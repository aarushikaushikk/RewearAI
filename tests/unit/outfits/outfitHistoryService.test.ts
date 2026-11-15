import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INVALID_COMBINATION_ERROR,
  ITEMS_NOT_FOUND_ERROR,
  OutfitHistoryError,
  OutfitHistoryService,
} from '@/services/outfitHistoryService';
import type { Category, CreateWardrobeItemDTO, WardrobeItemRecord } from '@/types/wardrobe';
import { USER_IDS } from '../../contracts/fixtures';
import { MemoryOutfitHistoryRepository } from '../../mocks/memoryOutfitHistoryRepository';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';

const [ALEX, SAM] = USER_IDS;
const TODAY = '2026-11-11';

let publicIdCounter = 0;

function newItem(ownerId: string, category: Category, name: string | null = null): CreateWardrobeItemDTO {
  publicIdCounter += 1;
  const publicId = `rewear/users/${ownerId}/${publicIdCounter}`;
  return {
    ownerId,
    image: { url: `https://res.cloudinary.com/test/image/upload/v1/${publicId}.jpg`, publicId },
    name,
    category,
    color: 'Navy',
    style: 'Classic',
    season: 'All-season',
    formality: 'Smart casual',
  };
}

async function expectHistoryError(run: Promise<unknown>, message: string, statusCode: number) {
  const err = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(OutfitHistoryError);
  expect(err).toMatchObject({ message, statusCode });
}

describe('OutfitHistoryService', () => {
  let items: MemoryWardrobeItemRepository;
  let history: MemoryOutfitHistoryRepository;
  let service: OutfitHistoryService;
  let top: WardrobeItemRecord;
  let bottom: WardrobeItemRecord;
  let shoes: WardrobeItemRecord;
  let dress: WardrobeItemRecord;

  beforeEach(async () => {
    items = new MemoryWardrobeItemRepository();
    history = new MemoryOutfitHistoryRepository();
    service = new OutfitHistoryService(history, items);
    top = await items.create(newItem(ALEX, 'Top', 'White Oxford Shirt'));
    bottom = await items.create(newItem(ALEX, 'Bottom'));
    shoes = await items.create(newItem(ALEX, 'Shoes', 'Brown Loafers'));
    dress = await items.create(newItem(ALEX, 'Dress', 'Green Wrap Dress'));
  });

  describe('markWorn', () => {
    it('records the combination as worn on the date, using the stored item details', async () => {
      const result = await service.markWorn(ALEX, {
        itemIds: [top.id, bottom.id, shoes.id],
        occasion: 'work',
        wornOn: TODAY,
      });

      expect(result.created).toBe(true);
      expect(result.entry).toMatchObject({ wornOn: TODAY, occasion: 'work' });
      expect(result.entry.items).toEqual([
        {
          status: 'present',
          id: top.id,
          name: 'White Oxford Shirt',
          image: { url: top.image.url },
          category: 'Top',
          color: 'Navy',
          style: 'Classic',
          season: 'All-season',
          formality: 'Smart casual',
        },
        expect.objectContaining({ status: 'present', id: bottom.id, name: null, category: 'Bottom' }),
        expect.objectContaining({ status: 'present', id: shoes.id, name: 'Brown Loafers' }),
      ]);
      expect(Date.parse(result.entry.recordedAt)).not.toBeNaN();
      expect(result.entry.items[0]).not.toHaveProperty('image.publicId');
    });

    it('stores a factual description built from the stored items, not from the request', async () => {
      const create = vi.spyOn(history, 'findOrCreateOutfit');

      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY });

      expect(create).toHaveBeenCalledWith({
        ownerId: ALEX,
        itemIds: [top.id, bottom.id],
        occasion: 'work',
        explanation: 'Worn for Work: White Oxford Shirt (Top), Navy Bottom.',
      });
    });

    it('records a dress on its own', async () => {
      const result = await service.markWorn(ALEX, { itemIds: [dress.id], occasion: 'dinner', wornOn: TODAY });

      expect(result.created).toBe(true);
      expect(result.entry.items.map((i) => i.id)).toEqual([dress.id]);
    });

    it('accepts items that are no longer available', async () => {
      await items.setAvailability(ALEX, top.id, false);

      const result = await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY });

      expect(result.created).toBe(true);
    });

    it('counts the same clothes on the same day as one wear, whatever the order or occasion', async () => {
      const first = await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY });
      const second = await service.markWorn(ALEX, {
        itemIds: [bottom.id, top.id],
        occasion: 'dinner',
        wornOn: TODAY,
      });

      expect(second.created).toBe(false);
      expect(second.entry).toEqual(first.entry);
      expect(await service.list(ALEX)).toHaveLength(1);
    });

    it('records the same clothes again on another day', async () => {
      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: '2026-11-10' });
      const second = await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY });

      expect(second.created).toBe(true);
      expect(await service.list(ALEX)).toHaveLength(2);
    });

    it('returns one record for 10 simultaneous identical requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY }),
        ),
      );

      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.entry.id)).size).toBe(1);
      expect(await service.list(ALEX)).toHaveLength(1);
    });

    it("rejects another user's item exactly like a missing one, and records nothing", async () => {
      const samsBottom = await items.create(newItem(SAM, 'Bottom'));

      await expectHistoryError(
        service.markWorn(ALEX, { itemIds: [top.id, samsBottom.id], occasion: 'work', wornOn: TODAY }),
        ITEMS_NOT_FOUND_ERROR,
        404,
      );
      await expectHistoryError(
        service.markWorn(ALEX, { itemIds: [top.id, 'item_999'], occasion: 'work', wornOn: TODAY }),
        ITEMS_NOT_FOUND_ERROR,
        404,
      );
      expect(await service.list(ALEX)).toEqual([]);
      expect(await service.list(SAM)).toEqual([]);
    });

    it('rejects an item deleted from the wardrobe', async () => {
      await items.deleteForOwner(ALEX, bottom.id);

      await expectHistoryError(
        service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY }),
        ITEMS_NOT_FOUND_ERROR,
        404,
      );
    });

    it.each([
      ['a top alone', ['top']],
      ['shoes alone', ['shoes']],
      ['a dress with a top', ['dress', 'top']],
    ])('rejects %s as an invalid combination, and records nothing', async (_label, keys) => {
      const byKey: Record<string, WardrobeItemRecord> = { top, bottom, shoes, dress };

      await expectHistoryError(
        service.markWorn(ALEX, { itemIds: keys.map((k) => byKey[k].id), occasion: 'work', wornOn: TODAY }),
        INVALID_COMBINATION_ERROR,
        400,
      );
      expect(await service.list(ALEX)).toEqual([]);
    });

    it('rejects two items of one category, judged by the stored category', async () => {
      const secondTop = await items.create(newItem(ALEX, 'Top'));

      await expectHistoryError(
        service.markWorn(ALEX, { itemIds: [top.id, secondTop.id, bottom.id], occasion: 'work', wornOn: TODAY }),
        INVALID_COMBINATION_ERROR,
        400,
      );
    });

    it('rejects a repeated item ID even if validation was skipped', async () => {
      await expectHistoryError(
        service.markWorn(ALEX, { itemIds: [dress.id, dress.id], occasion: 'work', wornOn: TODAY }),
        INVALID_COMBINATION_ERROR,
        400,
      );
    });
  });

  describe('list', () => {
    it('is empty for a user with no history', async () => {
      expect(await service.list(ALEX)).toEqual([]);
    });

    it('lists worn outfits newest first', async () => {
      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: '2026-11-09' });
      await service.markWorn(ALEX, { itemIds: [dress.id], occasion: 'dinner', wornOn: TODAY });
      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id, shoes.id], occasion: 'casual', wornOn: '2026-11-10' });

      const listed = await service.list(ALEX);

      expect(listed.map((e) => [e.wornOn, e.occasion])).toEqual([
        [TODAY, 'dinner'],
        ['2026-11-10', 'casual'],
        ['2026-11-09', 'work'],
      ]);
    });

    it('keeps an entry whose item was later deleted, with a placeholder in its place', async () => {
      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY });
      await items.deleteForOwner(ALEX, bottom.id);

      const [entry] = await service.list(ALEX);

      expect(entry.items).toEqual([
        expect.objectContaining({ status: 'present', id: top.id }),
        { status: 'missing', id: bottom.id },
      ]);
    });

    it('lists items in outfit order (top, bottom, shoes), not in the sorted order they are stored in', async () => {
      // Created in reverse, so their IDs sort shoes, bottom, top.
      const laterShoes = await items.create(newItem(ALEX, 'Shoes', 'Black Boots'));
      const laterBottom = await items.create(newItem(ALEX, 'Bottom', 'Grey Trousers'));
      const laterTop = await items.create(newItem(ALEX, 'Top', 'Blue Shirt'));
      await service.markWorn(ALEX, {
        itemIds: [laterTop.id, laterBottom.id, laterShoes.id],
        occasion: 'work',
        wornOn: TODAY,
      });

      const [stored] = await history.listByOwner(ALEX);
      const [entry] = await service.list(ALEX);

      expect(stored.outfit?.itemIds).toEqual([laterShoes.id, laterBottom.id, laterTop.id]);
      expect(entry.items.map((i) => i.id)).toEqual([laterTop.id, laterBottom.id, laterShoes.id]);
    });

    it('puts a deleted item after the items still in the wardrobe, as Saved Outfits does', async () => {
      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id, shoes.id], occasion: 'work', wornOn: TODAY });
      await items.deleteForOwner(ALEX, top.id);

      const [entry] = await service.list(ALEX);

      expect(entry.items).toEqual([
        expect.objectContaining({ status: 'present', id: bottom.id }),
        expect.objectContaining({ status: 'present', id: shoes.id }),
        { status: 'missing', id: top.id },
      ]);
    });

    it('shows an edited item with its current details', async () => {
      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY });
      await items.updateForOwner(ALEX, top.id, {
        name: 'Blue Oxford Shirt',
        category: 'Top',
        color: 'Blue',
        style: 'Oxford',
        season: 'All-season',
        formality: 'Smart casual',
      });

      const [entry] = await service.list(ALEX);

      expect(entry.items[0]).toMatchObject({ status: 'present', name: 'Blue Oxford Shirt', color: 'Blue' });
    });

    it("never shows another user's history or items", async () => {
      await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'work', wornOn: TODAY });

      expect(await service.list(SAM)).toEqual([]);
    });

    it("shows another user's item as missing if a record ever referred to it", async () => {
      const samsTop = await items.create(newItem(SAM, 'Top', "Sam's private shirt"));
      // Bypasses the service checks, as a corrupted record would.
      const outfit = await history.findOrCreateOutfit({
        ownerId: ALEX,
        itemIds: [samsTop.id, bottom.id],
        occasion: 'work',
        explanation: 'Worn for Work: Top, Bottom.',
      });
      await history.recordWorn({
        ownerId: ALEX,
        outfitId: outfit.id,
        wornOn: TODAY,
        combinationKey: [samsTop.id, bottom.id].sort().join(','),
      });

      const [entry] = await service.list(ALEX);

      expect(entry.items.find((i) => i.id === samsTop.id)).toEqual({ status: 'missing', id: samsTop.id });
      expect(JSON.stringify(entry)).not.toContain("Sam's private shirt");
    });
  });
});
