import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as nextHeaders from 'next/headers';
import { AuthService } from '@/services/authService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import {
  redirectIfAuthenticated,
  requirePageSession,
  SIGN_IN_SESSION_ENDED_PATH,
} from '@/lib/auth/pageSession';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

function setCookie(token?: string) {
  const store = {
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && token ? { name, value: token } : undefined,
  };
  vi.mocked(nextHeaders.cookies).mockResolvedValue(store as never);
}

function digestOf(err: unknown): string | undefined {
  return (err as { digest?: string }).digest;
}

describe('pageSession', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
  });

  describe('requirePageSession', () => {
    it('returns the authenticated session for a valid cookie', async () => {
      const { sessionToken, user } = await authService.register({
        email: 'guard@example.com',
        password: 'Password123!',
      });
      setCookie(sessionToken);

      const auth = await requirePageSession(authService);

      expect(auth.user.id).toBe(user.id);
    });

    it('redirects to sign-in when no cookie exists', async () => {
      setCookie();

      const err = await requirePageSession(authService).catch((e) => e);

      expect(digestOf(err)).toContain(';/sign-in;');
    });

    it('redirects with the session-ended reason when a cookie is invalid', async () => {
      setCookie('forged-token');

      const err = await requirePageSession(authService).catch((e) => e);

      expect(digestOf(err)).toContain(`;${SIGN_IN_SESSION_ENDED_PATH};`);
    });

    it('propagates service failures', async () => {
      setCookie('some-token');
      const failing = {
        validateSession: vi.fn().mockRejectedValue(new Error('database unavailable')),
      } as unknown as AuthService;

      await expect(requirePageSession(failing)).rejects.toThrow('database unavailable');
    });
  });

  describe('redirectIfAuthenticated', () => {
    it('reports no outage when no cookie exists', async () => {
      setCookie();
      await expect(redirectIfAuthenticated(authService)).resolves.toEqual({
        serviceUnavailable: false,
      });
    });

    it('reports no outage for an invalid cookie', async () => {
      setCookie('forged-token');
      await expect(redirectIfAuthenticated(authService)).resolves.toEqual({
        serviceUnavailable: false,
      });
    });

    it('redirects a valid session to Home', async () => {
      const { sessionToken } = await authService.register({
        email: 'home@example.com',
        password: 'Password123!',
      });
      setCookie(sessionToken);

      const err = await redirectIfAuthenticated(authService).catch((e) => e);

      expect(digestOf(err)).toContain(';/;');
    });

    it('reports an outage instead of throwing when validation fails', async () => {
      setCookie('some-token');
      const failing = {
        validateSession: vi.fn().mockRejectedValue(new Error('database unavailable')),
      } as unknown as AuthService;

      await expect(redirectIfAuthenticated(failing)).resolves.toEqual({
        serviceUnavailable: true,
      });
    });

    it('does not swallow Next.js control-flow errors', async () => {
      const controlFlowError = Object.assign(new Error('Dynamic server usage'), {
        digest: 'DYNAMIC_SERVER_USAGE',
      });
      vi.mocked(nextHeaders.cookies).mockRejectedValue(controlFlowError);

      await expect(redirectIfAuthenticated(authService)).rejects.toBe(controlFlowError);
    });
  });
});
