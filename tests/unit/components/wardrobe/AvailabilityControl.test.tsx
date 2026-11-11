// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AvailabilityControl } from '@/components/wardrobe/AvailabilityControl';

const ITEM_ID = 'item 1/a';
const LABEL = 'White Button-down';

const ITEM = {
  id: ITEM_ID,
  image: { url: 'https://res.cloudinary.com/test/image/upload/v1/a.jpg', publicId: 'rewear/users/u1/a' },
  category: 'Top',
  color: 'White',
  style: 'Button-down',
  season: 'Summer',
  formality: 'Smart casual',
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function reply(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const saved = (isAvailable: boolean) => reply(200, { success: true, data: { ...ITEM, isAvailable } });

function mockFetch(...responses: (Response | Promise<Response> | Error)[]) {
  const fetchMock = vi.fn(() => {
    const next = responses.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next!);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function setup(isAvailable: boolean, onChange = vi.fn()) {
  const user = userEvent.setup();
  const view = render(
    <AvailabilityControl itemId={ITEM_ID} itemLabel={LABEL} isAvailable={isAvailable} onChange={onChange} />,
  );
  return { user, onChange, ...view };
}

const markUnavailable = () => screen.getByRole('button', { name: `Mark unavailable: ${LABEL}` });
const markAvailable = () => screen.getByRole('button', { name: `Mark available: ${LABEL}` });

describe('AvailabilityControl', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the current status as text, with an action naming the item', () => {
    setup(true);

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(markUnavailable()).toBeEnabled();
  });

  it('marks an available item unavailable once the server confirms it', async () => {
    const pending = deferred<Response>();
    const fetchMock = mockFetch(pending.promise);
    const { user, onChange } = setup(true);

    await user.click(markUnavailable());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/wardrobe/item%201%2Fa/availability');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ isAvailable: false });
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');

    // While saving: the old status stays, and the button shows progress and can't be pressed.
    expect(screen.getByText('Available')).toBeInTheDocument();
    const busy = screen.getByRole('button', { name: /saving/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');

    await act(async () => pending.resolve(saved(false)));

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(markAvailable()).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(`${LABEL} marked unavailable.`);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: ITEM_ID, isAvailable: false }));
  });

  it('returns an unavailable item to available', async () => {
    const fetchMock = mockFetch(saved(true));
    const { user, onChange } = setup(false);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();

    await user.click(markAvailable());

    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      isAvailable: true,
    });
    expect(await screen.findByText('Available')).toBeInTheDocument();
    expect(markUnavailable()).toBeEnabled();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isAvailable: true }));
  });

  it('keeps the previous status and announces an error when the save fails, then recovers on retry', async () => {
    mockFetch(reply(500, { success: false, error: 'driver detail' }), saved(false));
    const { user, onChange } = setup(true);

    await user.click(markUnavailable());

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't update availability. Try again.");
    expect(screen.queryByText(/driver detail/)).not.toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(markUnavailable());

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [401, 'Your session has ended. Sign in again to continue.'],
    [403, "We couldn't verify this request. Refresh the page and try again."],
    [404, "We couldn't find this clothing item. It may have been deleted."],
    [503, 'Service temporarily unavailable. Please try again later.'],
  ])('explains a %i response in its own words', async (status, message) => {
    mockFetch(reply(status));
    const { user } = setup(true);

    await user.click(markUnavailable());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('explains a network failure and keeps the previous status', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const { user } = setup(false);

    await user.click(markAvailable());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't reach the server. Check your connection and try again.",
    );
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('treats a success response without a usable item as a failure', async () => {
    mockFetch(reply(200, { success: true, data: { id: ITEM_ID } }));
    const { user, onChange } = setup(true);

    await user.click(markUnavailable());

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't update availability. Try again.");
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sends one request however many times the button is pressed while saving', async () => {
    const pending = deferred<Response>();
    const fetchMock = mockFetch(pending.promise);
    setup(true);
    const button = markUnavailable();

    // All three clicks land in one batch, before React re-renders the button as disabled,
    // as a fast double click can. Only the in-flight guard can stop the extra requests.
    act(() => {
      button.click();
      button.click();
      button.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Clicking the now-disabled button sends nothing either.
    fireEvent.click(screen.getByRole('button', { name: /saving/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(saved(false)));
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a new status from its parent, such as after the wardrobe reloads', () => {
    const { rerender } = setup(true);

    rerender(<AvailabilityControl itemId={ITEM_ID} itemLabel={LABEL} isAvailable={false} />);

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(markAvailable()).toBeInTheDocument();
  });
});
