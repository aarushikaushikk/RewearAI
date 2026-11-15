import { isCurrentDateSomewhere } from '@/lib/dates/localDate';
import { INVALID_PAYLOAD_ERROR } from '@/lib/validation/outfitValidation';
import { MAX_OUTFIT_ITEMS } from '@/services/outfitHistory/outfitCombination';
import { OCCASIONS, type Occasion } from '@/types/outfit';
import type { MarkOutfitWornInput } from '@/types/outfitHistory';

export { INVALID_PAYLOAD_ERROR };
export const INVALID_WORN_DATE_ERROR = "The worn date must be today's date.";

export type MarkWornPayloadResult =
  | { ok: true; value: MarkOutfitWornInput }
  | { ok: false; error: typeof INVALID_PAYLOAD_ERROR | typeof INVALID_WORN_DATE_ERROR };

const PAYLOAD_KEYS = ['itemIds', 'occasion', 'wornOn'];
// Covers stored ObjectIds; anything else can't name a wardrobe item.
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseItemIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OUTFIT_ITEMS) {
    return null;
  }
  if (!value.every((id): id is string => typeof id === 'string' && ITEM_ID_PATTERN.test(id))) {
    return null;
  }
  const ids = value.map((id) => id.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
}

/**
 * Accepts exactly `{ itemIds, occasion, wornOn }`. Only item IDs are taken from the client:
 * the session decides whose wardrobe is used, and item details come from the wardrobe.
 * `wornOn` must be today's date in some time zone, so it can't be backdated or in the future.
 */
export function parseMarkWornPayload(body: unknown, now: Date = new Date()): MarkWornPayloadResult {
  if (
    !isRecord(body) ||
    Object.keys(body).length !== PAYLOAD_KEYS.length ||
    !PAYLOAD_KEYS.every((key) => Object.hasOwn(body, key))
  ) {
    return { ok: false, error: INVALID_PAYLOAD_ERROR };
  }
  const itemIds = parseItemIds(body.itemIds);
  const { occasion, wornOn } = body;
  if (!itemIds || typeof occasion !== 'string' || !(OCCASIONS as readonly string[]).includes(occasion)) {
    return { ok: false, error: INVALID_PAYLOAD_ERROR };
  }
  if (typeof wornOn !== 'string') {
    return { ok: false, error: INVALID_PAYLOAD_ERROR };
  }
  if (!isCurrentDateSomewhere(wornOn, now)) {
    return { ok: false, error: INVALID_WORN_DATE_ERROR };
  }
  return { ok: true, value: { itemIds, occasion: occasion as Occasion, wornOn } };
}
