import 'server-only';
import { WardrobeItem } from '@/models/WardrobeItem';
import { isObjectIdString, withDatabase } from '@/lib/repositories/mongoSupport';
import type { AvailableWardrobeItemSource } from '@/services/outfitRecommendationService';
import type { WardrobeItemRecord } from '@/types/wardrobe';

/**
 * TEMPORARY (US7): a read-only source of a user's available items for outfit generation,
 * kept separate so US7 doesn't depend on unmerged US6. Once US6 is merged, pass its
 * MongoWardrobeItemRepository (which has the same listAvailableByOwner) to the service
 * instead, and delete this file.
 */
type StoredItem = Omit<WardrobeItemRecord, 'id' | 'ownerId' | 'name'> & {
  _id: { toString(): string };
  owner: { toString(): string };
  name?: string | null;
};

function toRecord(item: StoredItem): WardrobeItemRecord {
  return {
    id: item._id.toString(),
    ownerId: item.owner.toString(),
    image: { url: item.image.url, publicId: item.image.publicId },
    name: item.name ?? null,
    category: item.category,
    color: item.color,
    style: item.style,
    season: item.season,
    formality: item.formality,
    isAvailable: item.isAvailable,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export class MongoAvailableWardrobeItems implements AvailableWardrobeItemSource {
  async listAvailableByOwner(ownerId: string): Promise<WardrobeItemRecord[]> {
    if (!isObjectIdString(ownerId)) {
      return [];
    }
    return withDatabase('outfit.listAvailableItems', async () => {
      const items = await WardrobeItem.find({ owner: ownerId, isAvailable: true })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      return items.map((item) => toRecord(item as StoredItem));
    });
  }
}
