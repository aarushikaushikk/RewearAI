import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthError, AuthService } from '@/services/authService';
import { handleRegister } from '@/lib/auth/authHandlers';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';
import {
  DuplicateEmailError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

const INPUT = { email: 'person@example.com', password: 'Password123!' };

async function registerError(service: AuthService, input = INPUT) {
  const err = await service.register(input).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AuthError);
  return err as AuthError;
}

describe('Registration failures', () => {
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;
  let service: AuthService;

  beforeEach(() => {
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
    service = new AuthService(userRepo, sessionRepo);
  });

  describe('when the session cannot be created', () => {
    beforeEach(() => {
      vi.spyOn(sessionRepo, 'createSession').mockRejectedValue(new Error('session write failed'));
    });

    it('trusts a successful rollback without another database read', async () => {
      const findById = vi
        .spyOn(userRepo, 'findById')
        .mockRejectedValue(new RepositoryUnavailableError());

      const err = await registerError(service);

      expect(err.code).toBe('REGISTRATION_SESSION_FAILED');
      expect(findById).not.toHaveBeenCalled();
      vi.mocked(findById).mockRestore();
      expect(await userRepo.findByEmail(INPUT.email)).toBeNull();
    });

    it('allows the same email to register again after a rollback', async () => {
      await registerError(service);
      vi.mocked(sessionRepo.createSession).mockRestore();

      const retry = await service.register(INPUT);

      expect(retry.user.email).toBe(INPUT.email);
    });

    it('reports a rollback when the delete finds nothing and the account is confirmed gone', async () => {
      vi.spyOn(userRepo, 'deleteById').mockImplementation(async () => false);
      vi.spyOn(userRepo, 'findById').mockResolvedValue(null);

      expect((await registerError(service)).code).toBe('REGISTRATION_SESSION_FAILED');
    });

    it('tells the user to sign in when the rollback fails and the account remains', async () => {
      vi.spyOn(userRepo, 'deleteById').mockRejectedValue(new Error('delete failed'));

      const err = await registerError(service);

      expect(err.code).toBe('ACCOUNT_CREATED_SESSION_FAILED');
      expect(await userRepo.findByEmail(INPUT.email)).not.toBeNull();
    });

    it('tells the user to sign in when neither the rollback nor the check can run', async () => {
      vi.spyOn(userRepo, 'deleteById').mockRejectedValue(new RepositoryUnavailableError());
      vi.spyOn(userRepo, 'findById').mockRejectedValue(new RepositoryUnavailableError());

      expect((await registerError(service)).code).toBe('ACCOUNT_CREATED_SESSION_FAILED');
    });

    it('keeps a 500 for a failure that is not an outage', async () => {
      expect((await registerError(service)).statusCode).toBe(500);
    });
  });

  describe('when the session store has an outage', () => {
    beforeEach(() => {
      vi.spyOn(sessionRepo, 'createSession').mockRejectedValue(new RepositoryUnavailableError());
    });

    it('answers 503 for a rolled-back registration', async () => {
      const err = await registerError(service);

      expect(err.code).toBe('REGISTRATION_SESSION_FAILED');
      expect(err.statusCode).toBe(503);
    });

    it('answers 503 and keeps the sign-in code when the account remains', async () => {
      vi.spyOn(userRepo, 'deleteById').mockRejectedValue(new RepositoryUnavailableError());
      vi.spyOn(userRepo, 'findById').mockRejectedValue(new RepositoryUnavailableError());

      const res = await handleRegister(
        new Request('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify(INPUT),
        }),
        {
          authService: service,
          rateLimiter: new MemoryRateLimiter({ maxAttempts: 3, windowMs: 60_000 }),
        },
      );

      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('ACCOUNT_CREATED_SESSION_FAILED');
    });
  });

  describe('duplicate detection', () => {
    it('answers 409 when a concurrent request wins the race for the email', async () => {
      vi.spyOn(userRepo, 'create').mockRejectedValue(new DuplicateEmailError());

      const err = await registerError(service);

      expect(err.code).toBe('DUPLICATE_EMAIL');
      expect(err.statusCode).toBe(409);
    });

    it('does not mistake another error mentioning "duplicate" for a taken email', async () => {
      const driverError = new Error('E11000 duplicate key on accounts.providerId');
      vi.spyOn(userRepo, 'create').mockRejectedValue(driverError);

      await expect(service.register(INPUT)).rejects.toBe(driverError);
    });

    it('lets an outage during account creation reach the caller', async () => {
      const outage = new RepositoryUnavailableError();
      vi.spyOn(userRepo, 'create').mockRejectedValue(outage);

      await expect(service.register(INPUT)).rejects.toBe(outage);
    });
  });

  describe('names', () => {
    it('stores a blank name as no name', async () => {
      const result = await service.register({ ...INPUT, name: '   ' });

      expect(result.user.name).toBeNull();
    });

    it('trims a name before storing it', async () => {
      const result = await service.register({ ...INPUT, name: '  Alex  ' });

      expect(result.user.name).toBe('Alex');
    });

    it('rejects a name over 100 characters and creates nothing', async () => {
      const err = await registerError(service, { ...INPUT, name: 'x'.repeat(101) } as typeof INPUT);

      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Name must be 100 characters or fewer');
      expect(await userRepo.findByEmail(INPUT.email)).toBeNull();
    });

    it('accepts a name of exactly 100 characters', async () => {
      const name = 'x'.repeat(100);

      const result = await service.register({ ...INPUT, name });

      expect(result.user.name).toBe(name);
    });

    it('measures the name after trimming, as the database model does', async () => {
      const name = 'x'.repeat(100);

      const result = await service.register({ ...INPUT, name: `  ${name}  ` });

      expect(result.user.name).toBe(name);
    });
  });
});
