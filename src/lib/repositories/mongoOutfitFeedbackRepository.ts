import 'server-only';
import { Feedback } from '@/models/Feedback';
import { Outfit } from '@/models/Outfit';
import type { FeedbackRating, Occasion } from '@/types/outfit';
import { isObjectIdString, withDatabase } from './mongoSupport';
import type { IOutfitFeedbackRepository, RatedOutfitRecord } from './outfitFeedbackRepository';

const DUPLICATE_KEY_CODE = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === DUPLICATE_KEY_CODE;
}

async function ownsOutfit(ownerId: string, outfitId: string): Promise<boolean> {
  return (await Outfit.exists({ _id: outfitId, owner: ownerId })) !== null;
}

/**
 * Feedback records are the source of truth; Outfit.feedback is kept pointing at the outfit's
 * record, as the PRD's outfit data lists it.
 */
export class MongoOutfitFeedbackRepository implements IOutfitFeedbackRepository {
  async setRating(ownerId: string, outfitId: string, rating: FeedbackRating): Promise<boolean> {
    if (!isObjectIdString(ownerId) || !isObjectIdString(outfitId)) {
      return false;
    }
    return withDatabase('outfitFeedback.setRating', async () => {
      if (!(await ownsOutfit(ownerId, outfitId))) {
        return false;
      }
      const filter = { owner: ownerId, outfit: outfitId };
      const update = { $set: { rating } };
      let feedback;
      try {
        feedback = await Feedback.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after', runValidators: true });
      } catch (err) {
        // A concurrent first rating inserted the record between this upsert's find and insert.
        if (!isDuplicateKeyError(err)) {
          throw err;
        }
        feedback = await Feedback.findOneAndUpdate(filter, update, { returnDocument: 'after', runValidators: true });
      }
      if (!feedback) {
        return false;
      }
      await Outfit.updateOne({ _id: outfitId, owner: ownerId }, { $set: { feedback: feedback._id } });
      return true;
    });
  }

  async clearRating(ownerId: string, outfitId: string): Promise<boolean> {
    if (!isObjectIdString(ownerId) || !isObjectIdString(outfitId)) {
      return false;
    }
    return withDatabase('outfitFeedback.clearRating', async () => {
      if (!(await ownsOutfit(ownerId, outfitId))) {
        return false;
      }
      await Feedback.deleteOne({ owner: ownerId, outfit: outfitId });
      await Outfit.updateOne({ _id: outfitId, owner: ownerId }, { $unset: { feedback: 1 } });
      return true;
    });
  }

  async listRatedByOccasion(ownerId: string, occasion: Occasion): Promise<RatedOutfitRecord[]> {
    if (!isObjectIdString(ownerId)) {
      return [];
    }
    return withDatabase('outfitFeedback.listRatedByOccasion', async () => {
      const ratings = await Feedback.find({ owner: ownerId }).select({ outfit: 1, rating: 1 }).lean();
      if (ratings.length === 0) {
        return [];
      }
      const outfits = await Outfit.find({
        _id: { $in: ratings.map((r) => r.outfit) },
        owner: ownerId,
        occasion,
      })
        .select({ items: 1 })
        .lean();
      const itemsById = new Map(outfits.map((o) => [o._id.toString(), o.items.map(String)]));
      return ratings.flatMap((r): RatedOutfitRecord[] => {
        const itemIds = itemsById.get(r.outfit.toString());
        return itemIds ? [{ outfitId: r.outfit.toString(), itemIds, rating: r.rating }] : [];
      });
    });
  }
}
