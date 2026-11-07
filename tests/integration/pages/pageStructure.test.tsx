// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as nextHeaders from 'next/headers';
import { AuthService } from '@/services/authService';
import { getProductionAuthService } from '@/lib/auth/getAuthService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import AuthLayout from '@/app/(auth)/layout';
import SignInPage from '@/app/(auth)/sign-in/page';
import SignUpPage from '@/app/(auth)/sign-up/page';
import HomePage from '@/app/page';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

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

function setCookie(token?: string) {
  const store = {
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && token ? { name, value: token } : undefined,
  };
  vi.mocked(nextHeaders.cookies).mockResolvedValue(store as never);
}

describe('page structure', () => {
  beforeEach(() => {
    setCookie();
  });

  it('wraps authentication pages in a main landmark', () => {
    render(
      <AuthLayout>
        <p>Form</p>
      </AuthLayout>,
    );

    expect(screen.getByRole('main')).toHaveTextContent('Form');
  });

  it('gives Sign In one level-one heading naming the task', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/sign in to your account/i);
    expect(screen.getByText('ReWear AI')).toBeInTheDocument();
  });

  it('gives Sign Up one level-one heading naming the task', async () => {
    render(await SignUpPage());

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/create your account/i);
  });

  describe('Home', () => {
    beforeEach(async () => {
      const authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
      vi.mocked(getProductionAuthService).mockReturnValue(authService);
      const { sessionToken } = await authService.register({
        email: 'structure@example.com',
        password: 'Password123!',
        name: 'Alex',
      });
      setCookie(sessionToken);
    });

    it('exposes the skip-link target on its main landmark', async () => {
      render(await HomePage());

      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });

    it('links Add Clothing to the route in the design specification', async () => {
      render(await HomePage());

      expect(screen.getByRole('link', { name: /add clothing/i })).toHaveAttribute(
        'href',
        '/wardrobe/new',
      );
    });
  });
});
