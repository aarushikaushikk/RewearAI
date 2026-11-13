'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { OutfitItemImage } from '@/components/outfits/OutfitItemImage';
import { Alert } from '@/components/ui/Alert';
import { formatWornDate, isLocalDate } from '@/lib/dates/localDate';
import { itemDisplayName } from '@/lib/wardrobe/itemDisplayName';
import type { Occasion } from '@/types/outfit';
import type { MissingWornItemDto, OutfitHistoryEntryDto, WornItemDto } from '@/types/outfitHistory';

// Messages are chosen here, never taken from the response, so server text can't reach the user.
export const HISTORY_MESSAGES = {
  loading: 'Loading your outfit history…',
  failed: "We couldn't load your outfit history. Try again.",
  sessionEnded: 'Your session has ended. Sign in again to continue.',
  empty: "You haven't recorded an outfit yet.",
  missingItem: 'No longer in your wardrobe',
  noOccasion: 'Occasion not recorded',
} as const;

// Same as SIGN_IN_SESSION_ENDED_PATH, which lives in a server-only module; a test keeps them in sync.
const SIGN_IN_SESSION_ENDED_PATH = '/sign-in?reason=session-ended';

// As on the Create Outfit page.
const OCCASION_LABELS: Record<Occasion, string> = {
  work: 'Work',
  dinner: 'Dinner',
  weekend: 'Weekend',
  casual: 'Casual',
  formal: 'Formal',
};

const SECONDARY_ACTION =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';

const THUMBNAIL_SIZES = '(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string; sessionEnded?: boolean }
  | { status: 'loaded'; entries: OutfitHistoryEntryDto[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What's needed to name and show an item; a missing or unusable image gets a placeholder. */
function isWornItem(value: unknown): value is WornItemDto | MissingWornItemDto {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return false;
  }
  if (value.status === 'missing') {
    return true;
  }
  return (
    value.status === 'present' &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.color === 'string' &&
    typeof value.category === 'string' &&
    (value.image === undefined || isRecord(value.image))
  );
}

function isHistoryEntry(value: unknown): value is OutfitHistoryEntryDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isLocalDate(value.wornOn) &&
    (value.occasion === null || (typeof value.occasion === 'string' && Object.hasOwn(OCCASION_LABELS, value.occasion))) &&
    Array.isArray(value.items) &&
    value.items.every(isWornItem)
  );
}

/** The entries of a well-formed answer, or null for anything else. */
function entriesFrom(body: unknown): OutfitHistoryEntryDto[] | null {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    return null;
  }
  const { entries } = body.data;
  return Array.isArray(entries) && entries.every(isHistoryEntry) ? entries : null;
}

/**
 * Outfit History (DESIGN §5.8, US10): outfits marked as worn, newest worn date first as the
 * server orders them, with readable dates, the occasion, and the actual items. An item
 * since deleted keeps its place as an honest placeholder; nothing is invented for it.
 */
export function OutfitHistoryList() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/outfits/history', { headers: { Accept: 'application/json' } });
      if (response.status === 401) {
        setState({ status: 'failed', message: HISTORY_MESSAGES.sessionEnded, sessionEnded: true });
        return;
      }
      const entries = response.ok ? entriesFrom(await response.json().catch(() => null)) : null;
      setState(entries ? { status: 'loaded', entries } : { status: 'failed', message: HISTORY_MESSAGES.failed });
    } catch {
      setState({ status: 'failed', message: HISTORY_MESSAGES.failed });
    }
  }, []);

  useEffect(() => {
    // Loading on mount is this effect's purpose; the state it sets comes from the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="sr-only">
          {HISTORY_MESSAGES.loading}
        </p>
        <div aria-hidden="true" className="flex flex-col gap-6">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
              <div className="h-5 w-1/3 animate-pulse rounded bg-border" />
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 3 }, (_, item) => (
                  <div key={item} className="aspect-[4/5] animate-pulse rounded-xl bg-border" />
                ))}
              </div>
            </div>
          ))}
        </div>
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

  if (state.entries.length === 0) {
    return (
      <section
        aria-labelledby="empty-history-heading"
        className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6"
      >
        <h2 id="empty-history-heading" className="text-lg font-semibold text-text">
          {HISTORY_MESSAGES.empty}
        </h2>
        <p className="text-text-muted">Mark an outfit as worn on the Create Outfit page to see it here.</p>
        <Link href="/outfits/create" className={SECONDARY_ACTION}>
          Create an outfit
        </Link>
      </section>
    );
  }

  return (
    <ol aria-label="Worn outfits, newest first" className="flex flex-col gap-6">
      {state.entries.map((entry) => (
        <HistoryEntry key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function HistoryEntry({ entry }: { entry: OutfitHistoryEntryDto }) {
  const date = formatWornDate(entry.wornOn);
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-lg font-semibold text-text">
          <time dateTime={entry.wornOn}>{date}</time>
        </h2>
        <p className="text-text-muted">
          {entry.occasion ? `Occasion: ${OCCASION_LABELS[entry.occasion]}` : HISTORY_MESSAGES.noOccasion}
        </p>
      </div>
      <ul aria-label={`Items worn on ${date}`} className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {entry.items.map((item, index) => (
          // An item can only appear once in an outfit, but the index keeps keys unique regardless.
          <li key={`${item.id}-${index}`} className="overflow-hidden rounded-xl border border-border bg-surface">
            {item.status === 'present' ? <PresentItem item={item} /> : <MissingItem />}
          </li>
        ))}
      </ul>
    </li>
  );
}

function PresentItem({ item }: { item: WornItemDto }) {
  const name = itemDisplayName(item);
  return (
    <>
      <div className="relative aspect-[4/5] bg-background">
        <OutfitItemImage key={String(item.image?.url)} url={item.image?.url} name={name} sizes={THUMBNAIL_SIZES} />
      </div>
      <div className="p-2">
        <p className="break-words text-sm font-semibold text-text">{name}</p>
        <p className="text-xs text-text-muted">{item.category}</p>
      </div>
    </>
  );
}

function MissingItem() {
  return (
    <div className="flex aspect-[4/5] items-center justify-center bg-background p-2 text-center text-sm text-text-muted">
      {HISTORY_MESSAGES.missingItem}
    </div>
  );
}
