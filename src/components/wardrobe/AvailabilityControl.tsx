'use client';

import React, { useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { ITEM_GONE_MESSAGE, NETWORK_ERROR_MESSAGE } from '@/components/wardrobe/wardrobeFormErrors';
import type { WardrobeItemDto } from '@/types/wardrobe';

export interface AvailabilityControlProps {
  itemId: string;
  /** Names the item in the button's accessible name, e.g. "White Button-down". */
  itemLabel: string;
  /** The status as the server last reported it. */
  isAvailable: boolean;
  /** Called with the updated item after the server confirms a change. */
  onChange?: (item: WardrobeItemDto) => void;
}

const UPDATE_FAILED_MESSAGE = "We couldn't update availability. Try again.";

// Messages are chosen here, never taken from the response, so server text can't reach the user.
const STATUS_MESSAGES: Record<number, string> = {
  401: 'Your session has ended. Sign in again to continue.',
  403: "We couldn't verify this request. Refresh the page and try again.",
  404: ITEM_GONE_MESSAGE,
  503: 'Service temporarily unavailable. Please try again later.',
};

function isUpdatedItem(value: unknown, itemId: string): value is WardrobeItemDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Partial<WardrobeItemDto>;
  return item.id === itemId && typeof item.isAvailable === 'boolean';
}

/**
 * US6: shows whether an item is Available or Unavailable, as text, with a reversible action
 * (DESIGN §4 `AvailabilityControl`). The status changes only after the server confirms it; a
 * failure keeps the previous status and explains what went wrong.
 */
export function AvailabilityControl({ itemId, itemLabel, isAvailable, onChange }: AvailabilityControlProps) {
  const [status, setStatus] = useState(isAvailable);
  const [reported, setReported] = useState(isAvailable);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Blocks a second request before React re-renders the disabled button.
  const saving = useRef(false);

  // A new status from the parent (for example after a reload) replaces the shown one.
  if (isAvailable !== reported) {
    setReported(isAvailable);
    setStatus(isAvailable);
  }

  async function toggle() {
    if (saving.current) {
      return;
    }
    saving.current = true;
    setIsSaving(true);
    setError(null);
    setAnnouncement('');
    const next = !status;

    try {
      const response = await fetch(`/api/wardrobe/${encodeURIComponent(itemId)}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ isAvailable: next }),
      });
      const body = response.ok ? ((await response.json().catch(() => null)) as { data?: unknown } | null) : null;
      if (response.ok && isUpdatedItem(body?.data, itemId)) {
        setStatus(body.data.isAvailable);
        setAnnouncement(`${itemLabel} marked ${body.data.isAvailable ? 'available' : 'unavailable'}.`);
        onChange?.(body.data);
      } else {
        setError(response.ok ? UPDATE_FAILED_MESSAGE : (STATUS_MESSAGES[response.status] ?? UPDATE_FAILED_MESSAGE));
      }
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    }

    saving.current = false;
    setIsSaving(false);
  }

  const action = status ? 'Mark unavailable' : 'Mark available';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium',
            status ? 'bg-primary-soft text-primary' : 'bg-warning-soft text-warning',
          ].join(' ')}
        >
          <span aria-hidden="true">{status ? '●' : '○'}</span>
          {status ? 'Available' : 'Unavailable'}
        </span>

        <button
          type="button"
          onClick={() => void toggle()}
          disabled={isSaving}
          aria-busy={isSaving || undefined}
          className={[
            'inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-3',
            'text-sm font-medium text-text hover:bg-background',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {isSaving ? 'Saving…' : action}
          <span className="sr-only">: {itemLabel}</span>
        </button>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {error && <Alert variant="error" message={error} />}
    </div>
  );
}
