// How an outfit's colors read together (#18). Pure and client-safe: no server imports.
// Color only ranks valid outfits; it never decides whether one can be made.
//
// PROVISIONAL tables, pending teammate review (LLD #18 §3.2, decision D4).

import { PALETTES, type Palette } from '@/types/outfit';
import type { Color } from '@/types/wardrobe';

export { PALETTES, type Palette };

export type ColorFamily = 'neutral' | 'accent' | 'pattern';

export const COLOR_FAMILY: Record<Color, ColorFamily> = {
  Black: 'neutral',
  White: 'neutral',
  Grey: 'neutral',
  Charcoal: 'neutral',
  Beige: 'neutral',
  Camel: 'neutral',
  Brown: 'neutral',
  // Denim and navy are treated as basics.
  Navy: 'neutral',
  Indigo: 'neutral',
  Red: 'accent',
  Burgundy: 'accent',
  Pink: 'accent',
  Orange: 'accent',
  Yellow: 'accent',
  Green: 'accent',
  Blue: 'accent',
  Purple: 'accent',
  Multicolor: 'pattern',
};

/** Colors that read as one family, such as navy, indigo and blue. */
const TONAL_FAMILIES: readonly (readonly Color[])[] = [
  ['Navy', 'Indigo', 'Blue'],
  ['Red', 'Burgundy', 'Pink'],
  ['Beige', 'Camel', 'Brown'],
  ['Grey', 'Charcoal'],
];

/** Accent colors that are often worn together, in either order. */
const ACCENT_PAIRS: readonly (readonly [Color, Color])[] = [
  ['Burgundy', 'Pink'],
  ['Blue', 'Orange'],
  ['Green', 'Pink'],
  ['Purple', 'Yellow'],
  ['Blue', 'Yellow'],
  ['Red', 'Pink'],
  ['Green', 'Burgundy'],
];

const PALETTE_SCORES: Record<Palette, number> = { tonal: 4, neutral: 3, one_accent: 3, paired: 2, bold: 0 };

const inOneFamily = (colors: readonly Color[]) =>
  TONAL_FAMILIES.some((family) => colors.every((color) => family.includes(color)));

/** Classifies the colors of an outfit's pieces. The order of `colors` doesn't matter. */
export function paletteOf(colors: readonly Color[]): Palette {
  if (colors.length === 0) {
    throw new RangeError('An outfit needs at least one color');
  }
  const distinct = [...new Set(colors)];
  if (distinct.length === 1 || inOneFamily(distinct)) {
    return 'tonal';
  }
  const patterns = colors.filter((color) => COLOR_FAMILY[color] === 'pattern').length;
  const accents = distinct.filter((color) => COLOR_FAMILY[color] === 'accent');
  if (patterns > 1 || (patterns === 1 && accents.length > 0)) {
    return 'bold';
  }
  if (accents.length === 0) {
    return patterns === 1 ? 'one_accent' : 'neutral';
  }
  if (accents.length === 1) {
    return 'one_accent';
  }
  if (accents.length === 2) {
    const [a, b] = accents;
    const listed = ACCENT_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (listed || inOneFamily(accents)) {
      return 'paired';
    }
  }
  return 'bold';
}

/** Higher is calmer; used only to rank outfits that are already valid. */
export function paletteScore(palette: Palette): number {
  return PALETTE_SCORES[palette];
}
