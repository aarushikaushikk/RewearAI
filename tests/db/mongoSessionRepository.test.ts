import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { hashToken } from '@/lib/auth/sessionTokens';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import { DuplicateEmailError, RepositoryError } from '@/lib/repositories/repositoryErrors';
import { Session } from '@/models/Session';
import { User } from '@/models/User';
import { AuthService } from '@/services/authService';
import { describeSessionRepositoryContract } from '../contracts/sessionRepositoryContract';
import { tokenHashFor, USER_IDS } from '../contracts/fixtures';
import { errorFrom, recordQueries } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const [USER_A, USER_B] = USER_IDS;
const HASH = tokenHashFor('hash-1');
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);

let server: MongoTestServer;

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

describeSessionRepositoryContract('MongoDB', {
  newRepository: async () => {
    await clearTestDatabase(server);
    return new MongoSessionRepository();
  },
  userIds: USER_IDS,
});

describe('MongoSessionRepository on a real database', () => {
  let repo: MongoSessionRepository;
  const create = (tokenHash = HASH, userId = USER_A, expiresAt = inOneHour()) =>
    repo.createSession({ userId, tokenHash, expiresAt });

  beforeEach(async () => {
    await clearTestDatabase(server);
    repo = new MongoSessionRepository();
  });

  describe('records and persistence', () => {
    it('returns the same domain record from create and find, with string IDs', async () => {
      const created = await create();
      const found = await repo.findActiveSessionByTokenHash(HASH);
      const stored = await Session.collection.findOne({ tokenHash: HASH });

      expect(found).toEqual(created);
      expect(created.id).toBe(stored?._id.toString());
      expect(created.userId).toBe(USER_A);
      expect(created.revokedAt).toBeNull();
      expect(created.expiresAt).toBeInstanceOf(Date);
      expect(Object.keys(created).sort()).toEqual(
        ['createdAt', 'expiresAt', 'id', 'revokedAt', 'tokenHash', 'userId'].sort(),
      );
    });

    it('persists sessions and revocations so that a separate connection can read them', async () => {
      const created = await create();
      await repo.revokeSessionByTokenHash(HASH);

      const other = await mongoose.createConnection(server.uri).asPromise();
      try {
        const stored = await other.collection('sessions').findOne({ tokenHash: HASH });
        expect(stored?._id.toString()).toBe(created.id);
        expect(stored?.userId).toBeInstanceOf(mongoose.Types.ObjectId);
        expect(stored?.revokedAt).toBeInstanceOf(Date);
      } finally {
        await other.close();
      }
    });

    it('has the indexes that sessions rely on', async () => {
      const indexes = await Session.collection.indexes();

      expect(indexes.find((i) => i.key.tokenHash === 1)?.unique).toBe(true);
      expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
      expect(indexes.some((i) => i.key.userId === 1)).toBe(true);
    });
  });

  describe('expiry', () => {
    it('treats a session as expired at its exact expiry time', async () => {
      const now = new Date('2030-01-01T00:00:00.000Z');
      await create(tokenHashFor('at-expiry'), USER_A, now);
      await create(tokenHashFor('after-now'), USER_A, new Date(now.getTime() + 1));

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(now);
        expect(await repo.findActiveSessionByTokenHash(tokenHashFor('at-expiry'))).toBeNull();
        expect(await repo.findActiveSessionByTokenHash(tokenHashFor('after-now'))).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects an expired record that is still stored, without waiting for its deletion', async () => {
      // Expires in the future for mongod, so its cleanup can't remove the record during
      // the test, and in the past for the repository, whose clock is moved forward.
      const expiresAt = inOneHour();
      await create(HASH, USER_A, expiresAt);

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(expiresAt.getTime() + 1000);

        expect(await Session.collection.countDocuments({ tokenHash: HASH })).toBe(1);
        expect(await repo.findActiveSessionByTokenHash(HASH)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('revocation', () => {
    it('stores when a session was revoked and keeps it inactive', async () => {
      await create();
      const before = Date.now();

      await repo.revokeSessionByTokenHash(HASH);

      const stored = await Session.collection.findOne({ tokenHash: HASH });
      expect(stored?.revokedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(await repo.findActiveSessionByTokenHash(HASH)).toBeNull();
    });

    it('keeps the first revocation time when revoked again', async () => {
      await create();
      await repo.revokeSessionByTokenHash(HASH);
      const first = await Session.collection.findOne({ tokenHash: HASH });

      await repo.revokeSessionByTokenHash(HASH);
      await repo.revokeAllSessionsForUser(USER_A);

      const second = await Session.collection.findOne({ tokenHash: HASH });
      expect(second?.revokedAt).toEqual(first?.revokedAt);
    });

    it('treats a stored session with no revokedAt field as active and revocable', async () => {
      const now = new Date();
      await Session.collection.insertOne({
        userId: new mongoose.Types.ObjectId(USER_A),
        tokenHash: HASH,
        expiresAt: inOneHour(),
        createdAt: now,
        updatedAt: now,
      });

      expect(await repo.findActiveSessionByTokenHash(HASH)).toMatchObject({ revokedAt: null });
      expect(await repo.revokeSessionByTokenHash(HASH)).toBe(true);
      expect(await repo.findActiveSessionByTokenHash(HASH)).toBeNull();
    });

    it("revokes all of one user's sessions and none of another's", async () => {
      await create(tokenHashFor('a1'), USER_A);
      await create(tokenHashFor('a2'), USER_A);
      await create(tokenHashFor('b1'), USER_B);

      expect(await repo.revokeAllSessionsForUser(USER_A)).toBe(2);

      expect(await Session.collection.countDocuments({ userId: new mongoose.Types.ObjectId(USER_B), revokedAt: null })).toBe(1);
      expect(await Session.collection.countDocuments({ userId: new mongoose.Types.ObjectId(USER_A), revokedAt: null })).toBe(0);
    });
  });

  describe('duplicate token hashes', () => {
    it("rejects a repeated hash without touching the first user's session", async () => {
      const first = await create(HASH, USER_A);

      const err = await errorFrom(() => create(HASH, USER_B));

      expect(err).toBeInstanceOf(RepositoryError);
      expect(err).not.toBeInstanceOf(DuplicateEmailError);
      expect(err.message).toBe('The data operation failed');
      expect(err.cause).toBeUndefined();
      expect(`${err.message} ${JSON.stringify(err)}`).not.toMatch(/E11000|rewear_test_/);
      expect(`${err.message} ${JSON.stringify(err)}`).not.toContain(HASH);
      expect(await repo.findActiveSessionByTokenHash(HASH)).toEqual(first);
    });

    it('lets one of several concurrent creations for one hash succeed', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => create(HASH, USER_A)),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await Session.collection.countDocuments({ tokenHash: HASH })).toBe(1);
    });
  });

  describe('malformed input', () => {
    const MALFORMED_HASHES: [string, unknown][] = [
      ['an operator object matching every session', { $ne: null }],
      ['an operator object matching by pattern', { $regex: '.*' }],
      ['an operator object listing values', { $in: [HASH] }],
      ['a valid hash wrapped in an array', [HASH]],
      ['an empty string', ''],
      ['a raw token rather than a digest', 'raw-session-token'],
      ['a digest one character short', HASH.slice(1)],
      ['a digest in capitals', HASH.toUpperCase()],
    ];
    const MALFORMED_USER_IDS: [string, unknown][] = [
      ['a prefixed ID', 'user_1'],
      ['12 characters', '123456789012'],
      ['an operator object', { $ne: null }],
      ['a valid ID wrapped in an array', [USER_A]],
      ['an empty string', ''],
    ];

    it('records a query for valid input, so the checks below mean something', async () => {
      expect(await recordQueries(() => repo.findActiveSessionByTokenHash(HASH))).toHaveLength(1);
      expect(await recordQueries(() => repo.revokeSessionByTokenHash(HASH))).toHaveLength(1);
      expect(await recordQueries(() => repo.revokeAllSessionsForUser(USER_A))).toHaveLength(1);
    });

    it.each(MALFORMED_HASHES)('find returns null with no query for %s', async (_name, hash) => {
      await create();
      let result: unknown;

      const queries = await recordQueries(async () => {
        result = await repo.findActiveSessionByTokenHash(hash as string);
      });

      expect(result).toBeNull();
      expect(queries).toHaveLength(0);
    });

    it.each(MALFORMED_HASHES)('revoke returns false with no query for %s', async (_name, hash) => {
      await create();
      let result: unknown;

      const queries = await recordQueries(async () => {
        result = await repo.revokeSessionByTokenHash(hash as string);
      });

      expect(result).toBe(false);
      expect(queries).toHaveLength(0);
      expect(await repo.findActiveSessionByTokenHash(HASH)).not.toBeNull();
    });

    it.each(MALFORMED_USER_IDS)('revoke-all returns 0 with no query for %s', async (_name, id) => {
      await create();
      let result: unknown;

      const queries = await recordQueries(async () => {
        result = await repo.revokeAllSessionsForUser(id as string);
      });

      expect(result).toBe(0);
      expect(queries).toHaveLength(0);
      expect(await repo.findActiveSessionByTokenHash(HASH)).not.toBeNull();
    });

    it.each(MALFORMED_USER_IDS)('create rejects %s and stores nothing', async (_name, id) => {
      const err = await errorFrom(() => create(HASH, id as string));

      expect(err).toBeInstanceOf(RepositoryError);
      expect(err.message).toBe('The data operation failed');
      expect(await Session.collection.countDocuments({})).toBe(0);
    });

    it.each([
      ['a raw token', 'secret-raw-session-token'],
      ['an operator object', { $ne: null }],
    ])('create rejects %s as a hash and repeats nothing', async (_name, tokenHash) => {
      const err = await errorFrom(() => create(tokenHash as string));

      expect(err).toBeInstanceOf(RepositoryError);
      expect(err.message).toBe('The data operation failed');
      expect(err.cause).toBeUndefined();
      expect(JSON.stringify(err)).not.toContain('secret');
      expect(await Session.collection.countDocuments({})).toBe(0);
    });

    it('create rejects an invalid expiry date', async () => {
      const err = await errorFrom(() => create(HASH, USER_A, new Date('not a date')));

      expect(err).toBeInstanceOf(RepositoryError);
      expect(await Session.collection.countDocuments({})).toBe(0);
    });
  });

  describe('with AuthService and real user storage', () => {
    const INPUT = { email: 'person@example.com', password: 'Password123!' };
    let service: AuthService;

    beforeEach(() => {
      service = new AuthService(new MongoUserRepository(), repo);
    });

    it('stores only the SHA-256 hash of the session token', async () => {
      const { sessionToken } = await service.register(INPUT);

      const sessions = await Session.collection.find({}).toArray();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].tokenHash).toBe(hashToken(sessionToken));
      expect(sessions[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(sessions)).not.toContain(sessionToken);
    });

    it('authenticates until logout, and not afterwards', async () => {
      const { sessionToken, user } = await service.register(INPUT);

      expect((await service.validateSession(sessionToken))?.user.id).toBe(user.id);
      expect(await service.logout(sessionToken)).toBe(true);
      expect(await service.validateSession(sessionToken)).toBeNull();
      expect(await service.logout(sessionToken)).toBe(false);
    });

    it('does not authenticate an expired session', async () => {
      const { sessionToken } = await service.login(await registered());
      await Session.collection.updateOne(
        { tokenHash: hashToken(sessionToken) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      expect(await service.validateSession(sessionToken)).toBeNull();
    });

    it('does not authenticate a session whose user has been deleted', async () => {
      const { sessionToken, user } = await service.register(INPUT);

      await new MongoUserRepository().deleteById(user.id);

      expect(await service.validateSession(sessionToken)).toBeNull();
    });

    it('rolls back the new account when the session token hash collides', async () => {
      const taken = await service.register(INPUT);
      const sessions = vi.spyOn(repo, 'createSession').mockImplementationOnce((data) =>
        MongoSessionRepository.prototype.createSession.call(repo, {
          ...data,
          tokenHash: hashToken(taken.sessionToken),
        }),
      );

      await expect(service.register({ ...INPUT, email: 'other@example.com' })).rejects.toMatchObject(
        { code: 'REGISTRATION_SESSION_FAILED', statusCode: 500 },
      );

      expect(sessions).toHaveBeenCalledTimes(1);
      expect(await User.collection.countDocuments({ email: 'other@example.com' })).toBe(0);
      expect((await service.validateSession(taken.sessionToken))?.user.email).toBe(INPUT.email);
    });

    async function registered() {
      await service.register(INPUT);
      return INPUT;
    }
  });

  describe('test database cleanup', () => {
    it('runs on the temporary database only', () => {
      expect(mongoose.connection.host).toBe('127.0.0.1');
      expect(Session.db.name).toBe(server.dbName);
    });

    it('removes sessions and keeps their indexes', async () => {
      await create();

      await clearTestDatabase(server);

      expect(await Session.collection.countDocuments({})).toBe(0);
      const indexes = await Session.collection.indexes();
      expect(indexes.find((i) => i.key.tokenHash === 1)?.unique).toBe(true);
    });
  });
});
