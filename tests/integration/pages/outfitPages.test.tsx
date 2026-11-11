// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as nextHeaders from 'next/headers';
import CreateOutfitPage from '@/app/outfits/create/page';
import { getProductionAuthService } from '@/lib/auth/getAuthService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { AuthService } from '@/services/authService';
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
  usePathname: () => '/outfits/create',
}));

vi.mock('@/lib/auth/getAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/getAuthService')>()),
  getProductionAuthService: vi.fn(),
}));

function setCookie(token?: string) {
  const store = {
    get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { name, value: token } : undefined),
  };
  vi.mocked(nextHeaders.cookies).mockResolvedValue(store as never);
}

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

describe('Create Outfit page (/outfits/create)', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    vi.mocked(getProductionAuthService).mockReturnValue(authService);
  });

  it('sends a visitor with no session to sign-in', async () => {
    setCookie();

    await expect(redirectTargetOf(() => CreateOutfitPage())).resolves.toBe('/sign-in');
  });

  it('shows one level-one heading, the occasion form, and the header with Create Outfit current', async () => {
    const { sessionToken } = await authService.register({
      email: 'alex@example.com',
      password: 'Password123!',
      name: 'Alex',
    });
    setCookie(sessionToken);

    render(await CreateOutfitPage());

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Create Outfit');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByLabelText(/^occasion/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Outfit' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create Outfit' })[0]).toHaveAttribute('aria-current', 'page');
  });
});
