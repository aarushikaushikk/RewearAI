import type { Category, ClothingItem, Formality, Season } from "@/types/clothing";

export interface WardrobeFilters {
  query: string;
  category: Category | "";
  color: string;
  season: Season | "";
  formality: Formality | "";
}

export const emptyFilters: WardrobeFilters = {
  query: "",
  category: "",
  color: "",
  season: "",
  formality: "",
};

export function hasActiveFilters(filters: WardrobeFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.category !== "" ||
    filters.color !== "" ||
    filters.season !== "" ||
    filters.formality !== ""
  );
}

// Every whitespace-separated search term must appear somewhere in the item's
// name or attributes, so "white casual" narrows rather than widens results.
function matchesQuery(item: ClothingItem, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [item.name, item.category, item.color, item.season, item.formality]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

// An "All-season" item is wearable in any specific season, so it matches
// a Spring/Summer/Autumn/Winter filter as well as the "All-season" filter.
function matchesSeason(item: ClothingItem, season: Season | ""): boolean {
  if (season === "") return true;
  return item.season === season || (season !== "All-season" && item.season === "All-season");
}

export function filterClothing(items: ClothingItem[], filters: WardrobeFilters): ClothingItem[] {
  return items.filter(
    (item) =>
      matchesQuery(item, filters.query) &&
      (filters.category === "" || item.category === filters.category) &&
      (filters.color === "" || item.color === filters.color) &&
      matchesSeason(item, filters.season) &&
      (filters.formality === "" || item.formality === filters.formality),
  );
}
