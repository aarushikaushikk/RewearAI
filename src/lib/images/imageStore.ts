import { WardrobeImage } from '@/types/wardrobe';

export interface PendingImage {
  publicId: string;
  createdAt: Date;
}

/** Where clothing photos are stored. The production implementation is Cloudinary. */
export interface IImageStore {
  upload(bytes: Uint8Array, options: { folder: string; tags: string[] }): Promise<WardrobeImage>;
  /** Returns null if no image has this ID. */
  find(publicId: string): Promise<WardrobeImage | null>;
  listByTag(tag: string, cursor?: string): Promise<{ images: PendingImage[]; nextCursor?: string }>;
  /** At most 100 IDs per call. */
  delete(publicIds: string[]): Promise<void>;
  removeTag(tag: string, publicIds: string[]): Promise<void>;
}

/**
 * Thrown in place of an image service error. Nothing is attached as a cause,
 * because service errors can contain credentials and signatures.
 */
export class ImageStoreError extends Error {
  override name = 'ImageStoreError';

  constructor() {
    super('The image operation failed');
  }
}
