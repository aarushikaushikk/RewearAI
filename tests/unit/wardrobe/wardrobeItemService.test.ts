import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  PENDING_UPLOAD_TAG,
  PENDING_UPLOAD_TTL_MS,
  WardrobeError,
  WardrobeItemService,
} from '@/services/wardrobeItemService';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { USER_IDS } from '../../contracts/fixtures';
import { itemFor as newItem } from '../../contracts/wardrobeItemRepositoryContract';
import { MemoryImageStore } from '../../mocks/memoryImageStore';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';
import { GIF_BYTES, JPEG_BYTES } from '../../helpers/imageBytes';

const [ALEX, SAM] = USER_IDS;

function details(publicId: string) {
  return {
    publicId,
    name: 'Linen shirt',
    category: 'Top',
    color: 'White',
    style: 'Button-down',
    season: 'Summer',
    formality: 'Smart casual',
  };
}

async function rejection(promise: Promise<unknown>): Promise<WardrobeError> {
  const error = await promise.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(WardrobeError);
  return error as WardrobeError;
}

describe('WardrobeItemService', () => {
  let repo: MemoryWardrobeItemRepository;
  let store: MemoryImageStore;
  let service: WardrobeItemService;
  let consoleError: MockInstance;

  beforeEach(() => {
    repo = new MemoryWardrobeItemRepository();
    store = new MemoryImageStore();
    service = new WardrobeItemService(repo, store);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('uploadImage', () => {
    it("uploads into the user's own folder, tagged as pending", async () => {
      const image = await service.uploadImage(ALEX, JPEG_BYTES);

      expect(image.publicId.startsWith(`rewear/users/${ALEX}/`)).toBe(true);
      expect(image.url).toMatch(/^https:\/\//);
      expect(store.uploads).toEqual([
        { folder: `rewear/users/${ALEX}`, tags: [PENDING_UPLOAD_TAG] },
      ]);
    });

    it('rejects an unsupported file without uploading it', async () => {
      const error = await rejection(service.uploadImage(ALEX, GIF_BYTES));

      expect(error.code).toBe('UNSUPPORTED_TYPE');
      expect(error.statusCode).toBe(415);
      expect(store.uploads).toHaveLength(0);
    });

    it('reports an image store failure as a safe upload error', async () => {
      store.failing = true;

      const error = await rejection(service.uploadImage(ALEX, JPEG_BYTES));

      expect(error.code).toBe('UPLOAD_FAILED');
      expect(error.statusCode).toBe(502);
      expect(error.message).toBe("Your image didn't upload. Please try again.");
      expect(consoleError).toHaveBeenCalledWith('[wardrobe] operation failed', {
        operation: 'image.upload',
      });
    });
  });

  describe('createItem', () => {
    it('saves the item for the signed-in user, with the URL from the image store', async () => {
      const image = await service.uploadImage(ALEX, JPEG_BYTES);

      const { item, created } = await service.createItem(ALEX, {
        ...details(image.publicId),
        name: '  Linen shirt ',
      });

      expect(created).toBe(true);
      expect(item).toMatchObject({
        image,
        name: 'Linen shirt',
        category: 'Top',
        isAvailable: true,
      });
      expect(typeof item.createdAt).toBe('string');
      expect(await repo.findByImage(ALEX, image.publicId)).not.toBeNull();
    });

    it('rejects invalid details with the first field error, before any lookup', async () => {
      store.failing = true;

      const error = await rejection(
        service.createItem(ALEX, { ...details('rewear/users/x/1'), category: 'Hat' }),
      );

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Choose a category.');
    });

    it("refuses another user's image, answering as if it didn't exist", async () => {
      const samsImage = await service.uploadImage(SAM, JPEG_BYTES);
      store.failing = true; // proves no lookup happens

      const error = await rejection(service.createItem(ALEX, details(samsImage.publicId)));

      expect(error.code).toBe('IMAGE_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(await repo.findUsedImageIds([samsImage.publicId])).toEqual([]);
    });

    it('refuses an image that was never uploaded', async () => {
      const error = await rejection(
        service.createItem(ALEX, details(`rewear/users/${ALEX}/never-uploaded`)),
      );

      expect(error.code).toBe('IMAGE_NOT_FOUND');
    });

    it('returns the existing item when a save is retried, instead of a duplicate', async () => {
      const image = await service.uploadImage(ALEX, JPEG_BYTES);
      const first = await service.createItem(ALEX, details(image.publicId));

      const retry = await service.createItem(ALEX, details(image.publicId));

      expect(retry.created).toBe(false);
      expect(retry.item.id).toBe(first.item.id);
    });

    it('reports an image store failure during the lookup as a safe save error', async () => {
      const image = await service.uploadImage(ALEX, JPEG_BYTES);
      store.failing = true;

      const error = await rejection(service.createItem(ALEX, details(image.publicId)));

      expect(error.code).toBe('SAVE_FAILED');
      expect(error.statusCode).toBe(502);
      expect(error.message).toBe("We couldn't save this item. Try again.");
    });

    it('lets a database outage through for the handler to report', async () => {
      const image = await service.uploadImage(ALEX, JPEG_BYTES);
      vi.spyOn(repo, 'create').mockRejectedValue(new RepositoryUnavailableError());

      await expect(service.createItem(ALEX, details(image.publicId))).rejects.toBeInstanceOf(
        RepositoryUnavailableError,
      );
    });
  });

  // US4 (#9): view, edit and delete saved items. Every lookup is scoped to the signed-in user.
  async function savedItem(userId: string, name = 'Linen shirt') {
    const image = await service.uploadImage(userId, JPEG_BYTES);
    const { item } = await service.createItem(userId, { ...details(image.publicId), name });
    return item;
  }

  const EDITS = {
    name: 'White Oxford Shirt',
    category: 'Top',
    color: 'Blue',
    style: ' Oxford ',
    season: 'All-season',
    formality: 'Formal',
  };

  describe('listItems', () => {
    it("returns only the user's items, newest first, as client data", async () => {
      const older = await savedItem(ALEX, 'Older');
      await savedItem(SAM);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await savedItem(ALEX, 'Newer');

      const items = await service.listItems(ALEX);

      expect(items.map((item) => item.id)).toEqual([newer.id, older.id]);
      expect(items[0]).not.toHaveProperty('ownerId');
      expect(typeof items[0].updatedAt).toBe('string');
    });

    it('returns an empty list for an empty wardrobe', async () => {
      await expect(service.listItems(ALEX)).resolves.toEqual([]);
    });
  });

  describe('getItem', () => {
    it("returns the user's item", async () => {
      const item = await savedItem(ALEX);

      await expect(service.getItem(ALEX, item.id)).resolves.toEqual(item);
    });

    it("answers another user's item exactly as a missing one", async () => {
      const samsItem = await savedItem(SAM);

      const other = await rejection(service.getItem(ALEX, samsItem.id));
      const missing = await rejection(service.getItem(ALEX, 'item_999'));

      expect(other.code).toBe('ITEM_NOT_FOUND');
      expect(other.statusCode).toBe(404);
      expect(other.message).toBe("We couldn't find that clothing item.");
      expect([missing.code, missing.statusCode, missing.message]).toEqual([
        other.code,
        other.statusCode,
        other.message,
      ]);
    });
  });

  describe('updateItem', () => {
    it('saves the edited details, trimmed, keeping the image and availability', async () => {
      const item = await savedItem(ALEX);

      const updated = await service.updateItem(ALEX, item.id, EDITS);

      expect(updated).toMatchObject({
        id: item.id,
        image: item.image,
        name: 'White Oxford Shirt',
        color: 'Blue',
        style: 'Oxford',
        season: 'All-season',
        formality: 'Formal',
        isAvailable: true,
      });
      await expect(service.getItem(ALEX, item.id)).resolves.toEqual(updated);
    });

    it('removes the name when it is cleared', async () => {
      const item = await savedItem(ALEX);

      const updated = await service.updateItem(ALEX, item.id, { ...EDITS, name: '  ' });

      expect(updated).not.toHaveProperty('name');
    });

    it('rejects invalid details with the same first field error as Add Clothing, changing nothing', async () => {
      const item = await savedItem(ALEX);

      const error = await rejection(
        service.updateItem(ALEX, item.id, { ...EDITS, category: 'Hat', style: '' }),
      );

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Choose a category.');
      await expect(service.getItem(ALEX, item.id)).resolves.toEqual(item);
    });

    it("refuses another user's item as not found, and leaves it unchanged", async () => {
      const samsItem = await savedItem(SAM);

      const error = await rejection(service.updateItem(ALEX, samsItem.id, EDITS));

      expect(error.code).toBe('ITEM_NOT_FOUND');
      await expect(service.getItem(SAM, samsItem.id)).resolves.toEqual(samsItem);
    });

    it('lets a database outage through for the handler to report', async () => {
      const item = await savedItem(ALEX);
      vi.spyOn(repo, 'updateForOwner').mockRejectedValue(new RepositoryUnavailableError());

      await expect(service.updateItem(ALEX, item.id, EDITS)).rejects.toBeInstanceOf(
        RepositoryUnavailableError,
      );
    });
  });

  describe('deleteItem', () => {
    it('deletes the item and its Cloudinary image', async () => {
      const item = await savedItem(ALEX);

      await service.deleteItem(ALEX, item.id);

      expect(store.has(item.image.publicId)).toBe(false);
      await expect(service.listItems(ALEX)).resolves.toEqual([]);
    });

    it('deletes the image before the record, so the record is never left pointing nowhere unnoticed', async () => {
      const item = await savedItem(ALEX);
      const order: string[] = [];
      vi.spyOn(store, 'delete').mockImplementation(async () => {
        order.push('image');
      });
      vi.spyOn(repo, 'deleteForOwner').mockImplementation(async () => {
        order.push('record');
        return true;
      });

      await service.deleteItem(ALEX, item.id);

      expect(order).toEqual(['image', 'record']);
    });

    it('keeps the item, and reports a safe error, when the image cannot be deleted', async () => {
      const item = await savedItem(ALEX);
      store.failing = true;

      const error = await rejection(service.deleteItem(ALEX, item.id));

      expect(error.code).toBe('DELETE_FAILED');
      expect(error.statusCode).toBe(502);
      expect(error.message).toBe("We couldn't delete this item. Try again.");
      expect(consoleError).toHaveBeenCalledWith('[wardrobe] operation failed', {
        operation: 'image.delete',
      });
      store.failing = false;
      await expect(service.getItem(ALEX, item.id)).resolves.toEqual(item);
    });

    it('finishes on retry after the image was deleted but the record was not', async () => {
      const item = await savedItem(ALEX);
      vi.spyOn(repo, 'deleteForOwner').mockRejectedValueOnce(new RepositoryUnavailableError());

      await expect(service.deleteItem(ALEX, item.id)).rejects.toBeInstanceOf(
        RepositoryUnavailableError,
      );
      expect(store.has(item.image.publicId)).toBe(false);

      await service.deleteItem(ALEX, item.id);

      await expect(service.listItems(ALEX)).resolves.toEqual([]);
    });

    it("refuses another user's item as not found, and deletes neither it nor its image", async () => {
      const samsItem = await savedItem(SAM);

      const error = await rejection(service.deleteItem(ALEX, samsItem.id));

      expect(error.code).toBe('ITEM_NOT_FOUND');
      expect(store.has(samsItem.image.publicId)).toBe(true);
      await expect(service.getItem(SAM, samsItem.id)).resolves.toEqual(samsItem);
    });

    it('reports an item that is already gone as not found', async () => {
      const item = await savedItem(ALEX);
      await service.deleteItem(ALEX, item.id);

      const error = await rejection(service.deleteItem(ALEX, item.id));

      expect(error.code).toBe('ITEM_NOT_FOUND');
    });
  });

  describe('cleanupAbandonedUploads', () => {
    const NOW = new Date('2026-11-08T12:00:00Z');
    const STALE = new Date(NOW.getTime() - PENDING_UPLOAD_TTL_MS - 1);
    const FRESH = new Date(NOW.getTime() - PENDING_UPLOAD_TTL_MS + 60_000);

    async function pendingImage(createdAt: Date) {
      const image = await service.uploadImage(ALEX, JPEG_BYTES);
      store.setCreatedAtForTest(image.publicId, createdAt);
      return image.publicId;
    }

    it('deletes unsaved images past the timeout and keeps newer ones', async () => {
      const abandoned = await pendingImage(STALE);
      const inProgress = await pendingImage(FRESH);

      const result = await service.cleanupAbandonedUploads(NOW);

      expect(result).toEqual({ deleted: 1, confirmed: 0 });
      expect(store.has(abandoned)).toBe(false);
      expect(store.has(inProgress)).toBe(true);
    });

    it('keeps saved images and clears their pending tag', async () => {
      const saved = await pendingImage(STALE);
      await service.createItem(ALEX, details(saved));

      const result = await service.cleanupAbandonedUploads(NOW);

      expect(result).toEqual({ deleted: 0, confirmed: 1 });
      expect(store.has(saved)).toBe(true);
      expect(store.tagsOf(saved)).not.toContain(PENDING_UPLOAD_TAG);
    });

    it('reads every page of pending images', async () => {
      const ids = [await pendingImage(STALE), await pendingImage(STALE), await pendingImage(STALE)];

      const result = await service.cleanupAbandonedUploads(NOW);

      expect(result.deleted).toBe(3);
      expect(ids.some((id) => store.has(id))).toBe(false);
    });

    it('deletes in batches of at most 100, the Cloudinary limit', async () => {
      const deleteSpy = vi.spyOn(store, 'delete');
      for (let i = 0; i < 150; i++) {
        await pendingImage(STALE);
      }

      await service.cleanupAbandonedUploads(NOW);

      expect(deleteSpy.mock.calls.map(([ids]) => ids.length)).toEqual([100, 50]);
    });
  });
});

describe('WardrobeItemService availability (US6)', () => {
  let repo: MemoryWardrobeItemRepository;
  let service: WardrobeItemService;

  beforeEach(() => {
    repo = new MemoryWardrobeItemRepository();
    service = new WardrobeItemService(repo, new MemoryImageStore());
  });

  function itemFor(ownerId: string, n: number) {
    return repo.create(newItem(ownerId, `rewear/users/${ownerId}/item-${n}`));
  }

  it("lists only the user's items, as client-safe DTOs", async () => {
    const mine = await itemFor(ALEX, 1);
    await itemFor(SAM, 2);

    const items = await service.listItems(ALEX);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: mine.id, isAvailable: true });
    expect(items[0]).not.toHaveProperty('ownerId');
    expect(typeof items[0].createdAt).toBe('string');
  });

  it('marks an item unavailable and back to available, returning the updated item', async () => {
    const item = await itemFor(ALEX, 1);

    await expect(service.setAvailability(ALEX, item.id, false)).resolves.toMatchObject({
      id: item.id,
      isAvailable: false,
    });
    await expect(service.setAvailability(ALEX, item.id, true)).resolves.toMatchObject({
      id: item.id,
      isAvailable: true,
    });
  });

  it('excludes an unavailable item from available items until it is marked available again', async () => {
    const shirt = await itemFor(ALEX, 1);
    const coat = await itemFor(ALEX, 2);

    await service.setAvailability(ALEX, shirt.id, false);
    expect((await service.listAvailableItems(ALEX)).map((item) => item.id)).toEqual([coat.id]);
    expect(await service.listItems(ALEX)).toHaveLength(2);

    await service.setAvailability(ALEX, shirt.id, true);
    expect((await service.listAvailableItems(ALEX)).map((item) => item.id).sort()).toEqual(
      [coat.id, shirt.id].sort(),
    );
  });

  it("gives the same 404 for another user's item as for a missing one, and changes nothing", async () => {
    const samsItem = await itemFor(SAM, 1);

    const forOther = await rejection(service.setAvailability(ALEX, samsItem.id, false));
    const forMissing = await rejection(service.setAvailability(ALEX, 'item_999', false));

    for (const error of [forOther, forMissing]) {
      expect(error).toMatchObject({
        code: 'ITEM_NOT_FOUND',
        statusCode: 404,
        message: "We couldn't find that clothing item.",
      });
    }
    expect((await service.listItems(SAM))[0].isAvailable).toBe(true);
  });

  it('passes a database outage through for the handler to report', async () => {
    const item = await itemFor(ALEX, 1);
    vi.spyOn(repo, 'setAvailability').mockRejectedValue(new RepositoryUnavailableError());
    vi.spyOn(repo, 'listByOwner').mockRejectedValue(new RepositoryUnavailableError());

    await expect(service.setAvailability(ALEX, item.id, false)).rejects.toBeInstanceOf(
      RepositoryUnavailableError,
    );
    await expect(service.listItems(ALEX)).rejects.toBeInstanceOf(RepositoryUnavailableError);
  });
});
