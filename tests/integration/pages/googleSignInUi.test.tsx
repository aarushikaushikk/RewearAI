// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as nextHeaders from 'next/headers';
import { getProductionAuthService } from '@/lib/auth/getAuthService';
import SignInPage from '@/app/(auth)/sign-in/page';
import SignUpPage from '@/app/(auth)/sign-up/page';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('@/lib/auth/getAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/getAuthService')>()),
  getProductionAuthService: vi.fn(),
}));

const CLIENT_SECRET = 'test-client-secret-value';

function configureGoogle() {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', CLIENT_SECRET);
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:1/rewear_test_never_connected');
}

function signedOut() {
  vi.mocked(nextHeaders.cookies).mockResolvedValue({ get: () => undefined } as never);
}

const signInPage = (reason?: string | string[]) =>
  SignInPage({ searchParams: Promise.resolve(reason === undefined ? {} : { reason }) });

const googleLink = () => screen.queryByRole('link', { name: 'Continue with Google' });

beforeEach(() => {
  signedOut();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe.each([
  ['sign-in', () => signInPage()],
  ['sign-up', () => SignUpPage()],
])('the %s page', (_name, page) => {
  describe('when Google is configured', () => {
    beforeEach(configureGoogle);

    it('offers a plain link to start the flow', async () => {
      render(await page());

      expect(googleLink()).toHaveAttribute('href', '/api/auth/google');
    });

    it('keeps the email and password form', async () => {
      render(await page());

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('sends nothing secret to the page', async () => {
      const { container } = render(await page());

      expect(container.innerHTML).not.toContain(CLIENT_SECRET);
      expect(container.innerHTML).not.toContain('test-client.apps');
    });

    it('hides the option when the database is down', async () => {
      vi.mocked(nextHeaders.cookies).mockResolvedValue({
        get: () => ({ name: 'rewear_session', value: 'token' }),
      } as never);
      vi.mocked(getProductionAuthService).mockReturnValue({
        validateSession: vi.fn().mockRejectedValue(new RepositoryUnavailableError()),
      } as never);

      render(await page());

      expect(googleLink()).not.toBeInTheDocument();
    });
  });

  describe('when Google is not fully configured', () => {
    it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_ORIGIN', 'MONGODB_URI'])(
      'shows no Google option without %s, and keeps the form',
      async (name) => {
        configureGoogle();
        vi.stubEnv(name, '');

        render(await page());

        expect(googleLink()).not.toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      },
    );

    it('shows no Google option with an invalid origin', async () => {
      configureGoogle();
      vi.stubEnv('APP_ORIGIN', 'not-a-url');

      render(await page());

      expect(googleLink()).not.toBeInTheDocument();
    });
  });
});

describe('the Google link component', () => {
  it('is rendered on the server, so its condition never reaches the browser', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../../src/components/auth/GoogleSignInLink.tsx'),
      'utf8',
    );

    expect(source).not.toContain("'use client'");
    expect(source).not.toMatch(/from 'next\/link'/);
    expect(source).not.toContain('process.env');
  });
});

describe('Google failure messages on the sign-in page', () => {
  beforeEach(configureGoogle);

  it.each([
    ['google-cancelled', /sign-in with google was cancelled/i],
    ['google-failed', /couldn't complete sign-in with google, or the attempt expired/i],
    ['google-unavailable', /sign-in with google is temporarily unavailable/i],
    ['google-email-in-use', /already has an account that isn't connected to google/i],
    ['google-email-unverified', /isn't verified/i],
  ])('explains %s', async (reason, message) => {
    render(await signInPage(reason));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('directs an existing email to the way they signed in before', async () => {
    render(await signInPage('google-email-in-use'));

    expect(screen.getByRole('alert')).toHaveTextContent(/sign in the way you did before/i);
  });

  it('still offers Google and the form after a failure, so they can try again', async () => {
    render(await signInPage('google-failed'));

    expect(googleLink()).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it.each([
    ['an unknown reason', 'mystery'],
    ['a provider error', 'access_denied'],
    ['an email', 'alex@example.com'],
    ['markup', '<img src=x onerror=alert(1)>'],
    ['an inherited property name', 'constructor'],
    ['another inherited property name', '__proto__'],
    ['several values', ['google-failed', 'google-cancelled']],
  ])('shows nothing for %s, and never repeats it', async (_name, reason) => {
    const { container } = render(await signInPage(reason));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    if (typeof reason === 'string') {
      expect(container.innerHTML).not.toContain(reason);
    }
  });

  it('never shows a Google message over the outage message', async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: () => ({ name: 'rewear_session', value: 'token' }),
    } as never);
    vi.mocked(getProductionAuthService).mockReturnValue({
      validateSession: vi.fn().mockRejectedValue(new RepositoryUnavailableError()),
    } as never);

    render(await signInPage('google-cancelled'));

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(/sign-in is temporarily unavailable/i);
  });

  it('keeps the session-ended message', async () => {
    render(await signInPage('session-ended'));

    expect(screen.getByRole('alert')).toHaveTextContent(/your session has ended/i);
  });
});
