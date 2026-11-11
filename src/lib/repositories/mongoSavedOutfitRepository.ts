import 'server-only';
import { Types } from 'mongoose';
import { Outfit } from '@/models/Outfit';
import type { Occasion, SavedOutfitRecord } from '@/types/outfit';
import { isObjectIdString, withDatabase } from './mongoSupport';
import { RepositoryError } from './repositoryErrors';
import type { ISavedOutfitRepository, SaveOutfitResult } from './savedOutfitRepository';

interface StoredOutfit {
  _id: { toString(): string };
  owner: { toString(): string };
  occasion: Occasion;
  items: { toString(): string }[];
  savedAt?: Date | null;
}

function toRecord(outfit: StoredOutfit): SavedOutfitRecord {
  return {
    id: outfit._id.toString(),
    ownerId: outfit.owner.toString(),
    occasion: outfit.occasion,
    itemIds: outfit.items.map(String),
    // Every outfit this repository returns has been saved, so savedAt is set.
    savedAt: outfit.savedAt as Date,
  };
}

export class MongoSavedOutfitRepository implements ISavedOutfitRepository {
  async save(ownerId: string, occasion: Occasion, itemIds: string[]): Promise<SaveOutfitResult> {
    if (!isObjectIdString(ownerId) || itemIds.length === 0 || !itemIds.every(isObjectIdString)) {
      throw new RepositoryError();
    }
    // Sorted, so the same items in any order match one stored array exactly.
    const items = itemIds.map((id) => id.toLowerCase()).sort().map((id) => new Types.ObjectId(id));
    return withDatabase('outfit.save', async () => {
      // One atomic upsert: a retried save finds the record instead of adding another. Two
      // truly simultaneous first saves could still both insert; nothing indexes the item set.
      const filter = { owner: new Types.ObjectId(ownerId), occasion, items };
      const write = await Outfit.updateOne(
        filter,
        { $set: { isSaved: true, savedAt: new Date() } },
        { upsert: true },
      );
      const saved = await Outfit.findOne(filter).lean();
      if (!saved) {
        throw new RepositoryError();
      }
      return { outfit: toRecord(saved), created: write.upsertedCount === 1 };
    });
  }

  async listSavedByOwner(ownerId: string): Promise<SavedOutfitRecord[]> {
    if (!isObjectIdString(ownerId)) {
      return [];
    }
    return withDatabase('outfit.listSaved', async () => {
      const outfits = await Outfit.find({ owner: ownerId, isSaved: true })
        .sort({ savedAt: -1, _id: -1 })
        .lean();
      return outfits.map((outfit) => toRecord(outfit as StoredOutfit));
    });
  }

  async unsaveForOwner(ownerId: string, outfitId: string): Promise<boolean> {
    if (!isObjectIdString(ownerId) || !isObjectIdString(outfitId)) {
      return false;
    }
    return withDatabase('outfit.unsave', async () => {
      const result = await Outfit.updateOne({ _id: outfitId, owner: ownerId }, { $set: { isSaved: false } });
      return result.matchedCount === 1;
    });
  }
}
