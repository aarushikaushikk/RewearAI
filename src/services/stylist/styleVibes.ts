// US13: maps an item's saved style (free text the user confirmed) to a stylist vibe.
// Pure and client-safe. PROVISIONAL table, pending teammate review (LLD #18 §6.1, D8).

export const VIBES = [
  'polished',
  'sleek',
  'elegant',
  'classic',
  'minimal',
  'relaxed',
  'breezy',
  'cozy',
  'sporty',
  'rugged',
  'edgy',
  'playful',
  'bold',
  'glamorous',
  'romantic',
  'retro',
] as const;
export type Vibe = (typeof VIBES)[number];

export const MOOD_GROUPS = ['polished', 'relaxed', 'sporty', 'playful'] as const;
export type MoodGroup = (typeof MOOD_GROUPS)[number];

export const VIBE_GROUP: Record<Vibe, MoodGroup> = {
  polished: 'polished',
  sleek: 'polished',
  elegant: 'polished',
  classic: 'polished',
  minimal: 'polished',
  relaxed: 'relaxed',
  breezy: 'relaxed',
  cozy: 'relaxed',
  sporty: 'sporty',
  rugged: 'sporty',
  edgy: 'sporty',
  playful: 'playful',
  bold: 'playful',
  glamorous: 'playful',
  romantic: 'playful',
  retro: 'playful',
};

// A Map, not an object, so names such as "toString" can never match.
const STYLE_VIBES = new Map<string, Vibe>([
  ['polished', 'polished'],
  ['tailored', 'polished'],
  ['relaxed tailoring', 'polished'],
  ['sleek', 'sleek'],
  ['modern', 'sleek'],
  ['elegant', 'elegant'],
  ['formal', 'elegant'],
  ['evening', 'elegant'],
  ['classic', 'classic'],
  ['heritage', 'classic'],
  ['preppy', 'classic'],
  ['nautical', 'classic'],
  ['minimal', 'minimal'],
  ['basic', 'minimal'],
  ['relaxed', 'relaxed'],
  ['casual', 'relaxed'],
  ['denim', 'relaxed'],
  ['breezy', 'breezy'],
  ['resort', 'breezy'],
  ['cozy', 'cozy'],
  ['soft', 'cozy'],
  ['sporty', 'sporty'],
  ['rugged', 'rugged'],
  ['outdoor', 'rugged'],
  ['western', 'rugged'],
  ['workwear', 'rugged'],
  ['utility', 'rugged'],
  ['edgy', 'edgy'],
  ['streetwear', 'edgy'],
  ['playful', 'playful'],
  ['cheerful', 'playful'],
  ['statement', 'bold'],
  ['glamorous', 'glamorous'],
  ['party', 'glamorous'],
  ['romantic', 'romantic'],
  ['feminine', 'romantic'],
  ['boho', 'romantic'],
  ['retro', 'retro'],
  ['vintage', 'retro'],
]);

/** The vibe for a saved style, or null when the style isn't in the table. */
export function vibeForStyle(style: string): Vibe | null {
  return STYLE_VIBES.get(style.trim().toLowerCase()) ?? null;
}
