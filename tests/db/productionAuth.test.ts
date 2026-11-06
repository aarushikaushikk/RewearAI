import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import mongoose from 'mongoose';
import {
  handleGetSession,
  handleLogin,
  handleLogout,
  handleRegister,
} from '@/lib/auth/authHandlers';
import { getProductionAuthService } from '@/lib/auth/getAuthService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';
import { hashToken } from '@/lib/auth/sessionTokens';
import { Session } from '@/models/Session';
import { User } from '@/models/User';
import {
  clearTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const { Collection, MongoServerError } = mongoose.mongo;

const ORIGIN = 'http://localhost:3000';
const ALEX = { email: 'alex@example.com', password: 'CorrectHorse123!', name: 'Alex' };
const SAM = { email: 'sam@example.com', password: 'BatteryStaple456!' };

let server: MongoTestServer;
let logged: MockInstance<typeof console.error>;
let rateLimiter: MemoryRateLimiter;

function post(path: string, body?: unknown, options: { cookie?: string; origin?: string } = {}) {
  return new Request(`${ORIGIN}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: 'localhost:3000',
      origin: options.origin ?? ORIGIN,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const register = (input: unknown) => handleRegister(post('register', input), { rateLimiter });
const login = (input: unknown) => handleLogin(post('login', input), { rateLimiter });
const logout = (cookie: string) => handleLogout(post('logout', undefined, { cookie }));
const session = (cookie: string) =>
  handleGetSession(new Request(`${ORIGIN}/api/auth/session`, { headers: { cookie } }));

/** The `name=value` pair from a response's Set-Cookie header. */
function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie') ?? '';
  expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
  return header.split(';')[0];
}

const tokenIn = (cookie: string) => cookie.slice(SESSION_COOKIE_NAME.length + 1);

beforeAll(async () => {
  server = await startMongoTestServer();
  // Still the temporary server. A short wait is added because db.ts sets no timeout.
  process.env.MONGODB_URI = `${server.uri}?serverSelectionTimeoutMS=500`;
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rateLimiter = new MemoryRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('production authentication on MongoDB', () => {
  beforeEach(async () => {
    // The first test connects through the handlers, as a real first request does.
    if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
      await clearTestDatabase(server);
    }
  });

  describe('registration', () => {
    it('stores a bcrypt hash and a token hash, and returns neither', async () => {
      const res = await register(ALEX);
      const text = await res.text();

      expect(res.status).toBe(201);
      const stored = await User.collection.findOne({ email: ALEX.email });
      expect(stored?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(stored?.passwordHash).not.toContain(ALEX.password);
      const token = tokenIn(sessionCookie(res));
      const sessions = await Session.collection.find({}).toArray();
      expect(sessions.map((s) => s.tokenHash)).toEqual([hashToken(token)]);
      expect(JSON.stringify(sessions)).not.toContain(token);
      expect(text).not.toContain(stored?.passwordHash);
      expect(text).not.toContain(token);
      expect(text).not.toContain(hashToken(token));
    });

    it('answers 409 for a registered email however it is written, and keeps one account', async () => {
      await register(ALEX);

      const res = await register({ ...ALEX, email: 'ALEX@Example.COM', password: 'Different789!' });

      expect(res.status).toBe(409);
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(await User.collection.countDocuments({})).toBe(1);
      expect((await login(ALEX)).status).toBe(200);
    });

    it('answers 400 for invalid input and stores nothing', async () => {
      const res = await register({ email: 'not-an-email', password: 'short' });

      expect(res.status).toBe(400);
      expect(await User.collection.countDocuments({})).toBe(0);
    });
  });

  describe('sign-in', () => {
    beforeEach(async () => {
      await register(ALEX);
    });

    it('accepts the correct password and creates a new session', async () => {
      const res = await login(ALEX);

      expect(res.status).toBe(200);
      expect(await session(sessionCookie(res)).then((r) => r.status)).toBe(200);
      expect(await Session.collection.countDocuments({})).toBe(2);
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const wrong = await login({ ...ALEX, password: 'WrongPassword123!' });
      const unknown = await login({ email: 'nobody@example.com', password: 'WrongPassword123!' });

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(await wrong.json()).toEqual(await unknown.json());
      expect(wrong.headers.get('set-cookie')).toBeNull();
      expect(await Session.collection.countDocuments({})).toBe(1);
    });

    it('refuses password sign-in for an account with no password', async () => {
      await User.create({ email: 'google@example.com' });

      const res = await login({ email: 'google@example.com', password: 'AnyPassword123!' });

      expect(res.status).toBe(401);
    });

    it('answers 429 after repeated failures, and counts them across requests', async () => {
      const limiter = new MemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
      const attempt = () =>
        handleLogin(post('login', { ...ALEX, password: 'WrongPassword123!' }), {
          rateLimiter: limiter,
        });

      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(429);
    });

    it('answers 403 for another origin, before reaching the database', async () => {
      const findOne = vi.spyOn(Collection.prototype, 'findOne');

      const res = await handleLogin(post('login', ALEX, { origin: 'https://evil.example.com' }), {
        rateLimiter,
      });

      expect(res.status).toBe(403);
      expect(findOne).not.toHaveBeenCalled();
    });
  });

  describe('sessions across independent requests', () => {
    it('recognizes a session with a different service instance for each request', async () => {
      const cookie = sessionCookie(await register(ALEX));

      expect(getProductionAuthService()).not.toBe(getProductionAuthService());
      for (let request = 0; request < 3; request += 1) {
        const res = await session(cookie);
        expect(res.status).toBe(200);
        expect((await res.json()).data.user.email).toBe(ALEX.email);
      }
    });

    it('keeps each user to their own session', async () => {
      const alex = sessionCookie(await register(ALEX));
      const sam = sessionCookie(await register(SAM));

      expect((await (await session(alex)).json()).data.user.email).toBe(ALEX.email);
      expect((await (await session(sam)).json()).data.user.email).toBe(SAM.email);
    });

    it('returns only safe user fields', async () => {
      const cookie = sessionCookie(await register(ALEX));

      const { user } = (await (await session(cookie)).json()).data;

      expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    });

    it.each([
      ['a forged token', () => `${SESSION_COOKIE_NAME}=${'f'.repeat(64)}`],
      ['a token that is a stored hash', async () => {
        const token = tokenIn(sessionCookie(await register(ALEX)));
        return `${SESSION_COOKIE_NAME}=${hashToken(token)}`;
      }],
    ])('answers 401 for %s', async (_name, cookie) => {
      expect((await session(await cookie())).status).toBe(401);
    });

    it('answers 401 for an expired session', async () => {
      const cookie = sessionCookie(await register(ALEX));
      await Session.collection.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      expect((await session(cookie)).status).toBe(401);
    });

    it('answers 401 once the account has been deleted', async () => {
      const cookie = sessionCookie(await register(ALEX));
      await User.collection.deleteMany({});

      expect((await session(cookie)).status).toBe(401);
    });
  });

  describe('sign-out', () => {
    it('revokes the session in the database and clears the cookie', async () => {
      const cookie = sessionCookie(await register(ALEX));

      const res = await logout(cookie);

      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
      const stored = await Session.collection.findOne({ tokenHash: hashToken(tokenIn(cookie)) });
      expect(stored?.revokedAt).toBeInstanceOf(Date);
      expect((await session(cookie)).status).toBe(401);
    });

    it('leaves other sessions active', async () => {
      const first = sessionCookie(await register(ALEX));
      const second = sessionCookie(await login(ALEX));

      await logout(first);

      expect((await session(first)).status).toBe(401);
      expect((await session(second)).status).toBe(200);
    });
  });

  describe('failures', () => {
    it('answers a generic 500 when the database rejects an operation', async () => {
      await register(ALEX);
      vi.spyOn(Collection.prototype, 'findOne').mockRejectedValue(
        new MongoServerError({
          message: 'mongodb://user:s3cr3t-pass@cluster0 alex@example.com',
          code: 13,
        }),
      );

      const res = await login(ALEX);

      expect(res.status).toBe(500);
      expect(await res.text()).not.toMatch(/s3cr3t|cluster0|alex@|mongo/i);
    });

    it('writes nothing sensitive to the logs during a whole flow', async () => {
      const res = await register(ALEX);
      const cookie = sessionCookie(res);
      await login({ ...ALEX, password: 'WrongPassword123!' });
      await login(ALEX);
      await session(cookie);
      await logout(cookie);
      vi.spyOn(Collection.prototype, 'findOne').mockRejectedValue(new Error(ALEX.password));
      await login(ALEX);

      const stored = await User.collection.findOne({ email: ALEX.email });
      const logs = JSON.stringify(logged.mock.calls);
      for (const secret of [ALEX.password, ALEX.email, stored?.passwordHash, tokenIn(cookie), server.dbName]) {
        expect(logs).not.toContain(secret);
      }
    });
  });
});

describe('when MONGODB_URI is missing', () => {
  let uri: string | undefined;

  beforeEach(() => {
    uri = process.env.MONGODB_URI;
    process.env.MONGODB_URI = '';
  });

  afterEach(() => {
    process.env.MONGODB_URI = uri;
  });

  it('answers 503 and stores nothing, with no fallback', async () => {
    const usersBefore = await User.collection.countDocuments({});

    expect((await register(ALEX)).status).toBe(503);
    expect((await login(ALEX)).status).toBe(503);
    expect((await session(`${SESSION_COOKIE_NAME}=${'f'.repeat(64)}`)).status).toBe(503);
    expect((await logout(`${SESSION_COOKIE_NAME}=${'f'.repeat(64)}`)).status).toBe(503);

    expect(await User.collection.countDocuments({})).toBe(usersBefore);
  });
});

// Runs last in this file, because it shuts down the temporary server.
describe('when the database goes down', () => {
  let cookie: string;

  beforeAll(async () => {
    await clearTestDatabase(server);
    rateLimiter = new MemoryRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    cookie = sessionCookie(await register(ALEX));
    await mongoose.connection
      .db!.admin()
      .command({ shutdown: 1, force: true })
      .catch(() => undefined);
  });

  it.each([
    ['sign-up', () => register(SAM)],
    ['sign-in', () => login(ALEX)],
    ['the session check', () => session(cookie)],
    ['sign-out', () => logout(cookie)],
  ])('%s answers a safe 503', async (_name, run) => {
    const res = await run();

    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/mongo|127\.0\.0\.1|rewear_test_|alex@/i);
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/127\.0\.0\.1|rewear_test_|alex@/);
  });
});
