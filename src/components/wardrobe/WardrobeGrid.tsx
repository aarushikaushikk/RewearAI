'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { ClothingCard } from '@/components/wardrobe/ClothingCard';
import { FilterBar } from '@/components/wardrobe/FilterBar';
import {
  getLoadErrorMessage,
  LOAD_WARDROBE_FAILED_MESSAGE,
} from '@/components/wardrobe/wardrobeFormErrors';
import {
  EMPTY_FILTERS,
  filterWardrobeItems,
  hasActiveFilters,
  type WardrobeFilters,
} from '@/services/filterWardrobeItems';
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
 * The saved items in My Wardrobe (wireframe 03, US4), narrowed by search and
 * filters (US5). The filters live here, so a failed load and retry keeps them.
 */
export function WardrobeGrid({ notice }: { notice?: WardrobeNotice }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filters, setFilters] = useState<WardrobeFilters>(EMPTY_FILTERS);

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

  // An empty wardrobe has nothing to search, so the filters are not offered.
  const showFilters = !(state.status === 'loaded' && state.items.length === 0);

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert variant="success" message={NOTICE_MESSAGES[notice]} />}
      {showFilters && <FilterBar filters={filters} onChange={setFilters} />}
      <WardrobeContent
        state={state}
        filters={filters}
        onClearFilters={() => setFilters(EMPTY_FILTERS)}
        onRetry={() => void load()}
      />
    </div>
  );
}

interface WardrobeContentProps {
  state: LoadState;
  filters: WardrobeFilters;
  onClearFilters: () => void;
  onRetry: () => void;
}

function WardrobeContent({ state, filters, onClearFilters, onRetry }: WardrobeContentProps) {
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

  return <LoadedWardrobe items={state.items} filters={filters} onClearFilters={onClearFilters} />;
}

function LoadedWardrobe({
  items,
  filters,
  onClearFilters,
}: {
  items: WardrobeItemDto[];
  filters: WardrobeFilters;
  onClearFilters: () => void;
}) {
  const shown = useMemo(() => filterWardrobeItems(items, filters), [items, filters]);

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
      <div className="flex items-center justify-between gap-4">
        <p role="status" className="text-text-muted">
          Showing {shown.length} of {items.length} {items.length === 1 ? 'item' : 'items'}
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          disabled={!hasActiveFilters(filters)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-base font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
        >
          Clear filters
        </button>
      </div>

      {shown.length === 0 ? (
        <section
          aria-labelledby="no-matches-heading"
          className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-6"
        >
          <h2 id="no-matches-heading" className="text-lg font-semibold text-text">
            No items match your search and filters.
          </h2>
          <p className="text-text-muted">
            Change your search, or clear filters to see your whole wardrobe.
          </p>
        </section>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((item) => (
            <li key={item.id}>
              <ClothingCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
