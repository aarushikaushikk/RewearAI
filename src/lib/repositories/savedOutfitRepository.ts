import type { Occasion, SavedOutfitRecord } from '@/types/outfit';

export interface SaveOutfitResult {
  outfit: SavedOutfitRecord;
  /** False when the same items were already stored for this occasion, saved or not. */
  created: boolean;
}

/**
 * Saved outfits (US9). Every method scopes its query to `ownerId`, so another user's
 * outfit reads exactly like a missing one.
 */
export interface ISavedOutfitRepository {
  /**
   * Saves an outfit of these items for this occasion, dated now. The same items in any
   * order are one outfit, so a retried or repeated save updates the existing record.
   */
  save(ownerId: string, occasion: Occasion, itemIds: string[]): Promise<SaveOutfitResult>;
  /** The owner's saved outfits, most recently saved first. */
  listSavedByOwner(ownerId: string): Promise<SavedOutfitRecord[]>;
  /**
   * Takes one of the owner's outfits off the saved list, keeping the record for history
   * and feedback. True for any outfit the owner has, so a retried removal also succeeds.
   */
  unsaveForOwner(ownerId: string, outfitId: string): Promise<boolean>;
}
