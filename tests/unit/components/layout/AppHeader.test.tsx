// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AppHeader } from '@/components/layout/AppHeader';
import type { SafeUser } from '@/types/user';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
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

async function clickSignOut() {
  const actor = userEvent.setup();
  await actor.click(screen.getByRole('button', { name: /alice/i }));
  await actor.click(screen.getByRole('menuitem', { name: /sign out/i }));
}

describe('AppHeader sign out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

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

    expect(await screen.findByRole('menuitem', { name: /signing out/i })).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
