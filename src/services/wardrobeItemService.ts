import { IImageStore } from '@/lib/images/imageStore';
import { DuplicateImageError } from '@/lib/repositories/repositoryErrors';
import { IWardrobeItemRepository } from '@/lib/repositories/wardrobeItemRepository';
import { validateImageBytes } from '@/lib/validation/imageValidation';
import {
  ItemDetailsInput,
  NewItemInput,
  toItemDetails,
  toNewWardrobeItem,
  validateItemDetails,
  validateNewItemInput,
} from '@/lib/validation/wardrobeValidation';
import { ValidationResult } from '@/types/auth';
import { WardrobeImage, WardrobeItemDto, WardrobeItemRecord } from '@/types/wardrobe';

/** Marks uploads not yet saved to a wardrobe item, so cleanup can find abandoned ones. */
export const PENDING_UPLOAD_TAG = 'rewear-pending';

export function pendingUploadTag(_uploadScope: string): string {
  return PENDING_UPLOAD_TAG;
}

/** How long an uploaded image may wait to be saved before cleanup deletes it. */
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

// Cloudinary's Admin API accepts at most 100 public IDs per call.
const BATCH_SIZE = 100;

const UPLOAD_FAILED_MESSAGE = "Your image didn't upload. Please try again.";
const SAVE_FAILED_MESSAGE = "We couldn't save this item. Try again.";
const IMAGE_NOT_FOUND_MESSAGE = "We couldn't find that image. Please upload it again.";
const ITEM_NOT_FOUND_MESSAGE = "We couldn't find that clothing item.";
const DELETE_FAILED_MESSAGE = "We couldn't delete this item. Try again.";

export class WardrobeError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'WardrobeError';
  }
}

export interface CreateItemResult {
  item: WardrobeItemDto;
  /** False when a retried save found the item already saved. */
  created: boolean;
}

/** Each user's images live under their own folder, which proves ownership on save. */
export function userImageFolder(userId: string): string {
  return `rewear/users/${userId}`;
}

export function toWardrobeItemDto(record: WardrobeItemRecord): WardrobeItemDto {
  return {
    id: record.id,
    image: { ...record.image },
    ...(record.name ? { name: record.name } : {}),
    category: record.category,
    color: record.color,
    style: record.style,
    season: record.season,
    formality: record.formality,
    isAvailable: record.isAvailable,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function batches<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    result.push(items.slice(i, i + BATCH_SIZE));
  }
  return result;
}

// Logs fixed values only: image service errors can contain credentials.
function logFailure(operation: 'image.upload' | 'image.find' | 'image.delete'): void {
  console.error('[wardrobe] operation failed', { operation });
}

function throwIfInvalid(validation: ValidationResult): void {
  if (!validation.isValid) {
    const [firstError] = Object.values(validation.errors);
    throw new WardrobeError(firstError, 'VALIDATION_ERROR', 400);
  }
}

// The same answer for another user's item as for a missing one, so IDs can't be probed.
function itemNotFound(): WardrobeError {
  return new WardrobeError(ITEM_NOT_FOUND_MESSAGE, 'ITEM_NOT_FOUND', 404);
}

export class WardrobeItemService {
  constructor(
    private itemRepo: IWardrobeItemRepository,
    private imageStore: IImageStore,
    _uploadScope: string,
  ) {}

  /** Stores a photo for `userId`. No wardrobe item exists until createItem. */
  async uploadImage(userId: string, bytes: Uint8Array): Promise<WardrobeImage> {
    const validation = validateImageBytes(bytes);
    if (!validation.isValid) {
      const status = { EMPTY_FILE: 400, FILE_TOO_LARGE: 413, UNSUPPORTED_TYPE: 415 }[validation.code];
      throw new WardrobeError(validation.error, validation.code, status);
    }

    try {
      return await this.imageStore.upload(bytes, {
        folder: userImageFolder(userId),
        tags: [PENDING_UPLOAD_TAG],
      });
    } catch {
      logFailure('image.upload');
      throw new WardrobeError(UPLOAD_FAILED_MESSAGE, 'UPLOAD_FAILED', 502);
    }
  }

  /**
   * Saves a wardrobe item for `userId` from an image they uploaded. Retrying the
   * same save returns the existing item instead of creating a duplicate.
   */
  async createItem(userId: string, input: NewItemInput): Promise<CreateItemResult> {
    throwIfInvalid(validateNewItemInput(input));
    const { publicId, ...details } = toNewWardrobeItem(input);

    // Same answer for another user's image as for a missing one, so IDs can't be probed.
    if (!publicId.startsWith(`${userImageFolder(userId)}/`)) {
      throw new WardrobeError(IMAGE_NOT_FOUND_MESSAGE, 'IMAGE_NOT_FOUND', 404);
    }

    let image: WardrobeImage | null;
    try {
      image = await this.imageStore.find(publicId);
    } catch {
      logFailure('image.find');
      throw new WardrobeError(SAVE_FAILED_MESSAGE, 'SAVE_FAILED', 502);
    }
    if (!image) {
      throw new WardrobeError(IMAGE_NOT_FOUND_MESSAGE, 'IMAGE_NOT_FOUND', 404);
    }

    try {
      // The image store's URL is used, never one supplied by the client.
      const record = await this.itemRepo.create({ ...details, ownerId: userId, image });
      return { item: toWardrobeItemDto(record), created: true };
    } catch (err) {
      if (!(err instanceof DuplicateImageError)) {
        throw err;
      }
      const existing = await this.itemRepo.findByImage(userId, publicId);
      if (!existing) {
        throw new WardrobeError(IMAGE_NOT_FOUND_MESSAGE, 'IMAGE_NOT_FOUND', 404);
      }
      return { item: toWardrobeItemDto(existing), created: false };
    }
  }

  /** The user's items, newest first (US4). */
  async listItems(userId: string): Promise<WardrobeItemDto[]> {
    const records = await this.itemRepo.listByOwner(userId);
    return records.map(toWardrobeItemDto);
  }

  /**
   * `userId`'s available items, newest first. New outfit suggestions (US7) must draw only
   * from this list, so unavailable clothing is never recommended.
   */
  async listAvailableItems(userId: string): Promise<WardrobeItemDto[]> {
    return (await this.itemRepo.listAvailableByOwner(userId)).map(toWardrobeItemDto);
  }

  /** One of the user's items; another user's item is reported as not found. */
  async getItem(userId: string, itemId: string): Promise<WardrobeItemDto> {
    const record = await this.itemRepo.findByIdForOwner(userId, itemId);
    if (!record) {
      throw itemNotFound();
    }
    return toWardrobeItemDto(record);
  }

  /** Saves edited details with the Add Clothing rules. The image and availability don't change. */
  async updateItem(userId: string, itemId: string, input: ItemDetailsInput): Promise<WardrobeItemDto> {
    throwIfInvalid(validateItemDetails(input));
    const record = await this.itemRepo.updateForOwner(userId, itemId, toItemDetails(input));
    if (!record) {
      throw itemNotFound();
    }
    return toWardrobeItemDto(record);
  }

  /**
   * Marks one of `userId`'s items available or unavailable (US6). Repeating an update gives
   * the same result. Another user's item gets the same 404 as a missing one.
   */
  async setAvailability(userId: string, itemId: string, isAvailable: boolean): Promise<WardrobeItemDto> {
    const record = await this.itemRepo.setAvailability(userId, itemId, isAvailable);
    if (!record) {
      throw itemNotFound();
    }
    return toWardrobeItemDto(record);
  }

  /**
   * Deletes the item and its photo. The photo goes first: if that fails the item is
   * kept and can be deleted again. If the record then fails, a retry finds the item
   * and deleting the already-removed photo succeeds, so the retry finishes the job.
   */
  async deleteItem(userId: string, itemId: string): Promise<void> {
    const record = await this.itemRepo.findByIdForOwner(userId, itemId);
    if (!record) {
      throw itemNotFound();
    }

    try {
      await this.imageStore.delete([record.image.publicId]);
    } catch {
      logFailure('image.delete');
      throw new WardrobeError(DELETE_FAILED_MESSAGE, 'DELETE_FAILED', 502);
    }

    await this.itemRepo.deleteForOwner(userId, itemId);
  }

  /**
   * Deletes uploads left unsaved past PENDING_UPLOAD_TTL_MS. Whether an image was
   * saved is checked in the database, not trusted to the pending tag.
   */
  async cleanupAbandonedUploads(
    now = new Date(),
  ): Promise<{ deleted: number; confirmed: number }> {
    const cutoff = now.getTime() - PENDING_UPLOAD_TTL_MS;
    const stale: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.imageStore.listByTag(PENDING_UPLOAD_TAG, cursor);
      for (const image of page.images) {
        if (image.createdAt.getTime() <= cutoff) {
          stale.push(image.publicId);
        }
      }
      cursor = page.nextCursor;
    } while (cursor);

    if (stale.length === 0) {
      return { deleted: 0, confirmed: 0 };
    }

    const used = new Set(await this.itemRepo.findUsedImageIds(stale));
    const confirmed = stale.filter((publicId) => used.has(publicId));
    const abandoned = stale.filter((publicId) => !used.has(publicId));

    for (const batch of batches(confirmed)) {
      await this.imageStore.removeTag(PENDING_UPLOAD_TAG, batch);
    }
    for (const batch of batches(abandoned)) {
      await this.imageStore.delete(batch);
    }
    return { deleted: abandoned.length, confirmed: confirmed.length };
  }
}
