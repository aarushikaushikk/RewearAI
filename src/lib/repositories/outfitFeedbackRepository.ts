import type { FeedbackRating, Occasion } from '@/types/outfit';

/** One of the owner's rated outfits (US14). */
export interface RatedOutfitRecord {
  outfitId: string;
  itemIds: string[];
  rating: FeedbackRating;
}

/**
 * Recommendation feedback storage (US14). Every method scopes its records to `ownerId`, so
 * another user's outfit reads exactly like a missing one. An outfit has at most one rating.
 */
export interface IOutfitFeedbackRepository {
  /**
   * Sets the rating of one of the owner's outfits, replacing any earlier one, so a retried or
   * changed rating keeps one record. False, storing nothing, unless it is the owner's outfit.
   */
  setRating(ownerId: string, outfitId: string, rating: FeedbackRating): Promise<boolean>;
  /**
   * Removes the rating of one of the owner's outfits, keeping the outfit. True for any outfit the
   * owner has, rated or not, so a retried clear also succeeds.
   */
  clearRating(ownerId: string, outfitId: string): Promise<boolean>;
  /** The owner's rated outfits for this occasion, in no particular order. */
  listRatedByOccasion(ownerId: string, occasion: Occasion): Promise<RatedOutfitRecord[]>;
}
