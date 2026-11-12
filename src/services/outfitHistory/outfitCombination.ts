import { itemDisplayName } from '@/lib/wardrobe/itemDisplayName';
import type { Occasion } from '@/types/outfit';
import type { Category } from '@/types/wardrobe';

/** No valid outfit has more items: Top, Bottom, Outerwear, Shoes and Accessory at most. */
export const MAX_OUTFIT_ITEMS = 6;

/** Outfit.explanation's limit. */
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Identifies a set of clothes regardless of order: the sorted, lowercased item IDs. The
 * same clothes on the same day are one wear, so this is part of the history's unique key.
 */
export function combinationKey(itemIds: readonly string[]): string {
  return itemIds
    .map((id) => id.toLowerCase())
    .sort()
    .join(',');
}

/**
 * The outfit rule US7 generates by: one Top with one Bottom, or one Dress, never a Dress
 * with a Top or Bottom. Extras are allowed, but no category may appear twice.
 */
export function isValidOutfitCombination(categories: readonly Category[]): boolean {
  const present = new Set(categories);
  if (present.size !== categories.length) {
    return false;
  }
  const hasDress = present.has('Dress');
  const hasTop = present.has('Top');
  const hasBottom = present.has('Bottom');
  return hasDress ? !hasTop && !hasBottom : hasTop && hasBottom;
}

interface DescribedItem {
  name?: string | null;
  color: string;
  category: string;
}

function occasionLabel(occasion: Occasion): string {
  return occasion.charAt(0).toUpperCase() + occasion.slice(1);
}

function describeItem(item: DescribedItem): string {
  return item.name?.trim() ? `${itemDisplayName(item)} (${item.category})` : itemDisplayName(item);
}

/**
 * A factual description for Outfit.explanation, built only from the stored items: what was
 * worn and for which occasion. It makes no claim about why the items suit each other.
 */
export function describeWornOutfit(occasion: Occasion, items: readonly DescribedItem[]): string {
  const prefix = `Worn for ${occasionLabel(occasion)}: `;
  const detailed = `${prefix}${items.map(describeItem).join(', ')}.`;
  if (detailed.length <= MAX_DESCRIPTION_LENGTH) {
    return detailed;
  }
  return `${prefix}${items.map((item) => item.category).join(', ')}.`;
}
