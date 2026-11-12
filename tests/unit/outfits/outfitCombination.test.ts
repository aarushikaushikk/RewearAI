import { describe, expect, it } from 'vitest';
import {
  combinationKey,
  describeWornOutfit,
  isValidOutfitCombination,
  MAX_OUTFIT_ITEMS,
} from '@/services/outfitHistory/outfitCombination';
import type { Category } from '@/types/wardrobe';

describe('combinationKey', () => {
  it('is the same whatever the order of the items', () => {
    expect(combinationKey(['b2', 'a1', 'c3'])).toBe(combinationKey(['c3', 'b2', 'a1']));
  });

  it('ignores letter case, as ObjectIds do', () => {
    expect(combinationKey(['64B0000000000000000000AA'])).toBe(combinationKey(['64b0000000000000000000aa']));
  });

  it('is the sorted, lowercased IDs joined by commas', () => {
    expect(combinationKey(['b', 'A', 'c'])).toBe('a,b,c');
  });

  it('differs when the items differ', () => {
    expect(combinationKey(['a', 'b'])).not.toBe(combinationKey(['a', 'c']));
    expect(combinationKey(['a', 'b'])).not.toBe(combinationKey(['a', 'b', 'c']));
  });
});

describe('isValidOutfitCombination', () => {
  it.each<[string, Category[]]>([
    ['a top and a bottom', ['Top', 'Bottom']],
    ['a dress', ['Dress']],
    ['a top, bottom and every extra', ['Top', 'Bottom', 'Shoes', 'Outerwear', 'Accessory']],
    ['a dress with every extra', ['Dress', 'Shoes', 'Outerwear', 'Accessory']],
    ['the items in any order', ['Shoes', 'Bottom', 'Top']],
  ])('accepts %s', (_label, categories) => {
    expect(isValidOutfitCombination(categories)).toBe(true);
  });

  it.each<[string, Category[]]>([
    ['nothing', []],
    ['a top alone', ['Top']],
    ['a bottom alone', ['Bottom']],
    ['only extras', ['Shoes', 'Outerwear', 'Accessory']],
    ['a dress with a top', ['Dress', 'Top']],
    ['a dress with a bottom', ['Dress', 'Bottom']],
    ['a dress with a top and bottom', ['Dress', 'Top', 'Bottom']],
    ['two tops', ['Top', 'Top', 'Bottom']],
    ['two pairs of shoes', ['Top', 'Bottom', 'Shoes', 'Shoes']],
    ['two dresses', ['Dress', 'Dress']],
  ])('rejects %s', (_label, categories) => {
    expect(isValidOutfitCombination(categories)).toBe(false);
  });

  it('never needs more items than the payload limit allows', () => {
    expect(MAX_OUTFIT_ITEMS).toBe(6);
  });
});

describe('describeWornOutfit', () => {
  it('names the occasion and each item from its stored details', () => {
    expect(
      describeWornOutfit('work', [
        { name: 'White Oxford Shirt', color: 'White', category: 'Top' },
        { name: null, color: 'Navy', category: 'Bottom' },
      ]),
    ).toBe('Worn for Work: White Oxford Shirt (Top), Navy Bottom.');
  });

  it('falls back to categories when the names would exceed the 500-character limit', () => {
    const longName = 'x'.repeat(80);
    const text = describeWornOutfit('formal', [
      { name: longName, color: 'Black', category: 'Top' },
      { name: longName, color: 'Black', category: 'Bottom' },
      { name: longName, color: 'Black', category: 'Shoes' },
      { name: longName, color: 'Black', category: 'Outerwear' },
      { name: longName, color: 'Black', category: 'Accessory' },
      { name: longName, color: 'Black', category: 'Accessory' },
      { name: longName, color: 'Black', category: 'Accessory' },
    ]);

    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).toBe('Worn for Formal: Top, Bottom, Shoes, Outerwear, Accessory, Accessory, Accessory.');
  });

  it('ignores blank names, as the wardrobe does', () => {
    expect(describeWornOutfit('casual', [{ name: '   ', color: 'Red', category: 'Dress' }])).toBe(
      'Worn for Casual: Red Dress.',
    );
  });
});
