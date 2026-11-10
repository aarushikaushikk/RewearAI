import { ValidationResult } from '@/types/auth';
import {
  CATEGORIES,
  Category,
  Color,
  COLORS,
  Formality,
  FORMALITIES,
  NewWardrobeItem,
  Season,
  SEASONS,
  WardrobeItemDetails,
} from '@/types/wardrobe';

const MAX_NAME_LENGTH = 80;
const MAX_STYLE_LENGTH = 40;

/** An item's editable details as untrusted strings, before validation. */
export interface ItemDetailsInput {
  /** Optional; the Add Clothing form doesn't ask for one (wireframes 05 and 06). */
  name?: string;
  category: string;
  color: string;
  style: string;
  season: string;
  formality: string;
}

/** The Add Clothing details as untrusted strings, before validation. */
export interface NewItemInput extends ItemDetailsInput {
  publicId: string;
}

const DETAIL_FIELDS: (keyof ItemDetailsInput)[] = [
  'name',
  'category',
  'color',
  'style',
  'season',
  'formality',
];

const NEW_ITEM_FIELDS: (keyof NewItemInput)[] = ['publicId', ...DETAIL_FIELDS];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrows an untrusted body to `fields`, dropping anything else, such as an owner.
 * Returns null when its shape is wrong. Missing fields become empty strings so
 * that validation can report them as field errors.
 */
function pickStringFields<T>(body: unknown, fields: (keyof T & string)[]): T | null {
  if (!isRecord(body)) {
    return null;
  }
  const input: Record<string, string> = {};
  for (const field of fields) {
    const value = body[field];
    if (value !== undefined && typeof value !== 'string') {
      return null;
    }
    input[field] = value ?? '';
  }
  return input as T;
}

/** Reads the Add Clothing body; see pickStringFields. */
export function parseNewItemPayload(body: unknown): NewItemInput | null {
  return pickStringFields<NewItemInput>(body, NEW_ITEM_FIELDS);
}

/** Reads an edit body (US4). The image, owner and availability are never taken from it. */
export function parseItemDetailsPayload(body: unknown): ItemDetailsInput | null {
  return pickStringFields<ItemDetailsInput>(body, DETAIL_FIELDS);
}

function isOneOf<T extends string>(allowed: readonly T[], value: string): value is T {
  return (allowed as readonly string[]).includes(value);
}

/**
 * Validates new item details. Errors are keyed by field ID, in the order the
 * fields appear on the Add Clothing form, so the first is the one to focus.
 */
export function validateNewItemInput(input: NewItemInput): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.publicId.trim()) {
    errors.image = 'Upload an image of the item.';
  }
  Object.assign(errors, validateItemDetails(input).errors);
  return { isValid: Object.keys(errors).length === 0, errors };
}

/** Validates an item's editable details with the Add Clothing rules (US4 uses the same). */
export function validateItemDetails(input: ItemDetailsInput): ValidationResult {
  const errors: Record<string, string> = {};

  if ((input.name ?? '').trim().length > MAX_NAME_LENGTH) {
    errors.name = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (!isOneOf(CATEGORIES, input.category)) {
    errors.category = 'Choose a category.';
  }
  if (!isOneOf(COLORS, input.color)) {
    errors.color = 'Choose a color.';
  }
  if (!isOneOf(SEASONS, input.season)) {
    errors.season = 'Choose a season.';
  }
  if (!isOneOf(FORMALITIES, input.formality)) {
    errors.formality = 'Choose a formality.';
  }
  const style = input.style.trim();
  if (!style) {
    errors.style = 'Enter a style.';
  } else if (style.length > MAX_STYLE_LENGTH) {
    errors.style = `Use ${MAX_STYLE_LENGTH} characters or fewer.`;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * Accepts exactly `{ isAvailable: boolean }`. Anything else, including a string such as
 * "false" or an extra field such as an owner, is rejected rather than coerced or dropped.
 */
export function parseAvailabilityPayload(body: unknown): { isAvailable: boolean } | null {
  if (!isRecord(body)) {
    return null;
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'isAvailable' || typeof body.isAvailable !== 'boolean') {
    return null;
  }
  return { isAvailable: body.isAvailable };
}

/** Converts input that passed validateNewItemInput into a typed, trimmed item. */
export function toNewWardrobeItem(input: NewItemInput): NewWardrobeItem {
  return { publicId: input.publicId.trim(), ...toItemDetails(input) };
}

/** Converts details that passed validateItemDetails into typed, trimmed values. */
export function toItemDetails(input: ItemDetailsInput): WardrobeItemDetails {
  const name = (input.name ?? '').trim();
  return {
    name: name || null,
    category: input.category as Category,
    color: input.color as Color,
    style: input.style.trim(),
    season: input.season as Season,
    formality: input.formality as Formality,
  };
}
