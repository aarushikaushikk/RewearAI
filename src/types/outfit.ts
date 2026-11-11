// Allowed outfit values, shared by the Mongoose models and the UI.
// Client-safe: no server imports.

import type { Category, Color, Formality, Season } from "@/types/wardrobe";

/** PRD §13 occasion categories. */
export const OCCASIONS = [
  "work",
  "dinner",
  "weekend",
  "casual",
  "formal",
] as const;

/** PRD US14: positive or negative; clearing feedback removes the record. */
export const FEEDBACK_RATINGS = ["positive", "negative"] as const;

export type Occasion = (typeof OCCASIONS)[number];
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

/** The part each item plays in a generated outfit (US7). */
export type OutfitRole = "top" | "bottom" | "dress" | "shoes" | "outerwear" | "accessory";

/**
 * Why no outfit could be generated (US7):
 * - `no_suitable_items`: none of the user's available items has a formality for the occasion.
 * - `no_complete_outfit`: suitable items exist, but no Top + Bottom or Dress can be formed.
 */
export type InsufficientReason = "no_suitable_items" | "no_complete_outfit";

/** A recommended wardrobe item, with what the Create Outfit page needs to show it. */
export interface OutfitItemDto {
  role: OutfitRole;
  id: string;
  /** Null when the user didn't name the item; display color and style instead. */
  name: string | null;
  image: { url: string };
  category: Category;
  color: Color;
  style: string;
  season: Season;
  formality: Formality;
}

/** Response data for POST /api/outfits/generate. Generated outfits are not saved (US9). */
export type OutfitRecommendationDto =
  | { status: "ok"; occasion: Occasion; season: Season; items: OutfitItemDto[] }
  | { status: "insufficient"; occasion: Occasion; reason: InsufficientReason };

/** A saved outfit as stored (US9): references to the user's wardrobe items, never copies. */
export interface SavedOutfitRecord {
  id: string;
  ownerId: string;
  occasion: Occasion;
  itemIds: string[];
  savedAt: Date;
}
