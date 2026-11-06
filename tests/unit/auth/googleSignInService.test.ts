import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '@/lib/auth/sessionTokens';
import {
  DuplicateEmailError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
import { AuthService } from '@/services/authService';
import {
  GoogleSignInService,
  type VerifiedGoogleClaims,
} from '@/services/googleSignInService';
import { MemoryAccountRepository } from '../../mocks/memoryAccountRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';

const ALEX: VerifiedGoogleClaims = {
  sub: '108000000000000000001',
  email: 'alex@example.com',
  emailVerified: true,
  name: 'Alex',
};

function signedIn<T extends { status: string }>(result: T) {
  expect(result.status).toBe('signed-in');
  return result as Extract<T, { status: 'signed-in' }>;
}

describe('GoogleSignInService', () => {
  let users: MemoryUserRepository;
  let accounts: MemoryAccountRepository;
  let sessions: MemorySessionRepository;
  let service: GoogleSignInService;

  beforeEach(() => {
    users = new MemoryUserRepository();
    accounts = new MemoryAccountRepository();
    sessions = new MemorySessionRepository();
    service = new GoogleSignInService(users, accounts, sessions);
  });

  describe('refuses claims it cannot trust, before touching any data', () => {
    it.each<[string, Partial<Record<keyof VerifiedGoogleClaims, unknown>>, string]>([
      ['an unverified email', { emailVerified: false }, 'email-not-verified'],
      ['a missing verification flag', { emailVerified: undefined }, 'email-not-verified'],
      ['a verification flag sent as text', { emailVerified: 'true' }, 'email-not-verified'],
      ['a verification flag sent as a number', { emailVerified: 1 }, 'email-not-verified'],
      ['an operator object as the sub', { sub: { $ne: null } }, 'invalid-identity'],
      ['an empty sub', { sub: '' }, 'invalid-identity'],
      ['a sub with spaces', { sub: ` ${ALEX.sub} ` }, 'invalid-identity'],
      ['an operator object as the email', { email: { $ne: null } }, 'invalid-identity'],
      ['a missing email', { email: undefined }, 'invalid-identity'],
      ['a malformed email', { email: 'not-an-email' }, 'invalid-identity'],
    ])('%s', async (_name, change, reason) => {
      const findByProvider = vi.spyOn(accounts, 'findByProvider');
      const findByEmail = vi.spyOn(users, 'findByEmail');
      const createSession = vi.spyOn(sessions, 'createSession');

      const result = await service.signIn({ ...ALEX, ...change } as VerifiedGoogleClaims);

      expect(result).toEqual({ status: 'refused', reason });
      expect(findByProvider).not.toHaveBeenCalled();
      expect(findByEmail).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    });

    it('refuses an existing linked user whose email is no longer verified', async () => {
      await service.signIn(ALEX);

      const result = await service.signIn({ ...ALEX, emailVerified: false });

      expect(result).toEqual({ status: 'refused', reason: 'email-not-verified' });
    });
  });

  describe('a new identity', () => {
    it('creates a passwordless user linked by its sub', async () => {
      const { user } = signedIn(await service.signIn(ALEX));

      expect(user).toMatchObject({ email: ALEX.email, name: 'Alex' });
      expect((await users.findByEmail(ALEX.email))?.passwordHash).toBeNull();
      expect((await accounts.findByProvider('google', ALEX.sub))?.userId).toBe(user.id);
    });

    it('normalizes the email', async () => {
      const { user } = signedIn(await service.signIn({ ...ALEX, email: ' Alex@Example.COM ' }));

      expect(user.email).toBe(ALEX.email);
    });

    it.each<[string, unknown, string | null]>([
      ['trims a name', '  Alex  ', 'Alex'],
      ['stores a blank name as none', '   ', null],
      ['stores a missing name as none', undefined, null],
      ['ignores a name that is not text', { first: 'Alex' }, null],
      ['shortens a name over the model limit', 'x'.repeat(150), 'x'.repeat(100)],
    ])('%s', async (_name, name, expected) => {
      const { user } = signedIn(
        await service.signIn({ ...ALEX, name: name as VerifiedGoogleClaims['name'] }),
      );

      expect(user.name).toBe(expected);
    });
  });

  describe('an existing identity', () => {
    it('signs in by sub, whatever email Google now reports', async () => {
      const first = signedIn(await service.signIn(ALEX));

      const second = signedIn(await service.signIn({ ...ALEX, email: 'renamed@example.com' }));

      expect(second.user.id).toBe(first.user.id);
      expect(second.user.email).toBe(ALEX.email);
      expect(await users.findByEmail('renamed@example.com')).toBeNull();
    });

    it('finds the link by sub alone, with no write', async () => {
      await service.signIn(ALEX);
      const findByProvider = vi.spyOn(accounts, 'findByProvider');
      const createAccount = vi.spyOn(accounts, 'create');

      await service.signIn({ ...ALEX, email: 'renamed@example.com' });

      expect(findByProvider.mock.calls).toEqual([['google', ALEX.sub]]);
      expect(createAccount).not.toHaveBeenCalled();
    });

    it('accepts a race reported as a duplicate email, when its own user won', async () => {
      const first = signedIn(await service.signIn(ALEX));
      // This request saw no user yet, and the database then reports the conflict on the email.
      vi.spyOn(users, 'findById').mockResolvedValueOnce(null);
      vi.spyOn(users, 'createWithoutPassword').mockRejectedValueOnce(new DuplicateEmailError());

      const second = signedIn(await service.signIn(ALEX));

      expect(second.user.id).toBe(first.user.id);
    });

    it('does not sign in as another user who holds the email now reported', async () => {
      const alex = signedIn(await service.signIn(ALEX));
      await users.create({ email: 'other@example.com', passwordHash: 'hash' });

      const result = signedIn(await service.signIn({ ...ALEX, email: 'other@example.com' }));

      expect(result.user.id).toBe(alex.user.id);
    });
  });

  describe('never links by email', () => {
    it('refuses an existing password user, with nothing written', async () => {
      const existing = await users.create({ email: ALEX.email, passwordHash: 'hash' });
      const createAccount = vi.spyOn(accounts, 'create');

      const result = await service.signIn(ALEX);

      expect(result).toEqual({ status: 'refused', reason: 'email-in-use' });
      expect(createAccount).not.toHaveBeenCalled();
      expect(await users.findByEmail(ALEX.email)).toEqual(existing);
    });

    it('refuses an existing passwordless user with no link, with nothing written', async () => {
      await users.createWithoutPassword({ id: users.newId(), email: ALEX.email });
      const createAccount = vi.spyOn(accounts, 'create');

      const result = await service.signIn(ALEX);

      expect(result).toEqual({ status: 'refused', reason: 'email-in-use' });
      expect(createAccount).not.toHaveBeenCalled();
      expect(await accounts.findByProvider('google', ALEX.sub)).toBeNull();
    });

    it('refuses a second identity with the email of a linked user', async () => {
      await service.signIn(ALEX);

      const result = await service.signIn({ ...ALEX, sub: '108000000000000000002' });

      expect(result).toEqual({ status: 'refused', reason: 'email-in-use' });
    });

    it('never removes a link', async () => {
      const deleteLink = vi.spyOn(accounts, 'deleteLink');
      await users.create({ email: 'taken@example.com', passwordHash: 'hash' });

      await service.signIn(ALEX);
      await service.signIn(ALEX);
      await service.signIn({ ...ALEX, sub: '108000000000000000002', email: 'taken@example.com' });

      expect(deleteLink).not.toHaveBeenCalled();
    });
  });

  describe('sessions', () => {
    it('stores only the hash of the token, as password sign-in does', async () => {
      const createSession = vi.spyOn(sessions, 'createSession');

      const { sessionToken, user, expiresAt } = signedIn(await service.signIn(ALEX));

      expect(sessionToken).toMatch(/^[a-f0-9]{64}$/);
      expect(createSession).toHaveBeenCalledWith({
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt,
      });
      expect(JSON.stringify(createSession.mock.calls)).not.toContain(sessionToken);
    });

    it('lasts as long as a password session', async () => {
      const auth = new AuthService(users, sessions);
      const password = await auth.register({ email: 'p@example.com', password: 'Password123!' });

      const google = signedIn(await service.signIn(ALEX));

      expect(
        Math.abs(google.expiresAt.getTime() - password.expiresAt.getTime()),
      ).toBeLessThan(60_000);
    });

    it('works with the existing session checks and sign-out', async () => {
      const auth = new AuthService(users, sessions);
      const { sessionToken, user } = signedIn(await service.signIn(ALEX));

      expect((await auth.validateSession(sessionToken))?.user.id).toBe(user.id);
      expect(await auth.logout(sessionToken)).toBe(true);
      expect(await auth.validateSession(sessionToken)).toBeNull();
    });

    it('returns safe user fields only', async () => {
      const result = signedIn(await service.signIn(ALEX));

      expect(Object.keys(result.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    });

    it('gives each sign-in its own session', async () => {
      const first = signedIn(await service.signIn(ALEX));
      const second = signedIn(await service.signIn(ALEX));

      expect(second.sessionToken).not.toBe(first.sessionToken);
    });

    it('keeps the new account if the session fails, and a retry signs in to it', async () => {
      const outage = new RepositoryUnavailableError();
      vi.spyOn(sessions, 'createSession').mockRejectedValueOnce(outage);

      await expect(service.signIn(ALEX)).rejects.toBe(outage);

      const stored = await users.findByEmail(ALEX.email);
      const { user } = signedIn(await service.signIn(ALEX));
      expect(user.id).toBe(stored?.id);
    });
  });

  describe('password authentication', () => {
    it('cannot sign in to a Google user', async () => {
      await service.signIn(ALEX);
      const auth = new AuthService(users, sessions);

      await expect(
        auth.login({ email: ALEX.email, password: 'AnyPassword123!' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('still works for a password user after a refused Google sign-in', async () => {
      const auth = new AuthService(users, sessions);
      const password = 'CorrectHorse123!';
      await auth.register({ email: ALEX.email, password });

      await service.signIn(ALEX);

      await expect(auth.login({ email: ALEX.email, password })).resolves.toBeDefined();
    });

    it('rejects registering an email held by a Google user', async () => {
      await service.signIn(ALEX);
      const auth = new AuthService(users, sessions);

      await expect(
        auth.register({ email: ALEX.email, password: 'CorrectHorse123!' }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });
    });
  });
});
