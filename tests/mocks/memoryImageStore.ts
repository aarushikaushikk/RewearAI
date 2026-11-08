import { IImageStore, ImageStoreError, PendingImage } from '@/lib/images/imageStore';
import { WardrobeImage } from '@/types/wardrobe';

interface StoredImage {
  publicId: string;
  tags: Set<string>;
  createdAt: Date;
}

/**
 * In-memory stand-in for Cloudinary. Lists one image per page so callers must
 * follow `nextCursor`, and can be told to fail like an unreachable service.
 */
export class MemoryImageStore implements IImageStore {
  private images = new Map<string, StoredImage>();
  private nextId = 1;
  failing = false;

  readonly uploads: { folder: string; tags: string[] }[] = [];

  async upload(_bytes: Uint8Array, options: { folder: string; tags: string[] }): Promise<WardrobeImage> {
    this.failIfAsked();
    this.uploads.push(options);
    const publicId = `${options.folder}/image_${this.nextId++}`;
    this.images.set(publicId, { publicId, tags: new Set(options.tags), createdAt: new Date() });
    return { url: this.urlFor(publicId), publicId };
  }

  async find(publicId: string): Promise<WardrobeImage | null> {
    this.failIfAsked();
    return this.images.has(publicId) ? { url: this.urlFor(publicId), publicId } : null;
  }

  async listByTag(
    tag: string,
    cursor?: string,
  ): Promise<{ images: PendingImage[]; nextCursor?: string }> {
    this.failIfAsked();
    const tagged = [...this.images.values()].filter((image) => image.tags.has(tag));
    const index = cursor ? Number(cursor) : 0;
    const page = tagged.slice(index, index + 1);
    return {
      images: page.map(({ publicId, createdAt }) => ({ publicId, createdAt })),
      nextCursor: index + 1 < tagged.length ? String(index + 1) : undefined,
    };
  }

  async delete(publicIds: string[]): Promise<void> {
    this.failIfAsked();
    for (const publicId of publicIds) {
      this.images.delete(publicId);
    }
  }

  async removeTag(tag: string, publicIds: string[]): Promise<void> {
    this.failIfAsked();
    for (const publicId of publicIds) {
      this.images.get(publicId)?.tags.delete(tag);
    }
  }

  // Helpers for tests
  has(publicId: string): boolean {
    return this.images.has(publicId);
  }

  tagsOf(publicId: string): string[] {
    return [...(this.images.get(publicId)?.tags ?? [])];
  }

  setCreatedAtForTest(publicId: string, createdAt: Date): void {
    const image = this.images.get(publicId);
    if (image) {
      image.createdAt = createdAt;
    }
  }

  private urlFor(publicId: string): string {
    return `https://res.cloudinary.com/test/image/upload/v1/${publicId}.jpg`;
  }

  private failIfAsked(): void {
    if (this.failing) {
      throw new ImageStoreError();
    }
  }
}
