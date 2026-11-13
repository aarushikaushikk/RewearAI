// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CreateOutfitForm } from '@/components/outfits/CreateOutfitForm';
import { ALLOWED_IMAGE_HOST } from '@/components/outfits/OutfitItemImage';
import { SIGN_IN_SESSION_ENDED_PATH } from '@/lib/auth/pageSession';
import type { OutfitItemDto, OutfitRecommendationDto } from '@/types/outfit';
import nextConfig from '../../../../next.config';

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

  describe('why the wardrobe is insufficient (US12)', () => {
    const NO_SUITABLE = 'None of your available clothing is suitable for this occasion.';
    const NO_COMPLETE = 'An outfit needs a suitable top and bottom, or a suitable dress.';

    it.each([
      ['no_suitable_items', NO_SUITABLE, NO_COMPLETE],
      ['no_complete_outfit', NO_COMPLETE, NO_SUITABLE],
    ])('explains %s after the general message, keeping the recovery links', async (reason, shown, notShown) => {
      mockFetch(success({ status: 'insufficient', occasion: 'work', reason }));
      render(<CreateOutfitForm />);

      await generateFor(user, 'Work');

      const status = await screen.findByRole('status');
      expect(within(status).getByText("There aren't enough available items for a work outfit yet.")).toBeInTheDocument();
      expect(within(status).getByText(shown)).toBeInTheDocument();
      expect(within(status).queryByText(notShown)).not.toBeInTheDocument();
      expect(within(status).getByRole('link', { name: 'View wardrobe' })).toHaveAttribute('href', '/wardrobe');
      expect(within(status).getByRole('link', { name: 'Add clothing' })).toHaveAttribute('href', '/wardrobe/new');
    });

    it.each([
      ['a missing reason', {}],
      ['an unknown reason', { reason: 'not_a_reason' }],
      ['an inherited property name as the reason', { reason: 'toString' }],
      ['a reason that is not text', { reason: 42 }],
    ])('shows only the general message for %s', async (_label, extra) => {
      mockFetch(success({ status: 'insufficient', occasion: 'dinner', ...extra }));
      render(<CreateOutfitForm />);

      await generateFor(user, 'Dinner');

      const status = await screen.findByRole('status');
      expect(within(status).getByText("There aren't enough available items for a dinner outfit yet.")).toBeInTheDocument();
      expect(within(status).queryByText(NO_SUITABLE)).not.toBeInTheDocument();
      expect(within(status).queryByText(NO_COMPLETE)).not.toBeInTheDocument();
      expect(within(status).getAllByRole('paragraph')).toHaveLength(1);
      expect(within(status).getByRole('link', { name: 'View wardrobe' })).toBeInTheDocument();
      expect(within(status).getByRole('link', { name: 'Add clothing' })).toBeInTheDocument();
    });

    it('lets the user generate again for the same occasion after updating the wardrobe, replacing the message with the outfit', async () => {
      const fetchMock = mockFetch(
        success({ status: 'insufficient', occasion: 'work', reason: 'no_complete_outfit' }),
        success(OUTFIT),
      );
      render(<CreateOutfitForm />);

      await generateFor(user, 'Work');
      const status = await screen.findByRole('status');
      expect(within(status).getByRole('link', { name: 'View wardrobe' })).toBeInTheDocument();
      expect(within(status).getByRole('link', { name: 'Add clothing' })).toBeInTheDocument();
      expect(occasionSelect()).toHaveValue('Work');
      expect(generateButton()).toBeEnabled();

      await user.click(generateButton());

      expect(await screen.findByRole('heading', { name: 'Your outfit for Work' })).toBeInTheDocument();
      expect(sentBody(fetchMock, 1)).toEqual({ occasion: 'work' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/aren't enough available items/)).not.toBeInTheDocument();
      expect(screen.queryByText(NO_COMPLETE)).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(occasionSelect()).toHaveValue('Work');
    });

    it('hides the previous explanation while generating again, and shows the new reason if still insufficient', async () => {
      const pending = deferred<Response>();
      mockFetch(success({ status: 'insufficient', occasion: 'casual', reason: 'no_suitable_items' }), pending.promise);
      render(<CreateOutfitForm />);

      await generateFor(user, 'Casual');
      expect(await screen.findByText(NO_SUITABLE)).toBeInTheDocument();

      await user.click(generateButton());
      // The only status now is the button's "Loading…"; the old explanation is gone.
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.queryByText(/aren't enough available items/)).not.toBeInTheDocument();
      expect(screen.queryByText(NO_SUITABLE)).not.toBeInTheDocument();

      await act(async () => pending.resolve(success({ status: 'insufficient', occasion: 'casual', reason: 'no_complete_outfit' })));
      const status = screen.getByRole('status');
      expect(within(status).getByText(NO_COMPLETE)).toBeInTheDocument();
      expect(within(status).queryByText(NO_SUITABLE)).not.toBeInTheDocument();
      expect(within(status).getByRole('link', { name: 'Add clothing' })).toBeInTheDocument();
    });
  });

  it.each([
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

  it('offers Save outfit for the generated outfit, saving its occasion and items', async () => {
    const fetchMock = mockFetch(success(OUTFIT), reply(201, { success: true, data: { id: 'outfit_1' } }));
    render(<CreateOutfitForm />);
    await generateFor(user, 'Work');

    await user.click(await screen.findByRole('button', { name: 'Save outfit' }));

    expect(fetchMock.mock.calls[1][0]).toBe('/api/outfits/saved');
    expect(sentBody(fetchMock, 1)).toEqual({ occasion: 'work', itemIds: ['item_shirt', 'item_chinos'] });
    expect(await screen.findByText('Outfit saved.')).toBeInTheDocument();
  });

  it('keeps the outfit on screen when saving fails', async () => {
    mockFetch(success(OUTFIT), reply(500));
    render(<CreateOutfitForm />);
    await generateFor(user, 'Work');

    await user.click(await screen.findByRole('button', { name: 'Save outfit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save your outfit. Try again.");
    expect(screen.getByRole('heading', { name: 'Your outfit for Work' })).toBeInTheDocument();
    expect(screen.getByText('Linen shirt')).toBeInTheDocument();
  });

  it('offers to save a newly generated outfit afresh', async () => {
    const other = { ...OUTFIT, occasion: 'casual' as const };
    mockFetch(success(OUTFIT), reply(201, { success: true, data: { id: 'outfit_1' } }), success(other));
    render(<CreateOutfitForm />);
    await generateFor(user, 'Work');
    await user.click(await screen.findByRole('button', { name: 'Save outfit' }));
    await screen.findByText('Outfit saved.');

    await generateFor(user, 'Casual');

    expect(await screen.findByRole('button', { name: 'Save outfit' })).toBeEnabled();
    expect(screen.queryByText('Outfit saved.')).not.toBeInTheDocument();
  });

  describe('robustness (final review fixes)', () => {
    const PLACEHOLDER = 'Image unavailable for Linen shirt';

    async function showOutfit(items: unknown[]) {
      mockFetch(success({ ...OUTFIT, items }));
      render(<CreateOutfitForm />);
      await generateFor(user, 'Work');
      return within(await screen.findByRole('list', { name: 'Items in this outfit' })).getAllByRole('listitem');
    }

    it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
      'rejects the inherited property "%s" as an outfit role',
      async (role) => {
        mockFetch(success({ ...OUTFIT, items: [{ ...SHIRT, role }] }));
        render(<CreateOutfitForm />);

        await generateFor(user, 'Work');

        expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't generate an outfit. Try again.");
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
      },
    );

    it.each([
      ['an http URL', 'http://res.cloudinary.com/test/image/upload/v1/shirt.jpg'],
      ['another host', 'https://evil.example/shirt.jpg'],
      ['a look-alike host', 'https://res.cloudinary.com.evil.example/shirt.jpg'],
      ['a protocol-relative URL', '//res.cloudinary.com/test/shirt.jpg'],
      ['a javascript: URL', 'javascript:alert(1)'],
      ['text that is not a URL', 'not a url'],
      ['an empty URL', ''],
    ])('shows a placeholder instead of crashing for %s, keeping the name and role', async (_label, url) => {
      const [shirt, chinos] = await showOutfit([{ ...SHIRT, image: { url } }, CHINOS]);

      expect(within(shirt).getByRole('img', { name: PLACEHOLDER })).toHaveTextContent('Image unavailable');
      expect(within(shirt).queryByRole('img', { name: 'Linen shirt' })).not.toBeInTheDocument();
      expect(document.querySelector(`img[src*="${encodeURIComponent(url) || 'x-never'}"]`)).toBeNull();
      expect(within(shirt).getByText('Linen shirt')).toBeInTheDocument();
      expect(within(shirt).getByText('Top')).toBeInTheDocument();
      // Other items keep their photos.
      expect(within(chinos).getByRole('img', { name: 'Navy Chinos' })).toBeInTheDocument();
    });

    it.each([
      ['no image at all', { ...SHIRT, image: undefined }],
      ['an image without a URL', { ...SHIRT, image: {} }],
      ['a non-string URL', { ...SHIRT, image: { url: 42 } }],
    ])('shows a placeholder for an item with %s', async (_label, item) => {
      const [shirt] = await showOutfit([item, CHINOS]);

      expect(within(shirt).getByRole('img', { name: PLACEHOLDER })).toBeInTheDocument();
      expect(within(shirt).getByText('Linen shirt')).toBeInTheDocument();
    });

    it('replaces a photo that fails to load with the placeholder, keeping the name and role', async () => {
      const [shirt] = await showOutfit([SHIRT, CHINOS]);

      fireEvent.error(within(shirt).getByRole('img', { name: 'Linen shirt' }));

      expect(within(shirt).getByRole('img', { name: PLACEHOLDER })).toHaveTextContent('Image unavailable');
      expect(within(shirt).getByText('Linen shirt')).toBeInTheDocument();
      expect(within(shirt).getByText('Top')).toBeInTheDocument();
    });

    it('allows exactly the image host that next.config.ts allows', () => {
      expect(nextConfig.images?.remotePatterns).toEqual([{ protocol: 'https', hostname: ALLOWED_IMAGE_HOST }]);
    });

    it('offers Sign in, not Try again, when the session has ended, and keeps the occasion', async () => {
      const fetchMock = mockFetch(reply(401));
      render(<CreateOutfitForm />);

      await generateFor(user, 'Dinner');

      expect(await screen.findByRole('alert')).toHaveTextContent('Your session has ended. Sign in again to continue.');
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_SESSION_ENDED_PATH);
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(occasionSelect()).toHaveValue('Dinner');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
