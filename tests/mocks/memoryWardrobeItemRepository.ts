import { DuplicateImageError } from '@/lib/repositories/repositoryErrors';
import { IWardrobeItemRepository } from '@/lib/repositories/wardrobeItemRepository';
import { CreateWardrobeItemDTO, WardrobeItemRecord } from '@/types/wardrobe';

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
}
