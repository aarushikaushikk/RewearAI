// US14: generation uses the user's saved feedback, and each outfit carries its saved rating.
import { describe, expect, it, vi } from 'vitest';
import type { IOutfitFeedbackRepository, RatedOutfitRecord } from '@/lib/repositories/outfitFeedbackRepository';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';
import type { OutfitRecommendationDto } from '@/types/outfit';
import { MemoryAvailableWardrobeItems, wardrobeRecord } from '../../mocks/memoryAvailableWardrobeItems';

const ALEX = 'user_alex';

function ratings(records: RatedOutfitRecord[]): Pick<IOutfitFeedbackRepository, 'listRatedByOccasion'> {
  return { listRatedByOccasion: vi.fn(async () => structuredClone(records)) };
}

function itemIdsOf(result: OutfitRecommendationDto): string[] {
  if (result.status !== 'ok') {
    throw new Error(`expected an outfit, got ${result.status}`);
  }
  return result.items.map((item) => item.id);
}

describe('OutfitRecommendationService with feedback (US14)', () => {
  it("reads only the user's ratings for the requested occasion", async () => {
    const feedback = ratings([]);
    const service = new OutfitRecommendationService(
      new MemoryAvailableWardrobeItems([wardrobeRecord(ALEX, 'Dress')]),
      feedback,
    );

    await service.generate(ALEX, 'casual');

    expect(feedback.listRatedByOccasion).toHaveBeenCalledExactlyOnceWith(ALEX, 'casual');
  });

  it('avoids a combination the user marked Not helpful when another exists', async () => {
    const [tee, polo, jeans] = [wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Bottom')];
    const service = new OutfitRecommendationService(
      new MemoryAvailableWardrobeItems([tee, polo, jeans]),
      ratings([{ outfitId: 'outfit_1', itemIds: [jeans.id, tee.id], rating: 'negative' }]),
    );

    const result = await service.generate(ALEX, 'casual');

    expect(itemIdsOf(result)).toEqual([polo.id, jeans.id]);
    expect(result).toMatchObject({ feedback: null });
  });

  it('does not avoid a combination marked Helpful', async () => {
    const [tee, polo, jeans] = [wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Bottom')];
    const service = new OutfitRecommendationService(
      new MemoryAvailableWardrobeItems([tee, polo, jeans]),
      ratings([{ outfitId: 'outfit_1', itemIds: [tee.id, jeans.id], rating: 'positive' }]),
    );

    const result = await service.generate(ALEX, 'casual');

    expect(itemIdsOf(result)).toEqual([tee.id, jeans.id]);
  });

  it.each(['positive', 'negative'] as const)(
    'returns the saved %s rating when the outfit was rated before',
    async (rating) => {
      const [tee, jeans] = [wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Bottom')];
      const service = new OutfitRecommendationService(
        new MemoryAvailableWardrobeItems([tee, jeans]),
        ratings([{ outfitId: 'outfit_7', itemIds: [jeans.id, tee.id], rating }]),
      );

      const result = await service.generate(ALEX, 'casual');

      expect(itemIdsOf(result)).toEqual([tee.id, jeans.id]);
      expect(result).toMatchObject({ feedback: { outfitId: 'outfit_7', rating } });
    },
  );

  it('does not attach a rating saved for a different set of items', async () => {
    const [tee, jeans, sneakers] = [
      wardrobeRecord(ALEX, 'Top'),
      wardrobeRecord(ALEX, 'Bottom'),
      wardrobeRecord(ALEX, 'Shoes'),
    ];
    const service = new OutfitRecommendationService(
      new MemoryAvailableWardrobeItems([tee, jeans, sneakers]),
      ratings([{ outfitId: 'outfit_1', itemIds: [tee.id, jeans.id], rating: 'positive' }]),
    );

    const result = await service.generate(ALEX, 'casual');

    expect(itemIdsOf(result)).toEqual([tee.id, jeans.id, sneakers.id]);
    expect(result).toMatchObject({ feedback: null });
  });

  it('passes a database outage reading ratings through for the handler to report', async () => {
    const outage = new Error('down');
    const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([wardrobeRecord(ALEX, 'Dress')]), {
      listRatedByOccasion: async () => {
        throw outage;
      },
    });

    await expect(service.generate(ALEX, 'casual')).rejects.toBe(outage);
  });

  it('adds no feedback to a result without an outfit', async () => {
    const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([]), ratings([]));

    expect(await service.generate(ALEX, 'casual')).not.toHaveProperty('feedback');
  });
});
