// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CreateOutfitForm } from '@/components/outfits/CreateOutfitForm';
import type { OutfitItemDto, OutfitRecommendationDto } from '@/types/outfit';

const LABELS = ['Work', 'Dinner', 'Weekend', 'Casual', 'Formal'];
const VALUES = ['work', 'dinner', 'weekend', 'casual', 'formal'];

function outfitItem(overrides: Partial<OutfitItemDto>): OutfitItemDto {
  return {
    role: 'top',
    id: 'item_1',
    name: null,
    image: { url: 'https://res.cloudinary.com/test/image/upload/v1/rewear/users/u1/a.jpg' },
    category: 'Top',
    color: 'White',
    style: 'Button-down',
    season: 'All-season',
    formality: 'Smart casual',
    ...overrides,
  };
}

const SHIRT = outfitItem({ id: 'item_shirt', name: 'Linen shirt', image: { url: 'https://res.cloudinary.com/test/image/upload/v1/shirt.jpg' } });
const CHINOS = outfitItem({
  id: 'item_chinos',
  role: 'bottom',
  category: 'Bottom',
  color: 'Navy',
  style: 'Chinos',
  image: { url: 'https://res.cloudinary.com/test/image/upload/v1/chinos.jpg' },
});

const OUTFIT: OutfitRecommendationDto = { status: 'ok', occasion: 'work', season: 'All-season', items: [SHIRT, CHINOS] };

function reply(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
const success = (data: unknown) => reply(200, { success: true, data });

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

const occasionSelect = () => screen.getByLabelText(/^occasion/i) as HTMLSelectElement;
const generateButton = () => screen.getByRole('button', { name: 'Generate Outfit' });
const sentBody = (fetchMock: ReturnType<typeof mockFetch>, call = 0) =>
  JSON.parse((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);

async function generateFor(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.selectOptions(occasionSelect(), label);
  await user.click(generateButton());
}

describe('CreateOutfitForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('offers a required occasion with the five occasions, and one Generate Outfit button', () => {
    render(<CreateOutfitForm />);

    expect(occasionSelect()).toBeRequired();
    expect(screen.getByText('(Required)')).toBeInTheDocument();
    const options = within(occasionSelect()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Choose…', ...LABELS]);
    expect(screen.getAllByRole('button')).toEqual([generateButton()]);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('asks for an occasion, and sends nothing, when none is chosen', async () => {
    const fetchMock = mockFetch();
    render(<CreateOutfitForm />);

    await user.click(generateButton());

    expect(screen.getByText('Choose an occasion to continue.')).toBeInTheDocument();
    expect(occasionSelect()).toHaveAttribute('aria-invalid', 'true');
    expect(occasionSelect()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(LABELS.map((label, i) => [label, VALUES[i]]))(
    'sends exactly { occasion: "%s" → %s } to the generate endpoint',
    async (label, value) => {
      const fetchMock = mockFetch(success({ ...OUTFIT, occasion: value }));
      render(<CreateOutfitForm />);

      await generateFor(user, label);

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/outfits/generate');
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
      expect(sentBody(fetchMock)).toEqual({ occasion: value });
      expect(await screen.findByRole('heading', { name: `Your outfit for ${label}` })).toBeInTheDocument();
    },
  );

  it("shows each recommended item's saved photo, readable name, and role", async () => {
    mockFetch(success(OUTFIT));
    render(<CreateOutfitForm />);

    await generateFor(user, 'Work');

    const heading = await screen.findByRole('heading', { name: 'Your outfit for Work' });
    expect(heading).toHaveFocus();
    const items = within(screen.getByRole('list', { name: 'Items in this outfit' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(within(items[0]).getByRole('img', { name: 'Linen shirt' })).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent('https://res.cloudinary.com/test/image/upload/v1/shirt.jpg')),
    );
    expect(within(items[0]).getByText('Linen shirt')).toBeInTheDocument();
    expect(within(items[0]).getByText('Top')).toBeInTheDocument();

    // Unnamed: falls back to its color and style.
    expect(within(items[1]).getByRole('img', { name: 'Navy Chinos' })).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent('https://res.cloudinary.com/test/image/upload/v1/chinos.jpg')),
    );
    expect(within(items[1]).getByText('Navy Chinos')).toBeInTheDocument();
    expect(within(items[1]).getByText('Bottom')).toBeInTheDocument();
  });

  it('labels every outfit role readably', async () => {
    const roles = ['dress', 'shoes', 'outerwear', 'accessory'] as const;
    mockFetch(
      success({
        ...OUTFIT,
        items: roles.map((role, i) => outfitItem({ id: `item_${i}`, role, name: `Piece ${i}` })),
      }),
    );
    render(<CreateOutfitForm />);

    await generateFor(user, 'Work');

    const items = within(await screen.findByRole('list', { name: 'Items in this outfit' })).getAllByRole('listitem');
    expect(items.map((li) => within(li).getByText(/^(Dress|Shoes|Outerwear|Accessory)$/).textContent)).toEqual([
      'Dress',
      'Shoes',
      'Outerwear',
      'Accessory',
    ]);
  });

  it('shows progress, and sends one request however often Generate is pressed', async () => {
    const pending = deferred<Response>();
    const fetchMock = mockFetch(pending.promise);
    render(<CreateOutfitForm />);
    await user.selectOptions(occasionSelect(), 'Dinner');

    const button = generateButton();
    act(() => {
      button.click();
      button.click();
      button.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
    expect(occasionSelect()).toBeDisabled();

    await act(async () => pending.resolve(success({ ...OUTFIT, occasion: 'dinner' })));
    expect(screen.getByRole('heading', { name: 'Your outfit for Dinner' })).toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains an insufficient wardrobe and links to the wardrobe and Add Clothing', async () => {
    mockFetch(success({ status: 'insufficient', occasion: 'formal', reason: 'no_complete_outfit' }));
    render(<CreateOutfitForm />);

    await generateFor(user, 'Formal');

    expect(await screen.findByText("There aren't enough available items for a formal outfit yet.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View wardrobe' })).toHaveAttribute('href', '/wardrobe');
    expect(screen.getByRole('link', { name: 'Add clothing' })).toHaveAttribute('href', '/wardrobe/new');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it.each([
    ['a signed-out session (401)', reply(401), 'Your session has ended. Sign in again to continue.'],
    ['an unavailable service (503)', reply(503), 'Service temporarily unavailable. Please try again later.'],
    ['a server error (500)', reply(500, { success: false, error: 'driver detail' }), "We couldn't generate an outfit. Try again."],
    ['a network failure', new TypeError('Failed to fetch'), "We couldn't reach the server. Check your connection and try again."],
    ['a success without a usable outfit', success({ status: 'ok', occasion: 'dinner' }), "We couldn't generate an outfit. Try again."],
  ])('announces %s, keeps the occasion, and retries it with Try again', async (_label, failure, message) => {
    const fetchMock = mockFetch(failure, success({ ...OUTFIT, occasion: 'dinner' }));
    render(<CreateOutfitForm />);

    await generateFor(user, 'Dinner');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/driver detail/)).not.toBeInTheDocument();
    expect(occasionSelect()).toHaveValue('Dinner');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(sentBody(fetchMock, 1)).toEqual({ occasion: 'dinner' });
    expect(await screen.findByRole('heading', { name: 'Your outfit for Dinner' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['an outfit', success(OUTFIT), () => screen.queryByRole('heading', { name: 'Your outfit for Work' })],
    [
      'an insufficient result',
      success({ status: 'insufficient', occasion: 'work', reason: 'no_suitable_items' }),
      () => screen.queryByText(/aren't enough available items/),
    ],
    ['an error', reply(500), () => screen.queryByRole('alert')],
  ])('clears %s as soon as a different occasion is chosen', async (_label, response, find) => {
    mockFetch(response);
    render(<CreateOutfitForm />);

    await generateFor(user, 'Work');
    await vi.waitFor(() => expect(find()).toBeInTheDocument());

    await user.selectOptions(occasionSelect(), 'Formal');

    expect(find()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('never shows an outfit under the wrong occasion: an answer for another occasion is unusable', async () => {
    mockFetch(success({ ...OUTFIT, occasion: 'weekend' }));
    render(<CreateOutfitForm />);

    await generateFor(user, 'Work');

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't generate an outfit. Try again.");
    expect(screen.queryByRole('heading', { name: /Your outfit for/ })).not.toBeInTheDocument();
  });
});
