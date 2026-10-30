"use client";

import { useMemo, useState } from "react";
import { ClothingCard } from "@/components/ClothingCard";
import {
  emptyFilters,
  filterClothing,
  getFilterOptions,
  hasActiveFilters,
  type ClothingFilters,
} from "@/services/filterClothing";
import type { ClothingItem } from "@/types/clothing";

type SelectFilterKey = Exclude<keyof ClothingFilters, "query">;

const fieldClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-100";

export function WardrobeBrowser({ items }: { items: ClothingItem[] }) {
  const [filters, setFilters] = useState<ClothingFilters>(emptyFilters);

  const options = useMemo(() => getFilterOptions(items), [items]);
  const visibleItems = useMemo(() => filterClothing(items, filters), [items, filters]);
  const filtersActive = hasActiveFilters(filters);

  const selectFilters: { key: SelectFilterKey; label: string; values: string[] }[] = [
    { key: "category", label: "Category", values: options.categories },
    { key: "color", label: "Color", values: options.colors },
    { key: "season", label: "Season", values: options.seasons },
    { key: "formality", label: "Formality", values: options.formalities },
  ];

  const clearFilters = () => setFilters(emptyFilters);

  if (items.length === 0) {
    return (
      <p className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        Your wardrobe is empty. Add clothing to start searching and filtering.
      </p>
    );
  }

  return (
    <>
      <form
        role="search"
        aria-label="Search and filter wardrobe"
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="sm:col-span-2">
          <label htmlFor="wardrobe-search" className="mb-1 block text-sm font-medium">
            Search
          </label>
          <input
            id="wardrobe-search"
            type="search"
            placeholder="e.g. white shirt"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            className={fieldClassName}
          />
        </div>

        {selectFilters.map(({ key, label, values }) => (
          <div key={key}>
            <label htmlFor={`filter-${key}`} className="mb-1 block text-sm font-medium">
              {label}
            </label>
            <select
              id={`filter-${key}`}
              value={filters[key]}
              onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
              className={fieldClassName}
            >
              <option value="">All</option>
              {values.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ))}
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          Showing {visibleItems.length} of {items.length} items
        </p>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!filtersActive}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
        >
          Clear filters
        </button>
      </div>

      {visibleItems.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">No items match your search and filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
          >
            Clear filters to see your full wardrobe
          </button>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <ClothingCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}
