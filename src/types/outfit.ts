// Allowed outfit values, shared by the Mongoose models and the UI.
// Client-safe: no server imports.

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
