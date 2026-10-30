import type { Category, ClothingItem, Formality, Season } from "@/types/clothing";

// An empty string means "no filter" for that attribute.
export interface ClothingFilters {
  query: string;
  category: Category | "";
  color: string;
  season: Season | "";
  formality: Formality | "";
}

export interface ClothingFilterOptions {
  categories: Category[];
  colors: string[];
  seasons: Season[];
  formalities: Formality[];
}

export const emptyFilters: ClothingFilters = {
  query: "",
  category: "",
  color: "",
  season: "",
  formality: "",
};

function getSearchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesSearch(item: ClothingItem, terms: string[]): boolean {
  const searchableText = [item.name, item.category, item.color, item.season, item.formality]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => searchableText.includes(term));
}

export function filterClothing(items: ClothingItem[], filters: ClothingFilters): ClothingItem[] {
  const terms = getSearchTerms(filters.query);

  return items.filter(
    (item) =>
      (filters.category === "" || item.category === filters.category) &&
      (filters.color === "" || item.color === filters.color) &&
      (filters.season === "" || item.season === filters.season) &&
      (filters.formality === "" || item.formality === filters.formality) &&
      matchesSearch(item, terms),
  );
}

export function hasActiveFilters(filters: ClothingFilters): boolean {
  return (
    getSearchTerms(filters.query).length > 0 ||
    filters.category !== "" ||
    filters.color !== "" ||
    filters.season !== "" ||
    filters.formality !== ""
  );
}

function distinctSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function getFilterOptions(items: ClothingItem[]): ClothingFilterOptions {
  return {
    categories: distinctSorted(items.map((item) => item.category)),
    colors: distinctSorted(items.map((item) => item.color)),
    seasons: distinctSorted(items.map((item) => item.season)),
    formalities: distinctSorted(items.map((item) => item.formality)),
  };
}
