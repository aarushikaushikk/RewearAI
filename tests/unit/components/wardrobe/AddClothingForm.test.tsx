// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AddClothingForm } from '@/components/wardrobe/AddClothingForm';

// jsdom has no canvas, so the photo is passed through unchanged.
vi.mock('@/lib/images/resizeImage', () => ({
  resizeImageForUpload: vi.fn(async (file: File) => file),
}));

const IMAGE = {
  url: 'https://res.cloudinary.com/test/image/upload/v1/rewear/users/u1/abc.jpg',
  publicId: 'rewear/users/u1/abc',
};

const SAVED_ITEM = {
  id: 'item_1',
  image: IMAGE,
  name: 'Linen shirt',
  category: 'Top',
  color: 'White',
  style: 'Button-down',
  season: 'Summer',
  formality: 'Smart casual',
  isAvailable: true,
  createdAt: '2026-11-08T10:00:00.000Z',
  updatedAt: '2026-11-08T10:00:00.000Z',
};

type Reply = { status: number; body?: unknown } | 'network-error';

function respond(reply: Reply) {
  if (reply === 'network-error') {
    return Promise.reject(new TypeError('Failed to fetch'));
  }
  return Promise.resolve({
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    json: async () => reply.body ?? {},
  } as Response);
}

/** Answers each route with its queued replies, in order. */
function mockRoutes(routes: Record<string, Reply[]>) {
  const fetchMock = vi.fn((url: string) => respond(routes[url].shift()!));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'shirt.jpg', { type: 'image/jpeg' });

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/^category/i), 'Top');
  await user.selectOptions(screen.getByLabelText(/^color/i), 'White');
  await user.type(screen.getByLabelText(/^style/i), 'Button-down');
  await user.selectOptions(screen.getByLabelText(/^season/i), 'Summer');
  await user.selectOptions(screen.getByLabelText(/^formality/i), 'Smart casual');
}

/** Uploads a photo and waits for the details step (wireframe 06). */
async function uploadAndContinue(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText(/clothing image/i), jpeg());
  await screen.findByRole('heading', { name: 'Describe this item' });
}

const UNSUPPORTED = "This file type isn't supported. Choose a JPEG, PNG, or WebP image.";

describe('AddClothingForm', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('upload step (wireframe 05)', () => {
    it('shows the upload card with its drop zone, rules, and two actions, and no detail fields', () => {
      render(<AddClothingForm />);

      expect(screen.getByRole('heading', { level: 1, name: 'Upload a clothing photo' })).toBeInTheDocument();
      expect(screen.getByText('Only photos of clothing you own')).toBeInTheDocument();
      expect(screen.getByText('Choose image or drag a file here')).toBeInTheDocument();
      expect(screen.getByText('JPEG, PNG, or WebP, up to 4 MB.')).toBeInTheDocument();
      expect(screen.getByLabelText(/clothing image/i)).toHaveAttribute(
        'accept',
        'image/jpeg,image/png,image/webp',
      );
      expect(screen.getByRole('button', { name: 'Choose photo' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/home');
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
    });

    it('opens the file picker from Choose photo', async () => {
      const user = userEvent.setup();
      render(<AddClothingForm />);
      const input = screen.getByLabelText(/clothing image/i) as HTMLInputElement;
      const click = vi.spyOn(input, 'click');

      await user.click(screen.getByRole('button', { name: 'Choose photo' }));

      expect(click).toHaveBeenCalled();
    });

    it('rejects an unsupported file type without uploading it', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const fetchMock = mockRoutes({});
      render(<AddClothingForm />);

      await user.upload(
        screen.getByLabelText(/clothing image/i),
        new File(['GIF89a'], 'shirt.gif', { type: 'image/gif' }),
      );

      expect(await screen.findByText(UNSUPPORTED)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { level: 1, name: 'Upload a clothing photo' })).toBeInTheDocument();
    });

    it('uploads a photo dropped on the drop zone and moves to the details step', async () => {
      const fetchMock = mockRoutes({
        '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }],
      });
      render(<AddClothingForm />);

      const dropZone = screen.getByText('Choose image or drag a file here');
      fireEvent.dragOver(dropZone, { dataTransfer: { files: [], types: ['Files'] } });
      fireEvent.drop(dropZone, { dataTransfer: { files: [jpeg()], types: ['Files'] } });

      expect(await screen.findByRole('heading', { name: 'Describe this item' })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a dropped file of an unsupported type without uploading it', async () => {
      const fetchMock = mockRoutes({});
      render(<AddClothingForm />);

      fireEvent.drop(screen.getByText('Choose image or drag a file here'), {
        dataTransfer: { files: [new File(['%PDF'], 'shirt.pdf', { type: 'application/pdf' })], types: ['Files'] },
      });

      expect(await screen.findByText(UNSUPPORTED)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows progress and blocks a second choice while uploading', async () => {
      const user = userEvent.setup();
      global.fetch = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
      render(<AddClothingForm />);

      await user.upload(screen.getByLabelText(/clothing image/i), jpeg());

      expect(screen.getByAltText('Preview of the selected clothing photo')).toBeInTheDocument();
      expect(screen.getByText('Uploading…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose photo' })).toBeDisabled();
      expect(screen.getByLabelText(/clothing image/i)).toBeDisabled();
    });

    it('keeps the preview and offers Retry or Choose another when the upload fails', async () => {
      const user = userEvent.setup();
      mockRoutes({
        '/api/uploads': [{ status: 502 }, { status: 201, body: { success: true, data: IMAGE } }],
      });
      render(<AddClothingForm />);

      await user.upload(screen.getByLabelText(/clothing image/i), jpeg());

      expect(await screen.findByText("Your image didn't upload. Please try again.")).toBeInTheDocument();
      expect(screen.getByAltText('Preview of the selected clothing photo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose another' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Retry upload' }));

      expect(await screen.findByRole('heading', { name: 'Describe this item' })).toBeInTheDocument();
    });

    it('uses its own message for each status, never the server text, and offers no Retry for a rejected type', async () => {
      const user = userEvent.setup();
      mockRoutes({
        '/api/uploads': [{ status: 415, body: { success: false, error: 'server says <b>no</b>' } }],
      });
      render(<AddClothingForm />);

      await user.upload(screen.getByLabelText(/clothing image/i), jpeg());

      expect(await screen.findByText(UNSUPPORTED)).toBeInTheDocument();
      expect(screen.queryByText(/server says/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry upload' })).not.toBeInTheDocument();
    });
  });

  describe('details step (wireframe 06)', () => {
    it('shows the uploaded photo beside the five detail fields in wireframe order', async () => {
      const user = userEvent.setup();
      mockRoutes({ '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }] });
      const { container } = render(<AddClothingForm />);

      await uploadAndContinue(user);

      expect(screen.getByRole('heading', { level: 1, name: 'Describe this item' })).toHaveFocus();
      expect(screen.getByText('Check each detail before saving.')).toBeInTheDocument();
      expect(screen.getByAltText('Uploaded clothing photo')).toBeInTheDocument();
      const labels = Array.from(container.querySelectorAll('label')).map((label) =>
        label.textContent!.replace('(Required)', '').trim(),
      );
      expect(labels).toEqual(['Category', 'Color', 'Style', 'Season', 'Formality']);
      expect(screen.getAllByText('(Required)')).toHaveLength(5);
      expect(screen.getByRole('button', { name: 'Confirm and save' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit details/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/suggest/i)).not.toBeInTheDocument();
    });

    it('shows field errors and sends nothing when saved empty', async () => {
      const user = userEvent.setup();
      const fetchMock = mockRoutes({ '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }] });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));

      expect(screen.getByText('Choose a category.')).toBeInTheDocument();
      expect(screen.getByText('Enter a style.')).toBeInTheDocument();
      expect(screen.getByLabelText(/^category/i)).toHaveFocus();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('saves the item and shows it with its stored photo', async () => {
      const user = userEvent.setup();
      const fetchMock = mockRoutes({
        '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }],
        '/api/wardrobe': [{ status: 201, body: { success: true, data: { ...SAVED_ITEM, name: null } } }],
      });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      await fillDetails(user);
      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));

      expect(await screen.findByText('Saved to your wardrobe.')).toBeInTheDocument();
      expect(screen.getByAltText('White Button-down')).toHaveAttribute(
        'src',
        expect.stringContaining('res.cloudinary.com'),
      );
      expect(screen.getByText('Available')).toBeInTheDocument();

      const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        publicId: IMAGE.publicId,
        category: 'Top',
        color: 'White',
        style: 'Button-down',
        season: 'Summer',
        formality: 'Smart casual',
      });
    });

    it('keeps every entered detail when the save fails', async () => {
      const user = userEvent.setup();
      mockRoutes({
        '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }],
        '/api/wardrobe': ['network-error'],
      });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      await fillDetails(user);
      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));

      expect(
        await screen.findByText("We couldn't reach the server. Check your connection and try again."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/^category/i)).toHaveValue('Top');
      expect(screen.getByLabelText(/^style/i)).toHaveValue('Button-down');
      expect(screen.getByAltText('Uploaded clothing photo')).toBeInTheDocument();
    });
  });
});
