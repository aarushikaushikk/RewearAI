import { describe, expect, it, vi } from 'vitest';
import { scoreOutfitPhotos } from '@/services/stylist/browser/scoreOutfitPhotos';
import { stylistLabels } from '@/services/stylist/stylistLibrary';
import type { ZeroShotImageClassifier } from '@/types/classification';

// A stand-in for the US3 worker classifier: scores every label, the first one highest.
const fakeClassifier = (impl?: ZeroShotImageClassifier) =>
  vi.fn<ZeroShotImageClassifier>(
    impl ?? (async (_image, labels) => labels.map((label, i) => ({ label, score: i === 0 ? 0.5 : 0.01 }))),
  );

const items = [
  { id: 'a', role: 'top' as const, url: 'https://res.cloudinary.com/demo/a.jpg' },
  { id: 'b', role: 'shoes' as const, url: 'https://res.cloudinary.com/demo/b.jpg' },
];

describe('scoreOutfitPhotos (US13)', () => {
  it("scores each piece's photo against its role's fixed label set", async () => {
    const classifier = fakeClassifier();

    const scores = await scoreOutfitPhotos(items, classifier);

    expect(classifier).toHaveBeenCalledTimes(2);
    expect(classifier.mock.calls.map((call) => call[1])).toEqual([stylistLabels('top'), stylistLabels('shoes')]);
    expect(classifier.mock.calls.map((call) => call[0])).toEqual(items.map((i) => i.url));
    expect(scores?.get('a')?.get(stylistLabels('top')[0])).toBe(0.5);
    expect(scores?.get('b')?.size).toBe(stylistLabels('shoes').length);
  });

  it('drops a piece whose photo fails and keeps the others', async () => {
    const classifier = fakeClassifier(async (image, labels) => {
      if (image === items[0].url) throw new Error('load failed');
      return labels.map((label) => ({ label, score: 0.1 }));
    });

    const scores = await scoreOutfitPhotos(items, classifier);

    expect([...(scores?.keys() ?? [])]).toEqual(['b']);
  });

  it('skips pieces without a photo URL', async () => {
    const classifier = fakeClassifier();

    await scoreOutfitPhotos([{ id: 'a', role: 'top' }, items[1]], classifier);

    expect(classifier).toHaveBeenCalledOnce();
  });

  it('answers null when nothing could be scored', async () => {
    const classifier = fakeClassifier(async () => {
      throw new Error('inference failed');
    });

    await expect(scoreOutfitPhotos(items, classifier)).resolves.toBeNull();
  });

  it('answers null without a classifier', async () => {
    await expect(scoreOutfitPhotos(items, null)).resolves.toBeNull();
  });

  it('gives up after the time budget', async () => {
    vi.useFakeTimers();
    try {
      const classifier = fakeClassifier(() => new Promise(() => {}));
      const pending = scoreOutfitPhotos(items, classifier, { timeoutMs: 1000 });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores scores for labels it did not ask about', async () => {
    const classifier = fakeClassifier(async () => [{ label: 'injected', score: 1 }]);

    const scores = await scoreOutfitPhotos([items[0]], classifier);

    expect(scores).toBeNull();
  });
});
