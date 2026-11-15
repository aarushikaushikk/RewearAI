import { beforeEach, describe, expect, it } from 'vitest';
import { SavedOutfitError, SavedOutfitService } from '@/services/savedOutfitService';
import type { Category } from '@/types/wardrobe';
import { USER_IDS } from '../../contracts/fixtures';
import { itemFor } from '../../contracts/wardrobeItemRepositoryContract';
import { MemorySavedOutfitRepository } from '../../mocks/memorySavedOutfitRepository';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';

const [ALEX, SAM] = USER_IDS;

async function rejection(promise: Promise<unknown>): Promise<SavedOutfitError> {
  const error = await promise.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(SavedOutfitError);
  return error as SavedOutfitError;
}

describe('SavedOutfitService', () => {
  let items: MemoryWardrobeItemRepository;
  let outfits: MemorySavedOutfitRepository;
  let service: SavedOutfitService;
  let nextImage = 1;

  async function addItem(ownerId: string, category: Category, name: string | null = null) {
    return items.create({ ...itemFor(ownerId, `u/${nextImage++}`), category, name });
  }

  beforeEach(() => {
    items = new MemoryWardrobeItemRepository();
    outfits = new MemorySavedOutfitRepository();
    service = new SavedOutfitService(outfits, items);
  });

  describe('save', () => {
    it("saves an outfit of the user's own items and returns it as shown on Saved Outfits", async () => {
      const top = await addItem(ALEX, 'Top', 'Oxford shirt');
      const bottom = await addItem(ALEX, 'Bottom');

      const { outfit, created } = await service.save(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id] });

      expect(created).toBe(true);
      expect(outfit).toMatchObject({ occasion: 'work' });
      expect(typeof outfit.id).toBe('string');
      expect(new Date(outfit.savedAt).toISOString()).toBe(outfit.savedAt);
      expect(outfit.items).toEqual([
        {
          status: 'present',
          id: top.id,
          name: 'Oxford shirt',
          image: { url: top.image.url },
          category: 'Top',
          color: top.color,
          style: top.style,
        },
        {
          status: 'present',
          id: bottom.id,
          name: null,
          image: { url: bottom.image.url },
          category: 'Bottom',
          color: bottom.color,
          style: bottom.style,
        },
      ]);
    });

    it('answers a retried save with the outfit already saved', async () => {
      const top = await addItem(ALEX, 'Top');
      const bottom = await addItem(ALEX, 'Bottom');
      const first = await service.save(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id] });

      const retry = await service.save(ALEX, { occasion: 'work', itemIds: [bottom.id, top.id] });

      expect(retry.created).toBe(false);
      expect(retry.outfit.id).toBe(first.outfit.id);
      await expect(service.listSaved(ALEX)).resolves.toHaveLength(1);
    });

    it("saves an unavailable item the user still owns, since it was just recommended", async () => {
      const dress = await addItem(ALEX, 'Dress');
      await items.setAvailability(ALEX, dress.id, false);

      const { outfit } = await service.save(ALEX, { occasion: 'casual', itemIds: [dress.id] });

      expect(outfit.items).toMatchObject([{ status: 'present', id: dress.id }]);
    });

    it("refuses another user's item and saves nothing", async () => {
      const mine = await addItem(ALEX, 'Top');
      const theirs = await addItem(SAM, 'Bottom');

      const error = await rejection(service.save(ALEX, { occasion: 'work', itemIds: [mine.id, theirs.id] }));

      expect(error).toMatchObject({ code: 'ITEMS_NOT_FOUND', statusCode: 400 });
      expect(error.message).toBe('Some of these items are no longer in your wardrobe. Generate a new outfit.');
      await expect(outfits.listSavedByOwner(ALEX)).resolves.toEqual([]);
    });

    it('refuses an item that was deleted, or never existed', async () => {
      const top = await addItem(ALEX, 'Top');
      const gone = await addItem(ALEX, 'Bottom');
      await items.deleteForOwner(ALEX, gone.id);

      await rejection(service.save(ALEX, { occasion: 'work', itemIds: [top.id, gone.id] }));
      await rejection(service.save(ALEX, { occasion: 'work', itemIds: ['item_missing'] }));
      await expect(outfits.listSavedByOwner(ALEX)).resolves.toEqual([]);
    });
  });

  describe('listSaved', () => {
    it("lists the user's saved outfits, most recently saved first", async () => {
      const top = await addItem(ALEX, 'Top');
      const bottom = await addItem(ALEX, 'Bottom');
      const dress = await addItem(ALEX, 'Dress');
      const theirs = await addItem(SAM, 'Dress');
      const work = await service.save(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id] });
      await service.save(SAM, { occasion: 'casual', itemIds: [theirs.id] });
      const casual = await service.save(ALEX, { occasion: 'casual', itemIds: [dress.id] });

      const saved = await service.listSaved(ALEX);

      expect(saved.map((outfit) => outfit.id)).toEqual([casual.outfit.id, work.outfit.id]);
    });

    it('shows items in outfit order: top, bottom, dress, outerwear, shoes, accessory', async () => {
      const shoes = await addItem(ALEX, 'Shoes');
      const accessory = await addItem(ALEX, 'Accessory');
      const outerwear = await addItem(ALEX, 'Outerwear');
      const bottom = await addItem(ALEX, 'Bottom');
      const top = await addItem(ALEX, 'Top');
      await service.save(ALEX, {
        occasion: 'formal',
        itemIds: [shoes.id, accessory.id, outerwear.id, bottom.id, top.id],
      });

      const [outfit] = await service.listSaved(ALEX);

      expect(outfit.items.map((item) => item.id)).toEqual([
        top.id,
        bottom.id,
        outerwear.id,
        shoes.id,
        accessory.id,
      ]);
    });

    it('marks an item deleted since saving as removed, after the items still there', async () => {
      const top = await addItem(ALEX, 'Top');
      const bottom = await addItem(ALEX, 'Bottom');
      const shoes = await addItem(ALEX, 'Shoes');
      await service.save(ALEX, { occasion: 'work', itemIds: [top.id, bottom.id, shoes.id] });

      await items.deleteForOwner(ALEX, top.id);

      const [outfit] = await service.listSaved(ALEX);
      expect(outfit.items.map((item) => item.status)).toEqual(['present', 'present', 'removed']);
      expect(outfit.items[2]).toEqual({ status: 'removed', id: top.id });
    });

    it('returns an empty list when nothing is saved', async () => {
      await expect(service.listSaved(ALEX)).resolves.toEqual([]);
    });
  });

  describe('unsave', () => {
    it('removes an outfit from the saved list without touching its items', async () => {
      const dress = await addItem(ALEX, 'Dress');
      const { outfit } = await service.save(ALEX, { occasion: 'casual', itemIds: [dress.id] });

      await service.unsave(ALEX, outfit.id);

      await expect(service.listSaved(ALEX)).resolves.toEqual([]);
      await expect(items.findByIdForOwner(ALEX, dress.id)).resolves.not.toBeNull();
    });

    it('succeeds again when a removal is retried', async () => {
      const dress = await addItem(ALEX, 'Dress');
      const { outfit } = await service.save(ALEX, { occasion: 'casual', itemIds: [dress.id] });
      await service.unsave(ALEX, outfit.id);

      await expect(service.unsave(ALEX, outfit.id)).resolves.toBeUndefined();
    });

    it("reports another user's outfit as not found and leaves it saved", async () => {
      const dress = await addItem(SAM, 'Dress');
      const { outfit } = await service.save(SAM, { occasion: 'casual', itemIds: [dress.id] });

      const error = await rejection(service.unsave(ALEX, outfit.id));

      expect(error).toMatchObject({ code: 'OUTFIT_NOT_FOUND', statusCode: 404 });
      expect(error.message).toBe("We couldn't find that saved outfit.");
      await expect(service.listSaved(SAM)).resolves.toHaveLength(1);
    });
  });
});
