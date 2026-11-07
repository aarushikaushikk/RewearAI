"use client";

import { useId, useState, type FormEvent } from "react";
import { normalizeStyle } from "@/services/classification/normalizeClassification";
import {
  CLASSIFIED_FIELDS,
  STYLE_MAX_LENGTH,
  type ClassificationResult,
  type ClassifiedField,
  type ConfirmedClothingAttributes,
  type FieldStatus,
} from "@/types/classification";
import { CATEGORIES, COLORS, FORMALITIES, SEASONS } from "@/types/wardrobe";

export interface ClassificationReviewProps {
  /** Preview of the selected or uploaded image (object URL or https URL). */
  imageUrl: string;
  imageAlt?: string;
  classification: { status: "loading" } | ClassificationResult;
  /** Called only with complete, reviewed values. Saving is the caller's job (US2). */
  onConfirm: (attributes: ConfirmedClothingAttributes) => void;
  /** Shown as "Retry analysis" after an analysis failure, if provided. */
  onRetry?: () => void;
  /** While true, the save button is disabled; the caller is saving. */
  isSubmitting?: boolean;
  /** A save failure from the caller; the form keeps the user's edits. */
  submitError?: string;
}

interface FieldState {
  value: string;
  /** `manual` means the user is entering this field with no suggestion. */
  status: FieldStatus | "manual";
  /** The original suggestion, for uncertain values the user must confirm. */
  suggested?: string;
  reviewed: boolean;
}

type FormFields = Record<ClassifiedField, FieldState>;

const LABELS: Record<ClassifiedField, string> = {
  category: "Category",
  color: "Color",
  style: "Style",
  season: "Season",
  formality: "Formality",
};

const OPTIONS: Record<Exclude<ClassifiedField, "style">, readonly string[]> = {
  category: CATEGORIES,
  color: COLORS,
  season: SEASONS,
  formality: FORMALITIES,
};

const STATUS_TEXT: Record<FieldStatus, string> = {
  suggested: "Suggested",
  uncertain: "Needs review",
  missing: "Not detected",
  invalid: "Suggestion not usable",
};

const REVIEW_MESSAGE = "Review or correct the highlighted details before saving.";
const UNCERTAIN_BANNER = "We aren't confident about these details. Please review them before saving.";
const ANALYSIS_FAILED = "We couldn't analyze this image. You can retry or enter details manually.";
const NOT_CLOTHING =
  "This image doesn't look like a clothing item. Choose another image or enter details manually.";

function emptyFields(): FormFields {
  const entries = CLASSIFIED_FIELDS.map((f) => [f, { value: "", status: "manual", reviewed: true }]);
  return Object.fromEntries(entries) as FormFields;
}

function fieldsFrom(classification: ClassificationReviewProps["classification"]): FormFields {
  if (classification.status !== "ok") return emptyFields();
  const entries = CLASSIFIED_FIELDS.map((f): [ClassifiedField, FieldState] => {
    const s = classification.suggestions[f];
    if (s.status === "suggested") return [f, { value: s.value, status: s.status, reviewed: true }];
    if (s.status === "uncertain") {
      return [f, { value: s.value, status: s.status, suggested: s.value, reviewed: false }];
    }
    return [f, { value: "", status: s.status, reviewed: true }];
  });
  return Object.fromEntries(entries) as FormFields;
}

function errorFor(field: ClassifiedField, state: FieldState): string | undefined {
  if (field === "style") {
    if (state.value.trim() === "") return "Enter a style.";
    if (normalizeStyle(state.value) === null) {
      return `Use up to ${STYLE_MAX_LENGTH} characters of plain text.`;
    }
  } else if (state.value === "") {
    return `Choose a ${LABELS[field].toLowerCase()}.`;
  }
  if (!state.reviewed) return "Confirm or change this value.";
  return undefined;
}

export function ClassificationReview({
  imageUrl,
  imageAlt = "Photo of the clothing item you selected",
  classification,
  onConfirm,
  onRetry,
  isSubmitting = false,
  submitError,
}: ClassificationReviewProps) {
  const id = useId();
  const [manual, setManual] = useState(false);
  const [fields, setFields] = useState(() => fieldsFrom(classification));
  const [source, setSource] = useState(classification);
  const [showErrors, setShowErrors] = useState(false);

  // A new result (for example after "Retry analysis") refills the form, unless the user has
  // switched to manual entry; their input is never overwritten.
  if (classification !== source) {
    setSource(classification);
    if (!manual) setFields(fieldsFrom(classification));
  }

  const errors = Object.fromEntries(
    CLASSIFIED_FIELDS.map((f) => [f, errorFor(f, fields[f])]),
  ) as Record<ClassifiedField, string | undefined>;
  const hasErrors = CLASSIFIED_FIELDS.some((f) => errors[f]);

  function startManualEntry() {
    setManual(true);
    setFields(emptyFields());
    setShowErrors(false);
  }

  function update(field: ClassifiedField, value: string) {
    setFields((prev) => {
      const current = prev[field];
      const reviewed = current.status === "uncertain" ? value !== current.suggested : true;
      return { ...prev, [field]: { ...current, value, reviewed } };
    });
  }

  function setReviewed(field: ClassifiedField, reviewed: boolean) {
    setFields((prev) => ({ ...prev, [field]: { ...prev[field], reviewed } }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    if (hasErrors || isSubmitting) return;
    onConfirm({
      category: fields.category.value as ConfirmedClothingAttributes["category"],
      color: fields.color.value as ConfirmedClothingAttributes["color"],
      style: normalizeStyle(fields.style.value) as string,
      season: fields.season.value as ConfirmedClothingAttributes["season"],
      formality: fields.formality.value as ConfirmedClothingAttributes["formality"],
    });
  }

  const showForm = manual || classification.status === "ok";
  const hasUncertain =
    !manual && CLASSIFIED_FIELDS.some((f) => fields[f].status === "uncertain");

  return (
    <section className="grid gap-6 text-[#202A25] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="aspect-[4/5] overflow-hidden rounded-xl border border-[#D7DED8] bg-[#F8F7F3]">
        {/* Plain img: previews are local object URLs, which next/image can't optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={imageAlt} className="h-full w-full object-contain" />
      </div>

      <div className="flex flex-col gap-4">
        {!showForm && classification.status === "loading" && (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-[#58655E]">
              Analyzing your image… This can take a moment the first time.
            </p>
            <SecondaryButton onClick={startManualEntry}>Enter details manually</SecondaryButton>
          </div>
        )}

        {!showForm && classification.status === "failed" && (
          <div className="flex flex-col gap-3 rounded-xl bg-[#FFF0EF] p-4">
            <p role="alert" className="text-[#A12828]">
              {classification.reason === "not_clothing" ? NOT_CLOTHING : ANALYSIS_FAILED}
            </p>
            <div className="flex flex-wrap gap-3">
              {onRetry && classification.reason !== "not_clothing" && (
                <SecondaryButton onClick={onRetry}>Retry analysis</SecondaryButton>
              )}
              <SecondaryButton onClick={startManualEntry}>Enter details manually</SecondaryButton>
            </div>
          </div>
        )}

        {showForm && (
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
            {hasUncertain && (
              <p className="rounded-xl bg-[#FFF5DE] p-3 text-[#865A13]">{UNCERTAIN_BANNER}</p>
            )}
            {showErrors && hasErrors && (
              <p role="alert" className="rounded-xl bg-[#FFF0EF] p-3 text-[#A12828]">
                {REVIEW_MESSAGE}
              </p>
            )}
            {submitError && (
              <p role="alert" className="rounded-xl bg-[#FFF0EF] p-3 text-[#A12828]">
                {submitError}
              </p>
            )}

            {CLASSIFIED_FIELDS.map((field) => (
              <AttributeField
                key={field}
                id={`${id}-${field}`}
                field={field}
                state={fields[field]}
                error={showErrors ? errors[field] : undefined}
                onChange={(value) => update(field, value)}
                onReviewedChange={(reviewed) => setReviewed(field, reviewed)}
              />
            ))}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="min-h-11 rounded-xl bg-[#245B45] px-5 font-semibold text-white hover:bg-[#194733] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245B45] disabled:opacity-60 md:self-end"
            >
              Save to My Wardrobe
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

interface AttributeFieldProps {
  id: string;
  field: ClassifiedField;
  state: FieldState;
  error?: string;
  onChange: (value: string) => void;
  onReviewedChange: (reviewed: boolean) => void;
}

function AttributeField({ id, field, state, error, onChange, onReviewedChange }: AttributeFieldProps) {
  const statusId = `${id}-status`;
  const errorId = `${id}-error`;
  const describedBy = [state.status !== "manual" && statusId, error && errorId]
    .filter(Boolean)
    .join(" ");
  const needsConfirm = state.status === "uncertain" && state.value === state.suggested;
  const control = {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy || undefined,
    className: `min-h-11 w-full rounded-xl border bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#245B45] ${
      error ? "border-[#A12828]" : state.status === "uncertain" && !state.reviewed ? "border-[#865A13]" : "border-[#D7DED8]"
    }`,
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="font-semibold">
          {LABELS[field]} <span className="text-sm font-normal text-[#58655E]">Required</span>
        </label>
        {state.status !== "manual" && (
          <span
            id={statusId}
            data-testid="field-status"
            className={`rounded-full px-2 text-sm ${
              state.status === "suggested" ? "bg-[#E8F1EB] text-[#245B45]" : "bg-[#FFF5DE] text-[#865A13]"
            }`}
          >
            {state.status === "uncertain" && state.reviewed ? "Reviewed" : STATUS_TEXT[state.status]}
          </span>
        )}
      </div>

      {field === "style" ? (
        <input
          {...control}
          type="text"
          value={state.value}
          maxLength={STYLE_MAX_LENGTH}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <select {...control} value={state.value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {OPTIONS[field].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {needsConfirm && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.reviewed}
            onChange={(e) => onReviewedChange(e.target.checked)}
            className="h-5 w-5 accent-[#245B45]"
          />
          {state.suggested} is correct
        </label>
      )}

      {error && (
        <p id={errorId} className="text-sm text-[#A12828]">
          {error}
        </p>
      )}
    </div>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl border border-[#245B45] bg-white px-4 font-semibold text-[#245B45] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245B45]"
    >
      {children}
    </button>
  );
}
