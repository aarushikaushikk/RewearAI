// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SavedOutfitList } from '@/components/outfits/SavedOutfitList';
import { SIGN_IN_SESSION_ENDED_PATH } from '@/lib/auth/pageSession';
import type { SavedOutfitDto } from '@/types/outfit';

const DINNER: SavedOutfitDto = {
  id: 'outfit_dinner',
  occasion: 'dinner',
  savedAt: '2026-10-28T12:00:00.000Z',
  items: [
    {
      status: 'present',
      id: 'item_dress',
      name: 'Silk dress',
      image: { url: 'https://res.cloudinary.com/test/image/upload/v1/dress.jpg' },
      category: 'Dress',
      color: 'Black',
      style: 'Slip',
    },
    {
      status: 'present',
      id: 'item_heels',
      name: null,
      image: { url: 'https://res.cloudinary.com/test/image/upload/v1/heels.jpg' },
      category: 'Shoes',
      color: 'Red',
      style: 'Heels',
    },
  ],
};

const WEEKEND: SavedOutfitDto = {
  id: 'outfit_weekend',
  occasion: 'weekend',
  savedAt: '2026-10-24T12:00:00.000Z',
  items: [
    {
      status: 'present',
      id: 'item_tee',
      name: 'Striped tee',
      image: { url: 'https://res.cloudinary.com/test/image/upload/v1/tee.jpg' },
      category: 'Top',
      color: 'White',
      style: 'Tee',
    },
    { status: 'removed', id: 'item_jeans' },
  ],
};

function reply(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
const listed = (outfits: SavedOutfitDto[]) => reply(200, { success: true, data: outfits });
const removed = (id: string) => reply(200, { success: true, data: { id } });

function mockFetch(...responses: (Response | Promise<Response> | Error)[]) {
  const fetchMock = vi.fn(() => {
    const next = responses.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next!);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const card = (title: string) => screen.getByRole('heading', { name: title }).closest('li')!;

async function confirmRemoval(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(within(card(title)).getByRole('button', { name: 'Remove saved' }));
  await user.click(screen.getByRole('button', { name: 'Remove saved outfit' }));
}

describe('SavedOutfitList', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a loading state while the saved outfits load', () => {
    mockFetch(new Promise<Response>(() => {}));

    render(<SavedOutfitList />);

    expect(screen.getByText('Loading your saved outfits…')).toBeInTheDocument();
  });

  it('shows each saved outfit with its occasion, saved date, and item photos', async () => {
    const fetchMock = mockFetch(listed([DINNER, WEEKEND]));

    render(<SavedOutfitList />);

    const titles = await screen.findAllByRole('heading', { level: 2 });
    expect(titles.map((title) => title.textContent)).toEqual(['Dinner outfit', 'Weekend outfit']);
    expect(fetchMock).toHaveBeenCalledWith('/api/outfits/saved', expect.anything());
    const dinner = within(card('Dinner outfit'));
    expect(dinner.getByText('Saved Oct 28')).toBeInTheDocument();
    expect(dinner.getByText('Silk dress')).toBeInTheDocument();
    expect(dinner.getByText('Red Heels')).toBeInTheDocument();
    expect(dinner.getByRole('img', { name: 'Silk dress' })).toBeInTheDocument();
  });

  it('shows a clear missing-item state for an item deleted since saving, inventing nothing', async () => {
    mockFetch(listed([WEEKEND]));

    render(<SavedOutfitList />);

    await screen.findByRole('heading', { name: 'Weekend outfit' });
    const weekend = within(card('Weekend outfit'));
    expect(weekend.getByText('Item removed from your wardrobe')).toBeInTheDocument();
    expect(weekend.getAllByRole('img')).toHaveLength(1);
  });

  it('offers Create Outfit when nothing is saved', async () => {
    mockFetch(listed([]));

    render(<SavedOutfitList />);

    expect(await screen.findByRole('heading', { name: 'No saved outfits yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an outfit' })).toHaveAttribute('href', '/outfits/create');
  });

  it('explains a failed load and loads again on Retry', async () => {
    mockFetch(reply(500), listed([DINNER]));

    render(<SavedOutfitList />);

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your saved outfits. Try again.");
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Dinner outfit' })).toBeInTheDocument();
  });

  it('explains an ended session when loading', async () => {
    mockFetch(reply(401));

    render(<SavedOutfitList />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has ended. Sign in again to continue.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_SESSION_ENDED_PATH);
  });

  it('asks for confirmation, and removes nothing when cancelled', async () => {
    const fetchMock = mockFetch(listed([DINNER]));
    render(<SavedOutfitList />);
    await screen.findByRole('heading', { name: 'Dinner outfit' });

    await user.click(within(card('Dinner outfit')).getByRole('button', { name: 'Remove saved' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Remove this saved outfit?' });
    expect(dialog).toHaveTextContent('Its clothing stays in your wardrobe.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Dinner outfit' })).toBeInTheDocument();
  });

  it('removes the outfit once confirmed and confirms the removal', async () => {
    const fetchMock = mockFetch(listed([DINNER, WEEKEND]), removed(DINNER.id));
    render(<SavedOutfitList />);
    await screen.findByRole('heading', { name: 'Dinner outfit' });

    await confirmRemoval(user, 'Dinner outfit');

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('/api/outfits/saved/outfit_dinner');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({ Origin: window.location.origin });
    expect(await screen.findByText('Saved outfit removed.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dinner outfit' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weekend outfit' })).toBeInTheDocument();
  });

  it('shows the empty state after the last outfit is removed', async () => {
    mockFetch(listed([DINNER]), removed(DINNER.id));
    render(<SavedOutfitList />);
    await screen.findByRole('heading', { name: 'Dinner outfit' });

    await confirmRemoval(user, 'Dinner outfit');

    expect(await screen.findByRole('heading', { name: 'No saved outfits yet' })).toBeInTheDocument();
  });

  it('keeps the outfit and offers Retry when removal fails, then removes it on Retry', async () => {
    const fetchMock = mockFetch(listed([DINNER]), reply(500), removed(DINNER.id));
    render(<SavedOutfitList />);
    await screen.findByRole('heading', { name: 'Dinner outfit' });

    await confirmRemoval(user, 'Dinner outfit');

    const dinner = within(card('Dinner outfit'));
    expect(await dinner.findByRole('alert')).toHaveTextContent("We couldn't remove this saved outfit. Try again.");
    await user.click(dinner.getByRole('button', { name: 'Retry' }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await screen.findByText('Saved outfit removed.')).toBeInTheDocument();
  });

  it('drops an outfit the server no longer has (404) from the list', async () => {
    mockFetch(listed([DINNER]), reply(404));
    render(<SavedOutfitList />);
    await screen.findByRole('heading', { name: 'Dinner outfit' });

    await confirmRemoval(user, 'Dinner outfit');

    expect(await screen.findByRole('heading', { name: 'No saved outfits yet' })).toBeInTheDocument();
  });
});
