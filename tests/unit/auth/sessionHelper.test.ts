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
import * as nextHeaders from 'next/headers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
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
