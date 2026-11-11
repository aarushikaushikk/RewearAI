// Client-safe: no server imports. Used by My Wardrobe to narrow the loaded items (US5).
import type { Category, Color, Formality, Season, WardrobeItemDto } from '@/types/wardrobe';

/** The search text and attribute filters on My Wardrobe. An empty string means "All". */
export interface WardrobeFilters {
  query: string;
  category: Category | '';
  color: Color | '';
  season: Season | '';
  formality: Formality | '';
}

export const EMPTY_FILTERS: WardrobeFilters = {
  query: '',
  category: '',
  color: '',
  season: '',
  formality: '',
};

function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** True when any search text or attribute filter is set. */
export function hasActiveFilters(filters: WardrobeFilters): boolean {
  return (
    searchTerms(filters.query).length > 0 ||
    filters.category !== '' ||
    filters.color !== '' ||
    filters.season !== '' ||
    filters.formality !== ''
  );
}

function searchableText(item: WardrobeItemDto): string {
  return [item.name ?? '', item.category, item.color, item.style, item.season, item.formality]
    .join(' ')
    .toLowerCase();
}

/**
 * The items matching every set filter, in their original order.
 *
 * - Search ignores case and extra spaces; every word must appear somewhere in the
 *   item's name or attributes (category, color, style, season, formality).
 * - Each attribute filter matches exactly. A season filter does not include
 *   All-season items (team decision for #10).
 */
export function filterWardrobeItems(
  items: readonly WardrobeItemDto[],
  filters: WardrobeFilters,
): WardrobeItemDto[] {
  const terms = searchTerms(filters.query);

  return items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.color && item.color !== filters.color) return false;
    if (filters.season && item.season !== filters.season) return false;
    if (filters.formality && item.formality !== filters.formality) return false;
    if (terms.length === 0) return true;

    const text = searchableText(item);
    return terms.every((term) => text.includes(term));
  });
}
