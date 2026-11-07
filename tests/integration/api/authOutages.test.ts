import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetSession, handleLogin, handleLogout, handleRegister } from '@/lib/auth/authHandlers';
import { AuthService } from '@/services/authService';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { RepositoryError, RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

const UNAVAILABLE_MESSAGE =
  'Authentication service is temporarily unavailable. Please try again later.';
const SENSITIVE_TEXT = 'cluster0.abcde.mongodb.net user:s3cr3t-pass E11000 person@example.com';
const LIMIT = 3;

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getSession(token: string) {
  return new Request('http://localhost:3000/api/auth/session', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

async function expectSafeUnavailable(res: Response) {
  expect(res.status).toBe(503);
  expect(res.headers.get('set-cookie')).toBeNull();
  const text = await res.text();
  expect(JSON.parse(text)).toMatchObject({ success: false, error: UNAVAILABLE_MESSAGE });
  expect(text).not.toMatch(/mongo|cluster|s3cr3t|E11000|repository/i);
}

describe('Auth routes during a database outage', () => {
  const credentials = { email: 'person@example.com', password: 'Password123!' };
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;
  let authService: AuthService;
  let rateLimiter: MemoryRateLimiter;

  beforeEach(() => {
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
    authService = new AuthService(userRepo, sessionRepo);
    rateLimiter = new MemoryRateLimiter({ maxAttempts: LIMIT, windowMs: 60_000 });
  });

  describe('responses', () => {
    it('login answers a safe 503', async () => {
      vi.spyOn(userRepo, 'findByEmail').mockRejectedValue(new RepositoryUnavailableError());

      await expectSafeUnavailable(
        await handleLogin(post('login', credentials), { authService, rateLimiter }),
      );
    });

    it('login answers a safe 503 when only session creation is down', async () => {
      await authService.register(credentials);
      vi.spyOn(sessionRepo, 'createSession').mockRejectedValue(new RepositoryUnavailableError());

      await expectSafeUnavailable(
        await handleLogin(post('login', credentials), { authService, rateLimiter }),
      );
    });

    it('register answers a safe 503', async () => {
      vi.spyOn(userRepo, 'findByEmail').mockRejectedValue(new RepositoryUnavailableError());

      await expectSafeUnavailable(
        await handleRegister(post('register', credentials), { authService, rateLimiter }),
      );
    });

    it('register answers a safe 503 when the account cannot be written', async () => {
      vi.spyOn(userRepo, 'create').mockRejectedValue(new RepositoryUnavailableError());

      await expectSafeUnavailable(
        await handleRegister(post('register', credentials), { authService, rateLimiter }),
      );
    });

    it('session answers 503 rather than treating the user as signed out', async () => {
      vi.spyOn(sessionRepo, 'findActiveSessionByTokenHash').mockRejectedValue(
        new RepositoryUnavailableError(),
      );

      await expectSafeUnavailable(await handleGetSession(getSession('some-token'), { authService }));
    });

    it('logout answers 503 and keeps the cookie, so the user knows it did not complete', async () => {
      vi.spyOn(sessionRepo, 'revokeSessionByTokenHash').mockRejectedValue(
        new RepositoryUnavailableError(),
      );

      await expectSafeUnavailable(
        await handleLogout(post('logout', {}, 'some-token'), { authService }),
      );
    });
  });

  describe('other failures', () => {
    it.each([
      ['a typed repository failure', () => new RepositoryError()],
      ['an unexpected error', () => new Error(SENSITIVE_TEXT)],
    ])('login answers a generic 500 for %s', async (_label, makeError) => {
      vi.spyOn(userRepo, 'findByEmail').mockRejectedValue(makeError());

      const res = await handleLogin(post('login', credentials), { authService, rateLimiter });

      expect(res.status).toBe(500);
      expect(await res.text()).not.toMatch(/mongo|cluster|s3cr3t|E11000|person@example/i);
    });

    it('register does not expose an unexpected error', async () => {
      vi.spyOn(userRepo, 'create').mockRejectedValue(new Error(SENSITIVE_TEXT));

      const res = await handleRegister(post('register', credentials), { authService, rateLimiter });

      expect(res.status).toBe(500);
      expect(await res.text()).not.toMatch(/mongo|cluster|s3cr3t|E11000|person@example/i);
    });

    it('session and logout do not expose an unexpected error', async () => {
      vi.spyOn(sessionRepo, 'findActiveSessionByTokenHash').mockRejectedValue(
        new Error(SENSITIVE_TEXT),
      );
      vi.spyOn(sessionRepo, 'revokeSessionByTokenHash').mockRejectedValue(new Error(SENSITIVE_TEXT));

      const session = await handleGetSession(getSession('some-token'), { authService });
      const logout = await handleLogout(post('logout', {}, 'some-token'), { authService });

      expect(session.status).toBe(500);
      expect(await session.text()).not.toMatch(/mongo|cluster|s3cr3t/i);
      expect(logout.status).toBe(500);
      expect(await logout.text()).not.toMatch(/mongo|cluster|s3cr3t/i);
    });
  });

  describe('rate limiting', () => {
    const OVER_THE_LIMIT = LIMIT + 2;

    it('does not lock a user out of login because of an outage', async () => {
      await authService.register(credentials);
      const findByEmail = vi
        .spyOn(userRepo, 'findByEmail')
        .mockRejectedValue(new RepositoryUnavailableError());

      for (let i = 0; i < OVER_THE_LIMIT; i++) {
        const res = await handleLogin(post('login', credentials), { authService, rateLimiter });
        expect(res.status).toBe(503);
      }

      findByEmail.mockRestore();
      const recovered = await handleLogin(post('login', credentials), { authService, rateLimiter });
      expect(recovered.status).toBe(200);
    });

    it('does not lock a user out of registration because of an outage', async () => {
      const create = vi.spyOn(userRepo, 'create').mockRejectedValue(new RepositoryUnavailableError());

      for (let i = 0; i < OVER_THE_LIMIT; i++) {
        const res = await handleRegister(post('register', credentials), { authService, rateLimiter });
        expect(res.status).toBe(503);
      }

      create.mockRestore();
      const recovered = await handleRegister(post('register', credentials), {
        authService,
        rateLimiter,
      });
      expect(recovered.status).toBe(201);
    });

    it('does not count an unexpected server error against the user', async () => {
      await authService.register(credentials);
      const findByEmail = vi.spyOn(userRepo, 'findByEmail').mockRejectedValue(new Error('bug'));

      for (let i = 0; i < OVER_THE_LIMIT; i++) {
        await handleLogin(post('login', credentials), { authService, rateLimiter });
      }

      findByEmail.mockRestore();
      const recovered = await handleLogin(post('login', credentials), { authService, rateLimiter });
      expect(recovered.status).toBe(200);
    });

    it('still counts wrong passwords', async () => {
      await authService.register(credentials);
      const attempt = { ...credentials, password: 'WrongPassword123!' };

      for (let i = 0; i < LIMIT; i++) {
        const res = await handleLogin(post('login', attempt), { authService, rateLimiter });
        expect(res.status).toBe(401);
      }

      const blocked = await handleLogin(post('login', credentials), { authService, rateLimiter });
      expect(blocked.status).toBe(429);
    });

    it('still counts repeated registration of an existing email', async () => {
      await authService.register(credentials);

      for (let i = 0; i < LIMIT; i++) {
        const res = await handleRegister(post('register', credentials), { authService, rateLimiter });
        expect(res.status).toBe(409);
      }

      const blocked = await handleRegister(post('register', credentials), {
        authService,
        rateLimiter,
      });
      expect(blocked.status).toBe(429);
    });
  });
});
