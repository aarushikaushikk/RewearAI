import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService, AuthError } from '@/services/authService';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

describe('AuthService', () => {
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;
  let authService: AuthService;

  beforeEach(() => {
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
    authService = new AuthService(userRepo, sessionRepo);
  });

  describe('Registration', () => {
    it('successfully registers a user with normalized email, hashed password, and creates an opaque session', async () => {
      const result = await authService.register({
        email: '  NewUser@Example.Com  ',
        password: 'ValidPassword123!',
        name: 'Alex Smith',
      });

      expect(result.user).toBeDefined();
      expect(result.user.id).toBeDefined();
      expect(result.user.email).toBe('newuser@example.com');
      expect(result.user.name).toBe('Alex Smith');
      // Must not leak password hash
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

      // Session token is returned for HTTP-only cookie
      expect(result.sessionToken).toBeDefined();
      expect(typeof result.sessionToken).toBe('string');
      expect(result.sessionToken.length).toBeGreaterThanOrEqual(32);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify stored user in repository
      const stored = await userRepo.findByEmail('newuser@example.com');
      expect(stored).not.toBeNull();
      expect(stored?.passwordHash).not.toBe('ValidPassword123!');
      expect(stored?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('rejects registration with invalid email format', async () => {
      await expect(
        authService.register({
          email: 'invalid-email',
          password: 'ValidPassword123!',
        })
      ).rejects.toThrow(AuthError);
    });

    it('rejects registration with password shorter than 8 characters', async () => {
      await expect(
        authService.register({
          email: 'user@example.com',
          password: 'short',
        })
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('rejects duplicate email registration (case-insensitive)', async () => {
      await authService.register({
        email: 'person@example.com',
        password: 'ValidPassword123!',
      });

      await expect(
        authService.register({
          email: 'PERSON@EXAMPLE.COM',
          password: 'AnotherPassword123!',
        })
      ).rejects.toThrow(AuthError);
    });

    it('compensates and rolls back user when session creation fails', async () => {
      // Mock sessionRepo.createSession to throw an error
      sessionRepo.createSession = async () => {
        throw new Error('Session database connection failure');
      };

      await expect(
        authService.register({
          email: 'rollback-test@example.com',
          password: 'ValidPassword123!',
        })
      ).rejects.toThrow('Registration failed during session initialization. Please try again.');

      // Verify user was rolled back and does not exist in repo
      const user = await userRepo.findByEmail('rollback-test@example.com');
      expect(user).toBeNull();
    });

    it('provides clear actionable error when rollback is unavailable and session creation fails', async () => {
      // Override deleteById on userRepo to simulate adapter without rollback
      (userRepo as unknown as Record<string, unknown>).deleteById = undefined;

      sessionRepo.createSession = async () => {
        throw new Error('Session database connection failure');
      };

      await expect(
        authService.register({
          email: 'no-rollback@example.com',
          password: 'ValidPassword123!',
        })
      ).rejects.toThrow(
        'Account registered successfully, but automatic sign-in failed. Please sign in with your credentials.'
      );

      // Verify user still exists in repo so they can sign in
      const user = await userRepo.findByEmail('no-rollback@example.com');
      expect(user).not.toBeNull();
    });
  });

  describe('Login', () => {
    beforeEach(async () => {
      await authService.register({
        email: 'existing@example.com',
        password: 'CorrectPassword123!',
        name: 'Existing User',
      });
    });

    it('successfully logs in with valid credentials and creates a new session', async () => {
      const result = await authService.login({
        email: 'EXISTING@EXAMPLE.COM',
        password: 'CorrectPassword123!',
      });

      expect(result.user.email).toBe('existing@example.com');
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(result.sessionToken).toBeDefined();

      // Verify that the session token is active
      const sessionValidation = await authService.validateSession(result.sessionToken);
      expect(sessionValidation).not.toBeNull();
      expect(sessionValidation?.user.email).toBe('existing@example.com');
    });

    it('fails with safe error message when email does not exist (no user enumeration)', async () => {
      try {
        await authService.login({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        });
        expect.unreachable('Should have thrown AuthError');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).message).toBe('Invalid email or password');
        expect((err as AuthError).statusCode).toBe(401);
      }
    });

    it('fails with safe generic error message when password is wrong', async () => {
      try {
        await authService.login({
          email: 'existing@example.com',
          password: 'WrongPassword123!',
        });
        expect.unreachable('Should have thrown AuthError');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).message).toBe('Invalid email or password');
        expect((err as AuthError).statusCode).toBe(401);
      }
    });
  });

  describe('Session Validation and Revocation (Logout)', () => {
    it('validates active session and derives authenticated user', async () => {
      const loginResult = await authService.register({
        email: 'session-test@example.com',
        password: 'Password12345!',
      });

      const validated = await authService.validateSession(loginResult.sessionToken);
      expect(validated).not.toBeNull();
      expect(validated?.user.id).toBe(loginResult.user.id);
      expect(validated?.user.email).toBe('session-test@example.com');
    });

    it('rejects an invalid or tampered session token', async () => {
      const validated = await authService.validateSession('tampered-or-fake-token-12345');
      expect(validated).toBeNull();
    });

    it('successfully revokes session on logout so the token cannot be reused', async () => {
      const loginResult = await authService.register({
        email: 'logout-test@example.com',
        password: 'Password12345!',
      });

      const initialValidation = await authService.validateSession(loginResult.sessionToken);
      expect(initialValidation).not.toBeNull();

      // Logout / revoke
      const loggedOut = await authService.logout(loginResult.sessionToken);
      expect(loggedOut).toBe(true);

      // Subsequent session check must fail
      const subsequentValidation = await authService.validateSession(loginResult.sessionToken);
      expect(subsequentValidation).toBeNull();
    });

    it('does not validate expired sessions', async () => {
      const loginResult = await authService.register({
        email: 'expiry-test@example.com',
        password: 'Password12345!',
      });

      const tokenHash = (await import('@/lib/auth/sessionTokens')).hashToken(
        loginResult.sessionToken
      );
      sessionRepo.expireSessionForTest(tokenHash);

      const validated = await authService.validateSession(loginResult.sessionToken);
      expect(validated).toBeNull();
    });
  });

  describe('Multi-User Isolation Invariant', () => {
    it('guarantees each session resolves exclusively to its own user', async () => {
      const user1 = await authService.register({
        email: 'user1@example.com',
        password: 'Password12345!',
        name: 'User One',
      });

      const user2 = await authService.register({
        email: 'user2@example.com',
        password: 'Password12345!',
        name: 'User Two',
      });

      const session1 = await authService.validateSession(user1.sessionToken);
      const session2 = await authService.validateSession(user2.sessionToken);

      expect(session1?.user.id).toBe(user1.user.id);
      expect(session1?.user.email).toBe('user1@example.com');

      expect(session2?.user.id).toBe(user2.user.id);
      expect(session2?.user.email).toBe('user2@example.com');

      expect(session1?.user.id).not.toBe(session2?.user.id);
    });
  });
});
