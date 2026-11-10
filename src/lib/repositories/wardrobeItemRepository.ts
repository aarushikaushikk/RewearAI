import { CreateWardrobeItemDTO, WardrobeItemDetails, WardrobeItemRecord } from '@/types/wardrobe';

/**
 * Every method that takes an `ownerId` scopes its query to that owner, so another
 * user's item reads exactly like a missing one.
 */
export interface IWardrobeItemRepository {
  /** Throws DuplicateImageError if any item, whoever owns it, already uses the image. */
  create(data: CreateWardrobeItemDTO): Promise<WardrobeItemRecord>;
  /** Only ever returns an item that `ownerId` owns. */
  findByImage(ownerId: string, publicId: string): Promise<WardrobeItemRecord | null>;
  /** The subset of `publicIds` that some item uses. Not scoped to a user: for upload cleanup only. */
  findUsedImageIds(publicIds: string[]): Promise<string[]>;
  /** The owner's items, newest first. */
  listByOwner(ownerId: string): Promise<WardrobeItemRecord[]>;
  /** The owner's available items, newest first. New outfit suggestions may use only these. */
  listAvailableByOwner(ownerId: string): Promise<WardrobeItemRecord[]>;
  /** Null for an unknown or malformed ID, or another user's item. */
  findByIdForOwner(ownerId: string, itemId: string): Promise<WardrobeItemRecord | null>;
  /**
   * Replaces the editable details, leaving the image and availability as they are.
   * Returns the updated item, or null when findByIdForOwner would.
   */
  updateForOwner(
    ownerId: string,
    itemId: string,
    details: WardrobeItemDetails,
  ): Promise<WardrobeItemRecord | null>;
  /**
   * Sets availability on an item that `ownerId` owns, and returns it. Null when
   * findByIdForOwner would return null.
   */
  setAvailability(
    ownerId: string,
    itemId: string,
    isAvailable: boolean,
  ): Promise<WardrobeItemRecord | null>;
  /** True if this call deleted the item; false when findByIdForOwner would return null. */
  deleteForOwner(ownerId: string, itemId: string): Promise<boolean>;
}
