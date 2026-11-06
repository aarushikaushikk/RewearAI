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
import { connectToDatabase } from '@/lib/db';
import { handleGetSession, handleLogin, handleLogout, handleRegister } from '@/lib/auth/authHandlers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';
import { hashToken } from '@/lib/auth/sessionTokens';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import {
  DuplicateEmailError,
  RepositoryError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
import { Session } from '@/models/Session';
import { User } from '@/models/User';
import { AuthService } from '@/services/authService';
import { PASSWORD_HASH, tokenHashFor, USER_IDS } from '../contracts/fixtures';
import { errorFrom } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const { Collection, MongoNetworkError, MongoServerError } = mongoose.mongo;

const RAW_TOKEN = 'raw-session-token-value';
const HASH = tokenHashFor('hash-1');
const SENSITIVE = [
  'mongodb+srv://rewear-user:s3cr3t-pass@cluster0.abcde.mongodb.net/rewear',
  'person@example.com',
  PASSWORD_HASH,
  RAW_TOKEN,
  HASH,
  'E11000',
].join(' ');
const LEAK = new RegExp(
  `s3cr3t|cluster0|mongodb\\+srv|person@|E11000|raw-session-token|\\$2b\\$|${HASH}|127\\.0\\.0\\.1|rewear_test_`,
);

const USER_ID = USER_IDS[0];
const users = new MongoUserRepository();
const sessions = new MongoSessionRepository();

type DriverMethod = 'findOne' | 'insertOne' | 'updateOne' | 'updateMany' | 'deleteOne';

const OPERATIONS: [string, DriverMethod, () => Promise<unknown>][] = [
  ['user.findByEmail', 'findOne', () => users.findByEmail('person@example.com')],
  ['user.findById', 'findOne', () => users.findById(USER_ID)],
  [
    'user.create',
    'insertOne',
    () => users.create({ email: 'person@example.com', passwordHash: PASSWORD_HASH }),
  ],
  ['user.deleteById', 'deleteOne', () => users.deleteById(USER_ID)],
  [
    'session.create',
    'insertOne',
    () =>
      sessions.createSession({
        userId: USER_ID,
        tokenHash: HASH,
        expiresAt: new Date(Date.now() + 60_000),
      }),
  ],
  ['session.findActive', 'findOne', () => sessions.findActiveSessionByTokenHash(HASH)],
  ['session.revoke', 'updateOne', () => sessions.revokeSessionByTokenHash(HASH)],
  ['session.revokeAll', 'updateMany', () => sessions.revokeAllSessionsForUser(USER_ID)],
];

function postRequest(path: string, body?: unknown, cookie?: string): Request {
  return new Request(`http://localhost:3000/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let server: MongoTestServer;
let logged: MockInstance<typeof console.error>;

beforeAll(async () => {
  server = await startMongoTestServer();
  // Still the temporary server. A short wait is added because db.ts sets no timeout,
  // so an unreachable database would otherwise take 30 seconds per operation.
  process.env.MONGODB_URI = `${server.uri}?serverSelectionTimeoutMS=500`;
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('after a successful connection', () => {
  beforeEach(async () => {
    await clearTestDatabase(server);
  });

  describe.each(OPERATIONS)('%s', (operation, driverMethod, run) => {
    it('reports a network failure as unavailable, with a safe log', async () => {
      vi.spyOn(Collection.prototype, driverMethod).mockRejectedValue(
        new MongoNetworkError(SENSITIVE),
      );

      const err = await errorFrom(run);

      expect(err).toBeInstanceOf(RepositoryUnavailableError);
      expect(err.message).toBe('The data store is unavailable');
      expect(logged.mock.calls).toEqual([
        ['[repository] operation failed', { operation, category: 'network' }],
      ]);
    });

    it('reports another failure as a plain error, with a safe log', async () => {
      vi.spyOn(Collection.prototype, driverMethod).mockRejectedValue(
        new MongoServerError({ message: SENSITIVE, code: 13 }),
      );

      const err = await errorFrom(run);

      expect(err.constructor).toBe(RepositoryError);
      expect(err.message).toBe('The data operation failed');
      expect(`${err.stack} ${JSON.stringify(err)}`).not.toMatch(LEAK);
      expect(logged.mock.calls).toEqual([
        ['[repository] operation failed', { operation, category: 'unknown' }],
      ]);
    });
  });

  it('logs nothing when an operation succeeds', async () => {
    const user = await users.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });
    await users.findById(user.id);

    expect(logged).not.toHaveBeenCalled();
  });

  it('does not log a duplicate email, which is an expected result', async () => {
    await users.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

    const err = await errorFrom(() =>
      users.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH }),
    );

    expect(err).toBeInstanceOf(DuplicateEmailError);
    expect(logged).not.toHaveBeenCalled();
  });

  it('logs a repeated token hash on the real index without repeating it', async () => {
    const data = { userId: USER_ID, tokenHash: HASH, expiresAt: new Date(Date.now() + 60_000) };
    await sessions.createSession(data);

    const err = await errorFrom(() => sessions.createSession(data));

    expect(err.constructor).toBe(RepositoryError);
    expect(logged.mock.calls).toEqual([
      ['[repository] operation failed', { operation: 'session.create', category: 'duplicate_key' }],
    ]);
  });

  it('logs a real validation failure without repeating the input', async () => {
    const err = await errorFrom(() =>
      users.create({ email: 'person@example.com', passwordHash: 'plain-text-password' }),
    );

    expect(err.constructor).toBe(RepositoryError);
    expect(logged.mock.calls).toEqual([
      ['[repository] operation failed', { operation: 'user.create', category: 'validation' }],
    ]);
  });

  describe('registration rollback', () => {
    const INPUT = { email: 'person@example.com', password: 'Password123!' };
    const deps = () => ({
      authService: new AuthService(users, sessions),
      rateLimiter: new MemoryRateLimiter({ maxAttempts: 3, windowMs: 60_000 }),
    });

    it('answers 503 and removes the account when session creation loses the network', async () => {
      vi.spyOn(Session, 'create').mockRejectedValueOnce(new MongoNetworkError(SENSITIVE));

      const res = await handleRegister(postRequest('register', INPUT), deps());

      expect(res.status).toBe(503);
      expect(await res.text()).not.toMatch(LEAK);
      expect(await User.collection.countDocuments({})).toBe(0);
    });

    it('answers 503 and says to sign in when the rollback loses the network too', async () => {
      vi.spyOn(Session, 'create').mockRejectedValueOnce(new MongoNetworkError(SENSITIVE));
      vi.spyOn(users, 'findByEmail').mockResolvedValueOnce(null);
      vi.spyOn(Collection.prototype, 'deleteOne').mockRejectedValue(new MongoNetworkError(SENSITIVE));
      vi.spyOn(Collection.prototype, 'findOne').mockRejectedValue(new MongoNetworkError(SENSITIVE));

      const res = await handleRegister(postRequest('register', INPUT), deps());

      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('ACCOUNT_CREATED_SESSION_FAILED');
      vi.restoreAllMocks();
      expect(await User.collection.countDocuments({ email: INPUT.email })).toBe(1);
    });
  });

  it('answers 503 and leaves the session active when revocation loses the network', async () => {
    await sessions.createSession({
      userId: USER_ID,
      tokenHash: hashToken(RAW_TOKEN),
      expiresAt: new Date(Date.now() + 60_000),
    });
    vi.spyOn(Collection.prototype, 'updateOne').mockRejectedValueOnce(
      new MongoNetworkError(SENSITIVE),
    );

    const res = await handleLogout(
      postRequest('logout', undefined, `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`),
      { authService: new AuthService(users, sessions) },
    );

    expect(res.status).toBe(503);
    expect(await sessions.findActiveSessionByTokenHash(hashToken(RAW_TOKEN))).not.toBeNull();
  });
});

// Runs last in this file, because it shuts down the temporary server.
describe('when the database goes down after connecting', () => {
  const CREDENTIALS = { email: 'person@example.com', password: 'Password123!' };
  let token: string;
  let rateLimiter: MemoryRateLimiter;
  let recordAttempt: MockInstance;
  let authService: AuthService;

  beforeAll(async () => {
    await clearTestDatabase(server);
    authService = new AuthService(users, sessions);
    ({ sessionToken: token } = await authService.register(CREDENTIALS));

    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.connected);
    // mongod closes the connection instead of replying, so this command is expected to fail.
    await mongoose.connection
      .db!.admin()
      .command({ shutdown: 1, force: true })
      .catch(() => undefined);
  });

  beforeEach(() => {
    rateLimiter = new MemoryRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    recordAttempt = vi.spyOn(rateLimiter, 'recordAttempt');
  });

  it.each(OPERATIONS)('%s reports the database as unavailable', async (operation, _method, run) => {
    const err = await errorFrom(run);

    expect(err).toBeInstanceOf(RepositoryUnavailableError);
    expect(`${err.message} ${err.stack} ${JSON.stringify(err)}`).not.toMatch(LEAK);
    expect(logged.mock.calls).toEqual([
      ['[repository] operation failed', { operation, category: 'network' }],
    ]);
  });

  it('sign-in answers 503 and does not count toward the rate limit', async () => {
    const res = await handleLogin(postRequest('login', CREDENTIALS), { authService, rateLimiter });

    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(LEAK);
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(LEAK);
  });

  it('sign-up answers 503 and does not count toward the rate limit', async () => {
    const res = await handleRegister(postRequest('register', CREDENTIALS), {
      authService,
      rateLimiter,
    });

    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(LEAK);
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it('the session check answers 503 instead of signing the user out', async () => {
    const res = await handleGetSession(
      new Request('http://localhost:3000/api/auth/session', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
      { authService },
    );

    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(LEAK);
  });

  it('sign-out answers 503', async () => {
    const res = await handleLogout(
      postRequest('logout', undefined, `${SESSION_COOKIE_NAME}=${token}`),
      { authService },
    );

    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(LEAK);
  });
});
