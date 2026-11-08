import { CreateWardrobeItemDTO, WardrobeItemRecord } from '@/types/wardrobe';

export interface IWardrobeItemRepository {
  /** Throws DuplicateImageError if any item, whoever owns it, already uses the image. */
  create(data: CreateWardrobeItemDTO): Promise<WardrobeItemRecord>;
  /** Only ever returns an item that `ownerId` owns. */
  findByImage(ownerId: string, publicId: string): Promise<WardrobeItemRecord | null>;
  /** The subset of `publicIds` that some item uses. Not scoped to a user: for upload cleanup only. */
  findUsedImageIds(publicIds: string[]): Promise<string[]>;
}
