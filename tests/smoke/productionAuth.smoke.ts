import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';
import { startApp, type RunningApp } from '../helpers/nextApp';

/**
 * Runs the real `next start` build, whose routes and pages are bundled separately,
 * against a temporary MongoDB server. Run with `npm run test:smoke`.
 */
const COOKIE_NAME = 'rewear_session';
const ALEX = { email: 'alex@example.com', password: 'CorrectHorse123!', name: 'Alex' };

function client(app: RunningApp) {
  const headers = { 'Content-Type': 'application/json', origin: app.origin };
  return {
    post: (route: string, body?: unknown, cookie?: string, origin = app.origin) =>
      fetch(`${app.origin}/api/auth/${route}`, {
        method: 'POST',
        headers: { ...headers, origin, ...(cookie ? { cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    session: (cookie: string) =>
      fetch(`${app.origin}/api/auth/session`, { headers: { cookie } }),
    page: (route: string, cookie?: string) =>
      fetch(`${app.origin}${route}`, {
        redirect: 'manual',
        headers: cookie ? { cookie } : {},
      }),
  };
}

function cookieFrom(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

/**
 * Pages use Cache Components, so a redirect after the session check is streamed in a
 * 200 response for the browser to follow, and only a visitor with no cookie gets a 307
 * from the proxy. Either way, the response must carry no private content.
 */
async function expectStreamedRedirect(res: Response, target: string) {
  const body = await res.text();

  expect(res.status).toBe(200);
  expect(body).toContain(`NEXT_REDIRECT;replace;${target};307`);
  expect(body).not.toContain('Welcome back');
  expect(body).not.toContain(ALEX.email);
}

const SESSION_ENDED = '/sign-in?reason=session-ended';

const withTimeout = (uri: string) => `${uri}?serverSelectionTimeoutMS=1000`;
const LEAK = /mongodb:\/\/|127\.0\.0\.1:\d+\/rewear|rewear_test_|E11000|MongoNetwork|MongoServerSelection/;

describe('production build with no MONGODB_URI', () => {
  let app: RunningApp;

  beforeAll(async () => {
    app = await startApp('');
  });

  afterAll(async () => {
    await app?.stop();
  });

  it('fails closed on every auth route, with no in-memory fallback', async () => {
    const api = client(app);

    const register = await api.post('register', ALEX);
    const login = await api.post('login', ALEX);
    const session = await api.session(`${COOKIE_NAME}=${'f'.repeat(64)}`);

    expect(register.status).toBe(503);
    expect(register.headers.get('set-cookie')).toBeNull();
    expect(login.status).toBe(503);
    expect(session.status).toBe(503);
    expect(`${await register.text()} ${await login.text()}`).not.toMatch(LEAK);
  });

  it('still redirects a visitor with no cookie away from private pages', async () => {
    const res = await client(app).page('/');

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in');
  });
});

describe('production build on a temporary MongoDB server', () => {
  let server: MongoTestServer;
  let database: mongoose.Connection;
  let app: RunningApp;
  let api: ReturnType<typeof client>;
  let cookie: string;

  beforeAll(async () => {
    server = await startMongoTestServer();
    database = await mongoose.createConnection(server.uri).asPromise();
    app = await startApp(withTimeout(server.uri));
    api = client(app);
  });

  afterAll(async () => {
    await app?.stop();
    await database?.close().catch(() => undefined);
    await server?.stop();
  });

  it('registers an account, with a hardened cookie and hashes in the database', async () => {
    const res = await api.post('register', ALEX);
    const text = await res.text();
    const setCookie = res.headers.get('set-cookie') ?? '';
    cookie = cookieFrom(res);
    const token = cookie.slice(COOKIE_NAME.length + 1);

    expect(res.status).toBe(201);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(text).not.toContain(token);

    const user = await database.collection('users').findOne({ email: ALEX.email });
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(text).not.toContain(user?.passwordHash);
    const session = await database.collection('sessions').findOne({});
    expect(session?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(session)).not.toContain(token);
  });

  it('builds the unique indexes on first use', async () => {
    const users = await database.collection('users').indexes();
    const sessions = await database.collection('sessions').indexes();

    expect(users.find((index) => index.key.email === 1)?.unique).toBe(true);
    expect(sessions.find((index) => index.key.tokenHash === 1)?.unique).toBe(true);
  });

  it('answers 409 across the bundled route, not 500', async () => {
    const res = await api.post('register', ALEX);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('DUPLICATE_EMAIL');
  });

  it('answers 401 for a wrong password, and 200 and a new session for the right one', async () => {
    const wrong = await api.post('login', { ...ALEX, password: 'WrongPassword123!' });
    const right = await api.post('login', ALEX);

    expect(wrong.status).toBe(401);
    expect(right.status).toBe(200);
    expect((await api.session(cookieFrom(right))).status).toBe(200);
  });

  it('answers 403 for a request from another origin', async () => {
    const res = await api.post('login', ALEX, undefined, 'https://evil.example.com');

    expect(res.status).toBe(403);
  });

  it('shows the signed-in user on a private page, in a separate bundle from the routes', async () => {
    const res = await api.page('/', cookie);

    expect(res.status).toBe(200);
    const body = (await res.text()).replaceAll('<!-- -->', '');
    expect(body).toContain('Welcome back, Alex');
    expect(body).not.toContain('NEXT_REDIRECT');
  });

  it('sends a signed-in user from the sign-in page to the app', async () => {
    const res = await api.page('/sign-in', cookie);

    await expectStreamedRedirect(res, '/');
  });

  it('redirects from a private page for a missing or forged cookie', async () => {
    const missing = await api.page('/');
    const forged = await api.page('/', `${COOKIE_NAME}=${'f'.repeat(64)}`);

    expect(missing.status).toBe(307);
    expect(missing.headers.get('location')).toContain('/sign-in');
    await expectStreamedRedirect(forged, SESSION_ENDED);
  });

  it('keeps sessions and accounts when the server restarts', async () => {
    await app.stop();
    app = await startApp(withTimeout(server.uri));
    api = client(app);

    expect((await api.session(cookie)).status).toBe(200);
    expect((await api.page('/', cookie)).status).toBe(200);
    expect((await api.post('login', ALEX)).status).toBe(200);
  });

  it('revokes a session on sign-out, for both routes and pages', async () => {
    const res = await api.post('logout', undefined, cookie);
    const revoked = await database
      .collection('sessions')
      .countDocuments({ revokedAt: { $ne: null } });

    expect(res.status).toBe(200);
    expect(revoked).toBe(1);
    expect((await api.session(cookie)).status).toBe(401);
    await expectStreamedRedirect(await api.page('/', cookie), SESSION_ENDED);
  });

  it('answers 429 after repeated failed sign-ins', async () => {
    const attempt = () => api.post('login', { ...ALEX, password: 'WrongPassword123!' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((status) => status === 401 || status === 429)).toBe(true);
  });

  // Runs last in this block, because it shuts down the temporary server.
  describe('when the database goes down', () => {
    let validCookie: string;

    beforeAll(async () => {
      await app.stop();
      app = await startApp(withTimeout(server.uri));
      api = client(app);
      validCookie = cookieFrom(await api.post('login', ALEX));
      await database.db!.admin().command({ shutdown: 1, force: true }).catch(() => undefined);
    });

    it.each([
      ['sign-up', () => api.post('register', { ...ALEX, email: 'new@example.com' })],
      ['sign-in', () => api.post('login', ALEX)],
      ['the session check', () => api.session(validCookie)],
      ['sign-out', () => api.post('logout', undefined, validCookie)],
    ])('%s answers a safe 503 across the bundled route', async (_name, run) => {
      const res = await run();

      expect(res.status).toBe(503);
      expect(await res.text()).not.toMatch(LEAK);
    });

    it('does not sign the user out of a private page, or expose details', async () => {
      const res = await api.page('/', validCookie);
      const body = await res.text();

      expect(res.headers.get('location') ?? '').not.toContain('/sign-in');
      expect(body).not.toContain('NEXT_REDIRECT');
      expect(body).not.toContain('Welcome back');
      expect(body).not.toMatch(LEAK);
    });

    it('keeps secrets out of the server output for the whole run', () => {
      const output = app.output();

      expect(output).not.toContain(ALEX.password);
      expect(output).not.toContain(ALEX.email);
      expect(output).not.toContain(validCookie.slice(COOKIE_NAME.length + 1));
      expect(output).not.toMatch(LEAK);
    });
  });
});
