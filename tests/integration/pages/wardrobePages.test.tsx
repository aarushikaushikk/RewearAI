// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as nextHeaders from 'next/headers';
import { AuthService } from '@/services/authService';
import { getProductionAuthService } from '@/lib/auth/getAuthService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import WardrobePage from '@/app/wardrobe/page';
import ClothingDetailPage from '@/app/wardrobe/[itemId]/page';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { mockRoutes, pending } from '../../helpers/fetchMock';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/wardrobe',
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

const wardrobePage = (query: Record<string, string> = {}) =>
  WardrobePage({ searchParams: Promise.resolve(query) });
const detailPage = (itemId: string) => ClothingDetailPage({ params: Promise.resolve({ itemId }) });

// US4 (#9): My Wardrobe (wireframe 03) and Clothing Detail (wireframe 04) are private pages.
describe('wardrobe pages', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    vi.mocked(getProductionAuthService).mockReturnValue(authService);
  });

  afterEach(cleanup);

  async function signIn() {
    const { sessionToken } = await authService.register({
      email: 'alex@example.com',
      password: 'Password123!',
    });
    setCookie(sessionToken);
  }

  describe('My Wardrobe (/wardrobe)', () => {
    it('sends a signed-out visitor to sign-in', async () => {
      setCookie();

      await expect(redirectTargetOf(() => wardrobePage())).resolves.toBe('/sign-in');
    });

    it('shows the page heading and the Add Clothing action, then loads the grid', async () => {
      await signIn();
      const fetchMock = mockRoutes({ 'GET /api/wardrobe': [pending()] });

      render(await wardrobePage());

      expect(screen.getByRole('heading', { level: 1, name: 'My Wardrobe' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '+ Add Clothing' })).toHaveAttribute('href', '/wardrobe/new');
      expect(fetchMock).toHaveBeenCalledWith('/api/wardrobe', expect.anything());
    });

    it('confirms a deletion only for the known notice', async () => {
      await signIn();
      mockRoutes({ 'GET /api/wardrobe': [{ status: 200, body: { success: true, data: [] } }] });

      render(await wardrobePage({ deleted: '1' }));

      expect(await screen.findByText('Clothing item deleted.')).toBeInTheDocument();
    });
  });

  describe('Clothing Detail (/wardrobe/[itemId])', () => {
    it('sends a signed-out visitor to sign-in', async () => {
      setCookie();

      await expect(redirectTargetOf(() => detailPage('item_1'))).resolves.toBe('/sign-in');
    });

    it('loads the item named in the URL, encoded', async () => {
      await signIn();
      const fetchMock = mockRoutes({ 'GET /api/wardrobe/a%2Fb': [pending()] });

      render(await detailPage('a/b'));

      expect(fetchMock).toHaveBeenCalledWith('/api/wardrobe/a%2Fb', expect.anything());
      expect(screen.getByRole('link', { name: 'Back to My Wardrobe' })).toHaveAttribute('href', '/wardrobe');
    });
  });
});
