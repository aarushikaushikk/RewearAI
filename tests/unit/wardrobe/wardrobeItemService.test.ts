import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  PENDING_UPLOAD_TAG,
  PENDING_UPLOAD_TTL_MS,
  WardrobeError,
  WardrobeItemService,
} from '@/services/wardrobeItemService';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { USER_IDS } from '../../contracts/fixtures';
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
