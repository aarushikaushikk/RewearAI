// Clothing classification suggestions (US3). Client-safe: no server imports.
// Suggestions are never a saved wardrobe item; the user reviews and confirms
// every value before US2's save, so these types carry no owner or ID.

import type { Category, Color, Formality, Season } from "@/types/wardrobe";

/** Mirrors `style.maxlength` in `src/models/WardrobeItem.ts`; a test keeps them in sync. */
export const STYLE_MAX_LENGTH = 40;

export const CLASSIFIED_FIELDS = [
  "category",
  "color",
  "style",
  "season",
  "formality",
] as const;

export type ClassifiedField = (typeof CLASSIFIED_FIELDS)[number];

/** Confidence a provider reports for one field. Anything else counts as unknown. */
export const CONFIDENCE_LEVELS = ["high", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * One field as the provider adapter must hand it over, before validation.
 * Values are `unknown` because provider output is untrusted.
 */
export interface RawFieldSuggestion {
  value?: unknown;
  confidence?: unknown;
}

/** Provider-neutral shape the future adapter produces; validated by `normalizeClassification`. */
export interface RawClassification {
  isClothing?: unknown;
  category?: RawFieldSuggestion;
  color?: RawFieldSuggestion;
  style?: RawFieldSuggestion;
  season?: RawFieldSuggestion;
  formality?: RawFieldSuggestion;
}

/**
 * - `suggested`: allowed value, reported with high confidence.
 * - `uncertain`: allowed value, but low or unreported confidence.
 * - `missing`: the provider gave no value.
 * - `invalid`: the provider gave a value that isn't allowed; it is discarded.
 * Only `suggested` and `uncertain` carry a value, so nothing is invented.
 */
export type FieldSuggestion<T> =
  | { status: "suggested"; value: T }
  | { status: "uncertain"; value: T }
  | { status: "missing" }
  | { status: "invalid" };

export type FieldStatus = FieldSuggestion<unknown>["status"];

export interface ClassificationSuggestions {
  category: FieldSuggestion<Category>;
  color: FieldSuggestion<Color>;
  style: FieldSuggestion<string>;
  season: FieldSuggestion<Season>;
  formality: FieldSuggestion<Formality>;
}

export type ClassificationFailureReason = "invalid_output" | "not_clothing";

export type ClassificationResult =
  | {
      status: "ok";
      suggestions: ClassificationSuggestions;
      /** Fields that aren't `suggested`, in `CLASSIFIED_FIELDS` order. */
      fieldsNeedingReview: ClassifiedField[];
    }
  | { status: "failed"; reason: ClassificationFailureReason };
