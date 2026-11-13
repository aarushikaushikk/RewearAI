import { beforeEach, describe, expect, it } from 'vitest';
import {
  FEEDBACK_INVALID_COMBINATION_ERROR,
  FEEDBACK_ITEMS_NOT_FOUND_ERROR,
  FEEDBACK_OUTFIT_NOT_FOUND_ERROR,
  OutfitFeedbackError,
  OutfitFeedbackService,
} from '@/services/outfitFeedbackService';
import type { Category, CreateWardrobeItemDTO, WardrobeItemRecord } from '@/types/wardrobe';
import { USER_IDS } from '../../contracts/fixtures';
import { MemoryOutfitFeedbackRepository } from '../../mocks/memoryOutfitFeedbackRepository';
import { MemoryOutfitHistoryRepository } from '../../mocks/memoryOutfitHistoryRepository';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';

const [ALEX, SAM] = USER_IDS;

let publicIdCounter = 0;

function newItem(ownerId: string, category: Category): CreateWardrobeItemDTO {
  publicIdCounter += 1;
  const publicId = `rewear/users/${ownerId}/fb-${publicIdCounter}`;
  return {
    ownerId,
    image: { url: `https://res.cloudinary.com/test/image/upload/v1/${publicId}.jpg`, publicId },
    name: null,
    category,
    color: 'Navy',
    style: 'Classic',
    season: 'All-season',
    formality: 'Smart casual',
  };
}

async function expectFeedbackError(run: Promise<unknown>, message: string, statusCode: number) {
  const err = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(OutfitFeedbackError);
  expect(err).toMatchObject({ message, statusCode });
}

describe('OutfitFeedbackService (US14)', () => {
  let items: MemoryWardrobeItemRepository;
  let outfits: MemoryOutfitHistoryRepository;
  let feedback: MemoryOutfitFeedbackRepository;
  let service: OutfitFeedbackService;
  let top: WardrobeItemRecord;
  let bottom: WardrobeItemRecord;

  beforeEach(async () => {
    items = new MemoryWardrobeItemRepository();
    outfits = new MemoryOutfitHistoryRepository();
    feedback = new MemoryOutfitFeedbackRepository(outfits);
    service = new OutfitFeedbackService(outfits, feedback, items);
    top = await items.create(newItem(ALEX, 'Top'));
    bottom = await items.create(newItem(ALEX, 'Bottom'));
  });

  describe('rate', () => {
    it('saves the rating with the recommended outfit and returns its outfit ID', async () => {
      const result = await service.rate(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id], rating: 'positive' });

      expect(result).toEqual({ outfitId: expect.any(String), rating: 'positive' });
      await expect(feedback.listRatedByOccasion(ALEX, 'work')).resolves.toEqual([
        expect.objectContaining({ outfitId: result.outfitId, rating: 'positive' }),
      ]);
    });

    it('reuses the outfit for the same items in any order, so changing the rating keeps one record', async () => {
      const first = await service.rate(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id], rating: 'positive' });

      const changed = await service.rate(ALEX, {
        occasion: 'work',
        itemIds: [bottom.id, top.id],
        rating: 'negative',
      });

      expect(changed.outfitId).toBe(first.outfitId);
      await expect(feedback.listRatedByOccasion(ALEX, 'work')).resolves.toEqual([
        expect.objectContaining({ outfitId: first.outfitId, rating: 'negative' }),
      ]);
    });

    it('rates the same outfit that Mark as worn (US10) recorded', async () => {
      const worn = await outfits.findOrCreateOutfit({ ownerId: ALEX, occasion: 'work', itemIds: [top.id, bottom.id] });

      const result = await service.rate(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id], rating: 'negative' });

      expect(result.outfitId).toBe(worn.id);
    });

    it("refuses another user's items, as if they did not exist, and stores nothing", async () => {
      const theirs = await items.create(newItem(SAM, 'Top'));

      await expectFeedbackError(
        service.rate(ALEX, { occasion: 'work', itemIds: [theirs.id, bottom.id], rating: 'negative' }),
        FEEDBACK_ITEMS_NOT_FOUND_ERROR,
        404,
      );
      await expect(feedback.listRatedByOccasion(ALEX, 'work')).resolves.toEqual([]);
    });

    it('refuses an item that has since been deleted', async () => {
      await items.deleteForOwner(ALEX, bottom.id);

      await expectFeedbackError(
        service.rate(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id], rating: 'positive' }),
        FEEDBACK_ITEMS_NOT_FOUND_ERROR,
        404,
      );
    });

    it('refuses items that do not form an outfit', async () => {
      const otherTop = await items.create(newItem(ALEX, 'Top'));

      await expectFeedbackError(
        service.rate(ALEX, { occasion: 'work', itemIds: [top.id, otherTop.id], rating: 'positive' }),
        FEEDBACK_INVALID_COMBINATION_ERROR,
        400,
      );
    });

    it('accepts an unavailable item, since the outfit was just recommended', async () => {
      await items.setAvailability(ALEX, bottom.id, false);

      await expect(
        service.rate(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id], rating: 'negative' }),
      ).resolves.toMatchObject({ rating: 'negative' });
    });
  });

  describe('clear', () => {
    it('removes the rating and keeps the outfit', async () => {
      const { outfitId } = await service.rate(ALEX, {
        occasion: 'work',
        itemIds: [top.id, bottom.id],
        rating: 'negative',
      });

      await service.clear(ALEX, outfitId);

      await expect(feedback.listRatedByOccasion(ALEX, 'work')).resolves.toEqual([]);
      const again = await outfits.findOrCreateOutfit({ ownerId: ALEX, occasion: 'work', itemIds: [top.id, bottom.id] });
      expect(again).toEqual({ id: outfitId, created: false });
    });

    it("reports another user's outfit as not found and keeps its rating", async () => {
      const { outfitId } = await service.rate(ALEX, {
        occasion: 'work',
        itemIds: [top.id, bottom.id],
        rating: 'positive',
      });

      await expectFeedbackError(service.clear(SAM, outfitId), FEEDBACK_OUTFIT_NOT_FOUND_ERROR, 404);
      await expect(feedback.listRatedByOccasion(ALEX, 'work')).resolves.toHaveLength(1);
    });
  });
});
