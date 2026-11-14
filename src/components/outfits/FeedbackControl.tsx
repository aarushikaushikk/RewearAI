'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import { SECONDARY_ACTION, SIGN_IN_SESSION_ENDED_PATH } from '@/components/outfits/outfitDisplay';
import { Alert } from '@/components/ui/Alert';
import { FEEDBACK_RATINGS, type FeedbackRating, type Occasion, type OutfitFeedbackDto } from '@/types/outfit';

// Messages are chosen here, never taken from the response, so server text can't reach the user.
export const FEEDBACK_MESSAGES = {
  explainer: 'Outfits you mark Not helpful are skipped for this occasion when another combination is available.',
  saved: 'Feedback saved.',
  cleared: 'Feedback cleared.',
  failed: "We couldn't save your feedback. Try again.",
  network: NETWORK_ERROR_MESSAGE,
  sessionEnded: 'Your session has ended. Sign in again to continue.',
  forbidden: "We couldn't verify this request. Refresh the page and try again.",
  itemsGone: 'Some of these items are no longer in your wardrobe. Generate a new outfit.',
  outfitGone: "We couldn't find this outfit. Generate a new outfit.",
} as const;

const RATING_LABELS: Record<FeedbackRating, string> = {
  positive: 'Helpful',
  negative: 'Not helpful',
};

type Action = { kind: 'rate'; rating: FeedbackRating } | { kind: 'clear'; outfitId: string };

type Notice =
  | { status: 'none' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string; retry: Action | null; sessionEnded?: boolean };

/** Failures that sending the same request again can't fix. */
function finalFailure(status: number, action: Action): Notice | null {
  switch (status) {
    case 401:
      return { status: 'error', message: FEEDBACK_MESSAGES.sessionEnded, retry: null, sessionEnded: true };
    case 403:
      return { status: 'error', message: FEEDBACK_MESSAGES.forbidden, retry: null };
    case 400:
    case 404:
      return {
        status: 'error',
        message: action.kind === 'rate' ? FEEDBACK_MESSAGES.itemsGone : FEEDBACK_MESSAGES.outfitGone,
        retry: null,
      };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A saved rating, or null when `value` isn't a well-formed one. Also checks the generate response. */
export function parseOutfitFeedback(value: unknown): OutfitFeedbackDto | null {
  if (!isRecord(value) || typeof value.outfitId !== 'string' || value.outfitId === '') {
    return null;
  }
  const rating = FEEDBACK_RATINGS.find((r) => r === value.rating);
  return rating ? { outfitId: value.outfitId, rating } : null;
}

export interface FeedbackControlProps {
  occasion: Occasion;
  /** The shown outfit's wardrobe item IDs. The server finds or creates the outfit for them. */
  itemIds: string[];
  /** The rating already saved for this outfit, as the generate response reported it. */
  initial: OutfitFeedbackDto | null;
}

/**
 * Recommendation feedback (US14, DESIGN §5.6, wireframe 09): Helpful / Not helpful, which the
 * user can change or clear. Pressed state always shows what the server confirmed, so a failed
 * request leaves the saved choice visible. The parent keys it by outfit, so a new outfit starts
 * from its own saved state.
 */
export function FeedbackControl({ occasion, itemIds, initial }: FeedbackControlProps) {
  const [saved, setSaved] = useState<OutfitFeedbackDto | null>(initial);
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice>({ status: 'none' });
  // Blocks a second request before React re-renders the disabled buttons.
  const inFlight = useRef(false);
  const headingId = useId();

  async function send(action: Action): Promise<Notice> {
    try {
      const response =
        action.kind === 'rate'
          ? await fetch('/api/outfits/feedback', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
              body: JSON.stringify({ occasion, itemIds, rating: action.rating }),
            })
          : await fetch(`/api/outfits/feedback/${encodeURIComponent(action.outfitId)}`, {
              method: 'DELETE',
              headers: { Origin: window.location.origin },
            });
      if (!response.ok) {
        return finalFailure(response.status, action) ?? { status: 'error', message: FEEDBACK_MESSAGES.failed, retry: action };
      }
      if (action.kind === 'clear') {
        setSaved(null);
        return { status: 'done', message: FEEDBACK_MESSAGES.cleared };
      }
      const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
      const confirmed = parseOutfitFeedback(body?.data);
      if (!confirmed || confirmed.rating !== action.rating) {
        return { status: 'error', message: FEEDBACK_MESSAGES.failed, retry: action };
      }
      setSaved(confirmed);
      return { status: 'done', message: FEEDBACK_MESSAGES.saved };
    } catch {
      return { status: 'error', message: FEEDBACK_MESSAGES.network, retry: action };
    }
  }

  async function run(action: Action) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(action);
    setNotice({ status: 'none' });

    const next = await send(action);

    inFlight.current = false;
    setPending(null);
    setNotice(next);
  }

  function rate(rating: FeedbackRating) {
    // Already saved: nothing to change.
    if (saved?.rating === rating) {
      return;
    }
    void run({ kind: 'rate', rating });
  }

  const busy = pending !== null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5"
    >
      <h3 id={headingId} className="font-semibold text-text">
        Was this recommendation helpful?
      </h3>
      <div role="group" aria-labelledby={headingId} className="flex flex-wrap items-center gap-3">
        {FEEDBACK_RATINGS.map((rating) => {
          const chosen = saved?.rating === rating;
          const loading = pending?.kind === 'rate' && pending.rating === rating;
          return (
            <button
              key={rating}
              type="button"
              onClick={() => rate(rating)}
              disabled={busy}
              aria-pressed={chosen}
              aria-busy={loading || undefined}
              className={[
                'inline-flex min-h-11 min-w-32 items-center justify-center rounded-full border px-5 font-medium',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-60',
                chosen
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-surface text-text hover:bg-background',
              ].join(' ')}
            >
              {RATING_LABELS[rating]}
            </button>
          );
        })}
        {saved && (
          <button
            type="button"
            onClick={() => void run({ kind: 'clear', outfitId: saved.outfitId })}
            disabled={busy}
            aria-busy={pending?.kind === 'clear' || undefined}
            className="inline-flex min-h-11 items-center px-2 font-medium text-primary underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear feedback
          </button>
        )}
      </div>
      <p className="text-sm text-text-muted">{FEEDBACK_MESSAGES.explainer}</p>

      {notice.status === 'done' && (
        <p role="status" className="text-sm text-text">
          {notice.message}
        </p>
      )}
      {notice.status === 'error' && (
        <div className="flex flex-col gap-3">
          <Alert variant="error" message={notice.message} focusOnMount />
          {notice.sessionEnded ? (
            <Link href={SIGN_IN_SESSION_ENDED_PATH} className={`${SECONDARY_ACTION} self-start`}>
              Sign in
            </Link>
          ) : (
            notice.retry && (
              <button
                type="button"
                onClick={() => void run(notice.retry!)}
                disabled={busy}
                className={`${SECONDARY_ACTION} self-start disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Retry
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
