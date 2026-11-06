import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { User } from '@/models/User';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import { DuplicateEmailError, RepositoryError } from '@/lib/repositories/repositoryErrors';
import { AuthService } from '@/services/authService';
import { describeUserRepositoryContract } from '../contracts/userRepositoryContract';
import { OTHER_PASSWORD_HASH, PASSWORD_HASH } from '../contracts/fixtures';
import { MemorySessionRepository } from '../mocks/memorySessionRepository';
import { errorFrom, recordQueries } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const UNKNOWN_ID = '64b0000000000000000000ff';

let server: MongoTestServer;

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

describeUserRepositoryContract('MongoDB', {
  newRepository: async () => {
    await clearTestDatabase(server);
    return new MongoUserRepository();
  },
  unknownId: UNKNOWN_ID,
  addPasswordlessUser: (_repo, email) => User.create({ email }),
});

describe('MongoUserRepository on a real database', () => {
  let repo: MongoUserRepository;

  beforeEach(async () => {
    await clearTestDatabase(server);
    repo = new MongoUserRepository();
  });

  describe('records', () => {
    it('returns domain records with a string ID, Dates, and no database fields', async () => {
      const created = await repo.create({
        email: 'a@example.com',
        passwordHash: PASSWORD_HASH,
        name: 'A',
      });
      const loaded = await repo.findByEmail('a@example.com');
      const stored = await User.collection.findOne({ email: 'a@example.com' });

      for (const user of [created, loaded]) {
        expect(user?.id).toBe(stored?._id.toString());
        expect(user?.createdAt).toBeInstanceOf(Date);
        expect(user?.updatedAt).toBeInstanceOf(Date);
        expect(Object.keys(user!).sort()).toEqual(
          ['createdAt', 'email', 'id', 'name', 'passwordHash', 'updatedAt'].sort(),
        );
      }
    });

    it('stores a normalized email and finds it however the lookup is written', async () => {
      const created = await repo.create({
        email: '  MixedCase@Example.COM ',
        passwordHash: PASSWORD_HASH,
      });

      expect(await User.collection.countDocuments({ email: 'mixedcase@example.com' })).toBe(1);
      expect((await repo.findByEmail('  MIXEDCASE@example.com  '))?.id).toBe(created.id);
    });

    it('returns a null name for an account stored with no name', async () => {
      const created = await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

      expect((await repo.findByEmail('a@example.com'))?.name).toBeNull();
      expect((await repo.findById(created.id))?.name).toBeNull();
    });

    it('persists accounts so that a separate connection can read them', async () => {
      const created = await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

      const other = await mongoose.createConnection(server.uri).asPromise();
      try {
        const stored = await other.collection('users').findOne({ email: 'a@example.com' });
        expect(stored?._id.toString()).toBe(created.id);
        expect(stored?.passwordHash).toBe(PASSWORD_HASH);
      } finally {
        await other.close();
      }
      expect((await new MongoUserRepository().findById(created.id))?.email).toBe('a@example.com');
    });

    it('deletes only the given account from the database', async () => {
      const first = await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });
      const second = await repo.create({ email: 'b@example.com', passwordHash: PASSWORD_HASH });

      await expect(repo.deleteById(first.id)).resolves.toBe(true);
      await expect(repo.deleteById(first.id)).resolves.toBe(false);

      const remaining = await User.collection.find({}).toArray();
      expect(remaining.map((doc) => doc._id.toString())).toEqual([second.id]);
    });
  });

  describe('password hash', () => {
    it('never asks the database for the hash in findById', async () => {
      const created = await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

      const queries = await recordQueries(() => repo.findById(created.id));

      expect(queries).toHaveLength(1);
      const options = queries[0].args[1] as { projection?: Record<string, unknown> };
      expect(options.projection).toBeDefined();
      expect(options.projection).not.toHaveProperty('passwordHash');
    });

    it('returns no hash key from findById for an account with a stored hash', async () => {
      const created = await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

      const found = await repo.findById(created.id);

      expect(found).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(found)).not.toContain(PASSWORD_HASH);
    });

    it('explicitly loads the hash in findByEmail', async () => {
      await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

      expect((await repo.findByEmail('a@example.com'))?.passwordHash).toBe(PASSWORD_HASH);
    });

    it('returns null, not undefined or empty, for an account with a null hash', async () => {
      await User.create({ email: 'google@example.com' });
      expect(await User.collection.findOne({ email: 'google@example.com' })).toMatchObject({
        passwordHash: null,
      });

      const found = await repo.findByEmail('google@example.com');

      expect(found).not.toBeNull();
      expect(found?.passwordHash).toBeNull();
    });

    it('returns null for an account stored with no hash field at all', async () => {
      const now = new Date();
      await User.collection.insertOne({ email: 'old@example.com', createdAt: now, updatedAt: now });

      const found = await repo.findByEmail('old@example.com');

      expect(found).not.toBeNull();
      expect(found?.passwordHash).toBeNull();
    });
  });

  describe('duplicate emails', () => {
    it('has the unique email index these tests rely on', async () => {
      const indexes = await User.collection.indexes();

      expect(indexes.find((index) => index.key.email === 1)?.unique).toBe(true);
    });

    it('stores one account when 25 concurrent registrations use one email', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 25 }, (_, i) =>
          repo.create({
            email: i % 2 ? 'race@example.com' : 'RACE@example.com',
            passwordHash: PASSWORD_HASH,
          }),
        ),
      );

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(24);
      for (const result of rejected) {
        expect(result.reason).toBeInstanceOf(DuplicateEmailError);
      }
      expect(await User.collection.countDocuments({ email: 'race@example.com' })).toBe(1);
    });

    it('reveals no driver text or email in the duplicate error', async () => {
      await repo.create({ email: 'secret@example.com', passwordHash: PASSWORD_HASH });

      const err = await errorFrom(() =>
        repo.create({ email: 'secret@example.com', passwordHash: OTHER_PASSWORD_HASH }),
      );

      expect(err).toBeInstanceOf(DuplicateEmailError);
      expect(err.cause).toBeUndefined();
      expect(`${err.message} ${JSON.stringify(err)}`).not.toMatch(/secret@|E11000|rewear_test_/);
    });

    it('does not report a duplicate on another index as a taken email', async () => {
      await User.collection.createIndex({ name: 1 }, { unique: true, name: 'test_unique_name' });
      try {
        await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH, name: 'Same' });

        const err = await errorFrom(() =>
          repo.create({ email: 'b@example.com', passwordHash: PASSWORD_HASH, name: 'Same' }),
        );

        expect(err).toBeInstanceOf(RepositoryError);
        expect(err).not.toBeInstanceOf(DuplicateEmailError);
        expect(err.message).toBe('The data operation failed');
      } finally {
        await User.collection.dropIndex('test_unique_name');
      }
    });
  });

  describe('malformed input', () => {
    const MALFORMED_IDS: [string, unknown][] = [
      ['a prefixed ID', 'user_1'],
      ['free text', 'not-an-id'],
      ['an empty string', ''],
      ['12 characters, which Mongoose documents as a valid ID', '123456789012'],
      ['24 characters that are not hex', 'z'.repeat(24)],
      ['a valid ID with trailing text', `${UNKNOWN_ID}x`],
      ['a query operator as text', '{"$ne":null}'],
      ['a query operator object', { $ne: null }],
      ['a valid ID wrapped in an array', [UNKNOWN_ID]],
    ];

    it('records a query for a valid ID, so the checks below mean something', async () => {
      expect(await recordQueries(() => repo.findById(UNKNOWN_ID))).toHaveLength(1);
      expect(await recordQueries(() => repo.deleteById(UNKNOWN_ID))).toHaveLength(1);
    });

    it.each(MALFORMED_IDS)('findById returns null and sends no query for %s', async (_name, id) => {
      await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });
      let result: unknown;

      const queries = await recordQueries(async () => {
        result = await repo.findById(id as string);
      });

      expect(result).toBeNull();
      expect(queries).toHaveLength(0);
    });

    it.each(MALFORMED_IDS)(
      'deleteById returns false and deletes nothing for %s',
      async (_name, id) => {
        await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });
        let result: unknown;

        const queries = await recordQueries(async () => {
          result = await repo.deleteById(id as string);
        });

        expect(result).toBe(false);
        expect(queries).toHaveLength(0);
        expect(await User.collection.countDocuments({})).toBe(1);
      },
    );

    it('does not treat a query operator as an email', async () => {
      await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

      const err = await errorFrom(() => repo.findByEmail({ $ne: null } as unknown as string));

      expect(err).toBeInstanceOf(RepositoryError);
      expect(err.message).toBe('The data operation failed');
    });

    it.each([
      ['an invalid email', { email: 'secret-not-an-email', passwordHash: PASSWORD_HASH }],
      ['a plain-text password', { email: 'secret@example.com', passwordHash: 'secret-password' }],
    ])('rejects %s without repeating it or storing anything', async (_name, data) => {
      const err = await errorFrom(() => repo.create(data));

      expect(err).toBeInstanceOf(RepositoryError);
      expect(err.message).toBe('The data operation failed');
      expect(err.cause).toBeUndefined();
      expect(JSON.stringify(err)).not.toContain('secret');
      expect(await User.collection.countDocuments({})).toBe(0);
    });
  });

  describe('with AuthService', () => {
    const INPUT = { email: 'person@example.com', password: 'Password123!' };

    it('registers and signs in using the real hash, without exposing it', async () => {
      const service = new AuthService(repo, new MemorySessionRepository());
      const { sessionToken } = await service.register(INPUT);
      const stored = await User.collection.findOne({ email: INPUT.email });

      const login = await service.login(INPUT);
      const auth = await service.validateSession(sessionToken);

      expect(login.user.email).toBe(INPUT.email);
      expect(auth?.user.id).toBe(stored?._id.toString());
      expect(JSON.stringify([login, auth])).not.toContain(stored?.passwordHash);
      await expect(service.login({ ...INPUT, password: 'WrongPassword123!' })).rejects.toMatchObject(
        { code: 'INVALID_CREDENTIALS' },
      );
    });

    it('rolls back the account when its session cannot be created, so a retry works', async () => {
      const sessions = new MemorySessionRepository();
      const createSession = vi
        .spyOn(sessions, 'createSession')
        .mockRejectedValueOnce(new Error('session write failed'));
      const service = new AuthService(repo, sessions);

      await expect(service.register(INPUT)).rejects.toMatchObject({
        code: 'REGISTRATION_SESSION_FAILED',
      });
      expect(await User.collection.countDocuments({})).toBe(0);

      await expect(service.register(INPUT)).resolves.toMatchObject({
        user: { email: INPUT.email },
      });
      expect(createSession).toHaveBeenCalledTimes(2);
    });

    it('tells the user to sign in when the rollback fails and the account remains', async () => {
      const sessions = new MemorySessionRepository();
      vi.spyOn(sessions, 'createSession').mockRejectedValueOnce(new Error('session write failed'));
      const deleteById = vi.spyOn(repo, 'deleteById').mockResolvedValueOnce(false);

      await expect(new AuthService(repo, sessions).register(INPUT)).rejects.toMatchObject({
        code: 'ACCOUNT_CREATED_SESSION_FAILED',
      });

      expect(deleteById).toHaveBeenCalledTimes(1);
      expect(await User.collection.countDocuments({ email: INPUT.email })).toBe(1);
    });

    it('answers 409 to all but one of several concurrent registrations', async () => {
      const service = new AuthService(repo, new MemorySessionRepository());

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => service.register(INPUT)),
      );

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(4);
      for (const result of rejected) {
        expect(result.reason).toMatchObject({ code: 'DUPLICATE_EMAIL', statusCode: 409 });
      }
    });
  });

  describe('test database cleanup', () => {
    it('runs on the temporary database only', async () => {
      expect(mongoose.connection.host).toBe('127.0.0.1');
      expect(mongoose.connection.name).toBe(server.dbName);
      expect(User.db.name).toBe(server.dbName);
    });

    it('leaves another database on the same server untouched', async () => {
      await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });
      const sibling = mongoose.connection.useDb(`${server.dbName}_sibling`);
      await sibling.collection('users').insertOne({ email: 'keep@example.com' });

      try {
        await clearTestDatabase(server);

        expect(await User.collection.countDocuments({})).toBe(0);
        expect(await sibling.collection('users').countDocuments({})).toBe(1);
      } finally {
        await sibling.dropDatabase();
      }
    });

    it('keeps the unique email index after clearing', async () => {
      await clearTestDatabase(server);

      const indexes = await User.collection.indexes();
      expect(indexes.find((index) => index.key.email === 1)?.unique).toBe(true);
    });
  });
});
