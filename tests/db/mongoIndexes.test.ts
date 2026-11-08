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
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import { MongoAccountRepository } from '@/lib/repositories/mongoAccountRepository';
import {
  DuplicateAccountError,
  DuplicateEmailError,
  RepositoryError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
import { Account } from '@/models/Account';
import { Session } from '@/models/Session';
import { User } from '@/models/User';
import { AuthService } from '@/services/authService';
import { PASSWORD_HASH, tokenHashFor, USER_IDS } from '../contracts/fixtures';
import { errorFrom } from '../helpers/dbTestTools';
import {
  disconnectTestClient,
  resetTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const { Collection, MongoNetworkError, MongoServerError } = mongoose.mongo;

const HASH = tokenHashFor('hash-1');
const USER_ID = USER_IDS[0];
const inOneMinute = () => new Date(Date.now() + 60_000);
const newUser = (email = 'a@example.com') => ({ email, passwordHash: PASSWORD_HASH });
const newSession = () => ({ userId: USER_ID, tokenHash: HASH, expiresAt: inOneMinute() });

const users = new MongoUserRepository();
const sessions = new MongoSessionRepository();
const accounts = new MongoAccountRepository();

let server: MongoTestServer;
let logged: MockInstance<typeof console.error>;

async function indexOn(collection: { indexes(): Promise<unknown[]> }, field: string) {
  const indexes = (await collection.indexes()) as { key: Record<string, number> }[];
  return indexes.find((index) => Object.keys(index.key).join() === field);
}

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
  // Mongoose starts its own index build on connect. It has to finish before the tests
  // remove the indexes, or it could rebuild them and hide what is being tested.
  await Promise.allSettled([User.init(), Session.init(), Account.init()]);
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(async () => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await resetTestDatabase(server);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('before any index exists', () => {
  it('starts from a database with no indexes', async () => {
    const collections = await mongoose.connection.db!.listCollections().toArray();

    expect(collections).toEqual([]);
  });

  it('builds the required indexes with the correct definitions', async () => {
    await users.findByEmail('a@example.com');

    expect(await indexOn(User.collection, 'email')).toMatchObject({ key: { email: 1 }, unique: true });
    expect(await indexOn(Session.collection, 'tokenHash')).toMatchObject({
      key: { tokenHash: 1 },
      unique: true,
    });
    expect(await indexOn(Session.collection, 'expiresAt')).toMatchObject({
      key: { expiresAt: 1 },
      expireAfterSeconds: 0,
    });
    expect(await indexOn(Session.collection, 'userId')).toMatchObject({ key: { userId: 1 } });
    expect(await indexOn(Account.collection, 'provider,providerAccountId')).toMatchObject({
      key: { provider: 1, providerAccountId: 1 },
      unique: true,
    });
    expect(await indexOn(Account.collection, 'userId,provider')).toMatchObject({
      key: { userId: 1, provider: 1 },
      unique: true,
    });
  });

  it('stores one link when 25 concurrent writes use one identity', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        accounts.create({ userId: users.newId(), provider: 'google', providerAccountId: 'sub-1' }),
      ),
    );

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(24);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(DuplicateAccountError);
    }
    expect(await Account.collection.countDocuments({})).toBe(1);
  });

  it('stores one account when 25 concurrent writes use one email', async () => {
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => users.create(newUser())));

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(24);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(DuplicateEmailError);
    }
    expect(await User.collection.countDocuments({})).toBe(1);
  });

  it('stores one account when concurrent registrations go through AuthService', async () => {
    const service = new AuthService(users, sessions);
    const input = { email: 'a@example.com', password: 'Password123!' };

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.register(input)));

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(4);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({ code: 'DUPLICATE_EMAIL', statusCode: 409 });
    }
    expect(await User.collection.countDocuments({})).toBe(1);
    expect(await Session.collection.countDocuments({})).toBe(1);
  });

  it('stores one session when concurrent writes use one token hash', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => sessions.createSession(newSession())),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await Session.collection.countDocuments({})).toBe(1);
  });
});

describe('coordination', () => {
  it('runs one build for many concurrent operations of every kind', async () => {
    const userBuild = vi.spyOn(User, 'createIndexes');
    const sessionBuild = vi.spyOn(Session, 'createIndexes');
    const accountBuild = vi.spyOn(Account, 'createIndexes');

    await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => users.create(newUser(`u${i}@example.com`))),
      ...Array.from({ length: 5 }, () => sessions.findActiveSessionByTokenHash(HASH)),
    ]);

    expect(userBuild).toHaveBeenCalledTimes(1);
    expect(sessionBuild).toHaveBeenCalledTimes(1);
    expect(accountBuild).toHaveBeenCalledTimes(1);
  });

  it('does not build again once the build has succeeded', async () => {
    await users.findByEmail('a@example.com');
    const userBuild = vi.spyOn(User, 'createIndexes');
    const sessionBuild = vi.spyOn(Session, 'createIndexes');

    await users.findByEmail('a@example.com');
    await sessions.findActiveSessionByTokenHash(HASH);

    expect(userBuild).not.toHaveBeenCalled();
    expect(sessionBuild).not.toHaveBeenCalled();
  });

  it('shares one failed attempt among concurrent operations, and the next one retries', async () => {
    const userBuild = vi
      .spyOn(User, 'createIndexes')
      .mockRejectedValueOnce(new MongoNetworkError('down'));

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => users.create(newUser(`u${i}@example.com`))),
    );

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(userBuild).toHaveBeenCalledTimes(1);

    await users.create(newUser());

    expect(userBuild).toHaveBeenCalledTimes(2);
  });
});

describe('when the build fails', () => {
  it('sends no write, logs the failure, and recovers on retry', async () => {
    const secret = 'mongodb://user:s3cr3t-pass@127.0.0.1 person@example.com';
    vi.spyOn(User, 'createIndexes').mockRejectedValueOnce(
      new MongoServerError({ message: secret, code: 13 }),
    );
    const insertOne = vi.spyOn(Collection.prototype, 'insertOne');

    const err = await errorFrom(() => users.create(newUser()));

    expect(err.constructor).toBe(RepositoryError);
    expect(err.message).toBe('The data operation failed');
    expect(insertOne).not.toHaveBeenCalled();
    expect(logged.mock.calls).toEqual([
      ['[repository] operation failed', { operation: 'user.create', category: 'index_init' }],
    ]);

    await expect(users.create(newUser())).resolves.toMatchObject({ email: 'a@example.com' });
    expect(await indexOn(User.collection, 'email')).toMatchObject({ unique: true });
  });

  it('reports an outage during the build as unavailable, and recovers on retry', async () => {
    vi.spyOn(Session, 'createIndexes').mockRejectedValueOnce(new MongoNetworkError('down'));

    const err = await errorFrom(() => sessions.createSession(newSession()));

    expect(err).toBeInstanceOf(RepositoryUnavailableError);
    expect(logged.mock.calls).toEqual([
      ['[repository] operation failed', { operation: 'session.create', category: 'network' }],
    ]);
    expect(await Session.collection.countDocuments({})).toBe(0);

    await expect(sessions.createSession(newSession())).resolves.toMatchObject({ tokenHash: HASH });
  });

  it('blocks link writes if an Account index cannot be built, and recovers on retry', async () => {
    vi.spyOn(Account, 'createIndexes').mockRejectedValueOnce(
      new MongoServerError({ message: 'failed', code: 13 }),
    );
    const link = () =>
      accounts.create({ userId: users.newId(), provider: 'google', providerAccountId: 'sub-1' });

    expect((await errorFrom(link)).constructor).toBe(RepositoryError);
    expect(await Account.collection.countDocuments({})).toBe(0);

    await expect(link()).resolves.toMatchObject({ providerAccountId: 'sub-1' });
  });

  it('also refuses reads, so nothing runs on a database in an unknown state', async () => {
    vi.spyOn(User, 'createIndexes').mockRejectedValueOnce(
      new MongoServerError({ message: 'failed', code: 13 }),
    );

    expect((await errorFrom(() => sessions.findActiveSessionByTokenHash(HASH))).constructor).toBe(
      RepositoryError,
    );
  });

  describe('because stored data breaks a unique index', () => {
    beforeEach(async () => {
      const now = new Date();
      const doc = { email: 'taken@example.com', createdAt: now, updatedAt: now };
      await User.collection.insertMany([{ ...doc }, { ...doc }]);
    });

    it('does not report it as a taken email, and blocks every operation', async () => {
      const userErr = await errorFrom(() => users.create(newUser('new@example.com')));
      const sessionErr = await errorFrom(() => sessions.createSession(newSession()));

      expect(userErr.constructor).toBe(RepositoryError);
      expect(sessionErr.constructor).toBe(RepositoryError);
      expect(logged.mock.calls.map(([, details]) => details)).toEqual([
        { operation: 'user.create', category: 'index_init' },
        { operation: 'session.create', category: 'index_init' },
      ]);
      expect(await User.collection.countDocuments({ email: 'new@example.com' })).toBe(0);
      expect(await Session.collection.countDocuments({})).toBe(0);
    });

    it('recovers once the data is fixed', async () => {
      await errorFrom(() => users.create(newUser('new@example.com')));

      await User.collection.deleteOne({ email: 'taken@example.com' });

      await expect(users.create(newUser('new@example.com'))).resolves.toBeDefined();
      await expect(users.create(newUser('taken@example.com'))).rejects.toBeInstanceOf(
        DuplicateEmailError,
      );
    });
  });

  describe('because an existing index has the wrong definition', () => {
    beforeEach(async () => {
      await User.collection.createIndex({ email: 1 }, { name: 'email_1' });
    });

    it('refuses to write without the unique index, and recovers once it is removed', async () => {
      const err = await errorFrom(() => users.create(newUser()));

      expect(err.constructor).toBe(RepositoryError);
      expect(logged.mock.calls[0][1]).toEqual({ operation: 'user.create', category: 'index_init' });
      expect(await User.collection.countDocuments({})).toBe(0);

      await User.collection.dropIndex('email_1');

      await expect(users.create(newUser())).resolves.toBeDefined();
      expect(await indexOn(User.collection, 'email')).toMatchObject({ unique: true });
    });
  });
});

describe('across connections', () => {
  it('keeps enforcing uniqueness after a disconnect and reconnect', async () => {
    await users.create(newUser());
    await disconnectTestClient();
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);

    const err = await errorFrom(() => users.create(newUser()));

    expect(err).toBeInstanceOf(DuplicateEmailError);
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.connected);
    expect(await User.collection.countDocuments({})).toBe(1);
  });

  // Replaces `server`, so it runs last.
  it('builds the indexes again when the database changes', async () => {
    await users.create(newUser());
    const firstDatabase = server.dbName;
    await server.stop();
    server = await startMongoTestServer();

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => users.create(newUser())));

    expect(mongoose.connection.name).toBe(server.dbName);
    expect(server.dbName).not.toBe(firstDatabase);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await indexOn(User.collection, 'email')).toMatchObject({ unique: true });
    expect(await indexOn(Session.collection, 'tokenHash')).toMatchObject({ unique: true });
  });
});
