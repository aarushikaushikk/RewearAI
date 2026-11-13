import { beforeEach, describe, expect, it } from 'vitest';
import type { IOutfitFeedbackRepository } from '@/lib/repositories/outfitFeedbackRepository';
import type { IOutfitHistoryRepository } from '@/lib/repositories/outfitHistoryRepository';
import type { Occasion } from '@/types/outfit';

export interface OutfitFeedbackRepositories {
  feedback: IOutfitFeedbackRepository;
  /** Where the outfits being rated come from: the same records Mark as worn (US10) uses. */
  outfits: Pick<IOutfitHistoryRepository, 'findOrCreateOutfit'>;
}

export interface OutfitFeedbackContractSetup {
  /** Returns empty repositories that share one store of outfits. */
  newRepositories(): Promise<OutfitFeedbackRepositories> | OutfitFeedbackRepositories;
  /** Valid user IDs in this repository's format. */
  userIds: [string, string];
}

/** Wardrobe item IDs in the stored format; outfits only keep references to them. */
export const FEEDBACK_ITEM_IDS = [
  '64e000000000000000000001',
  '64e000000000000000000002',
  '64e000000000000000000003',
] as const;

const UNKNOWN_OUTFIT_ID = '64f0000000000000000000ff';

/**
 * Behaviour every IOutfitFeedbackRepository must have (US14). The MongoDB adapter runs this
 * same suite, so it must not depend on how a repository stores its records.
 */
export function describeOutfitFeedbackRepositoryContract(name: string, setup: OutfitFeedbackContractSetup): void {
  describe(`IOutfitFeedbackRepository contract: ${name}`, () => {
    const [userA, userB] = setup.userIds;
    const [shirt, trousers, shoes] = FEEDBACK_ITEM_IDS;
    let repos: OutfitFeedbackRepositories;

    beforeEach(async () => {
      repos = await setup.newRepositories();
    });

    async function outfitOf(ownerId: string, occasion: Occasion, itemIds: string[]) {
      return (await repos.outfits.findOrCreateOutfit({ ownerId, occasion, itemIds })).id;
    }

    describe('setRating', () => {
      it("rates the owner's outfit, which then lists with its items", async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);

        await expect(repos.feedback.setRating(userA, outfitId, 'positive')).resolves.toBe(true);

        const rated = await repos.feedback.listRatedByOccasion(userA, 'work');
        expect(rated).toHaveLength(1);
        expect(rated[0]).toMatchObject({ outfitId, rating: 'positive' });
        expect([...rated[0].itemIds].sort()).toEqual([shirt, trousers].sort());
      });

      it('changes the rating in place, so an outfit has one rating', async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);
        await repos.feedback.setRating(userA, outfitId, 'positive');

        await repos.feedback.setRating(userA, outfitId, 'negative');

        await expect(repos.feedback.listRatedByOccasion(userA, 'work')).resolves.toEqual([
          expect.objectContaining({ outfitId, rating: 'negative' }),
        ]);
      });

      it('treats a retried rating as one record', async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);

        await Promise.all([
          repos.feedback.setRating(userA, outfitId, 'negative'),
          repos.feedback.setRating(userA, outfitId, 'negative'),
        ]);

        await expect(repos.feedback.listRatedByOccasion(userA, 'work')).resolves.toHaveLength(1);
      });

      it("refuses another user's outfit and stores nothing", async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);

        await expect(repos.feedback.setRating(userB, outfitId, 'negative')).resolves.toBe(false);

        await expect(repos.feedback.listRatedByOccasion(userA, 'work')).resolves.toEqual([]);
        await expect(repos.feedback.listRatedByOccasion(userB, 'work')).resolves.toEqual([]);
      });

      it.each([UNKNOWN_OUTFIT_ID, 'not-an-id'])('refuses an unknown outfit ID (%s)', async (outfitId) => {
        await expect(repos.feedback.setRating(userA, outfitId, 'positive')).resolves.toBe(false);
      });
    });

    describe('clearRating', () => {
      it('removes the rating', async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);
        await repos.feedback.setRating(userA, outfitId, 'negative');

        await expect(repos.feedback.clearRating(userA, outfitId)).resolves.toBe(true);

        await expect(repos.feedback.listRatedByOccasion(userA, 'work')).resolves.toEqual([]);
      });

      it("succeeds again for the owner's outfit, so a retried clear also succeeds", async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);
        await repos.feedback.setRating(userA, outfitId, 'negative');
        await repos.feedback.clearRating(userA, outfitId);

        await expect(repos.feedback.clearRating(userA, outfitId)).resolves.toBe(true);
      });

      it("refuses another user's outfit and keeps the owner's rating", async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);
        await repos.feedback.setRating(userA, outfitId, 'positive');

        await expect(repos.feedback.clearRating(userB, outfitId)).resolves.toBe(false);

        await expect(repos.feedback.listRatedByOccasion(userA, 'work')).resolves.toHaveLength(1);
      });

      it.each([UNKNOWN_OUTFIT_ID, 'not-an-id'])('refuses an unknown outfit ID (%s)', async (outfitId) => {
        await expect(repos.feedback.clearRating(userA, outfitId)).resolves.toBe(false);
      });
    });

    describe('listRatedByOccasion', () => {
      it("lists only the owner's rated outfits for that occasion", async () => {
        const work = await outfitOf(userA, 'work', [shirt, trousers]);
        const workWithShoes = await outfitOf(userA, 'work', [shirt, trousers, shoes]);
        const dinner = await outfitOf(userA, 'dinner', [shirt, trousers]);
        const unrated = await outfitOf(userA, 'work', [trousers, shoes]);
        const theirs = await outfitOf(userB, 'work', [shirt, trousers]);
        await repos.feedback.setRating(userA, work, 'negative');
        await repos.feedback.setRating(userA, workWithShoes, 'positive');
        await repos.feedback.setRating(userA, dinner, 'negative');
        await repos.feedback.setRating(userB, theirs, 'negative');

        const rated = await repos.feedback.listRatedByOccasion(userA, 'work');

        expect(rated.map((r) => r.outfitId).sort()).toEqual([work, workWithShoes].sort());
        expect(rated.map((r) => r.outfitId)).not.toContain(unrated);
      });

      it('is empty for a user with no feedback, or an unknown user ID', async () => {
        await expect(repos.feedback.listRatedByOccasion(userA, 'work')).resolves.toEqual([]);
        await expect(repos.feedback.listRatedByOccasion('not-an-id', 'work')).resolves.toEqual([]);
      });

      it('returns copies, so changing a result never changes what is stored', async () => {
        const outfitId = await outfitOf(userA, 'work', [shirt, trousers]);
        await repos.feedback.setRating(userA, outfitId, 'positive');

        const [first] = await repos.feedback.listRatedByOccasion(userA, 'work');
        first.itemIds.push(shoes);

        const [again] = await repos.feedback.listRatedByOccasion(userA, 'work');
        expect(again.itemIds).toHaveLength(2);
      });
    });
  });
}
