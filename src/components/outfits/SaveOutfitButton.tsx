'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import { SECONDARY_ACTION, SIGN_IN_SESSION_ENDED_PATH } from '@/components/outfits/outfitDisplay';
import { Alert } from '@/components/ui/Alert';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { Occasion } from '@/types/outfit';

export interface SaveOutfitButtonProps {
  occasion: Occasion;
  itemIds: string[];
}

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string; sessionEnded: boolean };

const SAVE_FAILED_MESSAGE = "We couldn't save your outfit. Try again.";

// Messages are chosen here, never taken from the response, so server text can't reach the user.
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Some of these items are no longer in your wardrobe. Generate a new outfit.',
  401: 'Your session has ended. Sign in again to continue.',
  403: "We couldn't verify this request. Refresh the page and try again.",
  503: 'Service temporarily unavailable. Please try again later.',
};

/**
 * Saves the outfit on screen (US9). A retried save returns the outfit already saved, so
 * pressing Save again after a failure never adds a duplicate. The parent gives each
 * generated outfit its own key, so a new outfit starts unsaved.
 */
export function SaveOutfitButton({ occasion, itemIds }: SaveOutfitButtonProps) {
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  // Blocks a second request before React re-renders the disabled button.
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setState({ status: 'saving' });

    let next: SaveState;
    try {
      const response = await fetch('/api/outfits/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ occasion, itemIds }),
      });
      next = response.ok
        ? { status: 'saved' }
        : {
            status: 'error',
            message: STATUS_MESSAGES[response.status] ?? SAVE_FAILED_MESSAGE,
            sessionEnded: response.status === 401,
          };
    } catch {
      next = { status: 'error', message: NETWORK_ERROR_MESSAGE, sessionEnded: false };
    }

    inFlight.current = false;
    setState(next);
  }

  const sessionEnded = state.status === 'error' && state.sessionEnded;

  return (
    <div className="flex flex-col gap-3">
      {sessionEnded ? (
        <Link href={SIGN_IN_SESSION_ENDED_PATH} className={`${SECONDARY_ACTION} self-start`}>
          Sign in
        </Link>
      ) : (
        <PrimaryButton
          type="button"
          onClick={() => void save()}
          isLoading={state.status === 'saving'}
          disabled={state.status === 'saved'}
          className="sm:w-auto self-start"
        >
          {state.status === 'saved' ? 'Saved' : 'Save outfit'}
        </PrimaryButton>
      )}

      {state.status === 'saved' && (
        <p role="status" className="text-sm text-text">
          Outfit saved.{' '}
          <Link href="/outfits/saved" className="font-medium text-primary underline hover:no-underline">
            View saved outfits
          </Link>
        </p>
      )}

      {state.status === 'error' && <Alert variant="error" message={state.message} focusOnMount />}
    </div>
  );
}
