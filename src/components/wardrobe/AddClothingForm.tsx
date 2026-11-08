'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectField } from '@/components/ui/SelectField';
import { ImageUploadField, UploadStatus } from '@/components/wardrobe/ImageUploadField';
import {
  focusFirstInvalidField,
  getSaveErrorMessage,
  getUploadErrorMessage,
  NETWORK_ERROR_MESSAGE,
  TOO_LARGE_MESSAGE,
  UNSUPPORTED_TYPE_MESSAGE,
} from '@/components/wardrobe/wardrobeFormErrors';
import { resizeImageForUpload } from '@/lib/images/resizeImage';
import { HOME_PATH } from '@/lib/routes';
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
}

interface Details {
  name: string;
  category: string;
  color: string;
  style: string;
  season: string;
  formality: string;
}

const EMPTY_DETAILS: Details = {
  name: '',
  category: '',
  color: '',
  style: '',
  season: '',
  formality: '',
};

type FieldErrors = Partial<Record<keyof Details | 'image', string>>;

/** Add Clothing flow (DESIGN §5.4): choose and preview a photo, describe it, save. */
export function AddClothingForm() {
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedItem, setSavedItem] = useState<WardrobeItemDto | null>(null);
  // Ignores the response for a photo the user has since replaced.
  const uploadAttempt = useRef(0);

  const previewUrl = upload.previewUrl;
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function setDetail(field: keyof Details, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  async function sendUpload(blob: Blob, preview: string) {
    const attempt = ++uploadAttempt.current;
    setUpload({ status: 'uploading', previewUrl: preview, blob });
    setFieldErrors((current) => {
      const rest = { ...current };
      delete rest.image;
      return rest;
    });

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
        next = { status: 'failed', previewUrl: preview, blob, error: getUploadErrorMessage(response.status) };
      }
    } catch {
      next = { status: 'failed', previewUrl: preview, blob, error: NETWORK_ERROR_MESSAGE };
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
    if (upload.status === 'uploading') {
      validation.errors = { image: 'Wait for the image to finish uploading.', ...validation.errors };
      validation.isValid = false;
    }
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

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
    >
      <ImageUploadField
        id="image"
        status={upload.status}
        previewUrl={upload.previewUrl}
        uploadError={upload.error}
        error={fieldErrors.image}
        disabled={isSaving}
        onSelect={(file) => void handleSelect(file)}
        onRetry={
          upload.blob && upload.previewUrl
            ? () => void sendUpload(upload.blob!, upload.previewUrl!)
            : undefined
        }
      />

      <div className="flex flex-col gap-5">
        {formError && (
          <Alert
            variant="error"
            message={formError}
            onDismiss={() => setFormError(null)}
            focusOnMount
          />
        )}

        <FormField
          id="name"
          label="Name"
          type="text"
          value={details.name}
          onChange={(e) => setDetail('name', e.target.value)}
          optional
          error={fieldErrors.name}
          disabled={isSaving}
          placeholder="e.g. White linen shirt"
        />

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

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={HOME_PATH}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 font-medium text-text hover:bg-background"
          >
            Cancel
          </Link>
          <PrimaryButton isLoading={isSaving} className="sm:w-auto">
            Save to My Wardrobe
          </PrimaryButton>
        </div>
      </div>
    </form>
  );
}
