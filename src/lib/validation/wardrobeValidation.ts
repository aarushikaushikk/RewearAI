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
} from '@/types/wardrobe';

const MAX_NAME_LENGTH = 80;
const MAX_STYLE_LENGTH = 40;

/** The Add Clothing details as untrusted strings, before validation. */
export interface NewItemInput {
  publicId: string;
  /** Optional; the Add Clothing form doesn't ask for one (wireframes 05 and 06). */
  name?: string;
  category: string;
  color: string;
  style: string;
  season: string;
  formality: string;
}

const FIELDS: (keyof NewItemInput)[] = [
  'publicId',
  'name',
  'category',
  'color',
  'style',
  'season',
  'formality',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrows an untrusted body to the known string fields, dropping anything else,
 * such as an owner. Returns null when its shape is wrong. Missing fields become
 * empty strings so that validateNewItemInput can report them as field errors.
 */
export function parseNewItemPayload(body: unknown): NewItemInput | null {
  if (!isRecord(body)) {
    return null;
  }
  const input = {} as NewItemInput;
  for (const field of FIELDS) {
    const value = body[field];
    if (value !== undefined && typeof value !== 'string') {
      return null;
    }
    input[field] = value ?? '';
  }
  return input;
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

/** Converts input that passed validateNewItemInput into a typed, trimmed item. */
export function toNewWardrobeItem(input: NewItemInput): NewWardrobeItem {
  const name = (input.name ?? '').trim();
  return {
    publicId: input.publicId.trim(),
    name: name || null,
    category: input.category as Category,
    color: input.color as Color,
    style: input.style.trim(),
    season: input.season as Season,
    formality: input.formality as Formality,
  };
}
