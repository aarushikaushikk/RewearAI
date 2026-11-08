// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NextRequest } from 'next/server';
import * as nextHeaders from 'next/headers';
import { AuthService } from '@/services/authService';
import { hashToken } from '@/lib/auth/sessionTokens';
import { ConfigurationError, getProductionAuthService } from '@/lib/auth/getAuthService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { proxy } from '@/proxy';
import RootPage from '@/app/page';
import HomePage from '@/app/home/page';
import SignInPage from '@/app/(auth)/sign-in/page';
import SignUpPage from '@/app/(auth)/sign-up/page';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

// The real redirect() is kept so tests assert on the error Next.js acts on.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/lib/auth/getAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/getAuthService')>()),
  getProductionAuthService: vi.fn(),
}));

const PASSWORD = 'Password123!';
const SESSION_ENDED_URL = '/sign-in?reason=session-ended';

function setCookie(token?: string) {
  const store = {
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && token ? { name, value: token } : undefined,
  };
  vi.mocked(nextHeaders.cookies).mockResolvedValue(store as never);
}

/** Reads the redirect target from the error thrown by the real redirect(). */
async function redirectTargetOf(action: () => Promise<unknown>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return digest.split(';')[2];
    }
    throw err;
  }
}

function signInPage(reason?: string) {
  return SignInPage({ searchParams: Promise.resolve(reason ? { reason } : {}) });
}

describe('session-aware pages', () => {
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;
  let authService: AuthService;

  beforeEach(() => {
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
    authService = new AuthService(userRepo, sessionRepo);
    vi.mocked(getProductionAuthService).mockReset();
    vi.mocked(getProductionAuthService).mockReturnValue(authService);
  });

  afterEach(() => {
    cleanup();
  });

  function simulateOutage() {
    vi.mocked(getProductionAuthService).mockImplementation(() => {
      throw new ConfigurationError();
    });
  }

  describe('Root (/)', () => {
    it('forwards to Home at /home', async () => {
      setCookie();
      await expect(redirectTargetOf(async () => RootPage())).resolves.toBe('/home');
    });
  });

  describe('Home (private page)', () => {
    it('renders only the signed-in user for a valid session', async () => {
      const alice = await authService.register({
        email: 'alice@example.com',
        password: PASSWORD,
        name: 'Alice',
      });
      await authService.register({ email: 'bob@example.com', password: PASSWORD, name: 'Bob' });
      setCookie(alice.sessionToken);

      render(await HomePage());

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alice');
      expect(document.body).not.toHaveTextContent('Bob');
      expect(document.body).not.toHaveTextContent('bob@example.com');
    });

    it('sends a visitor with no cookie to sign-in without a session-ended notice', async () => {
      setCookie();
      await expect(redirectTargetOf(() => HomePage())).resolves.toBe('/sign-in');
    });

    it('does not resolve the auth service for a visitor with no cookie', async () => {
      setCookie();
      await redirectTargetOf(() => HomePage());
      expect(getProductionAuthService).not.toHaveBeenCalled();
    });

    it('rejects a forged cookie', async () => {
      setCookie('forged-token');
      await expect(redirectTargetOf(() => HomePage())).resolves.toBe(SESSION_ENDED_URL);
    });

    it('rejects an expired session', async () => {
      const { sessionToken } = await authService.register({
        email: 'expired@example.com',
        password: PASSWORD,
      });
      sessionRepo.expireSessionForTest(hashToken(sessionToken));
      setCookie(sessionToken);

      await expect(redirectTargetOf(() => HomePage())).resolves.toBe(SESSION_ENDED_URL);
    });

    it('rejects a revoked session', async () => {
      const { sessionToken } = await authService.register({
        email: 'revoked@example.com',
        password: PASSWORD,
      });
      await authService.logout(sessionToken);
      setCookie(sessionToken);

      await expect(redirectTargetOf(() => HomePage())).resolves.toBe(SESSION_ENDED_URL);
    });

    it('rejects a session whose user no longer exists', async () => {
      const { sessionToken, user } = await authService.register({
        email: 'deleted@example.com',
        password: PASSWORD,
      });
      await userRepo.deleteById(user.id);
      setCookie(sessionToken);

      await expect(redirectTargetOf(() => HomePage())).resolves.toBe(SESSION_ENDED_URL);
    });

    it('raises an outage to the error boundary rather than treating it as signed out', async () => {
      simulateOutage();
      setCookie('any-token');

      await expect(HomePage()).rejects.toBeInstanceOf(ConfigurationError);
    });

    it('raises a session lookup failure to the error boundary', async () => {
      vi.spyOn(sessionRepo, 'findActiveSessionByTokenHash').mockRejectedValue(
        new Error('database unavailable'),
      );
      setCookie('any-token');

      await expect(HomePage()).rejects.toThrow('database unavailable');
    });
  });

  describe('Sign In (public page)', () => {
    it('renders the form with no notice for a visitor with no cookie', async () => {
      setCookie();
      render(await signInPage());

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders the form for a stale cookie instead of redirecting', async () => {
      setCookie('forged-token');
      render(await signInPage());

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('explains that the session ended when sent back from a private page', async () => {
      setCookie('forged-token');
      render(await signInPage('session-ended'));

      expect(screen.getByRole('alert')).toHaveTextContent(/your session has ended/i);
    });

    it('ignores unknown reason values', async () => {
      setCookie();
      render(await signInPage('<script>alert(1)</script>'));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent('<script>');
    });

    it('redirects a valid session to Home', async () => {
      const { sessionToken } = await authService.register({
        email: 'signed-in@example.com',
        password: PASSWORD,
      });
      setCookie(sessionToken);

      await expect(redirectTargetOf(() => signInPage())).resolves.toBe('/home');
    });

    it('keeps the form reachable and reports an outage when a cookie cannot be checked', async () => {
      simulateOutage();
      setCookie('any-token');
      render(await signInPage());

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
    });

    it('reports the outage rather than an ended session when both apply', async () => {
      simulateOutage();
      setCookie('any-token');
      render(await signInPage('session-ended'));

      expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
      expect(document.body).not.toHaveTextContent(/your session has ended/i);
    });

    it('renders normally during an outage when there is no cookie to check', async () => {
      simulateOutage();
      setCookie();
      render(await signInPage());

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Sign Up (public page)', () => {
    it('renders the form for a stale cookie instead of redirecting', async () => {
      setCookie('forged-token');
      render(await SignUpPage());

      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('redirects a valid session to Home', async () => {
      const { sessionToken } = await authService.register({
        email: 'signed-in-2@example.com',
        password: PASSWORD,
      });
      setCookie(sessionToken);

      await expect(redirectTargetOf(() => SignUpPage())).resolves.toBe('/home');
    });

    it('keeps the form reachable and reports an outage when a cookie cannot be checked', async () => {
      simulateOutage();
      setCookie('any-token');
      render(await SignUpPage());

      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
    });
  });

  describe('redirect loop regression', () => {
    it('ends at the sign-in form when following redirects with a stale cookie', async () => {
      const token = 'stale-token';
      setCookie(token);
      const cookieHeader = `${SESSION_COOKIE_NAME}=${token}`;
      const origin = 'http://localhost:3000';

      // Proxy lets the cookie reach Home, and Home rejects it.
      const home = proxy(new NextRequest(`${origin}/`, { headers: { cookie: cookieHeader } }));
      expect(home.headers.get('location')).toBeNull();
      const target = await redirectTargetOf(() => HomePage());
      expect(target).toBe(SESSION_ENDED_URL);

      // Proxy must not bounce the redirect back, and the page must render the form.
      const signIn = proxy(
        new NextRequest(`${origin}${target}`, { headers: { cookie: cookieHeader } }),
      );
      expect(signIn.headers.get('location')).toBeNull();
      render(await signInPage('session-ended'));
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
