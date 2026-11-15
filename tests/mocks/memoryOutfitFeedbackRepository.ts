import type { IOutfitFeedbackRepository, RatedOutfitRecord } from '@/lib/repositories/outfitFeedbackRepository';
import type { FeedbackRating, Occasion } from '@/types/outfit';
import type { MemoryOutfitHistoryRepository } from './memoryOutfitHistoryRepository';

interface MemoryFeedback {
  ownerId: string;
  outfitId: string;
  rating: FeedbackRating;
}

/**
 * In-memory IOutfitFeedbackRepository. It rates the outfits stored in a
 * MemoryOutfitHistoryRepository, as MongoDB shares one Outfit collection.
 */
export class MemoryOutfitFeedbackRepository implements IOutfitFeedbackRepository {
  private ratings: MemoryFeedback[] = [];

  constructor(private outfits: MemoryOutfitHistoryRepository) {}

  async setRating(ownerId: string, outfitId: string, rating: FeedbackRating): Promise<boolean> {
    if (!this.outfits.outfitOf(ownerId, outfitId)) {
      return false;
    }
    const existing = this.ratings.find((r) => r.ownerId === ownerId && r.outfitId === outfitId);
    if (existing) {
      existing.rating = rating;
    } else {
      this.ratings.push({ ownerId, outfitId, rating });
    }
    return true;
  }

  async clearRating(ownerId: string, outfitId: string): Promise<boolean> {
    if (!this.outfits.outfitOf(ownerId, outfitId)) {
      return false;
    }
    this.ratings = this.ratings.filter((r) => !(r.ownerId === ownerId && r.outfitId === outfitId));
    return true;
  }

  async listRatedByOccasion(ownerId: string, occasion: Occasion): Promise<RatedOutfitRecord[]> {
    return this.ratings.flatMap((r): RatedOutfitRecord[] => {
      const outfit = r.ownerId === ownerId ? this.outfits.outfitOf(ownerId, r.outfitId) : undefined;
      return outfit?.occasion === occasion ? [{ outfitId: r.outfitId, itemIds: outfit.itemIds, rating: r.rating }] : [];
    });
  }
}
