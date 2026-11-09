import type { AvailableWardrobeItemSource } from '@/services/outfitRecommendationService';
import type { Category, Formality, Season, WardrobeItemRecord } from '@/types/wardrobe';

let nextId = 1;

/** A stored wardrobe item for tests; only the fields a test cares about need to be given. */
export function wardrobeRecord(
  ownerId: string,
  category: Category,
  overrides: Partial<WardrobeItemRecord> & { season?: Season; formality?: Formality } = {},
): WardrobeItemRecord {
  const id = `item_${nextId++}`;
  const now = new Date('2026-11-09T10:00:00.000Z');
  return {
    id,
    ownerId,
    image: { url: `https://res.cloudinary.com/test/image/upload/v1/${id}.jpg`, publicId: `rewear/users/${ownerId}/${id}` },
    name: null,
    category,
    color: 'Black',
    style: category,
    season: 'All-season',
    formality: 'Casual',
    isAvailable: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** In-memory AvailableWardrobeItemSource with the same owner and availability scoping as MongoDB. */
export class MemoryAvailableWardrobeItems implements AvailableWardrobeItemSource {
  constructor(public items: WardrobeItemRecord[] = []) {}

  async listAvailableByOwner(ownerId: string): Promise<WardrobeItemRecord[]> {
    return this.items
      .filter((item) => item.ownerId === ownerId && item.isAvailable)
      .map((item) => structuredClone(item));
  }
}
