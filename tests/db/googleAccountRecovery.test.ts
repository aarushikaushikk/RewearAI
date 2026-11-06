import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { MongoAccountRepository } from '@/lib/repositories/mongoAccountRepository';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import {
  DuplicateAccountError,
  DuplicateEmailError,
  DuplicateUserIdError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
import { Account } from '@/models/Account';
import { User } from '@/models/User';
import { AuthService } from '@/services/authService';
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

interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

type Outcome = { result: 'signed-in'; userId: string } | { result: 'email-in-use' };

/**
 * The write order Checkpoint 2 will implement, kept here until GoogleSignInService
 * exists. It proves that the repositories support these guarantees:
 *
 * - The Account is written first, with a new user ID, so it can never point at an
 *   existing user found by email. A matching email can only ever cause a refusal.
 * - If the User write then fails, the Account points at nothing. It gives no access
 *   and reserves no email, and a retry for the same identity completes it.
 * - A User is only created for an Account that already exists. A refusal in another
 *   request can remove that Account, so each side checks after its own write. Whichever
 *   runs last sees the other's write and restores the link.
 */
async function restoreLink(sub: string, userId: string): Promise<void> {
  try {
    await accounts.create({ userId, provider: 'google', providerAccountId: sub });
  } catch (err) {
    if (!(err instanceof DuplicateAccountError)) {
      throw err;
    }
  }
}

async function signInWithGoogle(identity: GoogleIdentity): Promise<Outcome> {
  let account = await accounts.findByProvider('google', identity.sub);
  if (!account) {
    try {
      account = await accounts.create({
        userId: users.newId(),
        provider: 'google',
        providerAccountId: identity.sub,
      });
    } catch (err) {
      if (!(err instanceof DuplicateAccountError)) {
        throw err;
      }
      account = await accounts.findByProvider('google', identity.sub);
      if (!account) {
        throw err;
      }
    }
  }
  const { userId } = account;

  if (await users.findById(userId)) {
    return { result: 'signed-in', userId };
  }
  try {
    await users.createWithoutPassword({ id: userId, email: identity.email, name: identity.name });
    if ((await accounts.findByProvider('google', identity.sub))?.userId !== userId) {
      await restoreLink(identity.sub, userId);
    }
    return { result: 'signed-in', userId };
  } catch (err) {
    if (err instanceof DuplicateUserIdError) {
      return { result: 'signed-in', userId };
    }
    if (!(err instanceof DuplicateEmailError)) {
      throw err;
    }
    // A concurrent request for this identity may have won with the same ID.
    if (await users.findById(userId)) {
      return { result: 'signed-in', userId };
    }
    await accounts.deleteLink('google', identity.sub, userId);
    if (await users.findById(userId)) {
      await restoreLink(identity.sub, userId);
      return { result: 'signed-in', userId };
    }
    return { result: 'email-in-use' };
  }
}

const ALEX: GoogleIdentity = { sub: '108000000000000000001', email: 'alex@example.com', name: 'Alex' };
const count = {
  users: () => User.collection.countDocuments({}),
  accounts: () => Account.collection.countDocuments({}),
};

/** Every Account points at a real User, and every passwordless User has an Account. */
async function expectConsistent() {
  const allAccounts = await Account.collection.find({}).toArray();
  const allUsers = await User.collection.find({}).toArray();
  const userIds = allUsers.map((u) => u._id.toString());
  const linkedIds = allAccounts.map((a) => a.userId.toString());

  expect(linkedIds.filter((id) => !userIds.includes(id))).toEqual([]);
  expect(
    allUsers
      .filter((u) => u.passwordHash === null && !linkedIds.includes(u._id.toString()))
      .map((u) => u.email),
  ).toEqual([]);
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
    const outcome = await signInWithGoogle(ALEX);

    expect(outcome.result).toBe('signed-in');
    const user = await User.collection.findOne({ email: ALEX.email });
    expect(user?.passwordHash).toBeNull();
    const account = await Account.collection.findOne({ providerAccountId: ALEX.sub });
    expect(account?.userId.toString()).toBe(user?._id.toString());
    await expectConsistent();
  });

  it('returns to the same user next time, by identity rather than email', async () => {
    const first = await signInWithGoogle(ALEX);

    const second = await signInWithGoogle({ ...ALEX, email: 'renamed@example.com' });

    expect(second).toEqual(first);
    expect(await count.users()).toBe(1);
    expect(await count.accounts()).toBe(1);
    expect(await User.collection.countDocuments({ email: ALEX.email })).toBe(1);
  });

  it('cannot use password sign-in', async () => {
    await signInWithGoogle(ALEX);
    const service = new AuthService(users, new MongoSessionRepository());

    await expect(
      service.login({ email: ALEX.email, password: 'AnyPassword123!' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('an email that already has an account is never linked', () => {
  it('refuses a password account, leaving it unchanged and working', async () => {
    const service = new AuthService(users, new MongoSessionRepository());
    const password = 'CorrectHorse123!';
    await service.register({ email: ALEX.email, password });
    const before = await User.collection.findOne({ email: ALEX.email });

    const outcome = await signInWithGoogle(ALEX);

    expect(outcome).toEqual({ result: 'email-in-use' });
    expect(await count.accounts()).toBe(0);
    expect(await User.collection.findOne({ email: ALEX.email })).toEqual(before);
    await expect(service.login({ email: ALEX.email, password })).resolves.toBeDefined();
  });

  it('refuses a passwordless user with no link, leaving it unchanged', async () => {
    const existing = await users.createWithoutPassword({ id: users.newId(), email: ALEX.email });

    const outcome = await signInWithGoogle(ALEX);

    expect(outcome).toEqual({ result: 'email-in-use' });
    expect(await count.accounts()).toBe(0);
    expect(await count.users()).toBe(1);
    expect((await users.findByEmail(ALEX.email))?.id).toBe(existing.id);
  });

  it('refuses a second Google identity with the email of a linked user', async () => {
    const first = await signInWithGoogle(ALEX);

    const second = await signInWithGoogle({ ...ALEX, sub: '108000000000000000002' });

    expect(second).toEqual({ result: 'email-in-use' });
    expect(await count.accounts()).toBe(1);
    expect((await accounts.findByProvider('google', ALEX.sub))?.userId).toBe(
      first.result === 'signed-in' ? first.userId : '',
    );
    await expectConsistent();
  });

  it('never points an Account at an existing user, even at the moment of refusal', async () => {
    const existing = await users.create({ email: ALEX.email, passwordHash: PASSWORD_HASH });
    const create = vi.spyOn(accounts, 'create');

    await signInWithGoogle(ALEX);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].userId).not.toBe(existing.id);
  });
});

describe('partial failures', () => {
  const outage = () => new MongoNetworkError('down');

  it('writes nothing when the Account write fails', async () => {
    vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(outage());

    const err = await errorFrom(() => signInWithGoogle(ALEX));

    expect(err).toBeInstanceOf(RepositoryUnavailableError);
    expect(await count.users()).toBe(0);
    expect(await count.accounts()).toBe(0);
  });

  describe('when the User write fails after the Account write', () => {
    async function failAfterAccountWrite() {
      const insertOne = Collection.prototype.insertOne;
      vi.spyOn(Collection.prototype, 'insertOne').mockImplementation(function (
        this: InstanceType<typeof Collection>,
        ...args: Parameters<typeof insertOne>
      ) {
        if (this.collectionName === 'users') {
          return Promise.reject(outage());
        }
        return insertOne.apply(this, args);
      });
      const err = await errorFrom(() => signInWithGoogle(ALEX));
      vi.mocked(Collection.prototype.insertOne).mockRestore();
      return err;
    }

    it('leaves no User, so nothing can sign in and no email is reserved', async () => {
      const err = await failAfterAccountWrite();

      expect(err).toBeInstanceOf(RepositoryUnavailableError);
      expect(await count.accounts()).toBe(1);
      expect(await count.users()).toBe(0);
      expect(await users.findByEmail(ALEX.email)).toBeNull();
    });

    it('completes with the same user ID on retry', async () => {
      await failAfterAccountWrite();
      const orphan = await accounts.findByProvider('google', ALEX.sub);

      const outcome = await signInWithGoogle(ALEX);

      expect(outcome).toEqual({ result: 'signed-in', userId: orphan?.userId });
      expect(await count.users()).toBe(1);
      expect(await count.accounts()).toBe(1);
      await expectConsistent();
    });

    it('lets someone else register that email meanwhile, then refuses and cleans up', async () => {
      await failAfterAccountWrite();

      const service = new AuthService(users, new MongoSessionRepository());
      await service.register({ email: ALEX.email, password: 'CorrectHorse123!' });
      const outcome = await signInWithGoogle(ALEX);

      expect(outcome).toEqual({ result: 'email-in-use' });
      expect(await count.accounts()).toBe(0);
      expect(await count.users()).toBe(1);
      await expectConsistent();
    });
  });

  describe('when removing the Account after a refusal also fails', () => {
    beforeEach(async () => {
      await users.create({ email: ALEX.email, passwordHash: PASSWORD_HASH });
      vi.spyOn(Collection.prototype, 'deleteOne').mockRejectedValueOnce(outage());
    });

    it('reports the failure and links nothing', async () => {
      const err = await errorFrom(() => signInWithGoogle(ALEX));

      expect(err).toBeInstanceOf(RepositoryUnavailableError);
      const orphan = await accounts.findByProvider('google', ALEX.sub);
      const existing = await users.findByEmail(ALEX.email);
      expect(orphan?.userId).not.toBe(existing?.id);
    });

    it('refuses again on retry, and this time cleans up', async () => {
      await errorFrom(() => signInWithGoogle(ALEX));

      expect(await signInWithGoogle(ALEX)).toEqual({ result: 'email-in-use' });

      expect(await count.accounts()).toBe(0);
      await expectConsistent();
    });
  });
});

describe('a refusal racing a request that finishes the same identity', () => {
  // These reproduce an exact order of events. A password registration holds the email, so
  // one request is refused and removes the link. The registration then rolls back, which
  // frees the email for a second request with the same identity to write the User.
  async function orphanWithEmailHeldByAnotherUser() {
    const holder = await users.create({ email: ALEX.email, passwordHash: PASSWORD_HASH });
    const account = await accounts.create({
      userId: users.newId(),
      provider: 'google',
      providerAccountId: ALEX.sub,
    });
    return { holder, userId: account.userId };
  }

  it('restores the link if the User appears just as the refusal removes it', async () => {
    const { holder, userId } = await orphanWithEmailHeldByAnotherUser();
    const deleteLink = accounts.deleteLink.bind(accounts);
    vi.spyOn(accounts, 'deleteLink').mockImplementationOnce(async (...args) => {
      const removed = await deleteLink(...args);
      await users.deleteById(holder.id);
      await users.createWithoutPassword({ id: userId, email: ALEX.email });
      return removed;
    });

    const outcome = await signInWithGoogle(ALEX);

    expect(outcome).toEqual({ result: 'signed-in', userId });
    await expectConsistent();
    expect(await count.accounts()).toBe(1);
  });

  it('restores the link if the refusal removes it just after the User is written', async () => {
    const { userId } = await accounts
      .create({ userId: users.newId(), provider: 'google', providerAccountId: ALEX.sub })
      .then((account) => ({ userId: account.userId }));
    const createUser = users.createWithoutPassword.bind(users);
    vi.spyOn(users, 'createWithoutPassword').mockImplementationOnce(async (data) => {
      const created = await createUser(data);
      await accounts.deleteLink('google', ALEX.sub, userId);
      return created;
    });

    const outcome = await signInWithGoogle(ALEX);

    expect(outcome).toEqual({ result: 'signed-in', userId });
    await expectConsistent();
    expect(await count.accounts()).toBe(1);
  });
});

describe('a user deleted while the link remains', () => {
  // Records the behaviour that any future account deletion must plan for.
  it('is recreated with the same ID by the next sign-in', async () => {
    const first = await signInWithGoogle(ALEX);
    const userId = first.result === 'signed-in' ? first.userId : '';
    await users.deleteById(userId);

    expect(await signInWithGoogle(ALEX)).toEqual({ result: 'signed-in', userId });
  });
});

describe('concurrent requests', () => {
  it('creates one user and one link for 25 requests from one identity', async () => {
    const outcomes = await Promise.all(Array.from({ length: 25 }, () => signInWithGoogle(ALEX)));

    const signedIn = new Set(outcomes.map((o) => (o.result === 'signed-in' ? o.userId : o.result)));
    expect(signedIn.size).toBe(1);
    expect(signedIn.has('email-in-use')).toBe(false);
    expect(await count.users()).toBe(1);
    expect(await count.accounts()).toBe(1);
    await expectConsistent();
  });

  it('lets one of several identities with one email win, and refuses the rest', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        signInWithGoogle({ ...ALEX, sub: `10800000000000000010${i}` }),
      ),
    );

    expect(outcomes.filter((o) => o.result === 'signed-in')).toHaveLength(1);
    expect(outcomes.filter((o) => o.result === 'email-in-use')).toHaveLength(9);
    expect(await count.users()).toBe(1);
    expect(await count.accounts()).toBe(1);
    await expectConsistent();
  });

  it('keeps one consistent account when Google and password sign-up race', async () => {
    const service = new AuthService(users, new MongoSessionRepository());

    for (let round = 0; round < 5; round += 1) {
      await clearTestDatabase(server);

      const [google, password] = await Promise.allSettled([
        signInWithGoogle(ALEX),
        service.register({ email: ALEX.email, password: 'CorrectHorse123!' }),
      ]);

      expect(await count.users()).toBe(1);
      await expectConsistent();
      const googleWon = google.status === 'fulfilled' && google.value.result === 'signed-in';
      expect(googleWon).toBe(password.status === 'rejected');
      expect(await count.accounts()).toBe(googleWon ? 1 : 0);
    }
  });
});
