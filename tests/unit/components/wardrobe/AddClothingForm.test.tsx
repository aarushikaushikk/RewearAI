// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  await user.type(screen.getByLabelText(/^name/i), 'Linen shirt');
  await user.selectOptions(screen.getByLabelText(/^category/i), 'Top');
  await user.selectOptions(screen.getByLabelText(/^color/i), 'White');
  await user.selectOptions(screen.getByLabelText(/^season/i), 'Summer');
  await user.selectOptions(screen.getByLabelText(/^formality/i), 'Smart casual');
  await user.type(screen.getByLabelText(/^style/i), 'Button-down');
}

describe('AddClothingForm', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('labels each field Required or Optional and shows the accepted files', () => {
    render(<AddClothingForm />);

    expect(screen.getByLabelText(/clothing image/i)).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
    expect(screen.getByText('JPEG, PNG, or WebP, up to 4 MB.')).toBeInTheDocument();
    expect(screen.getByText('(Optional)')).toBeInTheDocument();
    expect(screen.getAllByText('(Required)')).toHaveLength(6);
  });

  it('sends Cancel straight to Home', () => {
    render(<AddClothingForm />);
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/home');
  });

  it('shows field errors and sends nothing when saved empty', async () => {
    const user = userEvent.setup();
    const fetchMock = mockRoutes({});
    render(<AddClothingForm />);

    await user.click(screen.getByRole('button', { name: /save to my wardrobe/i }));

    expect(screen.getByText('Upload an image of the item.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(screen.getByText('Enter a style.')).toBeInTheDocument();
    expect(screen.getByLabelText(/clothing image/i)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file type without uploading it', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const fetchMock = mockRoutes({});
    render(<AddClothingForm />);

    await user.upload(
      screen.getByLabelText(/clothing image/i),
      new File(['GIF89a'], 'shirt.gif', { type: 'image/gif' }),
    );

    expect(
      await screen.findByText("This file type isn't supported. Choose a JPEG, PNG, or WebP image."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a preview, and offers Retry when the upload fails', async () => {
    const user = userEvent.setup();
    mockRoutes({
      '/api/uploads': [{ status: 502 }, { status: 201, body: { success: true, data: IMAGE } }],
    });
    render(<AddClothingForm />);

    await user.upload(screen.getByLabelText(/clothing image/i), jpeg());

    expect(screen.getByAltText('Preview of the selected clothing photo')).toBeInTheDocument();
    expect(
      await screen.findByText("Your image didn't upload. Please try again."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry upload/i }));

    await waitFor(() =>
      expect(screen.queryByText("Your image didn't upload. Please try again.")).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Image uploaded.')).toBeInTheDocument();
  });

  it('uses its own message for each status, never the server text', async () => {
    const user = userEvent.setup();
    mockRoutes({
      '/api/uploads': [{ status: 415, body: { success: false, error: 'server says <b>no</b>' } }],
    });
    render(<AddClothingForm />);

    await user.upload(screen.getByLabelText(/clothing image/i), jpeg());

    expect(
      await screen.findByText("This file type isn't supported. Choose a JPEG, PNG, or WebP image."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/server says/)).not.toBeInTheDocument();
  });

  it('saves the item and shows it with its stored photo', async () => {
    const user = userEvent.setup();
    const fetchMock = mockRoutes({
      '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }],
      '/api/wardrobe': [{ status: 201, body: { success: true, data: SAVED_ITEM } }],
    });
    render(<AddClothingForm />);

    await user.upload(screen.getByLabelText(/clothing image/i), jpeg());
    await screen.findByText('Image uploaded.');
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /save to my wardrobe/i }));

    expect(await screen.findByText('Saved to your wardrobe.')).toBeInTheDocument();
    expect(screen.getByAltText('Linen shirt')).toHaveAttribute('src', expect.stringContaining('res.cloudinary.com'));
    expect(screen.getByText('Available')).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      publicId: IMAGE.publicId,
      name: 'Linen shirt',
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

    await user.upload(screen.getByLabelText(/clothing image/i), jpeg());
    await screen.findByText('Image uploaded.');
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /save to my wardrobe/i }));

    expect(
      await screen.findByText("We couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toHaveValue('Linen shirt');
    expect(screen.getByLabelText(/^category/i)).toHaveValue('Top');
    expect(screen.getByAltText('Preview of the selected clothing photo')).toBeInTheDocument();
  });
});
