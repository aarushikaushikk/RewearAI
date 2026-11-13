// Outfit history (US10) request and response shapes.
// Client-safe: no server imports.

import type { Occasion } from '@/types/outfit';
import type { Category, Color, Formality, Season } from '@/types/wardrobe';

/** POST /api/outfits/history, after validation. Item details always come from the wardrobe. */
export interface MarkOutfitWornInput {
  /** Lowercased, distinct wardrobe item IDs, in the order the outfit showed them. */
  itemIds: string[];
  occasion: Occasion;
  /** The user's local calendar date, YYYY-MM-DD. */
  wornOn: string;
}

/** A worn item still in the user's wardrobe, with its current details. */
export interface WornItemDto {
  status: 'present';
  id: string;
  /** Null when the user didn't name the item; display color and category instead. */
  name: string | null;
  image: { url: string };
  category: Category;
  color: Color;
  style: string;
  season: Season;
  formality: Formality;
}

/** A worn item that is no longer in the user's wardrobe. Nothing else is known about it. */
export interface MissingWornItemDto {
  status: 'missing';
  id: string;
}

export interface OutfitHistoryEntryDto {
  id: string;
  /** The user's local calendar date, YYYY-MM-DD. */
  wornOn: string;
  /** Null only if the stored outfit record no longer exists. */
  occasion: Occasion | null;
  /** When the wear was recorded, as an ISO timestamp. */
  recordedAt: string;
  items: (WornItemDto | MissingWornItemDto)[];
}

/** POST response data: `created` is false when the same clothes were already recorded that day. */
export interface MarkOutfitWornResultDto {
  created: boolean;
  entry: OutfitHistoryEntryDto;
}

/** GET response data: newest worn date first. */
export interface OutfitHistoryListDto {
  entries: OutfitHistoryEntryDto[];
}
