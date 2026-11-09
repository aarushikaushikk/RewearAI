// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ClothingDetail } from '@/components/wardrobe/ClothingDetail';
import { mockRoutes, pending } from '../../../helpers/fetchMock';
import { itemDto } from '../../../helpers/wardrobeItems';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}));

const ITEM = itemDto({ id: 'item_1' });
const URL = '/api/wardrobe/item_1';
const GET = `GET ${URL}`;
const PATCH = `PATCH ${URL}`;
const DELETE = `DELETE ${URL}`;
const loaded = (item = ITEM) => ({ status: 200, body: { success: true, data: item } });

type User = ReturnType<typeof userEvent.setup>;

async function openDelete(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Delete item' }));
  return screen.getByRole('alertdialog', { name: 'Delete this clothing item?' });
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

afterEach(cleanup);

// Wireframe 04, without the availability toggle, which is #11.
describe('ClothingDetail', () => {
  describe('viewing', () => {
    it('shows a loading state while the item loads', () => {
      mockRoutes({ [GET]: [pending()] });

      render(<ClothingDetail itemId="item_1" />);

      expect(screen.getByRole('status')).toHaveTextContent(/loading this item/i);
    });

    it('shows the photo, the name as the heading, and every detail ready to edit', async () => {
      mockRoutes({ [GET]: [loaded()] });

      render(<ClothingDetail itemId="item_1" />);

      expect(await screen.findByRole('heading', { level: 1, name: 'White Oxford Shirt' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'White Oxford Shirt' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^name/i)).toHaveValue('White Oxford Shirt');
      expect(screen.getByLabelText(/^category/i)).toHaveValue('Top');
      expect(screen.getByLabelText(/^color/i)).toHaveValue('White');
      expect(screen.getByLabelText(/^style/i)).toHaveValue('Classic');
      expect(screen.getByLabelText(/^season/i)).toHaveValue('All-season');
      expect(screen.getByLabelText(/^formality/i)).toHaveValue('Smart casual');
      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    it('marks Name optional and the other details required, as on Add Clothing', async () => {
      mockRoutes({ [GET]: [loaded()] });

      render(<ClothingDetail itemId="item_1" />);

      expect(await screen.findByText('Name')).toHaveTextContent('(Optional)');
      for (const label of ['Category', 'Color', 'Style', 'Season', 'Formality']) {
        expect(screen.getByText(label, { selector: 'label' })).toHaveTextContent('(Required)');
      }
    });

    it('names an unnamed item by its color and category', async () => {
      mockRoutes({ [GET]: [loaded(itemDto({ name: undefined, color: 'White', category: 'Top' }))] });

      render(<ClothingDetail itemId="item_1" />);

      expect(await screen.findByRole('heading', { level: 1, name: 'White Top' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'White Top' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^name/i)).toHaveValue('');
    });

    it("explains an item that doesn't exist or isn't the user's, with a way back", async () => {
      mockRoutes({ [GET]: [{ status: 404 }] });

      render(<ClothingDetail itemId="item_1" />);

      expect(await screen.findByRole('heading', { name: "We couldn't find this clothing item" })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to My Wardrobe' })).toHaveAttribute('href', '/wardrobe');
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    });

    it('reports a failed load and retries it', async () => {
      const user = userEvent.setup();
      mockRoutes({ [GET]: [{ status: 503 }, loaded()] });

      render(<ClothingDetail itemId="item_1" />);

      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this item. Try again.");
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'White Oxford Shirt' })).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('saves the edited details and confirms the save', async () => {
      const user = userEvent.setup();
      const updated = itemDto({ name: 'Blue Oxford Shirt', color: 'Blue', style: 'Oxford' });
      const fetchMock = mockRoutes({ [GET]: [loaded()], [PATCH]: [loaded(updated)] });
      render(<ClothingDetail itemId="item_1" />);

      const name = await screen.findByLabelText(/^name/i);
      await user.clear(name);
      await user.type(name, 'Blue Oxford Shirt');
      await user.selectOptions(screen.getByLabelText(/^color/i), 'Blue');
      await user.clear(screen.getByLabelText(/^style/i));
      await user.type(screen.getByLabelText(/^style/i), 'Oxford');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Blue Oxford Shirt' })).toBeInTheDocument();
      const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
      expect(JSON.parse(init!.body as string)).toEqual({
        name: 'Blue Oxford Shirt',
        category: 'Top',
        color: 'Blue',
        style: 'Oxford',
        season: 'All-season',
        formality: 'Smart casual',
      });
      expect(init!.headers).toMatchObject({ Origin: window.location.origin });
    });

    it('shows field errors without sending anything, and focuses the first', async () => {
      const user = userEvent.setup();
      const fetchMock = mockRoutes({ [GET]: [loaded()] });
      render(<ClothingDetail itemId="item_1" />);

      await user.selectOptions(await screen.findByLabelText(/^category/i), '');
      await user.clear(screen.getByLabelText(/^style/i));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(screen.getByText('Choose a category.')).toBeInTheDocument();
      expect(screen.getByText('Enter a style.')).toBeInTheDocument();
      expect(screen.getByLabelText(/^category/i)).toHaveFocus();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the edits and offers a retry when the save fails', async () => {
      const user = userEvent.setup();
      mockRoutes({ [GET]: [loaded()], [PATCH]: [{ status: 503 }] });
      render(<ClothingDetail itemId="item_1" />);

      await user.clear(await screen.findByLabelText(/^style/i));
      await user.type(screen.getByLabelText(/^style/i), 'Oxford');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Service temporarily unavailable. Please try again later.',
      );
      expect(screen.getByLabelText(/^style/i)).toHaveValue('Oxford');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });

    it('reports a generic save failure in the words of the design', async () => {
      const user = userEvent.setup();
      mockRoutes({ [GET]: [loaded()], [PATCH]: ['network-error'] });
      render(<ClothingDetail itemId="item_1" />);

      await user.click(await screen.findByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/check your connection|try again/i);
    });

    it('says so when the item was deleted elsewhere before the save', async () => {
      const user = userEvent.setup();
      mockRoutes({ [GET]: [loaded()], [PATCH]: [{ status: 404 }] });
      render(<ClothingDetail itemId="item_1" />);

      await user.click(await screen.findByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "We couldn't find this clothing item. It may have been deleted.",
      );
    });
  });

  describe('deleting', () => {
    it('asks for confirmation before deleting anything', async () => {
      const user = userEvent.setup();
      const fetchMock = mockRoutes({ [GET]: [loaded()] });
      render(<ClothingDetail itemId="item_1" />);

      const dialog = await openDelete(user);

      expect(dialog).toHaveTextContent('White Oxford Shirt');
      expect(dialog).toHaveTextContent(/photo/);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('deletes on confirmation and returns to My Wardrobe', async () => {
      const user = userEvent.setup();
      const fetchMock = mockRoutes({
        [GET]: [loaded()],
        [DELETE]: [{ status: 200, body: { success: true, data: { id: 'item_1' } } }],
      });
      render(<ClothingDetail itemId="item_1" />);

      await openDelete(user);
      await user.click(screen.getByRole('button', { name: 'Delete clothing item' }));

      await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/wardrobe?deleted=1'));
      const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'DELETE')!;
      expect(init!.headers).toMatchObject({ Origin: window.location.origin });
    });

    it('treats an item that is already gone as deleted', async () => {
      const user = userEvent.setup();
      mockRoutes({ [GET]: [loaded()], [DELETE]: [{ status: 404 }] });
      render(<ClothingDetail itemId="item_1" />);

      await openDelete(user);
      await user.click(screen.getByRole('button', { name: 'Delete clothing item' }));

      await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/wardrobe?deleted=1'));
    });

    it('keeps the item and explains when the delete fails', async () => {
      const user = userEvent.setup();
      mockRoutes({ [GET]: [loaded()], [DELETE]: [{ status: 502 }] });
      render(<ClothingDetail itemId="item_1" />);

      await openDelete(user);
      await user.click(screen.getByRole('button', { name: 'Delete clothing item' }));

      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't delete this item. Try again.");
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'White Oxford Shirt' })).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });
});
