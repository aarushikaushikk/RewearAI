'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Alert } from '@/components/ui/Alert';
import { ACCEPTED_IMAGE_LABEL, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_LABEL } from '@/types/upload';

export type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'failed';

export interface ImageUploadFieldProps {
  id: string;
  status: UploadStatus;
  previewUrl?: string;
  /** A failed upload, shown with Retry when `onRetry` is given. */
  uploadError?: string;
  /** A validation error from submitting the form. */
  error?: string;
  disabled?: boolean;
  onSelect: (file: File) => void;
  onRetry?: () => void;
}

/** Choose or drop, preview, replace, and retry a clothing photo (DESIGN §4 ImageUploadField). */
export function ImageUploadField({
  id,
  status,
  previewUrl,
  uploadError,
  error,
  disabled,
  onSelect,
  onRetry,
}: ImageUploadFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [isDragOver, setIsDragOver] = useState(false);

  // Dropping is a shortcut for pointer users; the file input stays the keyboard path.
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !disabled) {
      onSelect(file);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="flex gap-1 items-baseline text-sm font-medium text-text">
        Clothing image
        <span className="text-sm text-text-muted font-normal">(Required)</span>
      </label>

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative aspect-[4/5] w-full overflow-hidden rounded-xl border bg-surface ${
          isDragOver ? 'border-2 border-dashed border-primary bg-primary-soft' : 'border-border'
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
          <p className="flex h-full items-center justify-center p-6 text-center text-text-muted">
            Drag a photo here, or choose one below.
          </p>
        )}
        {status === 'uploading' && (
          <p aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-surface/90 p-2 text-center text-sm">
            Uploading…
          </p>
        )}
      </div>

      <input
        id={id}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onSelect(file);
          }
          // Lets the same file be chosen again after an error.
          e.target.value = '';
        }}
        className="text-sm text-text file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-xl file:border file:border-text-muted file:bg-surface file:px-4 file:font-medium"
      />
      <p id={hintId} className="text-sm text-text-muted">
        {ACCEPTED_IMAGE_LABEL}, up to {MAX_IMAGE_LABEL}.
      </p>

      <p aria-live="polite" className="sr-only">
        {status === 'uploading' && 'Uploading image.'}
        {status === 'uploaded' && 'Image uploaded.'}
      </p>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {uploadError && (
        <div className="flex flex-col gap-2">
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
    </div>
  );
}
