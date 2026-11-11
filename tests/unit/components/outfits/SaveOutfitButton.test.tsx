// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SaveOutfitButton } from '@/components/outfits/SaveOutfitButton';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import { SIGN_IN_SESSION_ENDED_PATH } from '@/lib/auth/pageSession';

function reply(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function mockFetch(...responses: (Response | Promise<Response> | Error)[]) {
  const fetchMock = vi.fn(() => {
    const next = responses.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next!);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const saveButton = () => screen.getByRole('button', { name: 'Save outfit' });

describe('SaveOutfitButton', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    render(<SaveOutfitButton occasion="work" itemIds={['item_shirt', 'item_chinos']} />);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('saves the outfit by occasion and item IDs, with the page origin', async () => {
    const fetchMock = mockFetch(reply(201, { success: true, data: { id: 'outfit_1' } }));

    await user.click(saveButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/outfits/saved');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Origin: window.location.origin });
    expect(JSON.parse(init.body as string)).toEqual({ occasion: 'work', itemIds: ['item_shirt', 'item_chinos'] });
  });

  it.each([201, 200])('confirms the save (%i) and links to Saved Outfits', async (status) => {
    mockFetch(reply(status, { success: true, data: { id: 'outfit_1' } }));

    await user.click(saveButton());

    expect(await screen.findByRole('status')).toHaveTextContent('Outfit saved.');
    expect(screen.getByRole('link', { name: 'View saved outfits' })).toHaveAttribute('href', '/outfits/saved');
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  it('shows progress, and sends one request however often Save is pressed', async () => {
    const pending = deferred<Response>();
    const fetchMock = mockFetch(pending.promise);

    await user.click(saveButton());
    const busy = screen.getByRole('button', { busy: true });
    expect(busy).toBeDisabled();
    await user.click(busy);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(reply(201, { success: true, data: { id: 'outfit_1' } }));
    expect(await screen.findByText('Outfit saved.')).toBeInTheDocument();
  });

  it.each([
    [400, 'Some of these items are no longer in your wardrobe. Generate a new outfit.'],
    [403, "We couldn't verify this request. Refresh the page and try again."],
    [500, "We couldn't save your outfit. Try again."],
    [503, 'Service temporarily unavailable. Please try again later.'],
  ])('explains a %i failure with a fixed message, never the server text', async (status, message) => {
    mockFetch(reply(status, { success: false, error: 'server detail s3cr3t' }));

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/s3cr3t/)).not.toBeInTheDocument();
  });

  it('lets the user retry after a failure, and confirms the save that works', async () => {
    const fetchMock = mockFetch(reply(500), reply(201, { success: true, data: { id: 'outfit_1' } }));

    await user.click(saveButton());
    await screen.findByRole('alert');
    await user.click(saveButton());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Outfit saved.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains a network failure', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(saveButton()).toBeEnabled();
  });

  it('offers Sign in, not Save again, when the session has ended', async () => {
    mockFetch(reply(401));

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has ended. Sign in again to continue.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_SESSION_ENDED_PATH);
    expect(screen.queryByRole('button', { name: 'Save outfit' })).not.toBeInTheDocument();
  });
});
