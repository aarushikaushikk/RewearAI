// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { HISTORY_MESSAGES, OutfitHistoryList } from '@/components/outfits/OutfitHistoryList';
import { SIGN_IN_SESSION_ENDED_PATH } from '@/lib/auth/pageSession';
import type { MissingWornItemDto, OutfitHistoryEntryDto, WornItemDto } from '@/types/outfitHistory';
import { mockRoutes, pending, type Reply } from '../../../helpers/fetchMock';

const ROUTE = 'GET /api/outfits/history';

function presentItem(overrides: Partial<WornItemDto> = {}): WornItemDto {
  const id = overrides.id ?? 'item_shirt';
  return {
    status: 'present',
    id,
    name: 'Linen shirt',
    image: { url: `https://res.cloudinary.com/test/image/upload/v1/${id}.jpg` },
    category: 'Top',
    color: 'White',
    style: 'Button-down',
    season: 'All-season',
    formality: 'Smart casual',
    ...overrides,
  };
}

const missing = (id: string): MissingWornItemDto => ({ status: 'missing', id });

function historyEntry(overrides: Partial<OutfitHistoryEntryDto> = {}): OutfitHistoryEntryDto {
  return {
    id: 'history_1',
    wornOn: '2026-11-11',
    occasion: 'work',
    recordedAt: '2026-11-11T18:00:00.000Z',
    items: [presentItem(), presentItem({ id: 'item_chinos', name: null, category: 'Bottom', color: 'Navy' })],
    ...overrides,
  };
}

const loaded = (entries: unknown): Reply => ({ status: 200, body: { success: true, data: { entries } } });

afterEach(() => {
  cleanup();
});

describe('OutfitHistoryList (US10, DESIGN §5.8)', () => {
  it('shows an accessible loading state while the history loads', () => {
    mockRoutes({ [ROUTE]: [pending()] });

    render(<OutfitHistoryList />);

    expect(screen.getByRole('status')).toHaveTextContent(HISTORY_MESSAGES.loading);
  });

  it('asks for JSON from the history API', async () => {
    const fetchMock = mockRoutes({ [ROUTE]: [loaded([])] });

    render(<OutfitHistoryList />);
    await screen.findByText(HISTORY_MESSAGES.empty);

    expect(fetchMock).toHaveBeenCalledWith('/api/outfits/history', { headers: { Accept: 'application/json' } });
  });

  it('shows the empty state with a Create an outfit link, and no Saved Outfits link', async () => {
    mockRoutes({ [ROUTE]: [loaded([])] });

    render(<OutfitHistoryList />);

    expect(await screen.findByText("You haven't recorded an outfit yet.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an outfit' })).toHaveAttribute('href', '/outfits/create');
    expect(screen.queryByRole('link', { name: /saved/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists worn outfits in the order the server returns, newest first, with readable dates', async () => {
    mockRoutes({
      [ROUTE]: [
        loaded([
          historyEntry({ id: 'h3', wornOn: '2026-11-12', occasion: 'dinner' }),
          historyEntry({ id: 'h2', wornOn: '2026-11-11', occasion: 'work' }),
          historyEntry({ id: 'h1', wornOn: '2026-01-01', occasion: 'formal' }),
        ]),
      ],
    });

    render(<OutfitHistoryList />);

    const list = await screen.findByRole('list', { name: 'Worn outfits, newest first' });
    const entries = within(list).getAllByRole('listitem').filter((li) => li.parentElement === list);
    expect(entries.map((li) => within(li).getByRole('heading', { level: 2 }).textContent)).toEqual([
      'Thursday, November 12, 2026',
      'Wednesday, November 11, 2026',
      'Thursday, January 1, 2026',
    ]);
    expect(entries.map((li) => within(li).getByText(/^Occasion:/).textContent)).toEqual([
      'Occasion: Dinner',
      'Occasion: Work',
      'Occasion: Formal',
    ]);
    expect(within(entries[0]).getByText('Thursday, November 12, 2026').closest('time')).toHaveAttribute(
      'datetime',
      '2026-11-12',
    );
  });

  it("shows each outfit's real item photos and names", async () => {
    mockRoutes({ [ROUTE]: [loaded([historyEntry()])] });

    render(<OutfitHistoryList />);

    const items = await screen.findByRole('list', { name: 'Items worn on Wednesday, November 11, 2026' });
    expect(within(items).getByRole('img', { name: 'Linen shirt' })).toBeInTheDocument();
    expect(within(items).getByText('Linen shirt')).toBeInTheDocument();
    // An unnamed item is called by its color and category, as in the wardrobe.
    expect(within(items).getByRole('img', { name: 'Navy Bottom' })).toBeInTheDocument();
    expect(within(items).getByText('Bottom')).toBeInTheDocument();
  });

  it('shows an honest placeholder for an item since deleted from the wardrobe', async () => {
    mockRoutes({ [ROUTE]: [loaded([historyEntry({ items: [presentItem(), missing('item_gone')] })])] });

    render(<OutfitHistoryList />);

    const items = await screen.findByRole('list', { name: /Items worn on/ });
    expect(within(items).getAllByRole('listitem')).toHaveLength(2);
    expect(within(items).getByText(HISTORY_MESSAGES.missingItem)).toBeInTheDocument();
    expect(within(items).getAllByRole('img')).toHaveLength(1);
  });

  it('says so when an entry has no recorded occasion', async () => {
    mockRoutes({ [ROUTE]: [loaded([historyEntry({ occasion: null })])] });

    render(<OutfitHistoryList />);

    expect(await screen.findByText(HISTORY_MESSAGES.noOccasion)).toBeInTheDocument();
  });

  it('shows a placeholder when a photo URL cannot be shown', async () => {
    mockRoutes({
      [ROUTE]: [loaded([historyEntry({ items: [presentItem({ image: { url: 'http://evil.example/x.jpg' } })] })])],
    });

    render(<OutfitHistoryList />);

    expect(await screen.findByRole('img', { name: 'Image unavailable for Linen shirt' })).toBeInTheDocument();
  });

  it.each<[string, Reply]>([
    ['a server error', { status: 500, body: {} }],
    ['an unavailable service', { status: 503, body: {} }],
    ['a network failure', 'network-error'],
  ])('shows a fixed error and Retry for %s, and Retry loads again', async (_label, failure) => {
    const fetchMock = mockRoutes({ [ROUTE]: [failure, loaded([historyEntry()])] });
    const user = userEvent.setup();

    render(<OutfitHistoryList />);

    expect(await screen.findByRole('alert')).toHaveTextContent(HISTORY_MESSAGES.failed);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('list', { name: 'Worn outfits, newest first' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks the user to sign in again when the session has ended', async () => {
    mockRoutes({ [ROUTE]: [{ status: 401, body: {} }] });

    render(<OutfitHistoryList />);

    expect(await screen.findByRole('alert')).toHaveTextContent(HISTORY_MESSAGES.sessionEnded);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_SESSION_ENDED_PATH);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it.each<[string, unknown]>([
    ['no data', { success: true }],
    ['success false', { success: false, data: { entries: [] } }],
    ['entries that is not a list', { success: true, data: { entries: {} } }],
    ['an invalid worn date', { success: true, data: { entries: [historyEntry({ wornOn: '11/11/2026' })] } }],
    ['an unknown occasion', { success: true, data: { entries: [historyEntry({ occasion: 'party' as never })] } }],
    ['an inherited occasion name', { success: true, data: { entries: [historyEntry({ occasion: 'toString' as never })] } }],
    ['an item without a status', { success: true, data: { entries: [historyEntry({ items: [{ id: 'x' } as never] })] } }],
    ['an item without a name field', { success: true, data: { entries: [historyEntry({ items: [{ ...presentItem(), name: 7 } as never] })] } }],
    ['an entry without an ID', { success: true, data: { entries: [{ ...historyEntry(), id: 3 }] } }],
  ])('treats an answer with %s as a failed load', async (_label, body) => {
    mockRoutes({ [ROUTE]: [{ status: 200, body }] });

    render(<OutfitHistoryList />);

    expect(await screen.findByRole('alert')).toHaveTextContent(HISTORY_MESSAGES.failed);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
