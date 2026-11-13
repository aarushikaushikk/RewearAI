// US13: the fixed, pre-approved sentences a stylist note is assembled from. Pure, client-safe.
// Every sentence is hedged (can, may, tends to) and names no garment, fabric, weather, place
// or occasion of its own; only the {name} and accent slots carry the user's data. A test
// checks every sentence against these rules (LLD #18 §6.2, PRD US13 AC4).

import type { OutfitRole, Palette } from '@/types/outfit';
import { MOOD_GROUPS, type MoodGroup, type Vibe } from '@/services/stylist/styleVibes';

/** A palette sentence opener; `one_pattern` is one_accent when the accent is a Multicolor piece. */
export const PALETTE_OPENERS: Record<Palette | 'one_pattern', string> = {
  tonal: 'Keeping to one color family',
  neutral: 'Sticking to neutral shades',
  one_accent: 'Letting the {accent} stand out against neutrals',
  one_pattern: 'Letting one patterned piece stand out against neutrals',
  paired: 'Pairing {accentA} with {accentB}',
  bold: 'Mixing several colors',
};

/** Two tied mood groups, named in MOOD_GROUPS order. */
export type MixKey =
  | 'polished+relaxed'
  | 'polished+sporty'
  | 'polished+playful'
  | 'relaxed+sporty'
  | 'relaxed+playful'
  | 'sporty+playful';
export type MoodKey = MoodGroup | MixKey | 'none';

export const MOOD_KEYS: readonly MoodKey[] = [
  ...MOOD_GROUPS,
  ...MOOD_GROUPS.flatMap((a, i) => MOOD_GROUPS.slice(i + 1).map((b) => `${a}+${b}` as MixKey)),
  'none',
];

export const MOOD_ENDINGS: Record<MoodKey, string> = {
  polished: 'can give the outfit a polished, pulled-together feel.',
  relaxed: 'tends to keep the outfit relaxed and easy to wear.',
  sporty: 'can lean into a sporty, practical mood.',
  playful: 'may bring a playful, eye-catching energy.',
  'polished+relaxed': 'can keep the look smart while still feeling relaxed.',
  'polished+sporty': 'can balance polished and sporty pieces so the look feels easy rather than stiff.',
  'polished+playful': 'can let the playful pieces stand out against a polished base.',
  'relaxed+sporty': 'can keep a relaxed, sporty look easy to wear.',
  'relaxed+playful': 'may give a relaxed look a playful lift.',
  'sporty+playful': 'can mix sporty and playful pieces into a lively look.',
  none: 'can keep the outfit easy to put together.',
};

export interface PieceSentence {
  /** Shown to the user; {name} is the item's display name. */
  text: string;
  /** The look the photo model compares the item's photo with to pick this wording. */
  look: string;
}

export const PIECE_SENTENCES: Record<Vibe, readonly PieceSentence[]> = {
  polished: [
    { text: 'The {name} can add a polished finish.', look: 'polished, refined' },
    { text: 'The {name} tends to make the look feel more put together.', look: 'neat, put-together' },
  ],
  sleek: [
    { text: 'The {name} can keep the lines sleek.', look: 'sleek, streamlined' },
    { text: 'The {name} may add a sharp, modern touch.', look: 'sharp, modern' },
  ],
  elegant: [
    { text: 'The {name} can bring an elegant note.', look: 'elegant, graceful' },
    { text: 'The {name} may lift the look toward something dressier.', look: 'dressy, formal' },
  ],
  classic: [
    { text: 'The {name} can anchor the look with a classic touch.', look: 'classic, traditional' },
    { text: 'The {name} tends to keep things classic and familiar.', look: 'simple, traditional' },
  ],
  minimal: [
    { text: 'The {name} can keep things clean and simple.', look: 'clean, minimal' },
    { text: 'The {name} may keep the look pared back.', look: 'plain, understated' },
  ],
  relaxed: [
    { text: 'The {name} can keep the look relaxed.', look: 'relaxed, laid-back' },
    { text: 'The {name} tends to make the outfit feel easygoing.', look: 'loose, easygoing' },
  ],
  breezy: [
    { text: 'The {name} can add a light, breezy feel.', look: 'light, breezy' },
    { text: 'The {name} may keep things airy and easy.', look: 'airy, lightweight' },
  ],
  cozy: [
    { text: 'The {name} can bring a cozy, comfortable feel.', look: 'cozy, comfortable' },
    { text: 'The {name} tends to make the look feel snug and easy.', look: 'soft, snug' },
  ],
  sporty: [
    { text: 'The {name} can add a sporty edge.', look: 'sporty, athletic' },
    { text: 'The {name} may give the look an active, sporty feel.', look: 'activewear' },
  ],
  rugged: [
    { text: 'The {name} can add a rugged edge.', look: 'rugged, tough' },
    { text: 'The {name} tends to bring an outdoorsy feel.', look: 'outdoorsy, practical' },
  ],
  edgy: [
    { text: 'The {name} can add an edgy touch.', look: 'edgy, urban' },
    { text: 'The {name} may give the look a bit of attitude.', look: 'bold, rebellious' },
  ],
  playful: [
    { text: 'The {name} can add a playful touch.', look: 'playful, fun' },
    { text: 'The {name} may bring a bit of fun to the look.', look: 'cheerful, quirky' },
  ],
  bold: [
    { text: 'The {name} can act as a bold focal point.', look: 'bold, statement' },
    { text: 'The {name} may make a confident statement.', look: 'eye-catching, vivid' },
  ],
  glamorous: [
    { text: 'The {name} can add a touch of glamour.', look: 'glamorous, shiny' },
    { text: 'The {name} may bring some extra sparkle.', look: 'sparkly, luxurious' },
  ],
  romantic: [
    { text: 'The {name} can add a soft, romantic note.', look: 'romantic, feminine' },
    { text: 'The {name} may give the look a gentle, romantic feel.', look: 'delicate, flowing' },
  ],
  retro: [
    { text: 'The {name} can add a retro touch.', look: 'retro-styled' },
    { text: 'The {name} may bring a nostalgic, vintage feel.', look: 'vintage, nostalgic' },
  ],
};

/** For a featured piece whose saved style isn't in the vibe table (LLD #18 D7a). */
export const GENERIC_PIECE_SENTENCE = 'The {name} can help pull the look together.';

/** How each role is named in photo prompts; per-role wording matched photos better in the spike. */
export const ROLE_NOUNS: Record<OutfitRole, string> = {
  top: 'top',
  bottom: 'pair of trousers or skirt',
  dress: 'dress',
  shoes: 'pair of shoes',
  outerwear: 'jacket',
  accessory: 'accessory',
};

/** Compared with a photo to see how much it looks like `vibe`. */
export function vibePrompt(vibe: Vibe, role: OutfitRole): string {
  return `a photo of a ${vibe} ${ROLE_NOUNS[role]}`;
}

/** Compared with a photo to pick between a vibe's wordings. */
export function variantPrompt(variant: PieceSentence, role: OutfitRole): string {
  return `a photo of a ${variant.look} ${ROLE_NOUNS[role]}`;
}

const labelSets = new Map<OutfitRole, readonly string[]>();

/** The fixed label set for a role, so its text embeddings are computed once per tab. */
export function stylistLabels(role: OutfitRole): readonly string[] {
  let labels = labelSets.get(role);
  if (!labels) {
    const vibes = Object.keys(PIECE_SENTENCES) as Vibe[];
    labels = [
      ...vibes.map((vibe) => vibePrompt(vibe, role)),
      ...vibes.flatMap((vibe) => PIECE_SENTENCES[vibe].map((variant) => variantPrompt(variant, role))),
    ];
    labelSets.set(role, labels);
  }
  return labels;
}

/** Fills {slot}s with plain text; replacement patterns such as "$&" in values are not special. */
export function fillTemplate(template: string, values: Partial<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
