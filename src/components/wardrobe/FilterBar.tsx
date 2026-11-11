'use client';

import React from 'react';
import { FormField } from '@/components/ui/FormField';
import { SelectField } from '@/components/ui/SelectField';
import type { WardrobeFilters } from '@/services/filterWardrobeItems';
import { CATEGORIES, COLORS, FORMALITIES, SEASONS } from '@/types/wardrobe';

export interface FilterBarProps {
  filters: WardrobeFilters;
  onChange: (filters: WardrobeFilters) => void;
}

type AttributeFilter = Exclude<keyof WardrobeFilters, 'query'>;

const ATTRIBUTE_FILTERS: { key: AttributeFilter; label: string; options: readonly string[] }[] = [
  { key: 'category', label: 'Category', options: CATEGORIES },
  { key: 'color', label: 'Color', options: COLORS },
  { key: 'season', label: 'Season', options: SEASONS },
  { key: 'formality', label: 'Formality', options: FORMALITIES },
];

/**
 * The search field and attribute filters above My Wardrobe (wireframe 03, US5).
 * Controlled: the parent holds the filters, so they survive a reload of the items.
 */
export function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <div
      role="search"
      aria-label="Search and filter your wardrobe"
      className="grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]"
    >
      <div className="col-span-2 lg:col-span-1">
        <FormField
          id="wardrobe-search"
          label="Search"
          type="search"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Search names and attributes..."
          autoComplete="off"
        />
      </div>

      {ATTRIBUTE_FILTERS.map(({ key, label, options }) => (
        <SelectField
          key={key}
          id={`wardrobe-filter-${key}`}
          label={label}
          value={filters[key]}
          options={options}
          placeholder="All"
          // Every option comes from the allowed values for this attribute, or "" for All.
          onChange={(value) => onChange({ ...filters, [key]: value } as WardrobeFilters)}
        />
      ))}
    </div>
  );
}
