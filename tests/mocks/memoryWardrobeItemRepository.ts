import { DuplicateImageError } from '@/lib/repositories/repositoryErrors';
import { IWardrobeItemRepository } from '@/lib/repositories/wardrobeItemRepository';
import { CreateWardrobeItemDTO, WardrobeItemDetails, WardrobeItemRecord } from '@/types/wardrobe';

export class MemoryWardrobeItemRepository implements IWardrobeItemRepository {
  private items: WardrobeItemRecord[] = [];
  private nextId = 1;

  async create(data: CreateWardrobeItemDTO): Promise<WardrobeItemRecord> {
    if (this.items.some((item) => item.image.publicId === data.image.publicId)) {
      throw new DuplicateImageError();
    }
    const now = new Date();
    const item: WardrobeItemRecord = {
      id: `item_${this.nextId++}`,
      ownerId: data.ownerId,
      image: { ...data.image },
      name: data.name ?? null,
      category: data.category,
      color: data.color,
      style: data.style,
      season: data.season,
      formality: data.formality,
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    return structuredClone(item);
  }

  async findByImage(ownerId: string, publicId: string): Promise<WardrobeItemRecord | null> {
    const item = this.items.find(
      (candidate) => candidate.ownerId === ownerId && candidate.image.publicId === publicId,
    );
    return item ? structuredClone(item) : null;
  }

  async findUsedImageIds(publicIds: string[]): Promise<string[]> {
    const used = new Set(this.items.map((item) => item.image.publicId));
    return publicIds.filter((publicId) => used.has(publicId));
  }

  /** Newest first; items created in the same millisecond keep reverse insertion order, as _id does. */
  async listByOwner(ownerId: string): Promise<WardrobeItemRecord[]> {
    return this.items
      .filter((item) => item.ownerId === ownerId)
      .reverse()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => structuredClone(item));
  }

  async listAvailableByOwner(ownerId: string): Promise<WardrobeItemRecord[]> {
    return (await this.listByOwner(ownerId)).filter((item) => item.isAvailable);
  }

  async findByIdForOwner(ownerId: string, itemId: string): Promise<WardrobeItemRecord | null> {
    const item = this.ownedItem(ownerId, itemId);
    return item ? structuredClone(item) : null;
  }

  async updateForOwner(
    ownerId: string,
    itemId: string,
    details: WardrobeItemDetails,
  ): Promise<WardrobeItemRecord | null> {
    const item = this.ownedItem(ownerId, itemId);
    if (!item) {
      return null;
    }
    Object.assign(item, details, { updatedAt: new Date() });
    return structuredClone(item);
  }

  async setAvailability(
    ownerId: string,
    itemId: string,
    isAvailable: boolean,
  ): Promise<WardrobeItemRecord | null> {
    const item = this.ownedItem(ownerId, itemId);
    if (!item) {
      return null;
    }
    item.isAvailable = isAvailable;
    item.updatedAt = new Date();
    return structuredClone(item);
  }

  async deleteForOwner(ownerId: string, itemId: string): Promise<boolean> {
    const item = this.ownedItem(ownerId, itemId);
    if (!item) {
      return false;
    }
    this.items = this.items.filter((candidate) => candidate !== item);
    return true;
  }

  private ownedItem(ownerId: string, itemId: string): WardrobeItemRecord | undefined {
    return this.items.find((item) => item.id === itemId && item.ownerId === ownerId);
  }
}
