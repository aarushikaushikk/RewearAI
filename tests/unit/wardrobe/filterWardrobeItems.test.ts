import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  filterWardrobeItems,
  hasActiveFilters,
  type WardrobeFilters,
} from '@/services/filterWardrobeItems';
import { itemDto } from '../../helpers/wardrobeItems';

const SHIRT = itemDto({ id: 'shirt', name: 'White Oxford Shirt' });
const JEANS = itemDto({
  id: 'jeans',
  name: undefined,
  category: 'Bottom',
  color: 'Blue',
  style: 'Denim',
  season: 'All-season',
  formality: 'Casual',
});
const SWEATER = itemDto({
  id: 'sweater',
  name: 'Winter Sweater',
  color: 'Grey',
  style: 'Knit',
  season: 'Winter',
  formality: 'Casual',
});
const BLAZER = itemDto({
  id: 'blazer',
  name: 'Black Blazer',
  category: 'Outerwear',
  color: 'Black',
  style: 'Tailored',
  season: 'Autumn',
  formality: 'Formal',
});
const ITEMS = [SHIRT, JEANS, SWEATER, BLAZER];

function ids(filters: Partial<WardrobeFilters>): string[] {
  return filterWardrobeItems(ITEMS, { ...EMPTY_FILTERS, ...filters }).map((item) => item.id);
}

// US5: search and filter the wardrobe (wireframe 03).
describe('filterWardrobeItems', () => {
  it('returns every item, in order, when no search or filter is set', () => {
    expect(ids({})).toEqual(['shirt', 'jeans', 'sweater', 'blazer']);
  });

  describe('search', () => {
    it('matches item names, ignoring case', () => {
      expect(ids({ query: 'oxford' })).toEqual(['shirt']);
      expect(ids({ query: 'BLAZER' })).toEqual(['blazer']);
    });

    it('matches part of a word', () => {
      expect(ids({ query: 'sweat' })).toEqual(['sweater']);
    });

    it.each([
      ['category', 'bottom', ['jeans']],
      ['color', 'grey', ['sweater']],
      ['style', 'denim', ['jeans']],
      ['season', 'autumn', ['blazer']],
      ['formality', 'formal', ['blazer']],
    ])('matches the %s', (_attribute, query, expected) => {
      expect(ids({ query })).toEqual(expected);
    });

    it('finds an unnamed item by its attributes', () => {
      expect(ids({ query: 'blue' })).toEqual(['jeans']);
    });

    it('requires every word to match, across any fields', () => {
      expect(ids({ query: 'white shirt' })).toEqual(['shirt']);
      expect(ids({ query: 'casual grey' })).toEqual(['sweater']);
      expect(ids({ query: 'white blazer' })).toEqual([]);
    });

    it('ignores surrounding and repeated spaces', () => {
      expect(ids({ query: '  black   blazer ' })).toEqual(['blazer']);
    });

    it('treats a blank search as no search', () => {
      expect(ids({ query: '   ' })).toHaveLength(ITEMS.length);
    });

    it('returns nothing when no item matches', () => {
      expect(ids({ query: 'sequins' })).toEqual([]);
    });
  });

  describe('attribute filters', () => {
    it('filters by category', () => {
      expect(ids({ category: 'Top' })).toEqual(['shirt', 'sweater']);
    });

    it('filters by color', () => {
      expect(ids({ color: 'Black' })).toEqual(['blazer']);
    });

    it('filters by formality', () => {
      expect(ids({ formality: 'Casual' })).toEqual(['jeans', 'sweater']);
    });

    it('matches the selected season exactly, so All-season items are not included', () => {
      expect(ids({ season: 'Winter' })).toEqual(['sweater']);
      expect(ids({ season: 'All-season' })).toEqual(['shirt', 'jeans']);
    });

    it('combines filters with each other and with search', () => {
      expect(ids({ category: 'Top', formality: 'Casual' })).toEqual(['sweater']);
      expect(ids({ formality: 'Casual', query: 'denim' })).toEqual(['jeans']);
      expect(ids({ category: 'Outerwear', color: 'White' })).toEqual([]);
    });
  });

  it('handles an empty wardrobe', () => {
    expect(filterWardrobeItems([], { ...EMPTY_FILTERS, query: 'shirt' })).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false with no search or filter', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('is false for a blank search', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: '  ' })).toBe(false);
  });

  it.each<Partial<WardrobeFilters>>([
    { query: 'shirt' },
    { category: 'Top' },
    { color: 'Black' },
    { season: 'Winter' },
    { formality: 'Formal' },
  ])('is true when %j is set', (filters) => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, ...filters })).toBe(true);
  });
});
