import type { Occasion } from '@/types/outfit';

/** An outfit to store, or to find if the user already has one with these items. */
export interface NewOutfitData {
  ownerId: string;
  itemIds: string[];
  occasion: Occasion;
  explanation: string;
}

export interface StoredOutfitRef {
  id: string;
  /** False when an existing outfit with the same items and occasion was reused. */
  created: boolean;
}

export interface NewWornEntry {
  ownerId: string;
  outfitId: string;
  /** YYYY-MM-DD, the user's local date. */
  wornOn: string;
  /** combinationKey() of the outfit's item IDs. */
  combinationKey: string;
}

export interface OutfitHistoryEntryRecord {
  id: string;
  ownerId: string;
  outfitId: string;
  wornOn: string;
  combinationKey: string;
  recordedAt: Date;
  /** The worn outfit, or null if no outfit of this owner has that ID any more. */
  outfit: { occasion: Occasion; itemIds: string[] } | null;
}

/**
 * Outfit history storage (US10). Every method scopes its records to `ownerId`. Outfits are
 * never deleted here, because other requests, history entries or saved outfits may use them.
 */
export interface IOutfitHistoryRepository {
  /**
   * Reuses the owner's oldest outfit with exactly these items (any order) and occasion.
   * A new outfit stores canonicalItemIds() order, which Saved Outfits (US9) matches exactly.
   */
  findOrCreateOutfit(data: NewOutfitData): Promise<StoredOutfitRef>;
  /**
   * Records a wear. Throws RepositoryError, and records nothing, unless `outfitId` is one of
   * the owner's outfits. If the owner already has a record with this date and combination key,
   * including one written by a concurrent request, returns it with `created: false`.
   */
  recordWorn(entry: NewWornEntry): Promise<{ entry: OutfitHistoryEntryRecord; created: boolean }>;
  /** Newest worn date first; within a date, the latest recorded first, then the latest ID. */
  listByOwner(ownerId: string): Promise<OutfitHistoryEntryRecord[]>;
}
