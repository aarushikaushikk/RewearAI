'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { ClothingCard } from '@/components/wardrobe/ClothingCard';
import {
  getLoadErrorMessage,
  LOAD_WARDROBE_FAILED_MESSAGE,
} from '@/components/wardrobe/wardrobeFormErrors';
import type { WardrobeItemDto } from '@/types/wardrobe';

/** Notices another page can send here with, in the `notice` prop. */
export type WardrobeNotice = 'deleted';

const NOTICE_MESSAGES: Record<WardrobeNotice, string> = {
  deleted: 'Clothing item deleted.',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; error: string }
  | { status: 'loaded'; items: WardrobeItemDto[] };

const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 text-base font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';

/**
 * The saved items in My Wardrobe (wireframe 03, US4). Search and filters (#10)
 * will narrow this same list; until then every item is shown.
 */
export function WardrobeGrid({ notice }: { notice?: WardrobeNotice }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/wardrobe', { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        setState({
          status: 'failed',
          error: getLoadErrorMessage(response.status, LOAD_WARDROBE_FAILED_MESSAGE),
        });
        return;
      }
      const { data } = (await response.json()) as { data: WardrobeItemDto[] };
      setState({ status: 'loaded', items: data });
    } catch {
      setState({ status: 'failed', error: LOAD_WARDROBE_FAILED_MESSAGE });
    }
  }, []);

  useEffect(() => {
    // Loading on mount is this effect's purpose; the state it sets comes from the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert variant="success" message={NOTICE_MESSAGES[notice]} />}
      <WardrobeContent state={state} onRetry={() => void load()} />
    </div>
  );
}

function WardrobeContent({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="sr-only">
          Loading your wardrobe…
        </p>
        <ul aria-hidden="true" className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="flex flex-col gap-2">
              <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-border" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-border" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error" message={state.error} />
        <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
          Retry
        </button>
      </div>
    );
  }

  const { items } = state;
  if (items.length === 0) {
    return (
      <section
        aria-labelledby="empty-wardrobe-heading"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6"
      >
        <h2 id="empty-wardrobe-heading" className="text-lg font-semibold text-text">
          Your wardrobe is empty.
        </h2>
        <p className="text-text-muted">Add a photo of something you own to start your wardrobe.</p>
        <Link
          href="/wardrobe/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-base font-semibold text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Add clothing
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-muted">
        Showing {items.length} of {items.length} {items.length === 1 ? 'item' : 'items'}
      </p>
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <ClothingCard item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
