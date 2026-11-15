'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import { Alert } from '@/components/ui/Alert';
import { formatWornDate, isLocalDate, todayLocalDate } from '@/lib/dates/localDate';
import type { Occasion } from '@/types/outfit';

// Messages are chosen here, never taken from the response, so server text can't reach the user.
export const MARK_WORN_MESSAGES = {
  recorded: (date: string) => `Recorded as worn on ${date}.`,
  alreadyRecorded: (date: string) => `You already recorded this outfit as worn on ${date}.`,
  failed: "We couldn't record this outfit as worn. Try again.",
  unconfirmed: "We couldn't confirm that this outfit was recorded. Try again.",
  network: NETWORK_ERROR_MESSAGE,
  sessionEnded: 'Your session has ended. Sign in again to continue.',
  invalid: "We couldn't record this outfit. Check that your device's date is correct, then refresh the page.",
  itemsGone: 'Some of these items are no longer in your wardrobe. Generate a new outfit to continue.',
  forbidden: "We couldn't verify this request. Refresh the page and try again.",
  unavailable: 'Service temporarily unavailable. Please try again later.',
} as const;

// Same as SIGN_IN_SESSION_ENDED_PATH, which lives in a server-only module; a test keeps them in sync.
const SIGN_IN_SESSION_ENDED_PATH = '/sign-in?reason=session-ended';

const SECONDARY_ACTION =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

type State =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'recorded'; created: boolean; wornOn: string }
  | { status: 'error'; message: string; canRetry: boolean; sessionEnded?: boolean };

/** Failures that sending the same request again can't fix. */
const FINAL_FAILURES: Record<number, State> = {
  400: { status: 'error', message: MARK_WORN_MESSAGES.invalid, canRetry: false },
  401: { status: 'error', message: MARK_WORN_MESSAGES.sessionEnded, canRetry: false, sessionEnded: true },
  403: { status: 'error', message: MARK_WORN_MESSAGES.forbidden, canRetry: false },
  404: { status: 'error', message: MARK_WORN_MESSAGES.itemsGone, canRetry: false },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accepts only a well-formed confirmation; anything else is treated as unconfirmed. */
function recordedFrom(body: unknown): State | null {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    return null;
  }
  const { created, entry } = body.data;
  if (typeof created !== 'boolean' || !isRecord(entry) || !isLocalDate(entry.wornOn)) {
    return null;
  }
  return { status: 'recorded', created, wornOn: entry.wornOn };
}

async function stateFor(response: Response): Promise<State> {
  if (response.ok) {
    const body: unknown = await response.json().catch(() => null);
    return recordedFrom(body) ?? { status: 'error', message: MARK_WORN_MESSAGES.unconfirmed, canRetry: true };
  }
  if (response.status === 503) {
    return { status: 'error', message: MARK_WORN_MESSAGES.unavailable, canRetry: true };
  }
  return FINAL_FAILURES[response.status] ?? { status: 'error', message: MARK_WORN_MESSAGES.failed, canRetry: true };
}

interface MarkAsWornButtonProps {
  /** The shown outfit's wardrobe item IDs. Their details are looked up on the server. */
  itemIds: string[];
  occasion: Occasion;
}

/**
 * Mark as worn (US10, DESIGN §5.6): records the shown outfit for the user's local date. The
 * server keeps one record per set of clothes per day, so Try again can't duplicate it; a
 * retry also reuses the first attempt's date, so it can't record a second day after midnight.
 */
export function MarkAsWornButton({ itemIds, occasion }: MarkAsWornButtonProps) {
  const [state, setState] = useState<State>({ status: 'idle' });
  // Blocks a second request before React re-renders the disabled button.
  const inFlight = useRef(false);
  const wornOn = useRef<string | null>(null);
  const isSaving = state.status === 'saving';

  async function record() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    wornOn.current ??= todayLocalDate();
    setState({ status: 'saving' });

    let next: State;
    try {
      const response = await fetch('/api/outfits/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ itemIds, occasion, wornOn: wornOn.current }),
      });
      next = await stateFor(response);
    } catch {
      next = { status: 'error', message: MARK_WORN_MESSAGES.network, canRetry: true };
    }

    inFlight.current = false;
    setState(next);
  }

  if (state.status === 'recorded') {
    const date = formatWornDate(state.wornOn);
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p role="status" className="text-text">
          {state.created ? MARK_WORN_MESSAGES.recorded(date) : MARK_WORN_MESSAGES.alreadyRecorded(date)}
        </p>
        <Link href="/outfits/history" className={`${SECONDARY_ACTION} self-start`}>
          View outfit history
        </Link>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error" message={state.message} focusOnMount />
        {state.sessionEnded ? (
          <Link href={SIGN_IN_SESSION_ENDED_PATH} className={`${SECONDARY_ACTION} self-start`}>
            Sign in
          </Link>
        ) : (
          state.canRetry && (
            <button type="button" onClick={() => void record()} className={`${SECONDARY_ACTION} self-start`}>
              Try again
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void record()}
      disabled={isSaving}
      aria-busy={isSaving || undefined}
      className={`${SECONDARY_ACTION} self-start`}
    >
      {isSaving ? 'Recording…' : 'Mark as worn'}
    </button>
  );
}
