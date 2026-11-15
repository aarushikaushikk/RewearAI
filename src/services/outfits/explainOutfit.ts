// US13: the facts behind a generated outfit, for the Why these items? panel. Pure.
// They restate generateOutfit's own rules (formality, season, palette), so the explanation
// can only say what actually decided the outfit. Keep in step with generateOutfit.ts.

import { paletteOf, type Palette } from '@/services/outfits/colorHarmony';
import { OCCASION_FORMALITIES } from '@/services/outfits/generateOutfit';
import type { Occasion, OutfitExplanationDto } from '@/types/outfit';
import { FORMALITIES, SEASONS, type Color, type Formality, type Season } from '@/types/wardrobe';

interface ExplainedPiece {
  item: { formality: Formality; season: Season; color: Color };
}

/**
 * Throws a RangeError for anything generateOutfit can't produce, so a bug can never be
 * explained as if it were a rule.
 */
export function explainOutfit(
  occasion: Occasion,
  pieces: readonly ExplainedPiece[],
  palette: Palette,
  isAlternative: boolean,
): OutfitExplanationDto {
  if (pieces.length === 0) {
    throw new RangeError('An outfit needs at least one piece');
  }
  const items = pieces.map((piece) => piece.item);
  const allowed = OCCASION_FORMALITIES[occasion];
  if (!items.every((item) => allowed.includes(item.formality))) {
    throw new RangeError('A piece has a formality the occasion does not allow');
  }
  const seasons = SEASONS.filter((season) => items.some((item) => item.season === season));
  if (seasons.filter((season) => season !== 'All-season').length > 1) {
    throw new RangeError('The pieces mix two specific seasons');
  }
  if (paletteOf(items.map((item) => item.color)) !== palette) {
    throw new RangeError('The palette does not match the pieces');
  }
  return {
    formalities: FORMALITIES.filter((formality) => items.some((item) => item.formality === formality)),
    seasons,
    palette,
    alternative: isAlternative,
  };
}
