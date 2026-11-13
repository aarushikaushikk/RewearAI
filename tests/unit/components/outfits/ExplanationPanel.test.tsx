// @vitest-environment jsdom
// US13: the Why these items? panel. The photo model is faked; nothing is downloaded.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExplanationPanel, type ExplainedItem } from '@/components/outfits/ExplanationPanel';
import { vibePrompt } from '@/services/stylist/stylistLibrary';
import type { OutfitExplanationDto } from '@/types/outfit';
import type { LabelScore, ZeroShotImageClassifier } from '@/types/classification';

const cached = vi.fn<() => Promise<boolean>>();
const classifier = vi.fn<ZeroShotImageClassifier>();
vi.mock('@/services/classification/browser/modelCache', () => ({ isClassifierModelCached: () => cached() }));
vi.mock('@/services/classification/browser/getBrowserClassifier', () => ({ getBrowserClassifier: () => classifier }));

const TOP: ExplainedItem = {
  id: 'top',
  role: 'top',
  name: 'Oxford shirt',
  color: 'White',
  style: 'Classic',
  image: { url: 'https://res.cloudinary.com/test/top.jpg' },
};
const JACKET: ExplainedItem = {
  id: 'jacket',
  role: 'outerwear',
  name: 'Suede jacket',
  color: 'Brown',
  style: 'Western',
  image: { url: 'https://res.cloudinary.com/test/jacket.jpg' },
};
const FACTS: OutfitExplanationDto = {
  formalities: ['Smart casual', 'Formal'],
  seasons: ['Autumn', 'All-season'],
  palette: 'neutral',
  alternative: false,
};
const DISCLOSURE = /chosen with on-device AI/i;

/** Scores where the given item's photo looks strongly like its saved style. */
function photoFavours(itemUrl: string, prompt: string): ZeroShotImageClassifier {
  return async (image, labels): Promise<LabelScore[]> =>
    labels.map((label) => ({ label, score: image === itemUrl && label === prompt ? 0.9 : 0.01 }));
}

describe('ExplanationPanel (US13)', () => {
  beforeEach(() => {
    cached.mockResolvedValue(false);
    classifier.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the reason line and a basic stylist note right away', () => {
    render(<ExplanationPanel occasion="work" explanation={FACTS} items={[TOP, JACKET]} />);

    expect(screen.getByRole('heading', { name: 'Why these items?' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Picked because every piece is Smart casual or Formal for Work, they all suit Autumn, and the colors stay in neutrals.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Sticking to neutral shades/)).toBeInTheDocument();
    expect(screen.getByText(/^The Suede jacket can add a rugged edge\.$/)).toBeInTheDocument();
    expect(screen.queryByText(DISCLOSURE)).not.toBeInTheDocument();
  });

  it('does not start the photo model when it is not already downloaded', async () => {
    render(<ExplanationPanel occasion="work" explanation={FACTS} items={[TOP, JACKET]} />);

    await waitFor(() => expect(cached).toHaveBeenCalled());
    expect(classifier).not.toHaveBeenCalled();
  });

  it('switches to the AI-assisted note when the photos change the choice', async () => {
    cached.mockResolvedValue(true);
    classifier.mockImplementation(photoFavours(TOP.image!.url!, vibePrompt('classic', 'top')));
    const onFeatured = vi.fn();

    render(<ExplanationPanel occasion="work" explanation={FACTS} items={[TOP, JACKET]} onFeatured={onFeatured} />);

    expect(await screen.findByText(DISCLOSURE)).toBeInTheDocument();
    expect(screen.getByText(/^The Oxford shirt /)).toBeInTheDocument();
    expect(screen.queryByText(/Suede jacket/)).not.toBeInTheDocument();
    expect(onFeatured).toHaveBeenLastCalledWith('top');
  });

  it('announces the note politely in one live region', () => {
    render(<ExplanationPanel occasion="work" explanation={FACTS} items={[TOP, JACKET]} />);

    const live = screen.getByText(/^Sticking to neutral shades/).closest('[aria-live]');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps the basic note, with no error or disclosure, when the photo model fails', async () => {
    cached.mockResolvedValue(true);
    classifier.mockRejectedValue(new Error('inference_failed'));

    render(<ExplanationPanel occasion="work" explanation={FACTS} items={[TOP, JACKET]} />);

    await waitFor(() => expect(classifier).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/^The Suede jacket can add a rugged edge\.$/)).toBeInTheDocument();
    expect(screen.queryByText(DISCLOSURE)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores photo scores for an outfit that has since been replaced', async () => {
    cached.mockResolvedValue(true);
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    // Only the first outfit's scoring succeeds, and only after the outfit was replaced.
    classifier.mockImplementationOnce(async (image, labels) => {
      await gate;
      return photoFavours(TOP.image!.url!, vibePrompt('classic', 'top'))(image, labels);
    });
    classifier.mockRejectedValue(new Error('inference_failed'));
    const NEXT: ExplainedItem = { ...JACKET, id: 'boots', role: 'shoes', name: 'Hiking boots', style: 'Outdoor', image: undefined };

    const { rerender } = render(<ExplanationPanel occasion="work" explanation={FACTS} items={[TOP, JACKET]} />);
    rerender(<ExplanationPanel occasion="work" explanation={{ ...FACTS, alternative: true }} items={[TOP, NEXT]} />);
    release();

    await waitFor(() => expect(classifier).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/^The Hiking boots /)).toBeInTheDocument();
    expect(screen.queryByText(DISCLOSURE)).not.toBeInTheDocument();
  });

  it('features a different piece than the one featured before', () => {
    render(<ExplanationPanel occasion="work" explanation={FACTS} items={[TOP, JACKET]} previousFeatured="jacket" />);

    expect(screen.getByText(/^The Oxford shirt /)).toBeInTheDocument();
  });
});
