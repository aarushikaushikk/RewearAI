'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectField } from '@/components/ui/SelectField';
import { ImageUploadField, UploadStatus } from '@/components/wardrobe/ImageUploadField';
import {
  focusFirstInvalidField,
  getSaveErrorMessage,
  getUploadErrorMessage,
  isRetryableUploadStatus,
  NETWORK_ERROR_MESSAGE,
  TOO_LARGE_MESSAGE,
  UNSUPPORTED_TYPE_MESSAGE,
} from '@/components/wardrobe/wardrobeFormErrors';
import { resizeImageForUpload } from '@/lib/images/resizeImage';
import { itemDisplayName } from '@/lib/wardrobe/itemDisplayName';
import { validateNewItemInput } from '@/lib/validation/wardrobeValidation';
import { getBrowserClassifier } from '@/services/classification/browser/getBrowserClassifier';
import { classifyClothingImage } from '@/services/classification/classifyClothingImage';
import {
  applySuggestions,
  confirmSuggestion,
  editReviewField,
  emptyReviewFields,
  fieldValues,
  hasAppliedSuggestions,
  hasUnreviewed,
  needsConfirmation,
  reviewErrors,
  reviewHint,
  ReviewField,
  ReviewFields,
} from '@/services/classification/reviewFields';
import type { ClassificationResult, ClassifiedField } from '@/types/classification';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/types/upload';
import {
  CATEGORIES,
  COLORS,
  FORMALITIES,
  SEASONS,
  WardrobeImage,
  WardrobeItemDto,
} from '@/types/wardrobe';

interface UploadState {
  status: UploadStatus;
  previewUrl?: string;
  /** Kept so a failed upload can be retried without choosing the file again. */
  blob?: Blob;
  image?: WardrobeImage;
  error?: string;
  /** False when sending the same photo again cannot succeed (wrong type, too large). */
  retryable?: boolean;
}

/** `manual`: the user chose to enter details without waiting for, or after, an analysis. */
type AnalysisState = { status: 'idle' | 'loading' | 'manual' } | ClassificationResult;

type FieldErrors = Partial<Record<ClassifiedField, string>>;

const ANALYZING_MESSAGE =
  'Analyzing your photo to suggest details. This can take a moment the first time, and you can start entering details now.';
const ANALYSIS_FAILED_MESSAGE = "We couldn't analyze this image. You can retry or enter details manually.";
const NOT_CLOTHING_MESSAGE = "This photo doesn't look like a clothing item. You can enter the details manually.";
const UNCERTAIN_MESSAGE = "We aren't confident about these details. Please review them before saving.";
const SUGGESTED_MESSAGE = "We've filled in details suggested from your photo. Check each one before saving.";

const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 text-sm font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * Add Clothing (DESIGN §5.4). Step 1 is wireframe 05: choose or drop a photo,
 * which uploads straight away. Step 2 follows wireframe 06's layout: the photo
 * beside the five details, then Confirm and save.
 *
 * Classification (US3, #8) runs in the browser on the resized photo while it
 * uploads. Suggestions fill only fields the user hasn't touched, uncertain
 * values must be confirmed or changed, and every failure leaves manual entry
 * (wireframe 07). Nothing is saved until the user confirms.
 */
export function AddClothingForm() {
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const [fields, setFields] = useState<ReviewFields>(emptyReviewFields);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: 'idle' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedItem, setSavedItem] = useState<WardrobeItemDto | null>(null);
  // Ignores the response for a photo the user has since replaced.
  const uploadAttempt = useRef(0);
  // Ignores a classification result for a replaced photo, a reset form, or a skipped analysis.
  const classifyAttempt = useRef(0);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const isDetailsStep = upload.status === 'uploaded';
  const details = fieldValues(fields);

  const previewUrl = upload.previewUrl;
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Moves keyboard and screen reader users to the new step.
  useEffect(() => {
    if (isDetailsStep) {
      detailsHeading.current?.focus();
    }
  }, [isDetailsStep]);

  function setDetail(field: ClassifiedField, value: string) {
    setFields((current) => editReviewField(current, field, value));
  }

  function setConfirmed(field: ClassifiedField, confirmed: boolean) {
    setFields((current) => confirmSuggestion(current, field, confirmed));
  }

  async function runClassification(blob: Blob) {
    const attempt = ++classifyAttempt.current;
    setAnalysis({ status: 'loading' });
    let result: ClassificationResult;
    try {
      result = await classifyClothingImage(blob, getBrowserClassifier());
    } catch {
      result = { status: 'failed', reason: 'unavailable' };
    }
    if (attempt !== classifyAttempt.current) {
      return;
    }
    setAnalysis(result);
    if (result.status === 'ok') {
      setFields((current) => applySuggestions(current, result.suggestions));
    }
  }

  function retryAnalysis() {
    if (upload.blob) {
      void runClassification(upload.blob);
      detailsHeading.current?.focus();
    }
  }

  function enterManually() {
    classifyAttempt.current++;
    setAnalysis({ status: 'manual' });
    document.getElementById('category')?.focus();
  }

  async function sendUpload(blob: Blob, preview: string) {
    const attempt = ++uploadAttempt.current;
    setUpload({ status: 'uploading', previewUrl: preview, blob });

    let next: UploadState;
    try {
      const form = new FormData();
      form.set('image', blob, 'clothing.jpg');
      const response = await fetch('/api/uploads', {
        method: 'POST',
        headers: { Origin: window.location.origin },
        body: form,
      });
      if (response.ok) {
        const { data } = (await response.json()) as { data: WardrobeImage };
        next = { status: 'uploaded', previewUrl: preview, blob, image: data };
      } else {
        next = {
          status: 'failed',
          previewUrl: preview,
          blob,
          error: getUploadErrorMessage(response.status),
          retryable: isRetryableUploadStatus(response.status),
        };
      }
    } catch {
      next = { status: 'failed', previewUrl: preview, blob, error: NETWORK_ERROR_MESSAGE, retryable: true };
    }
    if (attempt === uploadAttempt.current) {
      setUpload(next);
    }
  }

  async function handleSelect(file: File) {
    if (file.type && !(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      uploadAttempt.current++;
      setUpload({ status: 'failed', error: UNSUPPORTED_TYPE_MESSAGE });
      return;
    }
    const blob = await resizeImageForUpload(file);
    if (blob.size > MAX_IMAGE_BYTES) {
      uploadAttempt.current++;
      setUpload({ status: 'failed', error: TOO_LARGE_MESSAGE });
      return;
    }
    // A new photo starts from empty details; its analysis runs while it uploads.
    setFields(emptyReviewFields());
    void runClassification(blob);
    await sendUpload(blob, URL.createObjectURL(blob));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const input = { ...details, publicId: upload.image?.publicId ?? '' };
    const validation = validateNewItemInput(input);
    // US2's validation messages come first; an otherwise valid uncertain value still needs review.
    const errors: Record<string, string> = { ...reviewErrors(fields), ...validation.errors };
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstInvalidField(errors);
      return;
    }
    setFieldErrors({});

    setIsSaving(true);
    try {
      const response = await fetch('/api/wardrobe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify(input),
      });
      if (response.ok) {
        const { data } = (await response.json()) as { data: WardrobeItemDto };
        classifyAttempt.current++;
        setSavedItem(data);
      } else {
        setFormError(getSaveErrorMessage(response.status));
      }
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE);
    }
    setIsSaving(false);
  }

  function reset() {
    uploadAttempt.current++;
    classifyAttempt.current++;
    setUpload({ status: 'idle' });
    setFields(emptyReviewFields());
    setAnalysis({ status: 'idle' });
    setFieldErrors({});
    setFormError(null);
    setSavedItem(null);
  }

  if (savedItem) {
    const label = itemDisplayName(savedItem);
    return (
      <section aria-labelledby="saved-heading" className="flex flex-col gap-4">
        <Alert variant="success" message="Saved to your wardrobe." focusOnMount />
        <article className="w-full max-w-xs overflow-hidden rounded-xl border border-border bg-surface">
          <div className="relative aspect-[4/5] bg-background">
            <Image src={savedItem.image.url} alt={label} fill sizes="320px" className="object-contain" />
          </div>
          <div className="p-3">
            <h2 id="saved-heading" className="font-semibold text-text">
              {label}
            </h2>
            <p className="text-sm text-text-muted">
              {savedItem.category} · {savedItem.season} · {savedItem.formality}
            </p>
            <p className="text-sm text-text">{savedItem.isAvailable ? 'Available' : 'Unavailable'}</p>
          </div>
        </article>
        <PrimaryButton type="button" onClick={reset} className="sm:w-auto sm:self-start">
          Add another item
        </PrimaryButton>
      </section>
    );
  }

  if (!isDetailsStep) {
    return (
      <ImageUploadField
        id="image"
        status={upload.status}
        previewUrl={upload.previewUrl}
        uploadError={upload.error}
        onSelect={(file) => void handleSelect(file)}
        onRetry={
          upload.retryable && upload.blob && upload.previewUrl
            ? () => void sendUpload(upload.blob!, upload.previewUrl!)
            : undefined
        }
      />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
      <div className="relative h-72 w-full overflow-hidden rounded-xl border border-border bg-background md:h-auto md:aspect-[4/5]">
        <Image
          src={upload.previewUrl!}
          alt="Uploaded clothing photo"
          fill
          unoptimized
          className="object-contain"
        />
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        aria-labelledby="details-heading"
        className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
      >
        <div>
          <h1
            id="details-heading"
            ref={detailsHeading}
            tabIndex={-1}
            className="text-[1.75rem] md:text-3xl font-bold text-text"
          >
            Describe this item
          </h1>
          <p className="mt-1 text-text-muted">Check each detail before saving.</p>
        </div>

        {formError && (
          <Alert
            variant="error"
            message={formError}
            onDismiss={() => setFormError(null)}
            focusOnMount
          />
        )}

        <AnalysisNotice
          analysis={analysis}
          hasUnreviewed={hasUnreviewed(fields)}
          hasSuggestions={hasAppliedSuggestions(fields)}
          disabled={isSaving}
          onRetry={upload.blob ? retryAnalysis : undefined}
          onManual={enterManually}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <SelectField
              id="category"
              label="Category"
              value={details.category}
              options={CATEGORIES}
              onChange={(v) => setDetail('category', v)}
              required
              error={fieldErrors.category}
              hint={reviewHint(fields.category)}
              disabled={isSaving}
            />
            <ConfirmSuggestion field="category" state={fields.category} disabled={isSaving} onChange={setConfirmed} />
          </div>
          <div className="flex flex-col gap-1">
            <SelectField
              id="color"
              label="Color"
              value={details.color}
              options={COLORS}
              onChange={(v) => setDetail('color', v)}
              required
              error={fieldErrors.color}
              hint={reviewHint(fields.color)}
              disabled={isSaving}
            />
            <ConfirmSuggestion field="color" state={fields.color} disabled={isSaving} onChange={setConfirmed} />
          </div>
          <div className="flex flex-col gap-1">
            <FormField
              id="style"
              label="Style"
              type="text"
              value={details.style}
              onChange={(e) => setDetail('style', e.target.value)}
              required
              error={fieldErrors.style}
              hint={reviewHint(fields.style)}
              disabled={isSaving}
              placeholder="e.g. Button-down"
            />
            <ConfirmSuggestion field="style" state={fields.style} disabled={isSaving} onChange={setConfirmed} />
          </div>
          <div className="flex flex-col gap-1">
            <SelectField
              id="season"
              label="Season"
              value={details.season}
              options={SEASONS}
              onChange={(v) => setDetail('season', v)}
              required
              error={fieldErrors.season}
              hint={reviewHint(fields.season)}
              disabled={isSaving}
            />
            <ConfirmSuggestion field="season" state={fields.season} disabled={isSaving} onChange={setConfirmed} />
          </div>
          <div className="flex flex-col gap-1">
            <SelectField
              id="formality"
              label="Formality"
              value={details.formality}
              options={FORMALITIES}
              onChange={(v) => setDetail('formality', v)}
              required
              error={fieldErrors.formality}
              hint={reviewHint(fields.formality)}
              disabled={isSaving}
            />
            <ConfirmSuggestion
              field="formality"
              state={fields.formality}
              disabled={isSaving}
              onChange={setConfirmed}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <PrimaryButton isLoading={isSaving} className="sm:w-auto">
            Confirm and save
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

interface AnalysisNoticeProps {
  analysis: AnalysisState;
  hasUnreviewed: boolean;
  hasSuggestions: boolean;
  disabled: boolean;
  onRetry?: () => void;
  onManual: () => void;
}

/**
 * Classification progress and outcome (wireframes 06 and 07). Never moves focus on its own,
 * because results arrive while the user may be typing.
 */
function AnalysisNotice({
  analysis,
  hasUnreviewed,
  hasSuggestions,
  disabled,
  onRetry,
  onManual,
}: AnalysisNoticeProps) {
  const manualButton = (
    <button type="button" onClick={onManual} disabled={disabled} className={SECONDARY_BUTTON}>
      Enter details manually
    </button>
  );

  switch (analysis.status) {
    case 'loading':
      return (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-text">
            {ANALYZING_MESSAGE}
          </p>
          <div className="shrink-0">{manualButton}</div>
        </div>
      );
    case 'failed': {
      const notClothing = analysis.reason === 'not_clothing';
      return (
        <div className="flex flex-col gap-2">
          <Alert
            variant={notClothing ? 'warning' : 'error'}
            message={notClothing ? NOT_CLOTHING_MESSAGE : ANALYSIS_FAILED_MESSAGE}
          />
          <div className="flex flex-wrap gap-3">
            {onRetry && !notClothing && (
              <button type="button" onClick={onRetry} disabled={disabled} className={SECONDARY_BUTTON}>
                Retry analysis
              </button>
            )}
            {manualButton}
          </div>
        </div>
      );
    }
    case 'ok':
      if (hasUnreviewed) {
        return <Alert variant="warning" message={UNCERTAIN_MESSAGE} />;
      }
      return hasSuggestions ? (
        <p role="status" className="text-sm text-text-muted">
          {SUGGESTED_MESSAGE}
        </p>
      ) : null;
    default:
      return null;
  }
}

interface ConfirmSuggestionProps {
  field: ClassifiedField;
  state: ReviewField;
  disabled: boolean;
  onChange: (field: ClassifiedField, confirmed: boolean) => void;
}

/** Lets the user accept an uncertain suggestion as it is; changing the value also reviews it. */
function ConfirmSuggestion({ field, state, disabled, onChange }: ConfirmSuggestionProps) {
  if (!needsConfirmation(state)) {
    return null;
  }
  const id = `${field}-confirm`;
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm text-text">
      <input
        id={id}
        type="checkbox"
        checked={state.reviewed}
        disabled={disabled}
        onChange={(e) => onChange(field, e.target.checked)}
        className="h-5 w-5 accent-primary"
      />
      {state.suggested} is correct
    </label>
  );
}
