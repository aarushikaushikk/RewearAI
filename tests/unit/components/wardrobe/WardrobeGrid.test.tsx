// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { WardrobeGrid } from '@/components/wardrobe/WardrobeGrid';
import { mockRoutes, pending } from '../../../helpers/fetchMock';
import { itemDto } from '../../../helpers/wardrobeItems';

const LIST = 'GET /api/wardrobe';

const SHIRT = itemDto({ id: 'item_1', name: 'White Oxford Shirt' });
const UNNAMED = itemDto({ id: 'item_2', name: undefined, color: 'Blue', category: 'Bottom' });
const SWEATER = itemDto({ id: 'item_3', name: 'Winter Sweater', isAvailable: false });

afterEach(cleanup);

// Wireframe 03: the saved items (US4) and their search and filters (US5).
describe('WardrobeGrid', () => {
  it('shows a loading state while the wardrobe loads', () => {
    mockRoutes({ [LIST]: [pending()] });

    render(<WardrobeGrid />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading your wardrobe/i);
  });

  it('shows each saved item with its photo, name and availability, linking to its details', async () => {
    mockRoutes({ [LIST]: [{ status: 200, body: { success: true, data: [SHIRT, UNNAMED, SWEATER] } }] });

    render(<WardrobeGrid />);

    expect(await screen.findByText('Showing 3 of 3 items')).toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(3);

    const shirtLink = within(cards[0]).getByRole('link', { name: /White Oxford Shirt/ });
    expect(shirtLink).toHaveAttribute('href', '/wardrobe/item_1');
    expect(within(cards[0]).getByRole('img', { name: 'White Oxford Shirt' })).toBeInTheDocument();
    expect(within(cards[0]).getByText('Available')).toBeInTheDocument();

    // An unnamed item is called by its color and category.
    expect(within(cards[1]).getByRole('link', { name: /Blue Bottom/ })).toHaveAttribute(
      'href',
      '/wardrobe/item_2',
    );
    expect(within(cards[2]).getByText('Unavailable')).toBeInTheDocument();
  });

  it('uses the singular for one item', async () => {
    mockRoutes({ [LIST]: [{ status: 200, body: { success: true, data: [SHIRT] } }] });

    render(<WardrobeGrid />);

    expect(await screen.findByText('Showing 1 of 1 item')).toBeInTheDocument();
  });

  it('explains an empty wardrobe and offers Add clothing', async () => {
    mockRoutes({ [LIST]: [{ status: 200, body: { success: true, data: [] } }] });

    render(<WardrobeGrid />);

    expect(await screen.findByText('Your wardrobe is empty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add clothing' })).toHaveAttribute('href', '/wardrobe/new');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // There is nothing to search, so the filters are not offered.
    expect(screen.queryByRole('searchbox', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('reports a failed load and retries it', async () => {
    const user = userEvent.setup();
    mockRoutes({
      [LIST]: [{ status: 503 }, { status: 200, body: { success: true, data: [SHIRT] } }],
    });

    render(<WardrobeGrid />);

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your wardrobe. Try again.");
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('White Oxford Shirt')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a network failure the same way', async () => {
    mockRoutes({ [LIST]: ['network-error'] });

    render(<WardrobeGrid />);

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your wardrobe. Try again.");
  });

  it('asks the user to sign in again when the session has ended', async () => {
    mockRoutes({ [LIST]: [{ status: 401 }] });

    render(<WardrobeGrid />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has ended. Sign in again to continue.',
    );
  });

  it('confirms a deletion it was sent here after', async () => {
    mockRoutes({ [LIST]: [{ status: 200, body: { success: true, data: [] } }] });

    render(<WardrobeGrid notice="deleted" />);

    expect(await screen.findByText('Clothing item deleted.')).toBeInTheDocument();
  });

  describe('search and filters', () => {
    const JEANS = itemDto({
      id: 'item_4',
      name: 'Blue Jeans',
      category: 'Bottom',
      color: 'Blue',
      style: 'Denim',
      season: 'All-season',
      formality: 'Casual',
    });
    const WINTER_SWEATER = itemDto({
      id: 'item_5',
      name: 'Winter Sweater',
      color: 'Grey',
      style: 'Knit',
      season: 'Winter',
      formality: 'Casual',
    });
    const ITEMS = [SHIRT, JEANS, WINTER_SWEATER];

    async function renderLoaded() {
      const user = userEvent.setup();
      mockRoutes({ [LIST]: [{ status: 200, body: { success: true, data: ITEMS } }] });
      render(<WardrobeGrid />);
      await screen.findByText('Showing 3 of 3 items');
      return user;
    }

    /** The item names on the visible cards, from their photos' alt text. */
    function cardNames(): string[] {
      return screen
        .getAllByRole('listitem')
        .map((card) => within(card).getByRole('img').getAttribute('alt') ?? '');
    }

    it('offers search and the four filters above the items', async () => {
      await renderLoaded();

      expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
      for (const name of ['Category', 'Color', 'Season', 'Formality']) {
        expect(screen.getByRole('combobox', { name })).toHaveDisplayValue('All');
      }
    });

    it('narrows the items as the user searches, and updates the count', async () => {
      const user = await renderLoaded();

      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'jeans');

      expect(cardNames()).toEqual(['Blue Jeans']);
      expect(screen.getByText('Showing 1 of 3 items')).toBeInTheDocument();
    });

    it('combines a filter with search', async () => {
      const user = await renderLoaded();

      await user.selectOptions(screen.getByRole('combobox', { name: 'Formality' }), 'Casual');
      expect(cardNames()).toEqual(['Blue Jeans', 'Winter Sweater']);

      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'knit');
      expect(cardNames()).toEqual(['Winter Sweater']);
      expect(screen.getByText('Showing 1 of 3 items')).toBeInTheDocument();
    });

    it('shows only items of the selected season, not All-season ones', async () => {
      const user = await renderLoaded();

      await user.selectOptions(screen.getByRole('combobox', { name: 'Season' }), 'Winter');

      expect(cardNames()).toEqual(['Winter Sweater']);
    });

    it('explains when nothing matches, and Clear filters returns the full wardrobe', async () => {
      const user = await renderLoaded();

      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'sequins');
      await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Shoes');

      expect(screen.getByText('No items match your search and filters.')).toBeInTheDocument();
      expect(screen.getByText('Showing 0 of 3 items')).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
      // Distinct from the empty-wardrobe state.
      expect(screen.queryByText('Your wardrobe is empty.')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Clear filters' }));

      expect(cardNames()).toEqual(['White Oxford Shirt', 'Blue Jeans', 'Winter Sweater']);
      expect(screen.getByText('Showing 3 of 3 items')).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('All');
    });

    it('offers one Clear filters action, enabled only while a search or filter is set', async () => {
      const user = await renderLoaded();

      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();

      await user.selectOptions(screen.getByRole('combobox', { name: 'Color' }), 'Blue');
      expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: 'Clear filters' }));

      expect(screen.getByRole('combobox', { name: 'Color' })).toHaveDisplayValue('All');
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
    });

    it('keeps the current search and filters when a failed load is retried', async () => {
      const user = userEvent.setup();
      mockRoutes({
        [LIST]: [{ status: 503 }, { status: 200, body: { success: true, data: ITEMS } }],
      });
      render(<WardrobeGrid />);
      await screen.findByRole('alert');

      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'sweater');
      await user.selectOptions(screen.getByRole('combobox', { name: 'Season' }), 'Winter');
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('Showing 1 of 3 items')).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('sweater');
      expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue('Winter');
      expect(cardNames()).toEqual(['Winter Sweater']);
    });
  });
});
