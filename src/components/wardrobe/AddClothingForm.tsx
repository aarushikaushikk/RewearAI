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
import { validateNewItemInput } from '@/lib/validation/wardrobeValidation';
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

interface Details {
  category: string;
  color: string;
  style: string;
  season: string;
  formality: string;
}

const EMPTY_DETAILS: Details = {
  category: '',
  color: '',
  style: '',
  season: '',
  formality: '',
};

type FieldErrors = Partial<Record<keyof Details, string>>;

/**
 * Add Clothing (DESIGN §5.4). Step 1 is wireframe 05: choose or drop a photo,
 * which uploads straight away. Step 2 follows wireframe 06's layout: the photo
 * beside the five details, then Confirm and save. Until classification (#8)
 * exists, the details start empty and nothing is called a suggestion.
 */
export function AddClothingForm() {
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedItem, setSavedItem] = useState<WardrobeItemDto | null>(null);
  // Ignores the response for a photo the user has since replaced.
  const uploadAttempt = useRef(0);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const isDetailsStep = upload.status === 'uploaded';

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

  function setDetail(field: keyof Details, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
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
    await sendUpload(blob, URL.createObjectURL(blob));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const input = { ...details, publicId: upload.image?.publicId ?? '' };
    const validation = validateNewItemInput(input);
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      focusFirstInvalidField(validation.errors);
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
    setUpload({ status: 'idle' });
    setDetails(EMPTY_DETAILS);
    setFieldErrors({});
    setFormError(null);
    setSavedItem(null);
  }

  if (savedItem) {
    const label = savedItem.name ?? `${savedItem.color} ${savedItem.style}`;
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

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="category"
            label="Category"
            value={details.category}
            options={CATEGORIES}
            onChange={(v) => setDetail('category', v)}
            required
            error={fieldErrors.category}
            disabled={isSaving}
          />
          <SelectField
            id="color"
            label="Color"
            value={details.color}
            options={COLORS}
            onChange={(v) => setDetail('color', v)}
            required
            error={fieldErrors.color}
            disabled={isSaving}
          />
          <FormField
            id="style"
            label="Style"
            type="text"
            value={details.style}
            onChange={(e) => setDetail('style', e.target.value)}
            required
            error={fieldErrors.style}
            disabled={isSaving}
            placeholder="e.g. Button-down"
          />
          <SelectField
            id="season"
            label="Season"
            value={details.season}
            options={SEASONS}
            onChange={(v) => setDetail('season', v)}
            required
            error={fieldErrors.season}
            disabled={isSaving}
          />
          <SelectField
            id="formality"
            label="Formality"
            value={details.formality}
            options={FORMALITIES}
            onChange={(v) => setDetail('formality', v)}
            required
            error={fieldErrors.formality}
            disabled={isSaving}
          />
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
