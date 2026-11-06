import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { MongoAccountRepository } from '@/lib/repositories/mongoAccountRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import {
  DuplicateAccountError,
  DuplicateEmailError,
  DuplicateUserIdError,
  RepositoryError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
import { Account } from '@/models/Account';
import { User } from '@/models/User';
import { describeAccountRepositoryContract } from '../contracts/accountRepositoryContract';
import { PASSWORD_HASH, USER_IDS } from '../contracts/fixtures';
import { errorFrom, recordQueries } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const { Collection, MongoNetworkError, MongoServerError } = mongoose.mongo;

const [USER_A] = USER_IDS;
const SUB = '108000000000000000001';

let server: MongoTestServer;

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describeAccountRepositoryContract('MongoDB', {
  newRepository: async () => {
    await clearTestDatabase(server);
    return new MongoAccountRepository();
  },
  userIds: USER_IDS,
});

describe('MongoAccountRepository on a real database', () => {
  let repo: MongoAccountRepository;
  const users = new MongoUserRepository();

  beforeEach(async () => {
    await clearTestDatabase(server);
    repo = new MongoAccountRepository();
  });

  it('stores the user ID as an ObjectId, and nothing but the link', async () => {
    const created = await repo.create({ userId: USER_A, provider: 'google', providerAccountId: SUB });

    const stored = await Account.collection.findOne({ providerAccountId: SUB });

    expect(stored?._id.toString()).toBe(created.id);
    expect(stored?.userId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(Object.keys(stored!).sort()).toEqual(
      ['__v', '_id', 'createdAt', 'provider', 'providerAccountId', 'updatedAt', 'userId'].sort(),
    );
  });

  it('persists links so that a separate connection can read them', async () => {
    await repo.create({ userId: USER_A, provider: 'google', providerAccountId: SUB });

    const other = await mongoose.createConnection(server.uri).asPromise();
    try {
      expect(await other.collection('accounts').countDocuments({ providerAccountId: SUB })).toBe(1);
    } finally {
      await other.close();
    }
  });

  it('has both unique indexes', async () => {
    await repo.findByProvider('google', SUB);

    const indexes = await Account.collection.indexes();

    expect(
      indexes.find((i) => i.key.provider === 1 && i.key.providerAccountId === 1)?.unique,
    ).toBe(true);
    expect(indexes.find((i) => i.key.userId === 1 && i.key.provider === 1)?.unique).toBe(true);
  });

  describe('malformed input never reaches a query', () => {
    it('records a query for valid input, so the checks below mean something', async () => {
      expect(await recordQueries(() => repo.findByProvider('google', SUB))).toHaveLength(1);
      expect(await recordQueries(() => repo.deleteLink('google', SUB, USER_A))).toHaveLength(1);
    });

    it.each<[string, unknown]>([
      ['an operator object', { $ne: null }],
      ['an array', [SUB]],
      ['spaces', ' x '],
    ])('%s as an identity', async (_name, identity) => {
      await repo.create({ userId: USER_A, provider: 'google', providerAccountId: SUB });

      const queries = await recordQueries(async () => {
        await repo.findByProvider('google', identity as string);
        await repo.deleteLink('google', identity as string, USER_A);
      });

      expect(queries).toHaveLength(0);
    });

    it.each<[string, unknown]>([
      ['an operator object', { $ne: null }],
      ['an array', [USER_A]],
      ['a prefixed ID', 'user_1'],
    ])('%s as a user ID', async (_name, userId) => {
      await repo.create({ userId: USER_A, provider: 'google', providerAccountId: SUB });

      const queries = await recordQueries(async () => {
        const removed = await repo.deleteLink('google', SUB, userId as string);
        expect(removed).toBe(false);
      });

      expect(queries).toHaveLength(0);
      const err = await errorFrom(() =>
        repo.create({ userId: userId as string, provider: 'google', providerAccountId: 'other' }),
      );
      expect(err).toBeInstanceOf(RepositoryError);
    });
  });

  describe('errors and logs', () => {
    const SENSITIVE = 'mongodb://user:s3cr3t-pass@cluster0 person@example.com 108000000000000000001';
    const LEAK = /s3cr3t|cluster0|person@|108000000000000000001|E11000|rewear_test_/;

    it.each<[string, 'findOne' | 'insertOne' | 'deleteOne', () => Promise<unknown>]>([
      ['account.findByProvider', 'findOne', () => repo.findByProvider('google', SUB)],
      ['account.create', 'insertOne', () => repo.create({ userId: USER_A, provider: 'google', providerAccountId: SUB })],
      ['account.deleteLink', 'deleteOne', () => repo.deleteLink('google', SUB, USER_A)],
    ])('%s reports an outage safely', async (operation, method, run) => {
      await repo.findByProvider('google', SUB);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(Collection.prototype, method).mockRejectedValue(new MongoNetworkError(SENSITIVE));

      const err = await errorFrom(run);

      expect(err).toBeInstanceOf(RepositoryUnavailableError);
      expect(`${err.stack} ${JSON.stringify(err)}`).not.toMatch(LEAK);
      expect(logged.mock.calls).toEqual([
        ['[repository] operation failed', { operation, category: 'network' }],
      ]);
    });

    it('reports another failure as a plain error, safely', async () => {
      await repo.findByProvider('google', SUB);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(Collection.prototype, 'findOne').mockRejectedValue(
        new MongoServerError({ message: SENSITIVE, code: 13 }),
      );

      const err = await errorFrom(() => repo.findByProvider('google', SUB));

      expect(err.constructor).toBe(RepositoryError);
      expect(JSON.stringify(logged.mock.calls)).not.toMatch(LEAK);
    });

    it('does not log a repeated identity, which is an expected result, or repeat it', async () => {
      await repo.create({ userId: USER_A, provider: 'google', providerAccountId: SUB });
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const err = await errorFrom(() =>
        repo.create({ userId: USER_IDS[1], provider: 'google', providerAccountId: SUB }),
      );

      expect(err).toBeInstanceOf(DuplicateAccountError);
      expect(err.cause).toBeUndefined();
      expect(`${err.message} ${JSON.stringify(err)}`).not.toMatch(LEAK);
      expect(logged).not.toHaveBeenCalled();
    });
  });

  describe('passwordless users', () => {
    const data = (email = 'a@example.com') => ({ id: users.newId(), email, name: 'A' });

    it('stores a null hash, with the given ID', async () => {
      const input = data();

      const created = await users.createWithoutPassword(input);
      const stored = await User.collection.findOne({ email: 'a@example.com' });

      expect(created.id).toBe(input.id);
      expect(stored?._id.toString()).toBe(input.id);
      expect(stored?.passwordHash).toBeNull();
      expect(created).not.toHaveProperty('passwordHash');
    });

    it('gives each new ID the form of a stored ID, and sends no query', async () => {
      const ids = new Set<string>();

      const queries = await recordQueries(async () => {
        for (let i = 0; i < 5; i += 1) {
          ids.add(users.newId());
        }
      });

      expect(queries).toHaveLength(0);
      expect(ids.size).toBe(5);
      for (const id of ids) {
        expect(id).toMatch(/^[a-f0-9]{24}$/);
      }
    });

    it.each<[string, unknown]>([
      ['an operator object', { $ne: null }],
      ['an array', [USER_A]],
      ['a prefixed ID', 'user_1'],
    ])('rejects %s as an ID with no query', async (_name, id) => {
      let err: unknown;

      const queries = await recordQueries(async () => {
        err = await users
          .createWithoutPassword({ id: id as string, email: 'a@example.com' })
          .catch((e: unknown) => e);
      });

      expect(err).toBeInstanceOf(RepositoryError);
      expect(queries).toHaveLength(0);
    });

    it('rejects an invalid email without repeating it', async () => {
      const err = await errorFrom(() =>
        users.createWithoutPassword({ id: users.newId(), email: 'secret-not-an-email' }),
      );

      expect(err.constructor).toBe(RepositoryError);
      expect(JSON.stringify(err)).not.toContain('secret');
    });

    it('rejects a name over 100 characters', async () => {
      const err = await errorFrom(() =>
        users.createWithoutPassword({ id: users.newId(), email: 'a@example.com', name: 'x'.repeat(101) }),
      );

      expect(err.constructor).toBe(RepositoryError);
      expect(await User.collection.countDocuments({})).toBe(0);
    });

    it('reports a repeated ID and a repeated email with their own errors', async () => {
      const input = data();
      await users.createWithoutPassword(input);

      await expect(
        users.createWithoutPassword({ ...input, email: 'other@example.com' }),
      ).rejects.toBeInstanceOf(DuplicateUserIdError);
      await expect(users.createWithoutPassword(data())).rejects.toBeInstanceOf(DuplicateEmailError);
    });

    it('leaves password registration requiring a valid hash', async () => {
      const err = await errorFrom(() =>
        users.create({ email: 'a@example.com', passwordHash: 'plain-text-password' }),
      );

      expect(err.constructor).toBe(RepositoryError);
      expect(await User.collection.countDocuments({})).toBe(0);
      await expect(
        users.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH }),
      ).resolves.toMatchObject({ passwordHash: PASSWORD_HASH });
    });
  });
});
