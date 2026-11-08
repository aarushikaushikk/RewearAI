import 'server-only';
import { WardrobeItem } from '@/models/WardrobeItem';
import { CreateWardrobeItemDTO, WardrobeItemRecord } from '@/types/wardrobe';
import { isObjectIdString, withDatabase } from './mongoSupport';
import { RepositoryError } from './repositoryErrors';
import { IWardrobeItemRepository } from './wardrobeItemRepository';

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

export class MongoWardrobeItemRepository implements IWardrobeItemRepository {
  async create(data: CreateWardrobeItemDTO): Promise<WardrobeItemRecord> {
    if (!isObjectIdString(data.ownerId)) {
      throw new RepositoryError();
    }
    return withDatabase('wardrobeItem.create', async () => {
      const item = await WardrobeItem.create({
        owner: data.ownerId,
        image: data.image,
        name: data.name ?? undefined,
        category: data.category,
        color: data.color,
        style: data.style,
        season: data.season,
        formality: data.formality,
      });
      return toRecord(item.toObject() as StoredItem);
    });
  }

  async findByImage(ownerId: string, publicId: string): Promise<WardrobeItemRecord | null> {
    if (!isObjectIdString(ownerId)) {
      return null;
    }
    return withDatabase('wardrobeItem.findByImage', async () => {
      const item = await WardrobeItem.findOne({ owner: ownerId, 'image.publicId': publicId }).lean();
      return item ? toRecord(item as StoredItem) : null;
    });
  }

  async findUsedImageIds(publicIds: string[]): Promise<string[]> {
    if (publicIds.length === 0) {
      return [];
    }
    return withDatabase('wardrobeItem.findUsedImageIds', async () => {
      const used: string[] = await WardrobeItem.distinct('image.publicId', {
        'image.publicId': { $in: publicIds },
      });
      return used;
    });
  }
}
