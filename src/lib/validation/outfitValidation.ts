import { OCCASIONS, type Occasion } from '@/types/outfit';

export const CHOOSE_OCCASION_ERROR = 'Choose an occasion to continue.';
export const INVALID_PAYLOAD_ERROR = 'Invalid request payload';

export type GenerateOutfitPayloadResult =
  | { ok: true; occasion: Occasion }
  | { ok: false; error: typeof CHOOSE_OCCASION_ERROR | typeof INVALID_PAYLOAD_ERROR };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accepts exactly `{ occasion }` with one of OCCASIONS, matched exactly. Any other field,
 * such as a user or item ID, makes the payload invalid: the session decides whose wardrobe
 * is used, and generation chooses the items.
 */
export function parseGenerateOutfitPayload(body: unknown): GenerateOutfitPayloadResult {
  if (!isRecord(body) || Object.keys(body).some((key) => key !== 'occasion')) {
    return { ok: false, error: INVALID_PAYLOAD_ERROR };
  }
  const { occasion } = body;
  if (typeof occasion !== 'string' || !(OCCASIONS as readonly string[]).includes(occasion)) {
    return { ok: false, error: CHOOSE_OCCASION_ERROR };
  }
  return { ok: true, occasion: occasion as Occasion };
}

/** One item per outfit role at most: top, bottom, dress, outerwear, shoes, accessory. */
export const MAX_OUTFIT_ITEMS = 6;
const MAX_ITEM_ID_LENGTH = 64;

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
  if (
    !Array.isArray(itemIds) ||
    itemIds.length === 0 ||
    itemIds.length > MAX_OUTFIT_ITEMS ||
    !itemIds.every(isItemId) ||
    new Set(itemIds).size !== itemIds.length
  ) {
    return invalid;
  }
  return { ok: true, occasion: occasion as Occasion, itemIds: [...itemIds] };
}
