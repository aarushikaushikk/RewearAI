import { beforeEach, describe, expect, it } from 'vitest';
import type {
  IOutfitHistoryRepository,
  NewOutfitData,
} from '@/lib/repositories/outfitHistoryRepository';
import { RepositoryError } from '@/lib/repositories/repositoryErrors';
import { combinationKey } from '@/services/outfitHistory/outfitCombination';

export interface OutfitHistoryContractSetup {
  /** Returns an empty repository. */
  newRepository(): Promise<IOutfitHistoryRepository> | IOutfitHistoryRepository;
  /** Valid user IDs in this repository's format. */
  userIds: [string, string];
}

/** Wardrobe item IDs in the stored format (lowercase ObjectId strings). */
export const ITEM_IDS = {
  top: '64c0000000000000000000a1',
  bottom: '64c0000000000000000000a2',
  shoes: '64c0000000000000000000a3',
  dress: '64c0000000000000000000a4',
} as const;

export function outfitFor(ownerId: string, itemIds: string[], overrides: Partial<NewOutfitData> = {}): NewOutfitData {
  return {
    ownerId,
    itemIds,
    occasion: 'work',
    explanation: 'Worn for Work: Top, Bottom.',
    ...overrides,
  };
}

/**
 * Behaviour every IOutfitHistoryRepository must have. The MongoDB adapter runs this same
 * suite, so it must not depend on how a repository stores its records.
 */
export function describeOutfitHistoryRepositoryContract(name: string, setup: OutfitHistoryContractSetup): void {
  describe(`IOutfitHistoryRepository contract: ${name}`, () => {
    const [userA, userB] = setup.userIds;
    const pair = [ITEM_IDS.top, ITEM_IDS.bottom];
    const pairKey = combinationKey(pair);
    let repo: IOutfitHistoryRepository;

    beforeEach(async () => {
      repo = await setup.newRepository();
    });

    async function wear(ownerId: string, wornOn: string, itemIds: string[] = pair) {
      const outfit = await repo.findOrCreateOutfit(outfitFor(ownerId, itemIds));
      return repo.recordWorn({ ownerId, outfitId: outfit.id, wornOn, combinationKey: combinationKey(itemIds) });
    }

    describe('findOrCreateOutfit', () => {
      it('creates an outfit the first time', async () => {
        const outfit = await repo.findOrCreateOutfit(outfitFor(userA, pair));

        expect(outfit.created).toBe(true);
        expect(typeof outfit.id).toBe('string');
        expect(outfit.id.length).toBeGreaterThan(0);
      });

      it('reuses the outfit for the same items in any order and the same occasion', async () => {
        const first = await repo.findOrCreateOutfit(outfitFor(userA, pair));
        const second = await repo.findOrCreateOutfit(outfitFor(userA, [...pair].reverse()));

        expect(second).toEqual({ id: first.id, created: false });
      });

      it('creates a separate outfit for another occasion', async () => {
        const work = await repo.findOrCreateOutfit(outfitFor(userA, pair));
        const dinner = await repo.findOrCreateOutfit(outfitFor(userA, pair, { occasion: 'dinner' }));

        expect(dinner.created).toBe(true);
        expect(dinner.id).not.toBe(work.id);
      });

      it('does not reuse an outfit with more or fewer items', async () => {
        const pairOutfit = await repo.findOrCreateOutfit(outfitFor(userA, pair));
        const withShoes = await repo.findOrCreateOutfit(outfitFor(userA, [...pair, ITEM_IDS.shoes]));
        const topOnly = await repo.findOrCreateOutfit(outfitFor(userA, [ITEM_IDS.top]));

        expect(new Set([pairOutfit.id, withShoes.id, topOnly.id]).size).toBe(3);
        expect(withShoes.created && topOnly.created).toBe(true);
      });

      it("never reuses another user's outfit", async () => {
        const alex = await repo.findOrCreateOutfit(outfitFor(userA, pair));
        const sam = await repo.findOrCreateOutfit(outfitFor(userB, pair));

        expect(sam.created).toBe(true);
        expect(sam.id).not.toBe(alex.id);
      });
    });

    describe('recordWorn', () => {
      it('records the outfit as worn on the date, with its items and occasion', async () => {
        const outfit = await repo.findOrCreateOutfit(outfitFor(userA, pair));
        const result = await repo.recordWorn({
          ownerId: userA,
          outfitId: outfit.id,
          wornOn: '2026-11-11',
          combinationKey: pairKey,
        });

        expect(result.created).toBe(true);
        expect(result.entry).toMatchObject({
          ownerId: userA,
          outfitId: outfit.id,
          wornOn: '2026-11-11',
          combinationKey: pairKey,
          outfit: { occasion: 'work', itemIds: pair },
        });
        expect(typeof result.entry.id).toBe('string');
        expect(result.entry.recordedAt).toBeInstanceOf(Date);
      });

      it('returns the existing record for the same combination on the same date', async () => {
        const first = await wear(userA, '2026-11-11');
        const second = await wear(userA, '2026-11-11', [...pair].reverse());

        expect(second.created).toBe(false);
        expect(second.entry.id).toBe(first.entry.id);
        expect(await repo.listByOwner(userA)).toHaveLength(1);
      });

      it('returns the existing record even when the second request used another outfit', async () => {
        const first = await wear(userA, '2026-11-11');
        const dinner = await repo.findOrCreateOutfit(outfitFor(userA, pair, { occasion: 'dinner' }));
        const second = await repo.recordWorn({
          ownerId: userA,
          outfitId: dinner.id,
          wornOn: '2026-11-11',
          combinationKey: pairKey,
        });

        expect(second.created).toBe(false);
        expect(second.entry).toEqual(first.entry);
      });

      it('records the same combination again on another date', async () => {
        const first = await wear(userA, '2026-11-10');
        const second = await wear(userA, '2026-11-11');

        expect(second.created).toBe(true);
        expect(second.entry.id).not.toBe(first.entry.id);
        expect(await repo.listByOwner(userA)).toHaveLength(2);
      });

      it('keeps identical combinations from different users apart', async () => {
        const alex = await wear(userA, '2026-11-11');
        const sam = await wear(userB, '2026-11-11');

        expect(sam.created).toBe(true);
        expect(sam.entry.id).not.toBe(alex.entry.id);
        expect(await repo.listByOwner(userA)).toHaveLength(1);
        expect(await repo.listByOwner(userB)).toHaveLength(1);
      });

      it("refuses another user's outfit, and records nothing for either user", async () => {
        const samsOutfit = await repo.findOrCreateOutfit(outfitFor(userB, pair));

        await expect(
          repo.recordWorn({ ownerId: userA, outfitId: samsOutfit.id, wornOn: '2026-11-11', combinationKey: pairKey }),
        ).rejects.toBeInstanceOf(RepositoryError);
        expect(await repo.listByOwner(userA)).toEqual([]);
        expect(await repo.listByOwner(userB)).toEqual([]);
      });

      it('refuses an outfit that does not exist', async () => {
        const unknownOutfit = '64d0000000000000000000ff';

        await expect(
          repo.recordWorn({ ownerId: userA, outfitId: unknownOutfit, wornOn: '2026-11-11', combinationKey: pairKey }),
        ).rejects.toBeInstanceOf(RepositoryError);
        expect(await repo.listByOwner(userA)).toEqual([]);
      });

      it("still refuses another user's outfit when the owner already has that record", async () => {
        const first = await wear(userA, '2026-11-11');
        const samsOutfit = await repo.findOrCreateOutfit(outfitFor(userB, pair));

        await expect(
          repo.recordWorn({ ownerId: userA, outfitId: samsOutfit.id, wornOn: '2026-11-11', combinationKey: pairKey }),
        ).rejects.toBeInstanceOf(RepositoryError);
        expect(await repo.listByOwner(userA)).toEqual([first.entry]);
      });

      it('stores one record when 10 identical requests arrive at once', async () => {
        const outfit = await repo.findOrCreateOutfit(outfitFor(userA, pair));
        const results = await Promise.all(
          Array.from({ length: 10 }, () =>
            repo.recordWorn({ ownerId: userA, outfitId: outfit.id, wornOn: '2026-11-11', combinationKey: pairKey }),
          ),
        );

        expect(results.filter((r) => r.created)).toHaveLength(1);
        expect(new Set(results.map((r) => r.entry.id)).size).toBe(1);
        expect(await repo.listByOwner(userA)).toHaveLength(1);
      });
    });

    describe('listByOwner', () => {
      it('is empty for a user with no history', async () => {
        expect(await repo.listByOwner(userA)).toEqual([]);
      });

      it('lists the newest worn date first, and the latest recorded first within a date', async () => {
        const older = await wear(userA, '2026-11-09');
        const sameDayFirst = await wear(userA, '2026-11-11', [ITEM_IDS.dress]);
        const newest = await wear(userA, '2026-11-12');
        const sameDaySecond = await wear(userA, '2026-11-11');

        const listed = await repo.listByOwner(userA);

        expect(listed.map((e) => e.id)).toEqual([
          newest.entry.id,
          sameDaySecond.entry.id,
          sameDayFirst.entry.id,
          older.entry.id,
        ]);
      });

      it("returns only the owner's records", async () => {
        await wear(userA, '2026-11-11');
        await wear(userB, '2026-11-10', [ITEM_IDS.dress]);

        const listed = await repo.listByOwner(userA);

        expect(listed).toHaveLength(1);
        expect(listed[0]).toMatchObject({ ownerId: userA, outfit: { itemIds: pair } });
      });
    });
  });
}
