import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { IUserRepository } from '@/lib/repositories/userRepository';
import { MongoAccountRepository } from '@/lib/repositories/mongoAccountRepository';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { Account } from '@/models/Account';
import { Session } from '@/models/Session';
import { User } from '@/models/User';
import { AuthService } from '@/services/authService';
import {
  GoogleSignInService,
  type GoogleSignInResult,
  type VerifiedGoogleClaims,
} from '@/services/googleSignInService';
import { PASSWORD_HASH } from '../contracts/fixtures';
import { errorFrom } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const { Collection, MongoNetworkError } = mongoose.mongo;

const users = new MongoUserRepository();
const accounts = new MongoAccountRepository();
const sessions = new MongoSessionRepository();
const service = new GoogleSignInService(users, accounts, sessions);
const passwordAuth = new AuthService(users, sessions);

const ALEX: VerifiedGoogleClaims = {
  sub: '108000000000000000001',
  email: 'alex@example.com',
  emailVerified: true,
  name: 'Alex',
};
const PASSWORD = 'CorrectHorse123!';
const REFUSED = { status: 'refused', reason: 'email-in-use' };

const count = {
  users: () => User.collection.countDocuments({}),
  accounts: () => Account.collection.countDocuments({}),
  sessions: () => Session.collection.countDocuments({}),
};

const idOf = (result: GoogleSignInResult) => (result.status === 'signed-in' ? result.user.id : null);

/**
 * The guarantees, which must hold whatever order requests ran in:
 * - Every passwordless user has an Account pointing at it, so none is ever stranded.
 * - No Account points at a user with a password, so nothing was linked by email.
 * An Account with no user is allowed: it gives no access and reserves no email.
 */
async function expectInvariants() {
  const allAccounts = await Account.collection.find({}).toArray();
  const allUsers = await User.collection.find({}).toArray();
  const linked = new Set(allAccounts.map((a) => a.userId.toString()));

  expect(
    allUsers.filter((u) => u.passwordHash === null && !linked.has(u._id.toString())).map((u) => u.email),
  ).toEqual([]);
  expect(
    allUsers.filter((u) => u.passwordHash !== null && linked.has(u._id.toString())).map((u) => u.email),
  ).toEqual([]);
}

/** A user repository whose next passwordless write waits until released. */
function holdUserWrite() {
  let reached: () => void = () => undefined;
  let release: () => void = () => undefined;
  const atWrite = new Promise<void>((resolve) => (reached = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));

  const held: IUserRepository = {
    findByEmail: (email) => users.findByEmail(email),
    findById: (id) => users.findById(id),
    create: (data) => users.create(data),
    deleteById: (id) => users.deleteById(id),
    newId: () => users.newId(),
    createWithoutPassword: async (data) => {
      reached();
      await released;
      return users.createWithoutPassword(data);
    },
  };
  return { repo: held, atWrite, release };
}

let server: MongoTestServer;

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await clearTestDatabase(server);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a new Google identity', () => {
  it('creates one passwordless user and one link to it', async () => {
    const id = idOf(await service.signIn(ALEX));

    const user = await User.collection.findOne({ email: ALEX.email });
    expect(user?._id.toString()).toBe(id);
    expect(user?.passwordHash).toBeNull();
    const account = await Account.collection.findOne({ providerAccountId: ALEX.sub });
    expect(account?.userId.toString()).toBe(id);
    await expectInvariants();
  });

  it('returns to the same user next time, by identity rather than email', async () => {
    const first = idOf(await service.signIn(ALEX));

    const second = idOf(await service.signIn({ ...ALEX, email: 'renamed@example.com' }));

    expect(second).toBe(first);
    expect(await count.users()).toBe(1);
    expect(await count.accounts()).toBe(1);
    expect(await User.collection.countDocuments({ email: ALEX.email })).toBe(1);
  });

  it('stores only the hash of the session token', async () => {
    const result = await service.signIn(ALEX);
    const token = result.status === 'signed-in' ? result.sessionToken : '';

    const stored = await Session.collection.find({}).toArray();

    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('cannot use password sign-in', async () => {
    await service.signIn(ALEX);

    await expect(
      passwordAuth.login({ email: ALEX.email, password: 'AnyPassword123!' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('an email that already has an account is never linked', () => {
  it('refuses a password account, leaving it unchanged and working', async () => {
    await passwordAuth.register({ email: ALEX.email, password: PASSWORD });
    const before = await User.collection.findOne({ email: ALEX.email });

    expect(await service.signIn(ALEX)).toEqual(REFUSED);

    expect(await count.accounts()).toBe(0);
    expect(await User.collection.findOne({ email: ALEX.email })).toEqual(before);
    await expect(passwordAuth.login({ email: ALEX.email, password: PASSWORD })).resolves.toBeDefined();
  });

  it('refuses a passwordless user with no link, leaving it unchanged', async () => {
    const existing = await users.createWithoutPassword({ id: users.newId(), email: ALEX.email });

    expect(await service.signIn(ALEX)).toEqual(REFUSED);

    expect(await count.accounts()).toBe(0);
    expect(await count.users()).toBe(1);
    expect(await count.sessions()).toBe(0);
    expect((await users.findByEmail(ALEX.email))?.id).toBe(existing.id);
  });

  it('refuses a second Google identity with the email of a linked user', async () => {
    const first = idOf(await service.signIn(ALEX));

    expect(await service.signIn({ ...ALEX, sub: '108000000000000000002' })).toEqual(REFUSED);

    expect(await count.accounts()).toBe(1);
    expect((await accounts.findByProvider('google', ALEX.sub))?.userId).toBe(first);
    await expectInvariants();
  });

  it('creates no session for the user the email check finds', async () => {
    await users.create({ email: ALEX.email, passwordHash: PASSWORD_HASH });

    await service.signIn(ALEX);

    expect(await count.sessions()).toBe(0);
  });
});

describe('partial failures', () => {
  const outage = () => new MongoNetworkError('down');

  function failInsertInto(collectionName: string) {
    const insertOne = Collection.prototype.insertOne;
    return vi.spyOn(Collection.prototype, 'insertOne').mockImplementation(function (
      this: InstanceType<typeof Collection>,
      ...args: Parameters<typeof insertOne>
    ) {
      if (this.collectionName === collectionName) {
        return Promise.reject(outage());
      }
      return insertOne.apply(this, args);
    });
  }

  it('writes nothing when the Account write fails', async () => {
    const insert = failInsertInto('accounts');

    const err = await errorFrom(() => service.signIn(ALEX));
    insert.mockRestore();

    expect(err).toBeInstanceOf(RepositoryUnavailableError);
    expect(await count.users()).toBe(0);
    expect(await count.accounts()).toBe(0);
  });

  describe('when the User write fails after the Account write', () => {
    async function interrupt() {
      const insert = failInsertInto('users');
      const err = await errorFrom(() => service.signIn(ALEX));
      insert.mockRestore();
      return err;
    }

    it('leaves a pending link that gives no access and reserves no email', async () => {
      expect(await interrupt()).toBeInstanceOf(RepositoryUnavailableError);

      expect(await count.accounts()).toBe(1);
      expect(await count.users()).toBe(0);
      expect(await count.sessions()).toBe(0);
      expect(await users.findByEmail(ALEX.email)).toBeNull();
    });

    it('completes with the same user ID on retry', async () => {
      await interrupt();
      const pending = await accounts.findByProvider('google', ALEX.sub);

      expect(idOf(await service.signIn(ALEX))).toBe(pending?.userId);

      expect(await count.users()).toBe(1);
      expect(await count.accounts()).toBe(1);
      await expectInvariants();
    });

    it('lets someone else register that email meanwhile, and then refuses', async () => {
      await interrupt();
      const pending = await accounts.findByProvider('google', ALEX.sub);

      await passwordAuth.register({ email: ALEX.email, password: PASSWORD });

      expect(await service.signIn(ALEX)).toEqual(REFUSED);
      expect(await count.users()).toBe(1);
      expect((await accounts.findByProvider('google', ALEX.sub))?.userId).toBe(pending?.userId);
      await expect(passwordAuth.login({ email: ALEX.email, password: PASSWORD })).resolves.toBeDefined();
      await expectInvariants();
    });

    it('finishes later if that email becomes free again', async () => {
      await interrupt();
      const holder = await users.create({ email: ALEX.email, passwordHash: PASSWORD_HASH });
      expect(await service.signIn(ALEX)).toEqual(REFUSED);

      await users.deleteById(holder.id);

      expect(idOf(await service.signIn(ALEX))).toBeTruthy();
      await expectInvariants();
    });
  });

  it('keeps a new account when its session fails, and a retry signs in to it', async () => {
    const insert = failInsertInto('sessions');

    const err = await errorFrom(() => service.signIn(ALEX));
    insert.mockRestore();

    expect(err).toBeInstanceOf(RepositoryUnavailableError);
    expect(await count.users()).toBe(1);
    expect(await count.accounts()).toBe(1);

    expect(idOf(await service.signIn(ALEX))).toBe((await users.findByEmail(ALEX.email))?.id);
    expect(await count.users()).toBe(1);
    expect(await count.sessions()).toBe(1);
    await expectInvariants();
  });
});

describe('the three-way race', () => {
  // The sequence that stranded a user in Checkpoint 1's design:
  //   B finds the pending link and pauses just before writing the User.
  //   A is refused, because a password registration holds the email.
  //   The registration rolls back, which frees the email.
  //   C starts while the email is free, and pauses just before writing the User.
  //   B and C then finish, in either order.
  async function runRace(finishFirst: 'B' | 'C') {
    const holder = await users.create({ email: ALEX.email, passwordHash: PASSWORD_HASH });
    const pending = await accounts.create({
      userId: users.newId(),
      provider: 'google',
      providerAccountId: ALEX.sub,
    });

    const heldB = holdUserWrite();
    const b = new GoogleSignInService(heldB.repo, accounts, sessions).signIn(ALEX);
    await heldB.atWrite;

    const a = await service.signIn(ALEX);

    await users.deleteById(holder.id);

    const heldC = holdUserWrite();
    const c = new GoogleSignInService(heldC.repo, accounts, sessions).signIn(ALEX);
    await heldC.atWrite;

    const [first, second] = finishFirst === 'B' ? [heldB, heldC] : [heldC, heldB];
    const [firstResult, secondResult] = finishFirst === 'B' ? [b, c] : [c, b];
    first.release();
    await firstResult.catch(() => undefined);
    second.release();
    await secondResult.catch(() => undefined);

    return { a, b: await b, c: await c, pendingUserId: pending.userId };
  }

  it.each(['B', 'C'] as const)('leaves no stranded user when %s finishes first', async (order) => {
    const { a, b, c } = await runRace(order);

    expect(a).toEqual(REFUSED);
    expect(idOf(b)).toBeTruthy();
    expect(idOf(c)).toBe(idOf(b));
    expect(await count.users()).toBe(1);
    await expectInvariants();
  });

  it.each(['B', 'C'] as const)('lets that person sign in afterwards when %s finishes first', async (order) => {
    const { b } = await runRace(order);

    expect(idOf(await service.signIn(ALEX))).toBe(idOf(b));
    await expectInvariants();
  });

  it('never removes a link during any of this', async () => {
    const deleteLink = vi.spyOn(accounts, 'deleteLink');

    await runRace('B');

    expect(deleteLink).not.toHaveBeenCalled();
  });

  it('does not refuse a request whose own identity just won the email', async () => {
    // This request looks for a link before another request for its identity has written
    // one, and then finds that request's User when it checks the email.
    const first = await service.signIn(ALEX);
    vi.spyOn(accounts, 'findByProvider').mockResolvedValueOnce(null);

    const second = await service.signIn(ALEX);

    expect(idOf(second)).toBe(idOf(first));
  });
});

describe('overlapping requests', () => {
  it('creates one user and one link for 25 requests from one identity', async () => {
    const outcomes = await Promise.all(Array.from({ length: 25 }, () => service.signIn(ALEX)));

    expect(new Set(outcomes.map(idOf)).size).toBe(1);
    expect(outcomes.every((o) => o.status === 'signed-in')).toBe(true);
    expect(await count.users()).toBe(1);
    expect(await count.accounts()).toBe(1);
    expect(await count.sessions()).toBe(25);
    await expectInvariants();
  });

  it('lets one of several identities with one email win, and refuses the rest', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        service.signIn({ ...ALEX, sub: `10800000000000000010${i}` }),
      ),
    );

    expect(outcomes.filter((o) => o.status === 'signed-in')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'refused')).toHaveLength(9);
    expect(await count.users()).toBe(1);
    await expectInvariants();
  });

  it('keeps one consistent account when Google and password sign-up race', async () => {
    for (let round = 0; round < 5; round += 1) {
      await clearTestDatabase(server);

      const [google, password] = await Promise.allSettled([
        service.signIn(ALEX),
        passwordAuth.register({ email: ALEX.email, password: PASSWORD }),
      ]);

      expect(await count.users()).toBe(1);
      await expectInvariants();
      const googleWon = google.status === 'fulfilled' && google.value.status === 'signed-in';
      expect(googleWon).toBe(password.status === 'rejected');
    }
  });

  describe('with randomized timing', () => {
    /** Adds a small delay before each call, so requests interleave differently each round. */
    function jittered<T extends object>(repo: T, random: () => number): T {
      return new Proxy(repo, {
        get(target, key) {
          const value = Reflect.get(target, key);
          if (typeof value !== 'function' || key === 'newId') {
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return async (...args: unknown[]) => {
            await new Promise((resolve) => setTimeout(resolve, random() * 6));
            return value.apply(target, args);
          };
        },
      });
    }

    function seeded(seed: number) {
      let state = seed;
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    }

    it('holds the guarantees when sign-ins overlap with a registration that rolls back', async () => {
      for (let round = 0; round < 25; round += 1) {
        await clearTestDatabase(server);
        const random = seeded(round + 1);
        const slowUsers = jittered(users, random);
        const slowAccounts = jittered(accounts, random);
        const google = new GoogleSignInService(slowUsers, slowAccounts, sessions);
        // Every other round, the registration's session fails, so it rolls back and frees the email.
        const registrationSessions = new MongoSessionRepository();
        if (round % 2 === 0) {
          vi.spyOn(registrationSessions, 'createSession').mockRejectedValueOnce(new Error('failed'));
        }
        const registration = new AuthService(slowUsers, registrationSessions);

        const [, ...signIns] = await Promise.allSettled([
          registration.register({ email: ALEX.email, password: PASSWORD }),
          google.signIn(ALEX),
          google.signIn(ALEX),
          google.signIn(ALEX),
          google.signIn(ALEX),
          google.signIn({ ...ALEX, sub: '108000000000000000002' }),
        ]);

        await expectInvariants();
        expect(await User.collection.countDocuments({ email: ALEX.email })).toBeLessThanOrEqual(1);

        // Everyone who signed in with one identity reached the same user.
        const ids = new Set(
          signIns
            .slice(0, 4)
            .flatMap((r) => (r.status === 'fulfilled' && idOf(r.value) ? [idOf(r.value)] : [])),
        );
        expect(ids.size).toBeLessThanOrEqual(1);

        // Nothing is stuck: a retry signs in, or is refused because someone holds the email.
        const retry = await service.signIn(ALEX);
        if (retry.status === 'refused') {
          expect(await users.findByEmail(ALEX.email)).not.toBeNull();
        }
        await expectInvariants();
      }
    }, 120_000);
  });
});

describe('logs', () => {
  it('holds no token, identity, email, or name through success, refusal, and failure', async () => {
    const logged = vi.mocked(console.error);
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await service.signIn(ALEX);
    await service.signIn({ ...ALEX, sub: '108000000000000000002' });
    await service.signIn({ ...ALEX, emailVerified: false });
    vi.spyOn(Collection.prototype, 'findOne').mockRejectedValueOnce(
      new MongoNetworkError(`${ALEX.sub} ${ALEX.email} ${ALEX.name}`),
    );
    await errorFrom(() => service.signIn(ALEX));

    const output = JSON.stringify([logged.mock.calls, info.mock.calls, warn.mock.calls]);
    const token = result.status === 'signed-in' ? result.sessionToken : 'missing';
    for (const secret of [token, ALEX.sub, '108000000000000000002', ALEX.email, 'Alex']) {
      expect(output).not.toContain(secret);
    }
  });
});
