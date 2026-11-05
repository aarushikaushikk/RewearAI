import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '@/services/authService';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import {
  getSessionFromRequest,
  getServerSession,
  getCurrentSession,
  requireAuth,
} from '@/lib/auth/sessionHelper';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import * as nextHeaders from 'next/headers';
import { connection } from 'next/server';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

describe('Server-Side Session Helpers (sessionHelper)', () => {
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
    authService = new AuthService(userRepo, sessionRepo);
  });

  describe('getSessionFromRequest', () => {
    it('extracts session token from request Cookie header and returns authenticated user and session', async () => {
      const registered = await authService.register({
        email: 'helper-test@example.com',
        password: 'Password123!',
        name: 'Helper User',
      });

      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${registered.sessionToken}; Other=val`,
        },
      });

      const sessionInfo = await getSessionFromRequest(req, authService);
      expect(sessionInfo).not.toBeNull();
      expect(sessionInfo?.user.id).toBe(registered.user.id);
      expect(sessionInfo?.user.email).toBe('helper-test@example.com');
    });

    it('returns null when Cookie header is absent', async () => {
      const req = new Request('http://localhost:3000/api/auth/session');
      const sessionInfo = await getSessionFromRequest(req, authService);
      expect(sessionInfo).toBeNull();
    });

    it('returns null when rewear_session cookie is missing', async () => {
      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: 'unrelated_cookie=abc1234',
        },
      });
      const sessionInfo = await getSessionFromRequest(req, authService);
      expect(sessionInfo).toBeNull();
    });
  });

  describe('getServerSession (Next.js 16 Server Components using next/headers cookies())', () => {
    it('reads session token from Next.js server cookieStore and returns authenticated user', async () => {
      const registered = await authService.register({
        email: 'server-component@example.com',
        password: 'Password123!',
      });

      const mockCookieStore = {
        get: vi.fn().mockImplementation((name: string) => {
          if (name === SESSION_COOKIE_NAME) {
            return { name: SESSION_COOKIE_NAME, value: registered.sessionToken };
          }
          return undefined;
        }),
      };

      vi.mocked(nextHeaders.cookies).mockResolvedValue(mockCookieStore as never);

      const sessionInfo = await getServerSession(authService);
      expect(sessionInfo).not.toBeNull();
      expect(sessionInfo?.user.email).toBe('server-component@example.com');
      expect(sessionInfo?.user.id).toBe(registered.user.id);
    });

    it('returns null when cookieStore has no session token', async () => {
      const mockCookieStore = {
        get: vi.fn().mockReturnValue(undefined),
      };
      vi.mocked(nextHeaders.cookies).mockResolvedValue(mockCookieStore as never);

      const sessionInfo = await getServerSession(authService);
      expect(sessionInfo).toBeNull();
    });
  });

  describe('resolution order and fail-closed behavior', () => {
    function mockCookieStore(token?: string) {
      const store = {
        get: vi.fn().mockReturnValue(
          token ? { name: SESSION_COOKIE_NAME, value: token } : undefined
        ),
      };
      vi.mocked(nextHeaders.cookies).mockResolvedValue(store as never);
    }

    it('getServerSession returns null without resolving the service when no cookie exists', async () => {
      mockCookieStore();
      await expect(getServerSession()).resolves.toBeNull();
    });

    it('getServerSession defers to request time before validating a token', async () => {
      // validateSession reads the clock, which Cache Components rejects while prerendering.
      mockCookieStore('some-token');
      const order: string[] = [];
      vi.mocked(connection).mockImplementationOnce(async () => {
        order.push('connection');
      });
      const service = {
        validateSession: vi.fn().mockImplementation(async () => {
          order.push('validateSession');
          return null;
        }),
      } as unknown as AuthService;

      await getServerSession(service);

      expect(order).toEqual(['connection', 'validateSession']);
    });

    it('getServerSession fails closed when a cookie exists but the service is unconfigured', async () => {
      mockCookieStore('some-token');
      await expect(getServerSession()).rejects.toBeInstanceOf(ConfigurationError);
    });

    it('getServerSession does not report a validation failure as signed out', async () => {
      mockCookieStore('some-token');
      const failingService = {
        validateSession: vi.fn().mockRejectedValue(new Error('database unavailable')),
      } as unknown as AuthService;

      await expect(getServerSession(failingService)).rejects.toThrow('database unavailable');
    });

    it('getServerSession propagates errors thrown by cookies()', async () => {
      const prerenderSignal = new Error('Dynamic server usage');
      vi.mocked(nextHeaders.cookies).mockRejectedValue(prerenderSignal);

      await expect(getServerSession(authService)).rejects.toBe(prerenderSignal);
    });

    it('getSessionFromRequest returns null without resolving the service when no cookie exists', async () => {
      const req = new Request('http://localhost:3000/api/wardrobe');
      await expect(getSessionFromRequest(req)).resolves.toBeNull();
    });

    it('getSessionFromRequest fails closed when a cookie exists but the service is unconfigured', async () => {
      const req = new Request('http://localhost:3000/api/wardrobe', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=some-token` },
      });
      await expect(getSessionFromRequest(req)).rejects.toBeInstanceOf(ConfigurationError);
    });

    it('requireAuth reports 401 rather than a configuration error when no cookie exists', async () => {
      const req = new Request('http://localhost:3000/api/wardrobe');
      await expect(requireAuth(req)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });
  });

  describe('getCurrentSession (Automatic Delegation)', () => {
    it('delegates to getSessionFromRequest when Request is provided', async () => {
      const registered = await authService.register({
        email: 'delegated@example.com',
        password: 'Password123!',
      });

      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${registered.sessionToken}`,
        },
      });

      const sessionInfo = await getCurrentSession(req, authService);
      expect(sessionInfo?.user.email).toBe('delegated@example.com');
    });

    it('delegates to getServerSession when Request is omitted', async () => {
      const registered = await authService.register({
        email: 'omitted-req@example.com',
        password: 'Password123!',
      });

      const mockCookieStore = {
        get: vi.fn().mockReturnValue({ name: SESSION_COOKIE_NAME, value: registered.sessionToken }),
      };
      vi.mocked(nextHeaders.cookies).mockResolvedValue(mockCookieStore as never);

      const sessionInfo = await getCurrentSession(undefined, authService);
      expect(sessionInfo?.user.email).toBe('omitted-req@example.com');
    });
  });

  describe('requireAuth', () => {
    it('throws 401 Unauthorized when session is absent', async () => {
      const req = new Request('http://localhost:3000/api/wardrobe');
      await expect(requireAuth(req, authService)).rejects.toThrow('Authentication required');
    });

    it('returns authenticated user when valid session is present', async () => {
      const registered = await authService.register({
        email: 'require-auth@example.com',
        password: 'Password123!',
      });

      const req = new Request('http://localhost:3000/api/wardrobe', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${registered.sessionToken}`,
        },
      });

      const auth = await requireAuth(req, authService);
      expect(auth.user.email).toBe('require-auth@example.com');
      expect(auth.user.id).toBe(registered.user.id);
    });
  });
});
