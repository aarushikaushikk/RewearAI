import { describe, expect, it } from 'vitest';
import {
  generateOutfit,
  OCCASION_FORMALITIES,
  type OutfitCandidate,
  type OutfitGenerationResult,
} from '@/services/outfits/generateOutfit';
import { OCCASIONS, type Occasion } from '@/types/outfit';
import { FORMALITIES, type Category, type Formality } from '@/types/wardrobe';

const USER = 'user-a';
const OTHER_USER = 'user-b';

let nextId = 1;
function item(category: Category, overrides: Partial<OutfitCandidate> = {}): OutfitCandidate {
  return {
    id: `item-${nextId++}`,
    ownerId: USER,
    isAvailable: true,
    category,
    season: 'All-season',
    formality: 'Casual',
    ...overrides,
  };
}

function generate(items: OutfitCandidate[], occasion: Occasion = 'casual', shown?: string[][]) {
  return generateOutfit({ userId: USER, occasion, items, shown });
}

function pieces(result: OutfitGenerationResult<OutfitCandidate>) {
  if (result.status !== 'ok') {
    throw new Error(`expected an outfit, got ${result.status}`);
  }
  return result.pieces;
}

const ids = (result: OutfitGenerationResult<OutfitCandidate>) => pieces(result).map((p) => p.item.id);
const roles = (result: OutfitGenerationResult<OutfitCandidate>) => pieces(result).map((p) => p.role);

describe('generateOutfit', () => {
  describe('occasions (provisional rules)', () => {
    it('maps each occasion to its approved formalities', () => {
      expect(OCCASION_FORMALITIES).toEqual({
        work: ['Smart casual', 'Formal'],
        dinner: ['Smart casual', 'Formal'],
        weekend: ['Casual', 'Smart casual'],
        casual: ['Casual'],
        formal: ['Formal'],
      });
      expect(Object.keys(OCCASION_FORMALITIES).sort()).toEqual([...OCCASIONS].sort());
    });

    it.each(OCCASIONS)('uses only formalities allowed for %s, even when others come first', (occasion) => {
      const allowed = OCCASION_FORMALITIES[occasion];
      // Disallowed pairs are listed first, so ignoring formality would pick one of them.
      const ordered: Formality[] = [
        ...FORMALITIES.filter((f) => !allowed.includes(f)),
        ...FORMALITIES.filter((f) => allowed.includes(f)),
      ];
      const wardrobe = ordered.flatMap((formality) => [item('Top', { formality }), item('Bottom', { formality })]);

      const result = generate(wardrobe, occasion);

      // The first allowed pair in the list is chosen.
      const firstAllowed = ordered.find((f) => allowed.includes(f));
      expect(pieces(result).map((p) => p.item.formality)).toEqual([firstAllowed, firstAllowed]);
    });

    it.each(OCCASIONS)('reports insufficient items for %s when only other formalities exist', (occasion) => {
      const disallowed = FORMALITIES.filter((f) => !OCCASION_FORMALITIES[occasion].includes(f));
      const wardrobe = disallowed.flatMap((formality) => [
        item('Top', { formality }),
        item('Bottom', { formality }),
        item('Dress', { formality }),
      ]);

      expect(generate(wardrobe, occasion)).toEqual({ status: 'insufficient', occasion, reason: 'no_suitable_items' });
    });

    it('rejects an occasion outside the approved list', () => {
      expect(() =>
        generateOutfit({ userId: USER, occasion: 'party' as Occasion, items: [item('Dress')] }),
      ).toThrow(RangeError);
    });
  });

  describe('outfit structure', () => {
    it('builds a core of one top and one bottom', () => {
      const top = item('Top');
      const bottom = item('Bottom');

      const result = generate([top, bottom]);

      expect(result).toMatchObject({ status: 'ok', occasion: 'casual' });
      expect(pieces(result)).toEqual([
        { role: 'top', item: top },
        { role: 'bottom', item: bottom },
      ]);
    });

    it('accepts one dress as a complete core', () => {
      const dress = item('Dress');

      expect(pieces(generate([dress]))).toEqual([{ role: 'dress', item: dress }]);
    });

    it('never combines a dress with a top or bottom', () => {
      const result = generate([item('Dress'), item('Top'), item('Bottom')]);

      expect(roles(result)).toEqual(['dress']);
    });

    it.each([
      ['a top without a bottom', ['Top', 'Shoes']],
      ['a bottom without a top', ['Bottom', 'Outerwear']],
      ['only shoes, outerwear, and accessories', ['Shoes', 'Outerwear', 'Accessory']],
    ] as [string, Category[]][])('reports insufficient items for %s', (_label, categories) => {
      expect(generate(categories.map((c) => item(c)))).toEqual({
        status: 'insufficient',
        occasion: 'casual',
        reason: 'no_complete_outfit',
      });
    });

    it('reports insufficient items for an empty wardrobe', () => {
      expect(generate([])).toEqual({ status: 'insufficient', occasion: 'casual', reason: 'no_suitable_items' });
    });

    it('adds shoes, one outerwear, and one accessory when suitable ones exist, in a fixed order', () => {
      const wardrobe = [
        item('Accessory'),
        item('Accessory'),
        item('Outerwear'),
        item('Outerwear'),
        item('Shoes'),
        item('Shoes'),
        item('Bottom'),
        item('Top'),
      ];

      expect(roles(generate(wardrobe))).toEqual(['top', 'bottom', 'shoes', 'outerwear', 'accessory']);
    });

    it('leaves out optional pieces when none are suitable', () => {
      const result = generate([
        item('Top'),
        item('Bottom'),
        item('Shoes', { formality: 'Formal' }),
        item('Outerwear', { isAvailable: false }),
      ]);

      expect(roles(result)).toEqual(['top', 'bottom']);
    });

    it('prefers a core that can be worn with suitable shoes', () => {
      const summerTop = item('Top', { season: 'Summer' });
      const summerBottom = item('Bottom', { season: 'Summer' });
      const dress = item('Dress');
      const winterBoots = item('Shoes', { season: 'Winter' });

      const result = generate([summerTop, summerBottom, dress, winterBoots]);

      expect(ids(result)).toEqual([dress.id, winterBoots.id]);
    });

    it('still returns an outfit without shoes when no core can take them', () => {
      const result = generate([
        item('Top', { season: 'Summer' }),
        item('Bottom', { season: 'Summer' }),
        item('Shoes', { season: 'Winter' }),
      ]);

      expect(roles(result)).toEqual(['top', 'bottom']);
    });
  });

  describe('seasons', () => {
    it('never pairs season-specific items from different seasons', () => {
      const result = generate([item('Top', { season: 'Summer' }), item('Bottom', { season: 'Winter' })]);

      expect(result).toEqual({ status: 'insufficient', occasion: 'casual', reason: 'no_complete_outfit' });
    });

    it('pairs a season-specific item with an All-season one, and reports that season', () => {
      const top = item('Top', { season: 'Winter' });
      const bottom = item('Bottom', { season: 'All-season' });

      const result = generate([top, bottom]);

      expect(ids(result)).toEqual([top.id, bottom.id]);
      expect(result).toMatchObject({ season: 'Winter' });
    });

    it('reports All-season when every piece is All-season', () => {
      expect(generate([item('Top'), item('Bottom')])).toMatchObject({ season: 'All-season' });
    });

    it('skips a bottom from another season and uses the next compatible one', () => {
      const top = item('Top', { season: 'Spring' });
      const autumnBottom = item('Bottom', { season: 'Autumn' });
      const springBottom = item('Bottom', { season: 'Spring' });

      expect(ids(generate([top, autumnBottom, springBottom]))).toEqual([top.id, springBottom.id]);
    });

    it('adds only optional pieces that match the season set by the pieces before them', () => {
      // An All-season core takes Summer shoes, which then rule out the Winter coat.
      const sandals = item('Shoes', { season: 'Summer' });
      const winterCoat = item('Outerwear', { season: 'Winter' });
      const scarf = item('Accessory', { season: 'All-season' });

      const result = generate([item('Top'), item('Bottom'), sandals, winterCoat, scarf]);

      expect(roles(result)).toEqual(['top', 'bottom', 'shoes', 'accessory']);
      expect(ids(result)).toContain(sandals.id);
      expect(ids(result)).not.toContain(winterCoat.id);
      expect(result).toMatchObject({ season: 'Summer' });
    });
  });

  describe('ownership and availability', () => {
    it("never uses another user's items, even when they would complete an outfit", () => {
      const wardrobe = [item('Top'), item('Bottom', { ownerId: OTHER_USER }), item('Dress', { ownerId: OTHER_USER })];

      expect(generate(wardrobe)).toEqual({ status: 'insufficient', occasion: 'casual', reason: 'no_complete_outfit' });
    });

    it('never uses unavailable items, and uses them again once available', () => {
      const top = item('Top');
      const bottom = item('Bottom', { isAvailable: false });

      expect(generate([top, bottom])).toMatchObject({ status: 'insufficient', reason: 'no_complete_outfit' });
      expect(ids(generate([top, { ...bottom, isAvailable: true }]))).toEqual([top.id, bottom.id]);
    });

    it('reports no suitable items when everything is unavailable or belongs to someone else', () => {
      const wardrobe = [item('Dress', { isAvailable: false }), item('Dress', { ownerId: OTHER_USER })];

      expect(generate(wardrobe)).toMatchObject({ status: 'insufficient', reason: 'no_suitable_items' });
    });

    it("leaves out another user's or unavailable optional pieces", () => {
      const result = generate([
        item('Dress'),
        item('Shoes', { ownerId: OTHER_USER }),
        item('Outerwear', { isAvailable: false }),
      ]);

      expect(roles(result)).toEqual(['dress']);
    });
  });

  describe('integrity and determinism', () => {
    it('returns the given item objects, never invented ones, and no item twice', () => {
      const top = item('Top');
      const wardrobe = [top, top, item('Bottom'), item('Shoes'), item('Accessory')];

      const result = generate(wardrobe);
      const chosen = pieces(result).map((p) => p.item);

      for (const piece of chosen) {
        expect(wardrobe).toContain(piece);
      }
      expect(new Set(chosen.map((c) => c.id)).size).toBe(chosen.length);
    });

    it('treats two entries with the same ID as one item', () => {
      const shared = { id: 'same', ownerId: USER, isAvailable: true, season: 'All-season', formality: 'Casual' } as const;

      // The same ID listed as both a top and a bottom can't make an outfit by itself.
      const result = generate([
        { ...shared, category: 'Top' },
        { ...shared, category: 'Bottom' },
      ]);

      expect(result).toMatchObject({ status: 'insufficient', reason: 'no_complete_outfit' });
    });

    it('gives the same outfit for the same wardrobe every time', () => {
      const wardrobe = [item('Top'), item('Top'), item('Bottom'), item('Bottom'), item('Dress'), item('Shoes')];

      expect(generate(wardrobe)).toEqual(generate(wardrobe));
    });

    it('prefers items earlier in the given order', () => {
      const [firstTop, secondTop] = [item('Top'), item('Top')];
      const [firstBottom, secondBottom] = [item('Bottom'), item('Bottom')];

      expect(ids(generate([firstTop, secondTop, firstBottom, secondBottom]))).toEqual([firstTop.id, firstBottom.id]);
      expect(ids(generate([secondTop, firstTop, secondBottom, firstBottom]))).toEqual([secondTop.id, secondBottom.id]);
    });

    it.each([
      ['no pair is compatible', 'Summer', 'Winter', false],
      ['every pair is valid but none can take shoes', 'All-season', 'All-season', true],
    ] as const)(
      'stays bounded on a large wardrobe when %s, instead of trying every pair',
      (_label, topSeason, bottomSeason, expectPair) => {
        let seasonReads = 0;
        const counted = (category: Category, season: OutfitCandidate['season']) => {
          const base = item(category);
          return Object.defineProperty({ ...base }, 'season', {
            get: () => {
              seasonReads++;
              return season;
            },
            enumerable: true,
          }) as OutfitCandidate;
        };
        const size = 300;
        const wardrobe = [
          ...Array.from({ length: size }, () => counted('Top', topSeason)),
          ...Array.from({ length: size }, () => counted('Bottom', bottomSeason)),
          counted('Dress', 'All-season'),
        ];

        const result = generate(wardrobe);

        expect(roles(result)).toEqual(expectPair ? ['top', 'bottom'] : ['dress']);
        // Trying every top with every bottom would read seasons about 2 × 300 × 300 times.
        expect(seasonReads).toBeLessThan(20 * wardrobe.length);
      },
    );
  });
  describe('alternatives (US8)', () => {
    const idsOf = (...items: OutfitCandidate[]) => items.map((i) => i.id);
    const sorted = (list: string[]) => [...list].sort();

    it('treats an empty shown list like a first request', () => {
      const wardrobe = [item('Top'), item('Top'), item('Bottom'), item('Bottom'), item('Shoes')];

      expect(generate(wardrobe, 'casual', [])).toEqual(generate(wardrobe));
    });

    it('returns a different combination from the one already shown', () => {
      const wardrobe = [item('Top'), item('Top'), item('Bottom'), item('Bottom'), item('Shoes')];
      const first = ids(generate(wardrobe));

      const next = ids(generate(wardrobe, 'casual', [first]));

      expect(sorted(next)).not.toEqual(sorted(first));
    });

    it('mixes in clothes that have not been shown yet before reusing shown ones', () => {
      const [shownTop, freshTop] = [item('Top'), item('Top')];
      const [shownBottom, freshBottom] = [item('Bottom'), item('Bottom')];

      const next = generate([shownTop, freshTop, shownBottom, freshBottom], 'casual', [idsOf(shownTop, shownBottom)]);

      expect(ids(next)).toEqual(idsOf(freshTop, freshBottom));
    });

    it('keeps some of the same clothes when only part of the outfit can change', () => {
      const top = item('Top');
      const [shownBottom, freshBottom] = [item('Bottom'), item('Bottom')];

      const next = generate([top, shownBottom, freshBottom], 'casual', [idsOf(top, shownBottom)]);

      expect(ids(next)).toEqual(idsOf(top, freshBottom));
    });

    it('swaps an optional piece when the core cannot change', () => {
      const [top, bottom] = [item('Top'), item('Bottom')];
      const [shownShoes, freshShoes] = [item('Shoes'), item('Shoes')];

      const next = generate([top, bottom, shownShoes, freshShoes], 'casual', [idsOf(top, bottom, shownShoes)]);

      expect(ids(next)).toEqual(idsOf(top, bottom, freshShoes));
    });

    it('spreads repeated requests across the pool instead of reusing the same pieces', () => {
      const tops = [item('Top'), item('Top'), item('Top')];
      const bottoms = [item('Bottom'), item('Bottom'), item('Bottom')];
      const wardrobe = [...tops, ...bottoms];
      const shown: string[][] = [];

      for (let i = 0; i < 3; i++) {
        shown.push(ids(generate(wardrobe, 'casual', shown)));
      }

      // Three requests over three tops and three bottoms wear each piece once.
      expect(sorted(shown.flat())).toEqual(sorted(idsOf(...tops, ...bottoms)));
    });

    it('offers every distinct combination once, then says there is no alternative', () => {
      const wardrobe = [item('Top'), item('Top'), item('Bottom'), item('Bottom')];
      const shown: string[][] = [];

      for (let i = 0; i < 4; i++) {
        shown.push(ids(generate(wardrobe, 'casual', shown)));
      }

      expect(new Set(shown.map((outfit) => sorted(outfit).join())).size).toBe(4);
      expect(generate(wardrobe, 'casual', shown)).toEqual({ status: 'no_alternative', occasion: 'casual' });
    });

    it('says there is no alternative when the wardrobe makes only one outfit', () => {
      const [top, bottom] = [item('Top'), item('Bottom')];

      expect(generate([top, bottom], 'casual', [idsOf(top, bottom)])).toEqual({
        status: 'no_alternative',
        occasion: 'casual',
      });
    });

    it('does not count dropping a suitable piece as an alternative', () => {
      const [top, bottom, shoes] = [item('Top'), item('Bottom'), item('Shoes')];

      expect(generate([top, bottom, shoes], 'casual', [idsOf(top, bottom, shoes)])).toEqual({
        status: 'no_alternative',
        occasion: 'casual',
      });
    });

    it('matches shown outfits regardless of item order', () => {
      const [top, bottom] = [item('Top'), item('Bottom')];

      expect(generate([top, bottom], 'casual', [idsOf(bottom, top)]).status).toBe('no_alternative');
    });

    it('still reports insufficient items rather than no alternative', () => {
      const top = item('Top');

      expect(generate([top], 'casual', [idsOf(top)])).toEqual({
        status: 'insufficient',
        occasion: 'casual',
        reason: 'no_complete_outfit',
      });
    });

    it('never adds a shown item that is unavailable, unsuitable or someone else\'s', () => {
      const [top, bottom] = [item('Top'), item('Bottom')];
      const unavailable = item('Bottom', { isAvailable: false });
      const formal = item('Bottom', { formality: 'Formal' });
      const others = item('Bottom', { ownerId: OTHER_USER });

      const result = generate([top, bottom, unavailable, formal, others], 'casual', [
        idsOf(top, bottom),
        idsOf(top, unavailable, formal, others),
      ]);

      expect(result).toEqual({ status: 'no_alternative', occasion: 'casual' });
    });

    it('keeps the season and formality rules for alternatives', () => {
      const summerTop = item('Top', { season: 'Summer' });
      const winterTop = item('Top', { season: 'Winter' });
      const summerBottom = item('Bottom', { season: 'Summer' });
      const winterBottom = item('Bottom', { season: 'Winter' });
      const winterCoat = item('Outerwear', { season: 'Winter' });

      const next = generate([summerTop, winterTop, summerBottom, winterBottom, winterCoat], 'casual', [
        idsOf(summerTop, summerBottom),
      ]);

      expect(ids(next)).toEqual(idsOf(winterTop, winterBottom, winterCoat));
    });

    it('stays bounded on a large wardrobe', () => {
      let seasonReads = 0;
      const counted = (category: Category) =>
        Object.defineProperty({ ...item(category) }, 'season', {
          get: () => {
            seasonReads++;
            return 'All-season';
          },
          enumerable: true,
        }) as OutfitCandidate;
      const wardrobe = [
        ...Array.from({ length: 300 }, () => counted('Top')),
        ...Array.from({ length: 300 }, () => counted('Bottom')),
        ...Array.from({ length: 300 }, () => counted('Shoes')),
      ];
      const first = ids(generate(wardrobe));
      seasonReads = 0;

      const next = generate(wardrobe, 'casual', [first]);

      expect(sorted(ids(next))).not.toEqual(sorted(first));
      expect(seasonReads).toBeLessThan(20 * wardrobe.length);
    });
  });
});
