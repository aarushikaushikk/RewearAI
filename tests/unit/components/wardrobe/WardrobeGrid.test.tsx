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

// Wireframe 03 without search and filters, which are #10.
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
});
