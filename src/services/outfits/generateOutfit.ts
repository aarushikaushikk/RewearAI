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

import { OCCASIONS, type Occasion } from '@/types/outfit';
import type { Category, Formality, Season, WardrobeItemRecord } from '@/types/wardrobe';

/** The fields generation needs; callers may pass richer records and get the same objects back. */
export type OutfitCandidate = Pick<
  WardrobeItemRecord,
  'id' | 'ownerId' | 'isAvailable' | 'category' | 'season' | 'formality'
>;

export type OutfitRole = 'top' | 'bottom' | 'dress' | 'shoes' | 'outerwear' | 'accessory';

export interface OutfitPiece<T> {
  role: OutfitRole;
  item: T;
}

/**
 * - `no_suitable_items`: none of the user's available items has a formality for this occasion.
 * - `no_complete_outfit`: suitable items exist, but no Top + Bottom or Dress can be formed.
 */
export type InsufficientReason = 'no_suitable_items' | 'no_complete_outfit';

export type OutfitGenerationResult<T> =
  | {
      status: 'ok';
      occasion: Occasion;
      /** Core first (top, bottom or dress), then shoes, outerwear, accessory when present. */
      pieces: OutfitPiece<T>[];
      /** The one specific season the pieces share, or All-season when none is specific. */
      season: Season;
    }
  | { status: 'insufficient'; occasion: Occasion; reason: InsufficientReason };

export interface GenerateOutfitInput<T extends OutfitCandidate> {
  /** The authenticated user; items owned by anyone else are ignored. */
  userId: string;
  occasion: Occasion;
  /** Candidate items in order of preference, for example newest first. */
  items: readonly T[];
}

export const OCCASION_FORMALITIES: Record<Occasion, readonly Formality[]> = {
  work: ['Smart casual', 'Formal'],
  dinner: ['Smart casual', 'Formal'],
  weekend: ['Casual', 'Smart casual'],
  casual: ['Casual'],
  formal: ['Formal'],
};

/** How many cores are checked for suitable shoes before settling for one without. */
export const MAX_CORE_CANDIDATES = 50;

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

function firstFitting<T extends OutfitCandidate>(
  entries: readonly Entry<T>[],
  context: SeasonContext,
): Entry<T> | undefined {
  return entries.find((entry) => fits(entry.item.season, context));
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

export function generateOutfit<T extends OutfitCandidate>(input: GenerateOutfitInput<T>): OutfitGenerationResult<T> {
  const { occasion } = input;
  if (!(OCCASIONS as readonly string[]).includes(occasion)) {
    throw new RangeError('Unknown occasion');
  }

  const eligible = eligibleEntries(input);
  if (eligible.count === 0) {
    return { status: 'insufficient', occasion, reason: 'no_suitable_items' };
  }

  const leads = [...eligible.of('Dress'), ...eligible.of('Top')].sort((a, b) => a.index - b.index);
  const bottoms = new SeasonBuckets(eligible.of('Bottom'));
  const shoes = eligible.of('Shoes');

  // Prefer the first core that suitable shoes fit, checking a bounded number of cores.
  const limit = shoes.length > 0 ? MAX_CORE_CANDIDATES : 1;
  let chosen: Core<T> | undefined;
  let chosenShoes: Entry<T> | undefined;
  let checked = 0;
  for (const core of cores(leads, bottoms)) {
    chosen ??= core;
    const fittingShoes = firstFitting(shoes, core.context);
    if (fittingShoes) {
      chosen = core;
      chosenShoes = fittingShoes;
      break;
    }
    if (++checked >= limit) {
      break;
    }
  }
  if (!chosen) {
    return { status: 'insufficient', occasion, reason: 'no_complete_outfit' };
  }

  const pieces = [...chosen.pieces];
  let context = chosen.context;
  const add = (role: OutfitRole, entry: Entry<T> | undefined) => {
    if (entry) {
      pieces.push({ role, item: entry.item });
      context = narrow(context, entry.item.season);
    }
  };
  // Each optional piece must fit the season set by the pieces before it.
  add('shoes', chosenShoes);
  add('outerwear', firstFitting(eligible.of('Outerwear'), context));
  add('accessory', firstFitting(eligible.of('Accessory'), context));

  return { status: 'ok', occasion, pieces, season: context ?? 'All-season' };
}
