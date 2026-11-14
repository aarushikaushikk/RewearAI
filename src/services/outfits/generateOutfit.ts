// Occasion-based outfit generation (US7). Pure and deterministic: the same wardrobe and
// occasion always give the same outfit, preferring items earlier in the given order.
//
// PROVISIONAL rules, pending teammate review (DESIGN.md "Outfit algorithm" open item):
// - Core: one Top with one Bottom, or one Dress. Never a Dress with a Top or Bottom.
// - Optional, added when a suitable one exists: Shoes (preferred), one Outerwear, one Accessory.
// - Every piece must have a formality allowed for the occasion (OCCASION_FORMALITIES).
// - Season-specific pieces from different seasons are never combined; All-season fits any.
// - Only the user's own, available items are used, each at most once. Nothing is invented:
//   when no core can be formed, the result says so instead of returning a partial outfit.
// - Alternatives (US8): given the outfits already shown, return a combination not among them
//   that differs in at least one item, preferring the least-shown items so repeated requests
//   mix and match across the pool. Leaving out a suitable optional piece is not an alternative.
// - Color (#18): among valid outfits, prefer a calmer palette (colorHarmony.ts). Color only
//   ranks; it never makes an outfit impossible or an ineligible item usable. On Try another,
//   unseen pieces come before a calmer palette.
// - Feedback (US14): a combination the user marked Not helpful ranks below every other valid
//   one, so it's returned only when nothing else is left. Feedback never makes an item eligible.

import { paletteOf, paletteScore, type Palette } from '@/services/outfits/colorHarmony';
import { OCCASIONS, type InsufficientReason, type Occasion, type OutfitRole } from '@/types/outfit';
import type { Category, Formality, Season, WardrobeItemRecord } from '@/types/wardrobe';

export type { InsufficientReason, OutfitRole, Palette };

/** The fields generation needs; callers may pass richer records and get the same objects back. */
export type OutfitCandidate = Pick<
  WardrobeItemRecord,
  'id' | 'ownerId' | 'isAvailable' | 'category' | 'color' | 'season' | 'formality'
>;

export interface OutfitPiece<T> {
  role: OutfitRole;
  item: T;
}

export type OutfitGenerationResult<T> =
  | {
      status: 'ok';
      occasion: Occasion;
      /** Core first (top, bottom or dress), then shoes, outerwear, accessory when present. */
      pieces: OutfitPiece<T>[];
      /** The one specific season the pieces share, or All-season when none is specific. */
      season: Season;
      /** How the pieces' colors read together (#18). */
      palette: Palette;
    }
  | { status: 'insufficient'; occasion: Occasion; reason: InsufficientReason }
  /** US8: every valid combination has already been shown. */
  | { status: 'no_alternative'; occasion: Occasion };

export interface GenerateOutfitInput<T extends OutfitCandidate> {
  /** The authenticated user; items owned by anyone else are ignored. */
  userId: string;
  occasion: Occasion;
  /** Candidate items in order of preference, for example newest first. */
  items: readonly T[];
  /**
   * US8: item IDs of the outfits already shown, each in any order. When non-empty, a
   * combination not among them is returned. IDs only rule combinations out; they never make
   * an item eligible.
   */
  shown?: readonly (readonly string[])[];
  /**
   * US14: item IDs of combinations the user marked Not helpful, each in any order. They rank
   * after every other valid combination; like `shown`, IDs never make an item eligible.
   */
  disliked?: readonly (readonly string[])[];
}

export const OCCASION_FORMALITIES: Record<Occasion, readonly Formality[]> = {
  work: ['Smart casual', 'Formal'],
  dinner: ['Smart casual', 'Formal'],
  weekend: ['Casual', 'Smart casual'],
  casual: ['Casual'],
  formal: ['Formal'],
};

/** How many cores are checked before settling on the best outfit found so far. */
export const MAX_CORE_CANDIDATES = 50;

/** How many options for each optional piece are tried with each core when finding an alternative. */
export const MAX_OPTIONS_PER_PIECE = 3;

type SpecificSeason = Exclude<Season, 'All-season'>;
/** The specific season an outfit is committed to so far, or null while everything is All-season. */
type SeasonContext = SpecificSeason | null;

interface Entry<T extends OutfitCandidate> {
  item: T;
  /** Position in the input, used to keep the caller's order when merging season buckets. */
  index: number;
}

interface Core<T> {
  pieces: OutfitPiece<T>[];
  context: SeasonContext;
}

function fits(season: Season, context: SeasonContext): boolean {
  return context === null || season === 'All-season' || season === context;
}

function narrow(context: SeasonContext, season: Season): SeasonContext {
  return season === 'All-season' ? context : season;
}

/** Entries of one category, grouped by season, so compatible items are found without scanning others. */
class SeasonBuckets<T extends OutfitCandidate> {
  private bySeason = new Map<Season, Entry<T>[]>();

  constructor(private all: Entry<T>[]) {
    for (const entry of all) {
      const season = entry.item.season;
      const bucket = this.bySeason.get(season) ?? [];
      bucket.push(entry);
      this.bySeason.set(season, bucket);
    }
  }

  /** Entries that fit `context`, in input order. */
  *fitting(context: SeasonContext): Generator<Entry<T>> {
    if (context === null) {
      yield* this.all;
      return;
    }
    const specific = this.bySeason.get(context) ?? [];
    const allSeason = this.bySeason.get('All-season') ?? [];
    let s = 0;
    let a = 0;
    while (s < specific.length || a < allSeason.length) {
      if (a >= allSeason.length || (s < specific.length && specific[s].index < allSeason[a].index)) {
        yield specific[s++];
      } else {
        yield allSeason[a++];
      }
    }
  }
}

function eligibleEntries<T extends OutfitCandidate>({ userId, occasion, items }: GenerateOutfitInput<T>) {
  const allowed = OCCASION_FORMALITIES[occasion];
  const seen = new Set<string>();
  const byCategory = new Map<Category, Entry<T>[]>();
  let count = 0;

  items.forEach((item, index) => {
    if (item.ownerId !== userId || item.isAvailable !== true || !allowed.includes(item.formality)) {
      return;
    }
    if (seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    count++;
    const list = byCategory.get(item.category) ?? [];
    list.push({ item, index });
    byCategory.set(item.category, list);
  });

  return { count, of: (category: Category) => byCategory.get(category) ?? [] };
}

/** Yields every core lazily, led by dresses and tops in input order. */
function* cores<T extends OutfitCandidate>(leads: Entry<T>[], bottoms: SeasonBuckets<T>): Generator<Core<T>> {
  for (const lead of leads) {
    const context = narrow(null, lead.item.season);
    if (lead.item.category === 'Dress') {
      yield { pieces: [{ role: 'dress', item: lead.item }], context };
      continue;
    }
    for (const bottom of bottoms.fitting(context)) {
      yield {
        pieces: [
          { role: 'top', item: lead.item },
          { role: 'bottom', item: bottom.item },
        ],
        context: narrow(context, bottom.item.season),
      };
    }
  }
}

const outfitKey = (ids: readonly string[]) => JSON.stringify([...new Set(ids)].sort());

/** How many shown outfits each item appeared in. */
function countUses(shown: readonly (readonly string[])[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const outfit of shown) {
    for (const id of new Set(outfit)) {
      uses.set(id, (uses.get(id) ?? 0) + 1);
    }
  }
  return uses;
}

/** Least-shown first, keeping input order among equals; `index` becomes the new rank. */
function byUses<T extends OutfitCandidate>(entries: Entry<T>[], uses: Map<string, number>): Entry<T>[] {
  return entries
    .map((entry) => ({ entry, count: uses.get(entry.item.id) ?? 0 }))
    .sort((a, b) => a.count - b.count || a.entry.index - b.entry.index)
    .map(({ entry }, index) => ({ item: entry.item, index }));
}

interface OptionalSlot<T extends OutfitCandidate> {
  role: OutfitRole;
  /** Up to MAX_OPTIONS_PER_PIECE ranked entries that fit the context. */
  options(context: SeasonContext): Entry<T>[];
}

function optionalSlot<T extends OutfitCandidate>(role: OutfitRole, ranked: Entry<T>[]): OptionalSlot<T> {
  const cache = new Map<SeasonContext, Entry<T>[]>();
  return {
    role,
    options(context) {
      let found = cache.get(context);
      if (!found) {
        found = [];
        for (const entry of ranked) {
          if (found.length >= MAX_OPTIONS_PER_PIECE) {
            break;
          }
          if (fits(entry.item.season, context)) {
            found.push(entry);
          }
        }
        cache.set(context, found);
      }
      return found;
    },
  };
}

/** Every way to complete a core, filling each optional slot whenever something fits. */
function* completions<T extends OutfitCandidate>(
  pieces: OutfitPiece<T>[],
  context: SeasonContext,
  slots: readonly OptionalSlot<T>[],
): Generator<Core<T>> {
  if (slots.length === 0) {
    yield { pieces, context };
    return;
  }
  const [slot, ...rest] = slots;
  const options = slot.options(context);
  if (options.length === 0) {
    yield* completions(pieces, context, rest);
    return;
  }
  for (const entry of options) {
    yield* completions([...pieces, { role: slot.role, item: entry.item }], narrow(context, entry.item.season), rest);
  }
}

interface Candidate<T> {
  outfit: Core<T>;
  /** The user marked exactly this combination Not helpful (US14). */
  disliked: boolean;
  missingShoes: boolean;
  /** How many times its items were shown, summed. */
  uses: number;
  palette: Palette;
  /** paletteScore(palette): higher is calmer. */
  calm: number;
}

const MAX_CALM = paletteScore('tonal');

/** Not disliked, then shoes when suitable ones exist, then the fewest shown items, then the calmer palette. */
function isBetter<T>(a: Candidate<T>, b: Candidate<T> | undefined): boolean {
  if (!b) {
    return true;
  }
  if (a.disliked !== b.disliked) {
    return b.disliked;
  }
  if (a.missingShoes !== b.missingShoes) {
    return b.missingShoes;
  }
  if (a.uses !== b.uses) {
    return a.uses < b.uses;
  }
  return a.calm > b.calm;
}

/**
 * The best combination not among `shown` (none, on a first request): ranked by isBetter, with
 * ties going to the earliest. Checks a bounded number of cores, each with a few options per piece.
 */
function bestOutfit<T extends OutfitCandidate>(
  eligible: ReturnType<typeof eligibleEntries<T>>,
  occasion: Occasion,
  shown: readonly (readonly string[])[],
  disliked: readonly (readonly string[])[],
): OutfitGenerationResult<T> {
  const uses = countUses(shown);
  const shownKeys = new Set(shown.map(outfitKey));
  const dislikedKeys = new Set(disliked.map(outfitKey));
  const leads = byUses([...eligible.of('Dress'), ...eligible.of('Top')], uses);
  const bottoms = new SeasonBuckets(byUses(eligible.of('Bottom'), uses));
  const shoesExist = eligible.of('Shoes').length > 0;
  const slots = [
    optionalSlot('shoes', byUses(eligible.of('Shoes'), uses)),
    optionalSlot('outerwear', byUses(eligible.of('Outerwear'), uses)),
    optionalSlot('accessory', byUses(eligible.of('Accessory'), uses)),
  ];

  let best: Candidate<T> | undefined;
  let checked = 0;
  for (const core of cores(leads, bottoms)) {
    for (const outfit of completions(core.pieces, core.context, slots)) {
      const itemIds = outfit.pieces.map((piece) => piece.item.id);
      const key = outfitKey(itemIds);
      if (shownKeys.has(key)) {
        continue;
      }
      const palette = paletteOf(outfit.pieces.map((piece) => piece.item.color));
      const candidate = {
        outfit,
        disliked: dislikedKeys.has(key),
        missingShoes: shoesExist && !outfit.pieces.some((piece) => piece.role === 'shoes'),
        uses: itemIds.reduce((sum, id) => sum + (uses.get(id) ?? 0), 0),
        palette,
        calm: paletteScore(palette),
      };
      if (isBetter(candidate, best)) {
        best = candidate;
      }
    }
    // Nothing beats an outfit not disliked, with shoes, made only of unshown items, in the calmest palette.
    const unbeatable =
      best !== undefined && !best.disliked && !best.missingShoes && best.uses === 0 && best.calm === MAX_CALM;
    if (++checked >= MAX_CORE_CANDIDATES || unbeatable) {
      break;
    }
  }

  if (checked === 0) {
    return { status: 'insufficient', occasion, reason: 'no_complete_outfit' };
  }
  if (!best) {
    return { status: 'no_alternative', occasion };
  }
  return {
    status: 'ok',
    occasion,
    pieces: best.outfit.pieces,
    season: best.outfit.context ?? 'All-season',
    palette: best.palette,
  };
}

export function generateOutfit<T extends OutfitCandidate>(input: GenerateOutfitInput<T>): OutfitGenerationResult<T> {
  const { occasion } = input;
  if (!(OCCASIONS as readonly string[]).includes(occasion)) {
    throw new RangeError('Unknown occasion');
  }

  const eligible = eligibleEntries(input);
  if (eligible.count === 0) {
    return { status: 'insufficient', occasion, reason: 'no_suitable_items' };
  }
  return bestOutfit(eligible, occasion, input.shown ?? [], input.disliked ?? []);
}
