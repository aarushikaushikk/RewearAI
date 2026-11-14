// US13: the factual reason line for the Why these items? panel. Pure and client-safe.
// It states generateOutfit's real rules (formality, season, palette) and nothing else.

import { OCCASION_LABELS } from '@/components/outfits/outfitDisplay';
import { COLOR_FAMILY } from '@/services/outfits/colorHarmony';
import type { Occasion, OutfitExplanationDto } from '@/types/outfit';
import { COLORS, type Color } from '@/types/wardrobe';

/** The outfit's accent colors, distinct and in COLORS order. */
export function accentColors(colors: readonly Color[]): Color[] {
  return COLORS.filter((color) => COLOR_FAMILY[color] === 'accent' && colors.includes(color));
}

function seasonClause(seasons: OutfitExplanationDto['seasons']): string {
  const specific = seasons.find((season) => season !== 'All-season');
  return specific ? `they all suit ${specific}` : 'every piece is All-season';
}

function paletteClause(palette: OutfitExplanationDto['palette'], colors: readonly Color[]): string {
  const accents = accentColors(colors);
  switch (palette) {
    case 'tonal':
      return 'the colors keep to one color family';
    case 'neutral':
      return 'the colors stay in neutrals';
    case 'one_accent':
      return accents.length === 1 ? `${accents[0]} is the only accent color` : 'one patterned piece is the only accent';
    case 'paired':
      return accents.length === 2 ? `it pairs ${accents[0]} with ${accents[1]}` : 'it pairs two accent colors';
    case 'bold':
      return 'it mixes several colors';
  }
}

/** `colors` are the outfit's piece colors, used to name its accents. */
export function reasonLine(occasion: Occasion, explanation: OutfitExplanationDto, colors: readonly Color[]): string {
  const formalities = explanation.formalities.join(' or ');
  const line =
    `Picked for ${OCCASION_LABELS[occasion]} because every piece is ${formalities}, ` +
    `${seasonClause(explanation.seasons)}, and ${paletteClause(explanation.palette, colors)}.`;
  return explanation.alternative ? `${line} It's a different combination from the ones you've already seen.` : line;
}
