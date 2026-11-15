'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import {
  displayName,
  OCCASION_LABELS,
  SECONDARY_ACTION,
  SIGN_IN_SESSION_ENDED_PATH,
} from '@/components/outfits/outfitDisplay';
import { OutfitItemImage } from '@/components/outfits/OutfitItemImage';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { SavedOutfitDto } from '@/types/outfit';

const REMOVE_FAILED_MESSAGE = "We couldn't remove this saved outfit. Try again.";

// Messages are chosen here, never taken from the response, so server text can't reach the user.
const STATUS_MESSAGES: Record<number, string> = {
  401: 'Your session has ended. Sign in again to continue.',
  403: "We couldn't verify this request. Refresh the page and try again.",
  503: 'Service temporarily unavailable. Please try again later.',
};

type RemoveState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'removing' }
  | { status: 'error'; message: string; sessionEnded: boolean };

/** "Oct 28", as on wireframe 10; the full date is kept in the <time> element. */
function savedDateLabel(savedAt: string): string {
  return new Date(savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface SavedOutfitCardProps {
  outfit: SavedOutfitDto;
  /** Called once the outfit is off the saved list, including when the server no longer has it. */
  onRemoved: (outfitId: string) => void;
}

/** One saved outfit (wireframe 10, US9): its photos, occasion, saved date, and Remove saved. */
export function SavedOutfitCard({ outfit, onRemoved }: SavedOutfitCardProps) {
  const [state, setState] = useState<RemoveState>({ status: 'idle' });
  // Blocks a second request before React re-renders the disabled buttons.
  const inFlight = useRef(false);
  const titleId = useId();
  const title = `${OCCASION_LABELS[outfit.occasion]} outfit`;

  async function remove() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setState({ status: 'removing' });

    let next: RemoveState | 'removed';
    try {
      const response = await fetch(`/api/outfits/saved/${encodeURIComponent(outfit.id)}`, {
        method: 'DELETE',
        headers: { Origin: window.location.origin },
      });
      // 404: the server has no such saved outfit for this user, so it is already off the list.
      next =
        response.ok || response.status === 404
          ? 'removed'
          : {
              status: 'error',
              message: STATUS_MESSAGES[response.status] ?? REMOVE_FAILED_MESSAGE,
              sessionEnded: response.status === 401,
            };
    } catch {
      next = { status: 'error', message: NETWORK_ERROR_MESSAGE, sessionEnded: false };
    }

    inFlight.current = false;
    if (next === 'removed') {
      onRemoved(outfit.id);
    } else {
      setState(next);
    }
  }

  return (
    <li
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5"
    >
      <ul aria-label={`Items in the ${title}`} className="grid grid-cols-2 gap-3">
        {outfit.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-background">
              {item.status === 'present' ? (
                <OutfitItemImage
                  url={item.image.url}
                  name={displayName(item)}
                  sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw"
                />
              ) : (
                // Never filled with a stand-in: the item is gone from the user's wardrobe.
                <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-sm text-text-muted">
                  Item removed from your wardrobe
                </div>
              )}
            </div>
            {item.status === 'present' && <p className="truncate text-sm text-text">{displayName(item)}</p>}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-text">
            {title}
          </h2>
          <p className="text-sm text-text-muted">
            <time dateTime={outfit.savedAt}>{`Saved ${savedDateLabel(outfit.savedAt)}`}</time>
          </p>
        </div>
        {state.status !== 'error' && (
          <button
            type="button"
            onClick={() => setState({ status: 'confirming' })}
            aria-describedby={titleId}
            disabled={state.status === 'removing'}
            className="inline-flex min-h-11 items-center rounded px-2 font-medium text-danger underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-danger disabled:opacity-60"
          >
            Remove saved
          </button>
        )}
      </div>

      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error" message={state.message} focusOnMount />
          {state.sessionEnded ? (
            <Link href={SIGN_IN_SESSION_ENDED_PATH} className={SECONDARY_ACTION}>
              Sign in
            </Link>
          ) : (
            // The user already confirmed, so Retry removes without asking again.
            <button type="button" onClick={() => void remove()} className={SECONDARY_ACTION}>
              Retry
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={state.status === 'confirming' || state.status === 'removing'}
        title="Remove this saved outfit?"
        message={`This removes the ${title.toLowerCase()} from Saved Outfits. Its clothing stays in your wardrobe.`}
        confirmLabel="Remove saved outfit"
        onConfirm={() => void remove()}
        onCancel={() => setState({ status: 'idle' })}
        isWorking={state.status === 'removing'}
      />
    </li>
  );
}
