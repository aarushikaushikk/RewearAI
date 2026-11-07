import {
  CLASSIFIED_FIELDS,
  STYLE_MAX_LENGTH,
  type ClassificationResult,
  type ClassificationSuggestions,
  type FieldSuggestion,
} from "@/types/classification";
import { CATEGORIES, COLORS, FORMALITIES, SEASONS } from "@/types/wardrobe";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates one field. `parse` returns the allowed value, or `null` if the text isn't allowed.
 * Low or unreported confidence keeps the value but marks it uncertain.
 */
function normalizeField<T>(
  entry: unknown,
  parse: (text: string) => T | null,
): FieldSuggestion<T> {
  if (entry === undefined) return { status: "missing" };
  if (!isRecord(entry)) return { status: "invalid" };

  const { value, confidence } = entry;
  if (value === undefined || value === null) return { status: "missing" };
  if (typeof value !== "string") return { status: "invalid" };

  const text = value.trim();
  if (text === "") return { status: "missing" };

  const parsed = parse(text);
  if (parsed === null) return { status: "invalid" };

  return confidence === "high"
    ? { status: "suggested", value: parsed }
    : { status: "uncertain", value: parsed };
}

/** Exact, case-insensitive match to an allowed value; no fuzzy or synonym mapping. */
function enumParser<T extends string>(allowed: readonly T[]) {
  return (text: string): T | null =>
    allowed.find((option) => option.toLowerCase() === text.toLowerCase()) ?? null;
}

/** Rejects rather than truncates, so a cut-off guess is never shown as a suggestion. */
function parseStyle(text: string): string | null {
  if (text.length > STYLE_MAX_LENGTH || CONTROL_CHARACTERS.test(text)) return null;
  return text;
}

/**
 * Turns untrusted provider output into reviewable suggestions. Never fills in a value the
 * provider didn't give; the user confirms or corrects every field before anything is saved.
 */
export function normalizeClassification(raw: unknown): ClassificationResult {
  if (!isRecord(raw) || typeof raw.isClothing !== "boolean") {
    return { status: "failed", reason: "invalid_output" };
  }
  if (!raw.isClothing) return { status: "failed", reason: "not_clothing" };

  const suggestions: ClassificationSuggestions = {
    category: normalizeField(raw.category, enumParser(CATEGORIES)),
    color: normalizeField(raw.color, enumParser(COLORS)),
    style: normalizeField(raw.style, parseStyle),
    season: normalizeField(raw.season, enumParser(SEASONS)),
    formality: normalizeField(raw.formality, enumParser(FORMALITIES)),
  };

  return {
    status: "ok",
    suggestions,
    fieldsNeedingReview: CLASSIFIED_FIELDS.filter(
      (field) => suggestions[field].status !== "suggested",
    ),
  };
}
