import { beforeEach, describe, expect, it } from 'vitest';
import type { ISavedOutfitRepository } from '@/lib/repositories/savedOutfitRepository';

export interface SavedOutfitContractSetup {
  /** Returns an empty repository. */
  newRepository(): Promise<ISavedOutfitRepository> | ISavedOutfitRepository;
  /** Valid user IDs in this repository's format. */
  userIds: [string, string];
}

/** Wardrobe item IDs in the stored format; the repository only keeps references to them. */
export const ITEM_IDS = [
  '64c000000000000000000001',
  '64c000000000000000000002',
  '64c000000000000000000003',
  '64c000000000000000000004',
] as const;

const UNKNOWN_OUTFIT_ID = '64d0000000000000000000ff';

/**
 * Behaviour every ISavedOutfitRepository must have (US9). The MongoDB adapter runs this
 * same suite, so it must not depend on how a repository stores its records.
 */
export function describeSavedOutfitRepositoryContract(name: string, setup: SavedOutfitContractSetup): void {
  describe(`ISavedOutfitRepository contract: ${name}`, () => {
    const [userA, userB] = setup.userIds;
    const [shirt, trousers, shoes, dress] = ITEM_IDS;
    let repo: ISavedOutfitRepository;

    beforeEach(async () => {
      repo = await setup.newRepository();
    });

    describe('save', () => {
      it('returns the saved outfit with a string ID, its exact items, and a saved date', async () => {
        const before = Date.now();

        const { outfit, created } = await repo.save(userA, 'work', [shirt, trousers, shoes]);

        expect(created).toBe(true);
        expect(typeof outfit.id).toBe('string');
        expect(outfit.id.length).toBeGreaterThan(0);
        expect(outfit).toMatchObject({ ownerId: userA, occasion: 'work' });
        expect([...outfit.itemIds].sort()).toEqual([shirt, trousers, shoes].sort());
        expect(outfit.savedAt).toBeInstanceOf(Date);
        expect(outfit.savedAt.getTime()).toBeGreaterThanOrEqual(before);
      });

      it('returns the outfit already saved when the same items are saved again, in any order', async () => {
        const first = await repo.save(userA, 'work', [shirt, trousers]);

        const retry = await repo.save(userA, 'work', [trousers, shirt]);

        expect(retry.created).toBe(false);
        expect(retry.outfit.id).toBe(first.outfit.id);
        await expect(repo.listSavedByOwner(userA)).resolves.toHaveLength(1);
      });

      it('keeps outfits with different items or a different occasion apart', async () => {
        const work = await repo.save(userA, 'work', [shirt, trousers]);
        const dinner = await repo.save(userA, 'dinner', [shirt, trousers]);
        const other = await repo.save(userA, 'work', [shirt, trousers, shoes]);

        expect(new Set([work.outfit.id, dinner.outfit.id, other.outfit.id]).size).toBe(3);
      });

      it("never reuses another user's outfit", async () => {
        const mine = await repo.save(userA, 'casual', [dress]);

        const theirs = await repo.save(userB, 'casual', [dress]);

        expect(theirs.created).toBe(true);
        expect(theirs.outfit.id).not.toBe(mine.outfit.id);
        expect(theirs.outfit.ownerId).toBe(userB);
      });

      it('saves a removed outfit again as the same record, with a new saved date', async () => {
        const first = await repo.save(userA, 'work', [shirt, trousers]);
        await repo.unsaveForOwner(userA, first.outfit.id);

        const again = await repo.save(userA, 'work', [shirt, trousers]);

        expect(again.created).toBe(false);
        expect(again.outfit.id).toBe(first.outfit.id);
        expect(again.outfit.savedAt.getTime()).toBeGreaterThanOrEqual(first.outfit.savedAt.getTime());
        await expect(repo.listSavedByOwner(userA)).resolves.toHaveLength(1);
      });
    });

    describe('listSavedByOwner', () => {
      it("returns only the owner's saved outfits, most recently saved first", async () => {
        const older = await repo.save(userA, 'work', [shirt, trousers]);
        await repo.save(userB, 'work', [shirt, trousers]);
        const newer = await repo.save(userA, 'casual', [dress]);

        const saved = await repo.listSavedByOwner(userA);

        expect(saved.map((outfit) => outfit.id)).toEqual([newer.outfit.id, older.outfit.id]);
        expect(saved[0]).toMatchObject({ ownerId: userA, occasion: 'casual', itemIds: [dress] });
      });

      it('puts an outfit saved again at the top', async () => {
        const first = await repo.save(userA, 'work', [shirt, trousers]);
        const second = await repo.save(userA, 'casual', [dress]);
        await repo.unsaveForOwner(userA, first.outfit.id);
        await new Promise((resolve) => setTimeout(resolve, 5));

        await repo.save(userA, 'work', [shirt, trousers]);

        const saved = await repo.listSavedByOwner(userA);
        expect(saved.map((outfit) => outfit.id)).toEqual([first.outfit.id, second.outfit.id]);
      });

      it('returns an empty list for a user with none, or a malformed owner', async () => {
        await expect(repo.listSavedByOwner(userA)).resolves.toEqual([]);
        await expect(repo.listSavedByOwner('not-an-id')).resolves.toEqual([]);
      });
    });

    describe('unsaveForOwner', () => {
      it('removes the outfit from the saved list', async () => {
        const kept = await repo.save(userA, 'casual', [dress]);
        const removed = await repo.save(userA, 'work', [shirt, trousers]);

        await expect(repo.unsaveForOwner(userA, removed.outfit.id)).resolves.toBe(true);

        const saved = await repo.listSavedByOwner(userA);
        expect(saved.map((outfit) => outfit.id)).toEqual([kept.outfit.id]);
      });

      it('reports success again when a removal is retried', async () => {
        const { outfit } = await repo.save(userA, 'work', [shirt, trousers]);
        await repo.unsaveForOwner(userA, outfit.id);

        await expect(repo.unsaveForOwner(userA, outfit.id)).resolves.toBe(true);
      });

      it("refuses another user's outfit and leaves it saved", async () => {
        const { outfit } = await repo.save(userB, 'work', [shirt, trousers]);

        await expect(repo.unsaveForOwner(userA, outfit.id)).resolves.toBe(false);

        await expect(repo.listSavedByOwner(userB)).resolves.toHaveLength(1);
      });

      it('returns false for an unknown or malformed ID, or a malformed owner', async () => {
        const { outfit } = await repo.save(userA, 'work', [shirt, trousers]);

        await expect(repo.unsaveForOwner(userA, UNKNOWN_OUTFIT_ID)).resolves.toBe(false);
        await expect(repo.unsaveForOwner(userA, 'not-an-id')).resolves.toBe(false);
        await expect(repo.unsaveForOwner('not-an-id', outfit.id)).resolves.toBe(false);
      });
    });
  });
}
