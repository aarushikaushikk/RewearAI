import { FEEDBACK_RATINGS, OCCASIONS, type FeedbackRating, type Occasion } from '@/types/outfit';

export const CHOOSE_OCCASION_ERROR = 'Choose an occasion to continue.';
export const INVALID_PAYLOAD_ERROR = 'Invalid request payload';

/** US8: how many already-shown outfits a request may list. */
export const MAX_SHOWN_OUTFITS = 20;

export type GenerateOutfitPayloadResult =
  | { ok: true; occasion: Occasion; shown: string[][] }
  | { ok: false; error: typeof CHOOSE_OCCASION_ERROR | typeof INVALID_PAYLOAD_ERROR };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One item per outfit role at most: top, bottom, dress, outerwear, shoes, accessory. */
export const MAX_OUTFIT_ITEMS = 6;
const MAX_ITEM_ID_LENGTH = 64;

/**
 * Accepts `{ occasion }` with one of OCCASIONS, matched exactly, and optionally `shown` (US8):
 * up to MAX_SHOWN_OUTFITS lists of the item IDs already shown. Any other field, such as a user
 * or item ID, makes the payload invalid: the session decides whose wardrobe is used, and shown
 * IDs only rule combinations out.
 */
export function parseGenerateOutfitPayload(body: unknown): GenerateOutfitPayloadResult {
  if (!isRecord(body) || Object.keys(body).some((key) => key !== 'occasion' && key !== 'shown')) {
    return { ok: false, error: INVALID_PAYLOAD_ERROR };
  }
  const { occasion, shown = [] } = body;
  if (typeof occasion !== 'string' || !(OCCASIONS as readonly string[]).includes(occasion)) {
    return { ok: false, error: CHOOSE_OCCASION_ERROR };
  }
  if (!Array.isArray(shown) || shown.length > MAX_SHOWN_OUTFITS || !shown.every(isItemIdList)) {
    return { ok: false, error: INVALID_PAYLOAD_ERROR };
  }
  return { ok: true, occasion: occasion as Occasion, shown: shown.map((itemIds) => [...itemIds]) };
}

export interface SaveOutfitInput {
  occasion: Occasion;
  itemIds: string[];
}

export type SaveOutfitPayloadResult =
  | ({ ok: true } & SaveOutfitInput)
  | { ok: false; error: typeof INVALID_PAYLOAD_ERROR };

function isItemId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ITEM_ID_LENGTH;
}

/** 1 to MAX_OUTFIT_ITEMS distinct item IDs. */
function isItemIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_OUTFIT_ITEMS &&
    value.every(isItemId) &&
    new Set(value).size === value.length
  );
}

/**
 * Accepts exactly `{ occasion, itemIds }` (US9): a known occasion and 1 to MAX_OUTFIT_ITEMS
 * distinct item IDs. An owner or explanation is refused: the session decides whose outfit it
 * is, and the service checks that every item belongs to that user.
 */
export function parseSaveOutfitPayload(body: unknown): SaveOutfitPayloadResult {
  const invalid = { ok: false, error: INVALID_PAYLOAD_ERROR } as const;
  if (!isRecord(body) || Object.keys(body).some((key) => key !== 'occasion' && key !== 'itemIds')) {
    return invalid;
  }
  const { occasion, itemIds } = body;
  if (typeof occasion !== 'string' || !(OCCASIONS as readonly string[]).includes(occasion)) {
    return invalid;
  }
  if (!isItemIdList(itemIds)) {
    return invalid;
  }
  return { ok: true, occasion: occasion as Occasion, itemIds: [...itemIds] };
}

export interface OutfitFeedbackInput extends SaveOutfitInput {
  rating: FeedbackRating;
}

export type OutfitFeedbackPayloadResult =
  | ({ ok: true } & OutfitFeedbackInput)
  | { ok: false; error: typeof INVALID_PAYLOAD_ERROR };

/**
 * Accepts exactly `{ occasion, itemIds, rating }` (US14): the outfit as Save accepts it, and a
 * rating from FEEDBACK_RATINGS, matched exactly. Clearing has its own request, so null is refused.
 * An owner or outfit ID is refused: the session decides whose outfit is rated.
 */
export function parseOutfitFeedbackPayload(body: unknown): OutfitFeedbackPayloadResult {
  const invalid = { ok: false, error: INVALID_PAYLOAD_ERROR } as const;
  if (!isRecord(body) || !('rating' in body)) {
    return invalid;
  }
  const { rating, ...outfit } = body;
  if (typeof rating !== 'string' || !(FEEDBACK_RATINGS as readonly string[]).includes(rating)) {
    return invalid;
  }
  const parsed = parseSaveOutfitPayload(outfit);
  if (!parsed.ok) {
    return invalid;
  }
  return { ok: true, occasion: parsed.occasion, itemIds: parsed.itemIds, rating: rating as FeedbackRating };
}
