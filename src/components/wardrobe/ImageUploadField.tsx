'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { HOME_PATH } from '@/lib/routes';
import { ACCEPTED_IMAGE_LABEL, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_LABEL } from '@/types/upload';

export type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'failed';

export interface ImageUploadFieldProps {
  id: string;
  status: UploadStatus;
  previewUrl?: string;
  /** Why the last choice or upload failed. */
  uploadError?: string;
  onSelect: (file: File) => void;
  /** Given only when sending the same photo again could succeed. */
  onRetry?: () => void;
}

/**
 * Upload step of Add Clothing (wireframe 05): a card with a drop zone that
 * becomes the preview, the format and size rules, Choose photo, and Cancel.
 */
export function ImageUploadField({
  id,
  status,
  previewUrl,
  uploadError,
  onSelect,
  onRetry,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const isUploading = status === 'uploading';
  const hintId = `${id}-hint`;

  // Dropping is a shortcut for pointer users; Choose photo is the keyboard path.
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isUploading) {
      setIsDragOver(true);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !isUploading) {
      onSelect(file);
    }
  }

  const rules = (
    <p id={hintId} className="text-sm text-text-muted">
      {ACCEPTED_IMAGE_LABEL}, up to {MAX_IMAGE_LABEL}.
    </p>
  );

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="w-full max-w-xl rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      <h1 id={`${id}-heading`} className="text-[1.75rem] md:text-3xl font-bold text-text">
        Upload a clothing photo
      </h1>
      <p className="mt-1 text-text-muted">Only photos of clothing you own</p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative mt-4 flex h-64 sm:h-72 flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 p-6 text-center ${
          isDragOver ? 'border-dashed border-primary bg-primary-soft' : 'border-border bg-background'
        }`}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Preview of the selected clothing photo"
            fill
            unoptimized
            className="object-contain"
          />
        ) : (
          <>
            <p className="text-text">Choose image or drag a file here</p>
            {rules}
          </>
        )}
        {isUploading && (
          <p aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-surface/90 p-2 text-sm">
            Uploading…
          </p>
        )}
      </div>
      {previewUrl && <div className="mt-2">{rules}</div>}

      <label htmlFor={id} className="sr-only">
        Clothing image
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        disabled={isUploading}
        tabIndex={-1}
        aria-describedby={hintId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onSelect(file);
          }
          // Lets the same file be chosen again after an error.
          e.target.value = '';
        }}
        className="sr-only"
      />

      <p aria-live="polite" className="sr-only">
        {isUploading && 'Uploading image.'}
      </p>

      {uploadError && (
        <div className="mt-4 flex flex-col gap-2">
          <Alert variant="error" message={uploadError} />
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="self-start min-h-11 rounded-xl border border-danger px-4 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              Retry upload
            </button>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PrimaryButton type="button" onClick={() => inputRef.current?.click()} disabled={isUploading}>
          {uploadError ? 'Choose another' : 'Choose photo'}
        </PrimaryButton>
        <Link
          href={HOME_PATH}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 font-medium text-text hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </section>
  );
}
