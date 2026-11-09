'use client';

import React, { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** A specific action, such as "Delete clothing item" (DESIGN §6). */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** While true, both buttons are disabled and Escape does nothing. */
  isWorking?: boolean;
}

/**
 * Confirmation for a destructive action (DESIGN §4 ConfirmDialog). Opens with
 * focus on Cancel, keeps Tab inside, closes on Escape, and returns focus to
 * whatever opened it.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  isWorking = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Remembers the opener on opening and gives focus back on closing.
  useEffect(() => {
    if (!open) {
      return;
    }
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!isWorking) {
        onCancel();
      }
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const buttons = [...(dialogRef.current?.querySelectorAll('button') ?? [])];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 px-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id={titleId} className="text-xl font-semibold text-text">
          {title}
        </h2>
        <p id={messageId} className="mt-2 text-base text-text-muted">
          {message}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isWorking}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 text-base font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking}
            aria-busy={isWorking || undefined}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-danger px-4 text-base font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
