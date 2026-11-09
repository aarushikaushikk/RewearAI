// Review state for the five classified fields on the Add Clothing details step (US3).
// Pure and client-safe. Rules:
// - Suggestions fill only fields the user hasn't edited, so late results never overwrite input.
// - Only `suggested` and `uncertain` suggestions carry a value; nothing is invented.
// - An uncertain value can't be saved until the user confirms it or changes it.

import {
  CLASSIFIED_FIELDS,
  type ClassificationSuggestions,
  type ClassifiedField,
  type FieldStatus,
} from "@/types/classification";

export interface ReviewField {
  value: string;
  /** `manual`: no suggestion applies (none arrived yet, or the user edited the field first). */
  status: FieldStatus | "manual";
  /** The value the classifier suggested, for `suggested` and `uncertain` fields. */
  suggested?: string;
  /** False only for an uncertain value the user hasn't yet confirmed or changed. */
  reviewed: boolean;
  /** True once the user has changed or confirmed this field. */
  edited: boolean;
}

export type ReviewFields = Record<ClassifiedField, ReviewField>;

export const CONFIRM_OR_CHANGE = "Confirm or change this value.";

const MANUAL: ReviewField = { value: "", status: "manual", reviewed: true, edited: false };

function mapFields(fn: (field: ClassifiedField) => ReviewField): ReviewFields {
  return Object.fromEntries(CLASSIFIED_FIELDS.map((f) => [f, fn(f)])) as ReviewFields;
}

export function emptyReviewFields(): ReviewFields {
  return mapFields(() => ({ ...MANUAL }));
}

export function applySuggestions(fields: ReviewFields, suggestions: ClassificationSuggestions): ReviewFields {
  return mapFields((f) => {
    const current = fields[f];
    if (current.edited) return { ...current, status: "manual", suggested: undefined, reviewed: true };
    const s = suggestions[f];
    if (s.status === "suggested" || s.status === "uncertain") {
      return { value: s.value, status: s.status, suggested: s.value, reviewed: s.status === "suggested", edited: false };
    }
    return { value: "", status: s.status, reviewed: true, edited: false };
  });
}

export function editReviewField(fields: ReviewFields, field: ClassifiedField, value: string): ReviewFields {
  const current = fields[field];
  // Changing an uncertain value reviews it; changing it back to the suggestion undoes that.
  const reviewed = current.status === "uncertain" ? value !== current.suggested : true;
  return { ...fields, [field]: { ...current, value, reviewed, edited: true } };
}

export function confirmSuggestion(fields: ReviewFields, field: ClassifiedField, confirmed: boolean): ReviewFields {
  return { ...fields, [field]: { ...fields[field], reviewed: confirmed, edited: true } };
}

export function fieldValues(fields: ReviewFields): Record<ClassifiedField, string> {
  return Object.fromEntries(CLASSIFIED_FIELDS.map((f) => [f, fields[f].value])) as Record<
    ClassifiedField,
    string
  >;
}

/** An uncertain suggestion that is still shown as suggested, so the user can tick it as correct. */
export function needsConfirmation(field: ReviewField): boolean {
  return field.status === "uncertain" && field.value === field.suggested;
}

/** True when at least one field currently holds a value the classifier suggested. */
export function hasAppliedSuggestions(fields: ReviewFields): boolean {
  return CLASSIFIED_FIELDS.some((f) => {
    const { status, value, suggested } = fields[f];
    return (status === "suggested" || status === "uncertain") && value === suggested;
  });
}

export function hasUnreviewed(fields: ReviewFields): boolean {
  return CLASSIFIED_FIELDS.some((f) => !fields[f].reviewed);
}

export function reviewErrors(fields: ReviewFields): Partial<Record<ClassifiedField, string>> {
  return Object.fromEntries(
    CLASSIFIED_FIELDS.filter((f) => !fields[f].reviewed).map((f) => [f, CONFIRM_OR_CHANGE]),
  );
}

/** Text describing where a field's value came from; never conveyed by color alone. */
export function reviewHint(field: ReviewField): string | undefined {
  switch (field.status) {
    case "suggested":
      return field.value === field.suggested ? "Suggested from your photo." : undefined;
    case "uncertain":
      if (field.value !== field.suggested) return undefined;
      return field.reviewed ? "Reviewed." : "Needs review. Confirm or change this suggestion.";
    case "missing":
      return field.value === "" ? "Not detected in your photo." : undefined;
    case "invalid":
      return field.value === "" ? "The suggestion couldn't be used." : undefined;
    default:
      return undefined;
  }
}
