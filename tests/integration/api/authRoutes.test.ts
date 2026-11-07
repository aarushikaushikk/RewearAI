import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleGetSession,
} from '@/lib/auth/authHandlers';
import { AuthService } from '@/services/authService';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';

describe('Auth API Routes Integration Tests', () => {
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;
  let authService: AuthService;
  let rateLimiter: MemoryRateLimiter;

  beforeEach(() => {
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
    authService = new AuthService(userRepo, sessionRepo);
    rateLimiter = new MemoryRateLimiter({ maxAttempts: 3, windowMs: 1000 });
  });

  describe('POST /api/auth/register', () => {
    it('creates account, returns 201, sets HTTP-only cookie, and never leaks password hash or raw token', async () => {
      const req = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'RegisterUser@Example.Com',
          password: 'Password123!',
          name: 'New Registrant',
        }),
      });

      const res = await handleRegister(req, { authService, rateLimiter });
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.user.email).toBe('registeruser@example.com');
      expect(json.data.user.name).toBe('New Registrant');
      expect(json.data.user.passwordHash).toBeUndefined();
      expect(json.data.token).toBeUndefined();

      // Check Set-Cookie header
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/');
    });

    it('rejects duplicate email with 409 Conflict', async () => {
      await authService.register({
        email: 'duplicate@example.com',
        password: 'Password123!',
      });

      const req = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'DUPLICATE@example.com',
          password: 'Password123!',
        }),
      });

      const res = await handleRegister(req, { authService, rateLimiter });
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('already exists');
    });

    it('answers 400 for a password of only spaces, and creates no account', async () => {
      const req = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'spaces@example.com', password: '        ' }),
      });

      const res = await handleRegister(req, { authService, rateLimiter });

      expect(res.status).toBe(400);
      expect(await userRepo.findByEmail('spaces@example.com')).toBeNull();
    });

    it('rejects invalid inputs with 400 Bad Request', async () => {
      const req = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'short',
        }),
      });

      const res = await handleRegister(req, { authService, rateLimiter });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it('rejects requests with CSRF origin mismatch (403 Forbidden)', async () => {
      const req = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://evil-attacker.com',
        },
        body: JSON.stringify({
          email: 'csrf-test@example.com',
          password: 'Password123!',
        }),
      });

      const res = await handleRegister(req, { authService, rateLimiter });
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('CSRF');
    });

    it('rejects state-changing registration when Origin and Referer are both missing (403 Forbidden)', async () => {
      const req = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
        },
        body: JSON.stringify({
          email: 'no-origin@example.com',
          password: 'Password123!',
        }),
      });

      const res = await handleRegister(req, { authService, rateLimiter });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await authService.register({
        email: 'user-login@example.com',
        password: 'SecretPassword123!',
        name: 'Login User',
      });
    });

    it('authenticates valid credentials, sets cookie, and returns 200', async () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'USER-LOGIN@EXAMPLE.COM',
          password: 'SecretPassword123!',
        }),
      });

      const res = await handleLogin(req, { authService, rateLimiter });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.user.email).toBe('user-login@example.com');
      expect(json.data.user.passwordHash).toBeUndefined();

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain('HttpOnly');
    });

    it('rejects invalid credentials with generic 401 error message', async () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'user-login@example.com',
          password: 'WrongPassword123!',
        }),
      });

      const res = await handleLogin(req, { authService, rateLimiter });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Invalid email or password');
    });

    it('enforces rate limiting after repeated failed attempts (429 Too Many Requests)', async () => {
      for (let i = 0; i < 3; i++) {
        const req = new Request('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            email: 'user-login@example.com',
            password: 'WrongPassword!',
          }),
        });
        await handleLogin(req, { authService, rateLimiter });
      }

      // 4th attempt should be blocked by rate limiter
      const blockedReq = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'user-login@example.com',
          password: 'SecretPassword123!',
        }),
      });

      const blockedRes = await handleLogin(blockedReq, { authService, rateLimiter });
      expect(blockedRes.status).toBe(429);

      const json = await blockedRes.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Too many');
      expect(blockedRes.headers.get('Retry-After')).toBeDefined();
    });
  });

  describe('GET /api/auth/session & POST /api/auth/logout (Persistence, Invalidation & Reliability)', () => {
    it('persists session across requests and returns safe authenticated user', async () => {
      const reg = await authService.register({
        email: 'persist@example.com',
        password: 'Password123!',
      });

      const req = new Request('http://localhost:3000/api/auth/session', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${reg.sessionToken}`,
        },
      });

      const res = await handleGetSession(req, { authService });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.user.email).toBe('persist@example.com');
      expect(json.data.user.id).toBe(reg.user.id);
    });

    it('returns 401 when unauthenticated', async () => {
      const req = new Request('http://localhost:3000/api/auth/session', {
        method: 'GET',
      });

      const res = await handleGetSession(req, { authService });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('successfully logs out by revoking server-side session and clearing cookie', async () => {
      const reg = await authService.register({
        email: 'logout-route@example.com',
        password: 'Password123!',
      });

      // Logout request
      const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${reg.sessionToken}`,
        },
      });

      const logoutRes = await handleLogout(logoutReq, { authService });
      expect(logoutRes.status).toBe(200);

      const json = await logoutRes.json();
      expect(json.success).toBe(true);

      // Verify Set-Cookie cleared the cookie
      const setCookie = logoutRes.headers.get('set-cookie');
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
      expect(setCookie).toContain('Max-Age=0');

      // Subsequent session check using the same token must now return 401
      const sessionReq = new Request('http://localhost:3000/api/auth/session', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${reg.sessionToken}`,
        },
      });

      const sessionRes = await handleGetSession(sessionReq, { authService });
      expect(sessionRes.status).toBe(401);
    });

    it('returns HTTP 500 when database revocation fails during logout (does not falsely report success)', async () => {
      const reg = await authService.register({
        email: 'db-fail-logout@example.com',
        password: 'Password123!',
      });

      // Mock sessionRepo.revokeSessionByTokenHash to throw a database error
      sessionRepo.revokeSessionByTokenHash = async () => {
        throw new Error('Database connection lost');
      };

      const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${reg.sessionToken}`,
        },
      });

      const logoutRes = await handleLogout(logoutReq, { authService });
      expect(logoutRes.status).toBe(500);

      const json = await logoutRes.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Failed to complete logout');
    });

    it('safely handles logout when user has no active session cookie', async () => {
      const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      });

      const logoutRes = await handleLogout(logoutReq, { authService });
      expect(logoutRes.status).toBe(200);

      const json = await logoutRes.json();
      expect(json.success).toBe(true);
    });
  });

  describe('Malformed payloads', () => {
    function postJson(path: string, rawBody: string) {
      return new Request(`http://localhost:3000/api/auth/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: rawBody,
      });
    }

    const MALFORMED = [
      'not json',
      '',
      'null',
      '123',
      '"text"',
      '[]',
      '{"email":123,"password":"Password123!"}',
      '{"email":{"$ne":""},"password":"Password123!"}',
      '{"email":"a@example.com","password":12345678}',
      '{"email":"a@example.com","password":{"$ne":""}}',
    ];

    it.each(MALFORMED)('login answers 400 for %s', async (rawBody) => {
      const res = await handleLogin(postJson('login', rawBody), { authService, rateLimiter });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(typeof json.error).toBe('string');
    });

    it.each([...MALFORMED, '{"email":"a@example.com","password":"Password123!","name":123}'])(
      'register answers 400 for %s',
      async (rawBody) => {
        const res = await handleRegister(postJson('register', rawBody), {
          authService,
          rateLimiter,
        });
        expect(res.status).toBe(400);

        const json = await res.json();
        expect(json.success).toBe(false);
        expect(typeof json.error).toBe('string');
      },
    );

    it('does not create an account from a malformed payload', async () => {
      await handleRegister(
        postJson('register', '{"email":"a@example.com","password":12345678}'),
        { authService, rateLimiter },
      );
      await expect(userRepo.findByEmail('a@example.com')).resolves.toBeNull();
    });

    it('answers 400 for a malformed payload even while the service is unavailable', async () => {
      const res = await handleLogin(postJson('login', 'null'));
      expect(res.status).toBe(400);
    });

    it('keeps field-level validation for missing fields', async () => {
      const res = await handleLogin(postJson('login', '{}'), { authService, rateLimiter });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Email is required');
    });
  });

  describe('Machine-readable error codes', () => {
    function registerRequest() {
      return new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'partial@example.com', password: 'Password123!' }),
      });
    }

    it('identifies an account created without a session', async () => {
      const noRollbackUserRepo = new MemoryUserRepository();
      Object.assign(noRollbackUserRepo, { deleteById: undefined });
      vi.spyOn(sessionRepo, 'createSession').mockRejectedValue(new Error('session store down'));
      const service = new AuthService(noRollbackUserRepo, sessionRepo);

      const res = await handleRegister(registerRequest(), { authService: service, rateLimiter });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.code).toBe('ACCOUNT_CREATED_SESSION_FAILED');
      expect(JSON.stringify(json)).not.toContain('session store down');
    });

    it('identifies a registration that was rolled back', async () => {
      vi.spyOn(sessionRepo, 'createSession').mockRejectedValue(new Error('session store down'));

      const res = await handleRegister(registerRequest(), { authService, rateLimiter });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.code).toBe('REGISTRATION_SESSION_FAILED');
    });

    it('identifies invalid credentials on login', async () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'Password123!' }),
      });

      const res = await handleLogin(req, { authService, rateLimiter });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Requests with no session cookie during an outage', () => {
    it('session endpoint answers 401, because there is nothing to validate', async () => {
      const req = new Request('http://localhost:3000/api/auth/session');
      const res = await handleGetSession(req);
      expect(res.status).toBe(401);
    });

    it('logout succeeds and clears the cookie, because there is nothing to revoke', async () => {
      const req = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      });

      const res = await handleLogout(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    });

    it('session endpoint still answers 503 when a cookie cannot be validated', async () => {
      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=some-token` },
      });
      const res = await handleGetSession(req);
      expect(res.status).toBe(503);
    });

    it('logout still answers 503 when a session cannot be revoked', async () => {
      const req = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=some-token`,
        },
      });

      const res = await handleLogout(req);

      expect(res.status).toBe(503);
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('Runtime Database Fail-Closed Protection', () => {
    it('fails closed with generic 503 response without exposing internal details', async () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      });

      // Invoke without passing deps so it calls default getProductionAuthService()
      const res = await handleLogin(req);
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Authentication service is temporarily unavailable. Please try again later.');
      // Must not leak internal names or architecture
      expect(json.error).not.toContain('Aarushi');
      expect(json.error).not.toContain('Mongoose');
      expect(json.error).not.toContain('MongoDB');
    });
  });
});
