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
