// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AppHeader } from '@/components/layout/AppHeader';
import type { SafeUser } from '@/types/user';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

const pathname = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => pathname.current,
}));

const user: SafeUser = {
  id: 'user_1',
  email: 'alice@example.com',
  name: 'Alice',
  createdAt: new Date('2026-01-01'),
};

function mockLogoutResponse(status: number) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ success: status < 300 }),
  } as Response);
}

function accountButton() {
  return screen.getByRole('button', { name: /account menu/i });
}

function menuButton() {
  return screen.getByRole('button', { name: /^menu$/i });
}

async function clickSignOut() {
  const actor = userEvent.setup();
  await actor.click(accountButton());
  await actor.click(screen.getByRole('button', { name: /sign out/i }));
}

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.current = '/';
  });

  afterEach(() => {
    cleanup();
  });

  describe('sign out', () => {
    it('posts to the logout endpoint', async () => {
      mockLogoutResponse(200);
      render(<AppHeader user={user} />);
      await clickSignOut();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('leaves for sign-in and clears cached private pages after a successful logout', async () => {
      mockLogoutResponse(200);
      render(<AppHeader user={user} />);
      await clickSignOut();

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
      expect(router.refresh).toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([403, 500, 503])('stays on the page and reports a %i logout failure', async (status) => {
      mockLogoutResponse(status);
      render(<AppHeader user={user} />);
      await clickSignOut();

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't sign you out/i);
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    });

    it('stays on the page and reports a network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      render(<AppHeader user={user} />);
      await clickSignOut();

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't sign you out/i);
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    });

    it('does not show raw error details', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.1'));
      render(<AppHeader user={user} />);
      await clickSignOut();

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('ECONNREFUSED');
    });

    it('moves focus to the failure message so keyboard users are not stranded', async () => {
      mockLogoutResponse(500);
      render(<AppHeader user={user} />);
      await clickSignOut();

      expect(await screen.findByRole('alert')).toHaveFocus();
    });

    it('lets the user retry after a failure', async () => {
      mockLogoutResponse(500);
      render(<AppHeader user={user} />);
      await clickSignOut();
      await screen.findByRole('alert');

      mockLogoutResponse(200);
      await clickSignOut();

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows progress and blocks a second request while signing out', async () => {
      global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      render(<AppHeader user={user} />);
      await clickSignOut();

      expect(await screen.findByRole('button', { name: /signing out/i })).toBeDisabled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('account menu', () => {
    it('has an accessible name that does not depend on visible text', () => {
      render(<AppHeader user={user} />);
      expect(accountButton()).toHaveAccessibleName(/account menu for alice/i);
    });

    it('falls back to the email address when the user has no name', () => {
      render(<AppHeader user={{ ...user, name: null }} />);
      expect(accountButton()).toHaveAccessibleName(/account menu for alice@example\.com/i);
    });

    it('reports its state and reveals the account email and sign out', async () => {
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);
      expect(accountButton()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();

      await actor.click(accountButton());

      expect(accountButton()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });

    it('does not open the navigation menu', async () => {
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);

      await actor.click(accountButton());

      expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('navigation', { name: /mobile/i })).not.toBeInTheDocument();
    });

    it('closes on Escape and returns focus to its button', async () => {
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);
      await actor.click(accountButton());

      await actor.keyboard('{Escape}');

      expect(accountButton()).toHaveAttribute('aria-expanded', 'false');
      expect(accountButton()).toHaveFocus();
    });

    it('closes when clicking elsewhere', async () => {
      const actor = userEvent.setup();
      render(
        <div>
          <AppHeader user={user} />
          <p>Page content</p>
        </div>,
      );
      await actor.click(accountButton());

      await actor.click(screen.getByText('Page content'));

      expect(accountButton()).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes when keyboard focus leaves it', async () => {
      const actor = userEvent.setup();
      render(
        <div>
          <AppHeader user={user} />
          <a href="#after">After header</a>
        </div>,
      );
      await actor.click(accountButton());
      screen.getByRole('button', { name: /sign out/i }).focus();

      screen.getByRole('link', { name: /after header/i }).focus();

      await waitFor(() => expect(accountButton()).toHaveAttribute('aria-expanded', 'false'));
    });
  });

  describe('navigation menu', () => {
    it('has a visible text label and identifies what it controls', () => {
      render(<AppHeader user={user} />);

      expect(menuButton()).toHaveTextContent(/^menu$/i);
      expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
      expect(menuButton()).toHaveAttribute('aria-controls');
    });

    it('opens the drawer without opening the account menu', async () => {
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);

      await actor.click(menuButton());

      const drawer = screen.getByRole('navigation', { name: /mobile/i });
      expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
      expect(menuButton().getAttribute('aria-controls')).toBe(drawer.id);
      expect(accountButton()).toHaveAttribute('aria-expanded', 'false');
    });

    it('offers every destination, the account email, and exactly one sign out', async () => {
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);

      await actor.click(menuButton());

      const drawer = within(screen.getByRole('navigation', { name: /mobile/i }));
      for (const label of ['Home', 'My Wardrobe', 'Create Outfit', 'Saved Outfits', 'Outfit History']) {
        expect(drawer.getByRole('link', { name: label })).toBeInTheDocument();
      }
      expect(drawer.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /sign out/i })).toHaveLength(1);
    });

    it('closes on Escape and returns focus to its button', async () => {
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);
      await actor.click(menuButton());

      await actor.keyboard('{Escape}');

      expect(screen.queryByRole('navigation', { name: /mobile/i })).not.toBeInTheDocument();
      expect(menuButton()).toHaveFocus();
    });

    it('closes after choosing a destination', async () => {
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);
      await actor.click(menuButton());

      const drawer = within(screen.getByRole('navigation', { name: /mobile/i }));
      await actor.click(drawer.getByRole('link', { name: 'Home' }));

      expect(screen.queryByRole('navigation', { name: /mobile/i })).not.toBeInTheDocument();
    });

    it('signs out from the drawer', async () => {
      mockLogoutResponse(200);
      const actor = userEvent.setup();
      render(<AppHeader user={user} />);
      await actor.click(menuButton());

      await actor.click(screen.getByRole('button', { name: /sign out/i }));

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
    });
  });

  describe('current page', () => {
    function currentLinks() {
      const nav = screen.getByRole('navigation', { name: /main/i });
      return within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent);
    }

    it.each([
      ['/home', 'Home'],
      ['/wardrobe', 'My Wardrobe'],
      ['/wardrobe/new', 'My Wardrobe'],
      ['/outfits/create', 'Create Outfit'],
      ['/outfits/saved', 'Saved Outfits'],
      ['/outfits/history', 'Outfit History'],
    ])('on %s marks only %s', (path, label) => {
      pathname.current = path;
      render(<AppHeader user={user} />);

      expect(currentLinks()).toEqual([label]);
    });
  });

  it('starts with a skip link to the main content', () => {
    render(<AppHeader user={user} />);

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getAllByRole('link')[0]).toBe(skipLink);
  });
});
