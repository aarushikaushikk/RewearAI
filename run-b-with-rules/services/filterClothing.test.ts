import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClothingItem } from "@/types/clothing";
import {
  emptyFilters,
  filterClothing,
  getFilterOptions,
  hasActiveFilters,
} from "./filterClothing.ts";

const items: ClothingItem[] = [
  { id: "a", name: "White Oxford Shirt", category: "Top", color: "White", season: "All-season", formality: "Smart casual", available: true },
  { id: "b", name: "Grey Crewneck Sweater", category: "Top", color: "Grey", season: "Winter", formality: "Casual", available: true },
  { id: "c", name: "Tailored Wool Trousers", category: "Bottom", color: "Charcoal", season: "Autumn", formality: "Formal", available: true },
  { id: "d", name: "White Canvas Sneakers", category: "Shoes", color: "White", season: "All-season", formality: "Casual", available: false },
];

const ids = (result: ClothingItem[]) => result.map((item) => item.id);

describe("filterClothing", () => {
  it("returns the full wardrobe when no filters are set", () => {
    assert.deepEqual(ids(filterClothing(items, emptyFilters)), ["a", "b", "c", "d"]);
  });

  it("searches item names case-insensitively, ignoring surrounding whitespace", () => {
    assert.deepEqual(ids(filterClothing(items, { ...emptyFilters, query: "  oxford " })), ["a"]);
  });

  it("searches attribute values as well as names", () => {
    assert.deepEqual(ids(filterClothing(items, { ...emptyFilters, query: "formal" })), ["c"]);
  });

  it("requires every search word to match", () => {
    assert.deepEqual(ids(filterClothing(items, { ...emptyFilters, query: "white shoes" })), ["d"]);
  });

  it("filters by category, color, season, and formality", () => {
    assert.deepEqual(ids(filterClothing(items, { ...emptyFilters, category: "Top" })), ["a", "b"]);
    assert.deepEqual(ids(filterClothing(items, { ...emptyFilters, color: "White" })), ["a", "d"]);
    assert.deepEqual(ids(filterClothing(items, { ...emptyFilters, season: "Winter" })), ["b"]);
    assert.deepEqual(ids(filterClothing(items, { ...emptyFilters, formality: "Casual" })), ["b", "d"]);
  });

  it("combines search and filters", () => {
    const filters = { ...emptyFilters, query: "white", category: "Top" as const, season: "All-season" as const };
    assert.deepEqual(ids(filterClothing(items, filters)), ["a"]);
  });

  it("returns an empty list when nothing matches", () => {
    assert.deepEqual(filterClothing(items, { ...emptyFilters, category: "Dress" }), []);
  });

  it("does not mutate the input list", () => {
    const copy = [...items];
    filterClothing(items, { ...emptyFilters, color: "Grey" });
    assert.deepEqual(items, copy);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the empty filters and a whitespace-only query", () => {
    assert.equal(hasActiveFilters(emptyFilters), false);
    assert.equal(hasActiveFilters({ ...emptyFilters, query: "   " }), false);
  });

  it("is true when a search or any filter is set", () => {
    assert.equal(hasActiveFilters({ ...emptyFilters, query: "shirt" }), true);
    assert.equal(hasActiveFilters({ ...emptyFilters, formality: "Formal" }), true);
  });
});

describe("getFilterOptions", () => {
  it("lists the distinct values present in the wardrobe, sorted", () => {
    assert.deepEqual(getFilterOptions(items), {
      categories: ["Bottom", "Shoes", "Top"],
      colors: ["Charcoal", "Grey", "White"],
      seasons: ["All-season", "Autumn", "Winter"],
      formalities: ["Casual", "Formal", "Smart casual"],
    });
  });

  it("returns empty option lists for an empty wardrobe", () => {
    assert.deepEqual(getFilterOptions([]), { categories: [], colors: [], seasons: [], formalities: [] });
  });
});
