// US13: assembles the two-sentence stylist note from the sentence library. Pure, client-safe.
//
// The note is built from the items' saved metadata alone (the basic note). Photo scores from
// the on-device model (US3's FashionSigLIP) may then change which piece is featured and which
// wording is used, but only between options that agree with each item's saved style: the
// model never overrules metadata the user confirmed (AGENTS §5).

import { COLOR_FAMILY } from '@/services/outfits/colorHarmony';
import { accentColors } from '@/services/outfits/explanationText';
import {
  fillTemplate,
  GENERIC_PIECE_SENTENCE,
  MOOD_ENDINGS,
  PALETTE_OPENERS,
  PIECE_SENTENCES,
  variantPrompt,
  vibePrompt,
  type MixKey,
  type MoodKey,
} from '@/services/stylist/stylistLibrary';
import { MOOD_GROUPS, VIBE_GROUP, VIBES, vibeForStyle, type MoodGroup, type Vibe } from '@/services/stylist/styleVibes';
import type { OutfitRole, Palette } from '@/types/outfit';
import type { Color } from '@/types/wardrobe';

export interface StylistItem {
  id: string;
  role: OutfitRole;
  /** The display name shown on the item's card. */
  name: string;
  color: Color;
  style: string;
}

/** Photo model scores: item ID → label → score. Only labels from stylistLabels(role) are read. */
export type PhotoScores = ReadonlyMap<string, ReadonlyMap<string, number>>;

export interface StylistNote {
  mood: string;
  piece: string;
  featuredId: string;
  /** True only when photo scores changed the featured piece or its wording. */
  aiAssisted: boolean;
}

/** Which piece is featured first: the pieces that most shape a look's character lead. */
const FEATURE_ORDER: readonly OutfitRole[] = ['outerwear', 'shoes', 'accessory', 'top', 'bottom', 'dress'];
const byFeatureOrder = (a: StylistItem, b: StylistItem) => FEATURE_ORDER.indexOf(a.role) - FEATURE_ORDER.indexOf(b.role);

function moodKey(vibes: readonly Vibe[]): MoodKey {
  if (vibes.length === 0) {
    return 'none';
  }
  const counts = new Map<MoodGroup, number>();
  for (const vibe of vibes) {
    counts.set(VIBE_GROUP[vibe], (counts.get(VIBE_GROUP[vibe]) ?? 0) + 1);
  }
  const top = Math.max(...counts.values());
  const leaders = MOOD_GROUPS.filter((group) => counts.get(group) === top);
  return leaders.length === 1 ? leaders[0] : (`${leaders[0]}+${leaders[1]}` as MixKey);
}

function moodSentence(items: readonly StylistItem[], palette: Palette, vibes: readonly Vibe[]): string {
  const accents = accentColors(items.map((item) => item.color)).map((color) => color.toLowerCase());
  const hasPattern = items.some((item) => COLOR_FAMILY[item.color] === 'pattern');
  const opener =
    palette === 'one_accent' && accents.length === 0 && hasPattern ? PALETTE_OPENERS.one_pattern : PALETTE_OPENERS[palette];
  return fillTemplate(`${opener} ${MOOD_ENDINGS[moodKey(vibes)]}`, {
    accent: accents[0] ?? 'accent',
    accentA: accents[0] ?? 'one accent',
    accentB: accents[1] ?? 'another',
  });
}

/** How much more the photo looks like `vibe` than like any other vibe. */
function vibeMargin(labels: ReadonlyMap<string, number>, vibe: Vibe, role: OutfitRole): number | null {
  const own = labels.get(vibePrompt(vibe, role));
  if (own === undefined) {
    return null;
  }
  const others = VIBES.filter((v) => v !== vibe).map((v) => labels.get(vibePrompt(v, role)) ?? -Infinity);
  return own - Math.max(...others);
}

/** The wording whose prompt the photo matches best; the first wording when nothing was scored. */
function bestVariant(vibe: Vibe, role: OutfitRole, labels: ReadonlyMap<string, number> | undefined): number {
  let best = 0;
  let bestScore = -Infinity;
  PIECE_SENTENCES[vibe].forEach((variant, index) => {
    const score = labels?.get(variantPrompt(variant, role));
    if (score !== undefined && score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

export function composeStylistNote(
  items: readonly StylistItem[],
  palette: Palette,
  opts: { scores?: PhotoScores; previousFeatured?: string } = {},
): StylistNote {
  if (items.length === 0) {
    throw new RangeError('An outfit needs at least one piece');
  }
  const styled = items
    .map((item) => ({ item, vibe: vibeForStyle(item.style) }))
    .filter((entry): entry is { item: StylistItem; vibe: Vibe } => entry.vibe !== null);
  const mood = moodSentence(items, palette, styled.map((entry) => entry.vibe));

  if (styled.length === 0) {
    const [first] = [...items].sort(byFeatureOrder);
    return { mood, piece: fillTemplate(GENERIC_PIECE_SENTENCE, { name: first.name }), featuredId: first.id, aiAssisted: false };
  }

  // Rotate on Try another: skip the piece featured last time when another can be featured.
  const fresh = styled.length > 1 ? styled.filter((entry) => entry.item.id !== opts.previousFeatured) : styled;
  const ordered = [...fresh].sort((a, b) => byFeatureOrder(a.item, b.item));
  const basic = ordered[0];

  let chosen = basic;
  if (opts.scores) {
    let bestMargin = -Infinity;
    for (const entry of ordered) {
      const labels = opts.scores.get(entry.item.id);
      const margin = labels ? vibeMargin(labels, entry.vibe, entry.item.role) : null;
      if (margin !== null && margin > bestMargin) {
        chosen = entry;
        bestMargin = margin;
      }
    }
  }
  const variant = bestVariant(chosen.vibe, chosen.item.role, opts.scores?.get(chosen.item.id));

  return {
    mood,
    piece: fillTemplate(PIECE_SENTENCES[chosen.vibe][variant].text, { name: chosen.item.name }),
    featuredId: chosen.item.id,
    aiAssisted: chosen !== basic || variant !== 0,
  };
}
