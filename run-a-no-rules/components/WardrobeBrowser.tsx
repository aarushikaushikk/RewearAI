"use client";

import { useMemo, useState } from "react";
import type { Category, ClothingItem, Formality, Season } from "@/types/clothing";
import {
  emptyFilters,
  filterClothing,
  hasActiveFilters,
  type WardrobeFilters,
} from "@/lib/filterClothing";

const categories: Category[] = ["Top", "Bottom", "Outerwear", "Dress", "Shoes", "Accessory"];
const seasons: Season[] = ["Spring", "Summer", "Autumn", "Winter", "All-season"];
const formalities: Formality[] = ["Casual", "Smart casual", "Formal"];

const controlClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-700 dark:bg-zinc-900";

interface SelectFilterProps {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

function SelectFilter({ id, label, value, options, onChange }: SelectFilterProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={controlClass}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function WardrobeBrowser({ items }: { items: ClothingItem[] }) {
  const [filters, setFilters] = useState<WardrobeFilters>(emptyFilters);

  const colors = useMemo(
    () => Array.from(new Set(items.map((item) => item.color))).sort(),
    [items],
  );
  const visibleItems = useMemo(() => filterClothing(items, filters), [items, filters]);
  const isFiltered = hasActiveFilters(filters);

  function update<K extends keyof WardrobeFilters>(key: K, value: WardrobeFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
      <section aria-label="Search and filter" className="mt-6 space-y-4">
        <div>
          <label htmlFor="wardrobe-search" className="sr-only">
            Search wardrobe
          </label>
          <input
            id="wardrobe-search"
            type="search"
            placeholder="Search by name, color, category…"
            value={filters.query}
            onChange={(e) => update("query", e.target.value)}
            className={controlClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SelectFilter
            id="filter-category"
            label="Category"
            value={filters.category}
            options={categories}
            onChange={(v) => update("category", v as Category | "")}
          />
          <SelectFilter
            id="filter-color"
            label="Color"
            value={filters.color}
            options={colors}
            onChange={(v) => update("color", v)}
          />
          <SelectFilter
            id="filter-season"
            label="Season"
            value={filters.season}
            options={seasons}
            onChange={(v) => update("season", v as Season | "")}
          />
          <SelectFilter
            id="filter-formality"
            label="Formality"
            value={filters.formality}
            options={formalities}
            onChange={(v) => update("formality", v as Formality | "")}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
            {isFiltered
              ? `Showing ${visibleItems.length} of ${items.length} items`
              : `${items.length} items`}
          </p>
          <button
            type="button"
            onClick={() => setFilters(emptyFilters)}
            disabled={!isFiltered}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Clear filters
          </button>
        </div>
      </section>

      {visibleItems.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          No items match your search and filters.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{item.name}</h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.available
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {item.available ? "Available" : "Unavailable"}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                <dt className="text-zinc-500">Category</dt>
                <dd>{item.category}</dd>
                <dt className="text-zinc-500">Color</dt>
                <dd>{item.color}</dd>
                <dt className="text-zinc-500">Season</dt>
                <dd>{item.season}</dd>
                <dt className="text-zinc-500">Formality</dt>
                <dd>{item.formality}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
