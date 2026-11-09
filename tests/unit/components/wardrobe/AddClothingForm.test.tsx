// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AddClothingForm } from '@/components/wardrobe/AddClothingForm';
import type { ClassificationResult } from '@/types/classification';

// jsdom has no canvas, so the photo is passed through unchanged.
vi.mock('@/lib/images/resizeImage', () => ({
  resizeImageForUpload: vi.fn(async (file: File) => file),
}));

// The real model can't run in jsdom. These stand in for the browser classifier and give each
// test control over when, and with what, classification answers (US3).
const { classify, FAKE_CLASSIFIER } = vi.hoisted(() => ({
  classify: vi.fn(),
  FAKE_CLASSIFIER: async () => [],
}));
vi.mock('@/services/classification/classifyClothingImage', () => ({ classifyClothingImage: classify }));
vi.mock('@/services/classification/browser/getBrowserClassifier', () => ({
  getBrowserClassifier: () => FAKE_CLASSIFIER,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const CONFIDENT: ClassificationResult = {
  status: 'ok',
  suggestions: {
    category: { status: 'suggested', value: 'Top' },
    color: { status: 'suggested', value: 'White' },
    style: { status: 'suggested', value: 'Button-down' },
    season: { status: 'suggested', value: 'Summer' },
    formality: { status: 'suggested', value: 'Smart casual' },
  },
  fieldsNeedingReview: [],
};

const UNCERTAIN: ClassificationResult = {
  status: 'ok',
  suggestions: {
    category: { status: 'suggested', value: 'Top' },
    color: { status: 'uncertain', value: 'White' },
    style: { status: 'suggested', value: 'Button-down' },
    season: { status: 'uncertain', value: 'Summer' },
    formality: { status: 'missing' },
  },
  fieldsNeedingReview: ['color', 'season', 'formality'],
};

const ANALYSIS_FAILED = "We couldn't analyze this image. You can retry or enter details manually.";
const UNCERTAIN_BANNER = "We aren't confident about these details. Please review them before saving.";

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
    // By default the model is still loading, so US2's manual path is what these tests exercise.
    classify.mockReset();
    classify.mockImplementation(() => new Promise(() => {}));
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
      // US3: while the model loads, nothing is presented as a suggestion yet.
      expect(screen.getByRole('status')).toHaveTextContent(/analyzing your photo/i);
      expect(screen.queryByText('Suggested from your photo.')).not.toBeInTheDocument();
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

  describe('classification suggestions (US3, wireframes 06 and 07)', () => {
    const savedBody = (fetchMock: ReturnType<typeof mockRoutes>) =>
      JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);

    it('classifies the resized photo in the browser, fills in suggestions, and saves the reviewed values', async () => {
      const user = userEvent.setup();
      classify.mockResolvedValue(CONFIDENT);
      const fetchMock = mockRoutes({
        '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }],
        '/api/wardrobe': [{ status: 201, body: { success: true, data: SAVED_ITEM } }],
      });
      render(<AddClothingForm />);

      await uploadAndContinue(user);
      await waitFor(() => expect(screen.getByLabelText(/^category/i)).toHaveValue('Top'));

      expect(classify).toHaveBeenCalledTimes(1);
      expect(classify).toHaveBeenCalledWith(expect.any(Blob), FAKE_CLASSIFIER);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/uploads']);
      expect(screen.getAllByText('Suggested from your photo.')).toHaveLength(5);
      expect(screen.queryByText(UNCERTAIN_BANNER)).not.toBeInTheDocument();

      // Every field stays editable.
      await user.clear(screen.getByLabelText(/^style/i));
      await user.type(screen.getByLabelText(/^style/i), 'Oxford');
      await user.selectOptions(screen.getByLabelText(/^season/i), 'Spring');
      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));

      expect(await screen.findByText('Saved to your wardrobe.')).toBeInTheDocument();
      expect(savedBody(fetchMock)).toEqual({
        publicId: IMAGE.publicId,
        category: 'Top',
        color: 'White',
        style: 'Oxford',
        season: 'Spring',
        formality: 'Smart casual',
      });
    });

    it('shows progress while analyzing and lets the user stop waiting and enter details manually', async () => {
      const user = userEvent.setup();
      const pending = deferred<ClassificationResult>();
      classify.mockReturnValue(pending.promise);
      mockRoutes({ '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }] });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      expect(screen.getByRole('status')).toHaveTextContent(/analyzing your photo/i);
      expect(screen.getByLabelText(/^category/i)).toBeEnabled();

      await user.click(screen.getByRole('button', { name: 'Enter details manually' }));
      expect(screen.queryByText(/analyzing your photo/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^category/i)).toHaveFocus();

      await act(async () => pending.resolve(CONFIDENT));
      expect(screen.getByLabelText(/^category/i)).toHaveValue('');
      expect(screen.queryByText('Suggested from your photo.')).not.toBeInTheDocument();
    });

    it('marks uncertain and missing suggestions and blocks saving until they are reviewed', async () => {
      const user = userEvent.setup();
      classify.mockResolvedValue(UNCERTAIN);
      const fetchMock = mockRoutes({
        '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }],
        '/api/wardrobe': [{ status: 201, body: { success: true, data: SAVED_ITEM } }],
      });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      expect(await screen.findByText(UNCERTAIN_BANNER)).toBeInTheDocument();
      expect(screen.getAllByText('Needs review. Confirm or change this suggestion.')).toHaveLength(2);
      expect(screen.getByText('Not detected in your photo.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));

      expect(screen.getAllByText('Confirm or change this value.')).toHaveLength(2);
      expect(screen.getByText('Choose a formality.')).toBeInTheDocument();
      expect(screen.getByLabelText(/^color/i)).toHaveFocus();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('checkbox', { name: 'White is correct' }));
      await user.selectOptions(screen.getByLabelText(/^season/i), 'Winter');
      await user.selectOptions(screen.getByLabelText(/^formality/i), 'Casual');
      expect(screen.queryByText(UNCERTAIN_BANNER)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));

      expect(await screen.findByText('Saved to your wardrobe.')).toBeInTheDocument();
      expect(savedBody(fetchMock)).toMatchObject({ color: 'White', season: 'Winter', formality: 'Casual' });
    });

    it('explains a failed analysis and fills in suggestions after Retry analysis', async () => {
      const user = userEvent.setup();
      classify.mockResolvedValueOnce({ status: 'failed', reason: 'unavailable' }).mockResolvedValueOnce(CONFIDENT);
      mockRoutes({ '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }] });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      expect(await screen.findByText(ANALYSIS_FAILED)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Describe this item' })).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Retry analysis' }));

      await waitFor(() => expect(screen.getByLabelText(/^category/i)).toHaveValue('Top'));
      expect(screen.queryByText(ANALYSIS_FAILED)).not.toBeInTheDocument();
      expect(classify).toHaveBeenCalledTimes(2);
      expect(classify.mock.calls[1][0]).toBe(classify.mock.calls[0][0]);
    });

    it('lets the user finish without AI after a failed analysis', async () => {
      const user = userEvent.setup();
      classify.mockResolvedValue({ status: 'failed', reason: 'invalid_output' });
      mockRoutes({
        '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }],
        '/api/wardrobe': [{ status: 201, body: { success: true, data: SAVED_ITEM } }],
      });
      render(<AddClothingForm />);
      await uploadAndContinue(user);
      await screen.findByText(ANALYSIS_FAILED);

      await user.click(screen.getByRole('button', { name: 'Enter details manually' }));
      expect(screen.queryByText(ANALYSIS_FAILED)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^category/i)).toHaveFocus();

      await fillDetails(user);
      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
      expect(await screen.findByText('Saved to your wardrobe.')).toBeInTheDocument();
    });

    it('says when the photo does not look like clothing, without offering a pointless retry', async () => {
      const user = userEvent.setup();
      classify.mockResolvedValue({ status: 'failed', reason: 'not_clothing' });
      mockRoutes({ '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }] });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      expect(await screen.findByText(/doesn't look like a clothing item/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry analysis' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enter details manually' })).toBeInTheDocument();
    });

    it('never overwrites details the user entered before the suggestions arrived', async () => {
      const user = userEvent.setup();
      const pending = deferred<ClassificationResult>();
      classify.mockReturnValue(pending.promise);
      mockRoutes({ '/api/uploads': [{ status: 201, body: { success: true, data: IMAGE } }] });
      render(<AddClothingForm />);
      await uploadAndContinue(user);

      await user.selectOptions(screen.getByLabelText(/^category/i), 'Shoes');
      await user.type(screen.getByLabelText(/^style/i), 'Loafer');
      await act(async () => pending.resolve(CONFIDENT));

      await waitFor(() => expect(screen.getByLabelText(/^color/i)).toHaveValue('White'));
      expect(screen.getByLabelText(/^category/i)).toHaveValue('Shoes');
      expect(screen.getByLabelText(/^style/i)).toHaveValue('Loafer');
      expect(screen.getAllByText('Suggested from your photo.')).toHaveLength(3);
    });

    it('ignores the result for a photo the user has replaced', async () => {
      const user = userEvent.setup();
      const first = deferred<ClassificationResult>();
      const second = deferred<ClassificationResult>();
      classify.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      mockRoutes({
        '/api/uploads': [{ status: 502 }, { status: 201, body: { success: true, data: IMAGE } }],
      });
      render(<AddClothingForm />);

      await user.upload(screen.getByLabelText(/clothing image/i), jpeg());
      await screen.findByRole('button', { name: 'Choose another' });
      await uploadAndContinue(user);
      expect(classify).toHaveBeenCalledTimes(2);

      await act(async () =>
        first.resolve({
          ...CONFIDENT,
          suggestions: { ...CONFIDENT.suggestions, category: { status: 'suggested', value: 'Dress' } },
        }),
      );
      expect(screen.getByLabelText(/^category/i)).toHaveValue('');
      expect(screen.getByRole('status')).toHaveTextContent(/analyzing your photo/i);

      await act(async () => second.resolve(CONFIDENT));
      await waitFor(() => expect(screen.getByLabelText(/^category/i)).toHaveValue('Top'));
    });

    it('ignores a result that arrives after the form was reset for another item', async () => {
      const user = userEvent.setup();
      const late = deferred<ClassificationResult>();
      classify.mockReturnValueOnce(late.promise);
      mockRoutes({
        '/api/uploads': [
          { status: 201, body: { success: true, data: IMAGE } },
          { status: 201, body: { success: true, data: IMAGE } },
        ],
        '/api/wardrobe': [{ status: 201, body: { success: true, data: SAVED_ITEM } }],
      });
      render(<AddClothingForm />);
      await uploadAndContinue(user);
      await fillDetails(user);
      await user.click(screen.getByRole('button', { name: 'Confirm and save' }));
      await user.click(await screen.findByRole('button', { name: 'Add another item' }));
      await uploadAndContinue(user);

      // The first item's result arrives while the second item's (still loading) form is open.
      await act(async () => late.resolve(CONFIDENT));
      expect(screen.getByLabelText(/^category/i)).toHaveValue('');
      expect(screen.queryByText('Suggested from your photo.')).not.toBeInTheDocument();
    });
  });
});
