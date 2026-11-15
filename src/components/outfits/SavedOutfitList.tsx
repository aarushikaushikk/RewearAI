'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SECONDARY_ACTION, SIGN_IN_SESSION_ENDED_PATH } from '@/components/outfits/outfitDisplay';
import { SavedOutfitCard } from '@/components/outfits/SavedOutfitCard';
import { Alert } from '@/components/ui/Alert';
import type { SavedOutfitDto } from '@/types/outfit';

const LOAD_FAILED_MESSAGE = "We couldn't load your saved outfits. Try again.";
const SESSION_ENDED_MESSAGE = 'Your session has ended. Sign in again to continue.';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string; sessionEnded: boolean }
  | { status: 'loaded'; outfits: SavedOutfitDto[] };

/** The Saved Outfits list (wireframe 10, US9), most recently saved first. */
export function SavedOutfitList() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [removedNotice, setRemovedNotice] = useState(false);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/outfits/saved', { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const sessionEnded = response.status === 401;
        setState({
          status: 'failed',
          message: sessionEnded ? SESSION_ENDED_MESSAGE : LOAD_FAILED_MESSAGE,
          sessionEnded,
        });
        return;
      }
      const { data } = (await response.json()) as { data: SavedOutfitDto[] };
      setState({ status: 'loaded', outfits: data });
    } catch {
      setState({ status: 'failed', message: LOAD_FAILED_MESSAGE, sessionEnded: false });
    }
  }, []);

  useEffect(() => {
    // Loading on mount is this effect's purpose; the state it sets comes from the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function handleRemoved(outfitId: string) {
    setState((current) =>
      current.status === 'loaded'
        ? { status: 'loaded', outfits: current.outfits.filter((outfit) => outfit.id !== outfitId) }
        : current,
    );
    setRemovedNotice(true);
  }

  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="sr-only">
          Loading your saved outfits…
        </p>
        <ul aria-hidden="true" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="aspect-[4/5] animate-pulse rounded-xl bg-border" />
                <div className="aspect-[4/5] animate-pulse rounded-xl bg-border" />
              </div>
              <div className="h-4 w-1/2 animate-pulse rounded bg-border" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error" message={state.message} />
        {state.sessionEnded ? (
          <Link href={SIGN_IN_SESSION_ENDED_PATH} className={SECONDARY_ACTION}>
            Sign in
          </Link>
        ) : (
          <button type="button" onClick={() => void load()} className={SECONDARY_ACTION}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {removedNotice && (
        <p role="status" className="rounded-xl border border-primary bg-primary-soft px-4 py-3 text-sm text-text">
          Saved outfit removed.
        </p>
      )}

      {state.outfits.length === 0 ? (
        <section
          aria-labelledby="no-saved-outfits-heading"
          className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6"
        >
          <h2 id="no-saved-outfits-heading" className="text-xl font-semibold text-text">
            No saved outfits yet
          </h2>
          <p className="text-text-muted">Save an outfit you like on Create Outfit to find it here again.</p>
          <Link href="/outfits/create" className={SECONDARY_ACTION}>
            Create an outfit
          </Link>
        </section>
      ) : (
        <ul aria-label="Saved outfits" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {state.outfits.map((outfit) => (
            <SavedOutfitCard key={outfit.id} outfit={outfit} onRemoved={handleRemoved} />
          ))}
        </ul>
      )}
    </div>
  );
}
