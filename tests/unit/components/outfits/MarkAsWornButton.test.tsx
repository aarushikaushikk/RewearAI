// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MARK_WORN_MESSAGES, MarkAsWornButton } from '@/components/outfits/MarkAsWornButton';
import { SIGN_IN_SESSION_ENDED_PATH } from '@/lib/auth/pageSession';
import { mockRoutes, pending, type Reply } from '../../../helpers/fetchMock';

const ROUTE = 'POST /api/outfits/history';
const ITEM_IDS = ['item_shirt', 'item_chinos'];
// 23:30 on 11 November in Los Angeles, already 12 November in UTC.
const LATE_EVENING_LA = new Date('2026-11-12T07:30:00.000Z');
const originalTz = process.env.TZ;

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'history_1',
    wornOn: '2026-11-11',
    occasion: 'work',
    recordedAt: '2026-11-12T07:30:00.000Z',
    items: [],
    ...overrides,
  };
}

const recorded = (created = true): Reply => ({
  status: created ? 201 : 200,
  body: { success: true, data: { created, entry: entry() } },
});

const markButton = () => screen.getByRole('button', { name: 'Mark as worn' });
const retryButton = () => screen.getByRole('button', { name: 'Try again' });
const sentBodies = (fetchMock: ReturnType<typeof mockRoutes>) =>
  fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));

function renderButton() {
  return render(<MarkAsWornButton itemIds={ITEM_IDS} occasion="work" />);
}

beforeEach(() => {
  process.env.TZ = 'America/Los_Angeles';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(LATE_EVENING_LA);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalTz === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTz;
  }
});

describe('MarkAsWornButton (US10)', () => {
  it('offers one labelled button and sends nothing until it is pressed', () => {
    const fetchMock = mockRoutes({});

    renderButton();

    expect(markButton()).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the outfit's item IDs, the occasion and the user's local date, not the UTC date", async () => {
    const fetchMock = mockRoutes({ [ROUTE]: [recorded()] });
    renderButton();

    await userEvent.setup().click(markButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/outfits/history');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Origin: window.location.origin });
    expect(sentBodies(fetchMock)).toEqual([{ itemIds: ITEM_IDS, occasion: 'work', wornOn: '2026-11-11' }]);
  });

  it('confirms the recorded date and links to the history', async () => {
    mockRoutes({ [ROUTE]: [recorded()] });
    renderButton();

    await userEvent.setup().click(markButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      MARK_WORN_MESSAGES.recorded('Wednesday, November 11, 2026'),
    );
    expect(screen.getByRole('link', { name: 'View outfit history' })).toHaveAttribute('href', '/outfits/history');
    expect(screen.queryByRole('button', { name: 'Mark as worn' })).not.toBeInTheDocument();
  });

  it('says so when these clothes were already recorded that day', async () => {
    mockRoutes({ [ROUTE]: [recorded(false)] });
    renderButton();

    await userEvent.setup().click(markButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      MARK_WORN_MESSAGES.alreadyRecorded('Wednesday, November 11, 2026'),
    );
    expect(screen.getByRole('link', { name: 'View outfit history' })).toBeInTheDocument();
  });

  it('sends one request however many times the button is pressed while saving', async () => {
    const fetchMock = mockRoutes({ [ROUTE]: [pending()] });
    renderButton();
    const user = userEvent.setup();

    await user.click(markButton());
    const busy = screen.getByRole('button', { name: /recording/i });
    await user.click(busy);
    await user.dblClick(busy);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
  });

  it('blocks a second request even before React re-renders the disabled button', async () => {
    const fetchMock = mockRoutes({ [ROUTE]: [pending()] });
    renderButton();
    const button = markButton();

    button.click();
    button.click();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('offers Try again after a network failure, and the retry reuses the same date', async () => {
    const fetchMock = mockRoutes({ [ROUTE]: ['network-error', recorded()] });
    renderButton();
    const user = userEvent.setup();

    await user.click(markButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(MARK_WORN_MESSAGES.network);

    // Local midnight passes before the retry; it must not become a second day's wear.
    vi.setSystemTime(new Date('2026-11-12T08:30:00.000Z'));
    await user.click(retryButton());

    expect(await screen.findByRole('status')).toHaveTextContent(/Recorded as worn/);
    expect(sentBodies(fetchMock).map((b) => b.wornOn)).toEqual(['2026-11-11', '2026-11-11']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the new day for an outfit shown on a later day', async () => {
    const first = mockRoutes({ [ROUTE]: [recorded()] });
    const { unmount } = renderButton();
    await userEvent.setup().click(markButton());
    await screen.findByRole('status');
    unmount();

    vi.setSystemTime(new Date('2026-11-13T18:00:00.000Z'));
    const second = mockRoutes({ [ROUTE]: [recorded()] });
    renderButton();
    await userEvent.setup().click(markButton());

    expect(sentBodies(first)[0].wornOn).toBe('2026-11-11');
    expect(sentBodies(second)[0].wornOn).toBe('2026-11-13');
  });

  it.each<[string, Reply, string]>([
    ['a server error', { status: 500, body: { success: false, error: 'Internal server error' } }, MARK_WORN_MESSAGES.failed],
    ['an unavailable service', { status: 503, body: {} }, MARK_WORN_MESSAGES.unavailable],
    ['an unexpected status', { status: 418, body: {} }, MARK_WORN_MESSAGES.failed],
  ])('shows a fixed message and Try again for %s', async (_label, reply, message) => {
    mockRoutes({ [ROUTE]: [reply] });
    renderButton();

    await userEvent.setup().click(markButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(retryButton()).toBeInTheDocument();
  });

  it.each<[string, number, string]>([
    ['a rejected request', 400, MARK_WORN_MESSAGES.invalid],
    ['items no longer in the wardrobe', 404, MARK_WORN_MESSAGES.itemsGone],
    ['a failed origin check', 403, MARK_WORN_MESSAGES.forbidden],
  ])('shows a fixed message without Try again for %s', async (_label, status, message) => {
    mockRoutes({ [ROUTE]: [{ status, body: { success: false, error: 'server text <script>' } }] });
    renderButton();

    await userEvent.setup().click(markButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/server text/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('asks the user to sign in again when the session has ended', async () => {
    mockRoutes({ [ROUTE]: [{ status: 401, body: {} }] });
    renderButton();

    await userEvent.setup().click(markButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(MARK_WORN_MESSAGES.sessionEnded);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_SESSION_ENDED_PATH);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it.each<[string, unknown]>([
    ['success false', { success: false, data: { created: true, entry: entry() } }],
    ['no data', { success: true }],
    ['no entry', { success: true, data: { created: true } }],
    ['a non-boolean created', { success: true, data: { created: 'yes', entry: entry() } }],
    ['an invalid worn date', { success: true, data: { created: true, entry: entry({ wornOn: '2026-02-30' }) } }],
    ['an array', [entry()]],
  ])('treats a 2xx answer with %s as unconfirmed, and offers Try again', async (_label, body) => {
    mockRoutes({ [ROUTE]: [{ status: 201, body }] });
    renderButton();

    await userEvent.setup().click(markButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(MARK_WORN_MESSAGES.unconfirmed);
    expect(retryButton()).toBeInTheDocument();
  });

  it('treats a 2xx answer that is not JSON as unconfirmed', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    })) as unknown as typeof fetch;
    renderButton();

    await userEvent.setup().click(markButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(MARK_WORN_MESSAGES.unconfirmed);
  });

  it('moves focus to the error so keyboard and screen reader users hear it', async () => {
    mockRoutes({ [ROUTE]: [{ status: 500 }] });
    renderButton();
    const user = userEvent.setup();

    markButton().focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveFocus();
  });

  it('can be pressed from the keyboard', async () => {
    const fetchMock = mockRoutes({ [ROUTE]: [recorded()] });
    renderButton();
    const user = userEvent.setup();

    await user.tab();
    expect(markButton()).toHaveFocus();
    await user.keyboard(' ');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
