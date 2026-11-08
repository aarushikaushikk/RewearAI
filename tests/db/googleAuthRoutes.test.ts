import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { handleLogin, handleRegister } from '@/lib/auth/authHandlers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { handleGoogleCallback, handleGoogleStart } from '@/lib/auth/googleHandlers';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';
import { hashToken } from '@/lib/auth/sessionTokens';
import { connectToDatabase } from '@/lib/db';
import { Account } from '@/models/Account';
import { Session } from '@/models/Session';
import { User } from '@/models/User';
import { FakeGoogle, type IssuedCodeOptions } from '../helpers/fakeGoogle';
import {
  clearTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-client-secret-value';
const ORIGIN = 'http://localhost:3000';
const REDIRECT_URI = `${ORIGIN}/api/auth/google/callback`;
const TRANSACTION_COOKIE = 'rewear_google_tx';
const IDENTITY = {
  sub: '108000000000000000001',
  email: 'alex@example.com',
  email_verified: true,
  name: 'Alex',
};

const FAILED = '/sign-in?reason=google-failed';
const UNAVAILABLE = '/sign-in?reason=google-unavailable';

const google = new FakeGoogle(CLIENT_ID, CLIENT_SECRET, IDENTITY);
let server: MongoTestServer;
let logs: MockInstance[];

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

function cookiePair(res: Response, name: string): string | undefined {
  return setCookies(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];
}

async function start() {
  const res = await handleGoogleStart();
  const location = new URL(res.headers.get('location') ?? 'http://missing');
  const q = location.searchParams;
  return {
    res,
    location,
    cookie: cookiePair(res, TRANSACTION_COOKIE) ?? '',
    state: q.get('state') ?? '',
    authorization: {
      code_challenge: q.get('code_challenge') ?? '',
      nonce: q.get('nonce') ?? '',
      redirect_uri: q.get('redirect_uri') ?? '',
    },
  };
}

function callback(query: Record<string, string>, cookie?: string): Promise<Response> {
  // An attacker controls the Host header, so it must have no effect on the flow.
  return handleGoogleCallback(
    new Request(`http://attacker.example/api/auth/google/callback?${new URLSearchParams(query)}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

/** Runs the whole flow, as a browser returning from Google would. */
async function completeFlow(options?: IssuedCodeOptions) {
  const flow = await start();
  const code = google.authorize(flow.authorization, options);
  const res = await callback({ code, state: flow.state }, flow.cookie);
  return { res, flow, code };
}

/** A refused callback clears the transaction, issues no session, and stores no session. */
async function expectRefused(res: Response, location = FAILED) {
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe(location);
  expect(cookiePair(res, SESSION_COOKIE_NAME)).toBeUndefined();
  expect(setCookies(res).find((c) => c.startsWith(`${TRANSACTION_COOKIE}=`))).toMatch(/Max-Age=0/i);
  expect(await Session.collection.countDocuments({})).toBe(0);
}

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(async () => {
  logs = [
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
  ];
  vi.stubGlobal('fetch', google.fetch);
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('GOOGLE_CLIENT_SECRET', CLIENT_SECRET);
  vi.stubEnv('APP_ORIGIN', ORIGIN);
  await clearTestDatabase(server);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/auth/google', () => {
  it('redirects to Google with PKCE S256, state, nonce, and the fixed callback URL', async () => {
    const { res, location } = await start();

    expect(res.status).toBe(303);
    expect(location.origin).toBe('https://accounts.google.com');
    const q = location.searchParams;
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')?.length).toBeGreaterThanOrEqual(43);
    expect(q.get('state')?.length).toBeGreaterThanOrEqual(32);
    expect(q.get('nonce')?.length).toBeGreaterThanOrEqual(32);
    expect(location.toString()).not.toContain(CLIENT_SECRET);
  });

  it('makes new secrets for every request', async () => {
    const first = await start();
    const second = await start();

    expect(second.state).not.toBe(first.state);
    expect(second.authorization.nonce).not.toBe(first.authorization.nonce);
    expect(second.authorization.code_challenge).not.toBe(first.authorization.code_challenge);
  });

  it('stores the transaction in a short-lived HttpOnly, Lax cookie it can read back', async () => {
    const { res, state, authorization, cookie } = await start();

    const header = setCookies(res).find((c) => c.startsWith(`${TRANSACTION_COOKIE}=`)) ?? '';
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).toMatch(/Max-Age=600/i);
    // The value is encrypted, so it doesn't show the state or nonce.
    expect(cookie).not.toContain(state);
    expect(cookie).not.toContain(authorization.nonce);
  });

  it('uses a Secure __Host- cookie in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await handleGoogleStart();

    const header = setCookies(res)[0];
    expect(header.startsWith('__Host-rewear_google_tx=')).toBe(true);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/Path=\/(;|$)/i);
  });

  it('does not cache or leak the redirect', async () => {
    const { res } = await start();

    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

describe('a successful sign-in', () => {
  it('creates the user and issues the same session cookie as password sign-in', async () => {
    const { res } = await completeFlow();

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/home');
    const session = setCookies(res).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '';
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    const token = cookiePair(res, SESSION_COOKIE_NAME)?.split('=')[1] ?? '';
    const stored = await Session.collection.findOne({});
    expect(stored?.tokenHash).toBe(hashToken(token));
    const user = await User.collection.findOne({ email: IDENTITY.email });
    expect(user?.passwordHash).toBeNull();
    const account = await Account.collection.findOne({ providerAccountId: IDENTITY.sub });
    expect(account?.userId.toString()).toBe(user?._id.toString());
  });

  it('clears the transaction cookie', async () => {
    const { res } = await completeFlow();

    expect(setCookies(res).find((c) => c.startsWith(`${TRANSACTION_COOKIE}=`))).toMatch(/Max-Age=0/i);
  });

  it('stores no Google tokens anywhere', async () => {
    await completeFlow();

    const stored = JSON.stringify([
      await User.collection.find({}).toArray(),
      await Account.collection.find({}).toArray(),
      await Session.collection.find({}).toArray(),
    ]);
    expect(stored).not.toContain('fake-access-token');
    expect(stored).not.toContain('fake-refresh-token');
  });

  it('returns to the same user on a later sign-in', async () => {
    await completeFlow();
    await completeFlow();

    expect(await User.collection.countDocuments({})).toBe(1);
    expect(await Session.collection.countDocuments({})).toBe(2);
  });

  it('ignores any redirect target in the request', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);

    const res = await callback(
      { code, state: flow.state, returnTo: 'https://evil.example', next: '//evil.example' },
      flow.cookie,
    );

    expect(res.headers.get('location')).toBe('/home');
  });
});

describe('the transaction', () => {
  it('refuses a missing cookie', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);

    await expectRefused(await callback({ code, state: flow.state }));
  });

  it('refuses a tampered cookie', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);
    const value = flow.cookie.split('=')[1];
    const flipped = `${value.slice(0, -2)}${value.endsWith('AA') ? 'BB' : 'AA'}`;

    await expectRefused(await callback({ code, state: flow.state }, `${TRANSACTION_COOKIE}=${flipped}`));
  });

  it('refuses a made-up cookie', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);
    const forged = Buffer.from(JSON.stringify({ state: flow.state })).toString('base64url');

    await expectRefused(await callback({ code, state: flow.state }, `${TRANSACTION_COOKIE}=${forged}`));
  });

  it('refuses a cookie sealed with another secret', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'a-different-client-secret');

    await expectRefused(await callback({ code, state: flow.state }, flow.cookie));
  });

  it('refuses a transaction older than ten minutes, even with its cookie', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1000);

    await expectRefused(await callback({ code, state: flow.state }, flow.cookie));
  });

  it('refuses a missing state', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);

    await expectRefused(await callback({ code }, flow.cookie));
  });

  it('refuses a wrong state, which is how login CSRF is stopped', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);

    await expectRefused(await callback({ code, state: 'attacker-state' }, flow.cookie));
  });

  it("refuses an attacker's callback in a victim's browser", async () => {
    const attacker = await start();
    const code = google.authorize(attacker.authorization);
    const victim = await start();

    await expectRefused(await callback({ code, state: attacker.state }, victim.cookie));
  });

  it('refuses a missing code', async () => {
    const flow = await start();

    await expectRefused(await callback({ state: flow.state }, flow.cookie));
  });

  it('checks these before contacting Google', async () => {
    const flow = await start();
    const fetchSpy = vi.fn(google.fetch);
    vi.stubGlobal('fetch', fetchSpy);

    await callback({ code: 'x', state: 'wrong' }, flow.cookie);
    await callback({ code: 'x', state: flow.state });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses replaying a completed callback, with no second session', async () => {
    const { flow, code } = await completeFlow();

    const replay = await callback({ code, state: flow.state }, flow.cookie);

    expect(replay.headers.get('location')).toBe(FAILED);
    expect(cookiePair(replay, SESSION_COOKIE_NAME)).toBeUndefined();
    expect(await Session.collection.countDocuments({})).toBe(1);
  });
});

describe('PKCE', () => {
  it('refuses a code issued for a different verifier', async () => {
    const flow = await start();
    const code = google.authorize({
      ...flow.authorization,
      code_challenge: 'a-challenge-from-another-request-aaaaaaaaaaa',
    });

    await expectRefused(await callback({ code, state: flow.state }, flow.cookie));
  });

  it('refuses a code from another transaction, substituted into this one', async () => {
    const other = await start();
    const stolen = google.authorize(other.authorization);
    const flow = await start();

    await expectRefused(await callback({ code: stolen, state: flow.state }, flow.cookie));
  });

  it('refuses a code issued for another redirect URI', async () => {
    const flow = await start();
    const code = google.authorize({ ...flow.authorization, redirect_uri: 'https://evil.example/cb' });

    await expectRefused(await callback({ code, state: flow.state }, flow.cookie));
  });
});

describe('the ID token', () => {
  it.each<[string, IssuedCodeOptions]>([
    ['an invalid signature', { signWithUnknownKey: true }],
    ['the wrong issuer', { claims: { iss: 'https://evil.example' } }],
    ['the wrong audience', { claims: { aud: 'another-client' } }],
    ['an audience that adds another client', { claims: { aud: [CLIENT_ID, 'another-client'] } }],
    ['an expired token', { claims: { exp: Math.floor(Date.now() / 1000) - 3600 } }],
    ['the wrong nonce', { claims: { nonce: 'attacker-nonce' } }],
    ['no nonce', { claims: { nonce: undefined } }],
    ['no subject', { claims: { sub: undefined } }],
    ['no email', { claims: { email: undefined } }],
  ])('refuses %s', async (_name, options) => {
    const { res } = await completeFlow(options);

    await expectRefused(res);
    expect(await User.collection.countDocuments({})).toBe(0);
    expect(await Account.collection.countDocuments({})).toBe(0);
  });

  it.each<[string, unknown]>([
    ['false', false],
    ['the text "true"', 'true'],
    ['missing', undefined],
  ])('refuses email_verified that is %s', async (_name, value) => {
    const { res } = await completeFlow({ claims: { email_verified: value } });

    await expectRefused(res, '/sign-in?reason=google-email-unverified');
    expect(await User.collection.countDocuments({})).toBe(0);
  });

  it('takes identity only from the verified token, not the request', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);

    await callback(
      { code, state: flow.state, sub: 'attacker-sub', email: 'attacker@example.com', email_verified: 'true' },
      flow.cookie,
    );

    expect(await User.collection.countDocuments({ email: 'attacker@example.com' })).toBe(0);
    expect(await User.collection.countDocuments({ email: IDENTITY.email })).toBe(1);
  });
});

describe('existing accounts', () => {
  it('refuses an email held by a password account, leaving it working', async () => {
    const rateLimiter = new MemoryRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const credentials = { email: IDENTITY.email, password: 'CorrectHorse123!' };
    const post = (path: string) =>
      new Request(`${ORIGIN}/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', host: 'localhost:3000', origin: ORIGIN },
        body: JSON.stringify(credentials),
      });
    expect((await handleRegister(post('register'), { rateLimiter })).status).toBe(201);
    await Session.collection.deleteMany({});

    const { res } = await completeFlow();

    await expectRefused(res, '/sign-in?reason=google-email-in-use');
    expect(await Account.collection.countDocuments({})).toBe(0);
    expect((await handleLogin(post('login'), { rateLimiter })).status).toBe(200);
  });
});

describe('cancellation and provider failures', () => {
  it('treats access_denied as a cancellation', async () => {
    const flow = await start();

    const res = await callback({ error: 'access_denied', state: flow.state }, flow.cookie);

    await expectRefused(res, '/sign-in?reason=google-cancelled');
    expect(logs[0]).not.toHaveBeenCalled();
  });

  it('does not trust an error response with the wrong state', async () => {
    const flow = await start();

    await expectRefused(await callback({ error: 'access_denied', state: 'wrong' }, flow.cookie));
  });

  it('does not echo other provider errors', async () => {
    const flow = await start();

    const res = await callback(
      { error: 'server_error', error_description: 'secret-detail', state: flow.state },
      flow.cookie,
    );

    await expectRefused(res);
    expect(res.headers.get('location')).not.toContain('secret-detail');
  });

  it('refuses a rejected code exchange', async () => {
    google.tokenResponse = { status: 400, body: { error: 'invalid_grant', error_description: 'secret-detail' } };

    const { res } = await completeFlow();

    await expectRefused(res);
  });

  it('reports Google being down as unavailable', async () => {
    google.tokenResponse = { status: 503, body: { error: 'temporarily_unavailable' } };

    const { res } = await completeFlow();

    await expectRefused(res, UNAVAILABLE);
  });

  it('reports a token request timing out as unavailable', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input instanceof Request ? input.url : input).includes('/token')) {
        throw new DOMException('timed out', 'TimeoutError');
      }
      return google.fetch(input, init);
    });

    await expectRefused(await callback({ code, state: flow.state }, flow.cookie), UNAVAILABLE);
  });

  it('reports discovery failing at the start, and recovers on retry', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'discovery-failure-client');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });

    const failed = await handleGoogleStart();

    expect(failed.status).toBe(303);
    expect(failed.headers.get('location')).toBe(UNAVAILABLE);
    expect(setCookies(failed)).toEqual([]);

    vi.stubGlobal('fetch', google.fetch);
    const retried = await handleGoogleStart();
    expect(retried.headers.get('location')).toContain('https://accounts.google.com');
  });

  it('reports a database outage after verification as unavailable, with no session', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);
    const { MongoNetworkError, Collection } = (await import('mongoose')).default.mongo;
    vi.spyOn(Collection.prototype, 'findOne').mockRejectedValue(new MongoNetworkError('down'));

    const res = await callback({ code, state: flow.state }, flow.cookie);

    vi.mocked(Collection.prototype.findOne).mockRestore();
    await expectRefused(res, UNAVAILABLE);
  });
});

describe('configuration', () => {
  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_ORIGIN', 'MONGODB_URI'])(
    'fails closed when %s is missing, at the start and at the callback',
    async (name) => {
      const flow = await start();
      const code = google.authorize(flow.authorization);
      vi.stubEnv(name, '');
      const fetchSpy = vi.fn(google.fetch);
      vi.stubGlobal('fetch', fetchSpy);

      const startRes = await handleGoogleStart();
      const callbackRes = await callback({ code, state: flow.state }, flow.cookie);

      expect(startRes.headers.get('location')).toBe(UNAVAILABLE);
      expect(setCookies(startRes)).toEqual([]);
      await expectRefused(callbackRes, UNAVAILABLE);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('keeps password sign-up working when Google is not configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');

    const res = await handleRegister(
      new Request(`${ORIGIN}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', host: 'localhost:3000', origin: ORIGIN },
        body: JSON.stringify({ email: 'p@example.com', password: 'CorrectHorse123!' }),
      }),
      { rateLimiter: new MemoryRateLimiter({ maxAttempts: 5, windowMs: 60_000 }) },
    );

    expect(res.status).toBe(201);
  });
});

describe('sensitive data', () => {
  it('never reaches logs, redirects, or response bodies, through success and failure', async () => {
    const seen: string[] = [];
    const record = async (res: Response) => {
      seen.push(res.headers.get('location') ?? '', await res.clone().text());
      return res;
    };

    const success = await completeFlow();
    await record(success.res);
    const refused = await completeFlow({ signWithUnknownKey: true });
    await record(refused.res);
    google.tokenResponse = {
      status: 400,
      body: { error: 'invalid_grant', error_description: `${IDENTITY.email} ${CLIENT_SECRET}` },
    };
    const rejected = await completeFlow();
    await record(rejected.res);

    const output = JSON.stringify(logs.map((log) => log.mock.calls));
    const redirects = seen.join(' ');
    const token = cookiePair(success.res, SESSION_COOKIE_NAME)?.split('=')[1] ?? 'missing';
    for (const secret of [
      success.code,
      success.flow.state,
      success.flow.authorization.nonce,
      token,
      CLIENT_SECRET,
      IDENTITY.sub,
      IDENTITY.email,
      IDENTITY.name,
      'fake-access-token',
      'fake-refresh-token',
    ]) {
      expect(output).not.toContain(secret);
      expect(redirects).not.toContain(secret);
    }
  });

  it('logs only a fixed stage and category', async () => {
    const { res } = await completeFlow({ signWithUnknownKey: true });

    await expectRefused(res);
    expect(logs[0].mock.calls).toEqual([
      ['[google-sign-in] failed', { stage: 'verification', category: 'rejected' }],
    ]);
  });
});
