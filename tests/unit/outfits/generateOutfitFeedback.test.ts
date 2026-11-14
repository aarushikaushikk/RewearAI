// US14: combinations the user marked Not helpful are avoided when another valid one exists.
import { describe, expect, it } from 'vitest';
import { generateOutfit, type OutfitCandidate, type OutfitGenerationResult } from '@/services/outfits/generateOutfit';
import type { Category } from '@/types/wardrobe';

const USER = 'user-a';

let nextId = 1;
function item(category: Category, overrides: Partial<OutfitCandidate> = {}): OutfitCandidate {
  return {
    id: `fb-item-${nextId++}`,
    ownerId: USER,
    isAvailable: true,
    category,
    color: 'Black',
    season: 'All-season',
    formality: 'Casual',
    ...overrides,
  };
}

function ids(result: OutfitGenerationResult<OutfitCandidate>): string[] {
  if (result.status !== 'ok') {
    throw new Error(`expected an outfit, got ${result.status}`);
  }
  return result.pieces.map((piece) => piece.item.id);
}

const sorted = (values: string[]) => [...values].sort();

describe('generateOutfit with disliked combinations (US14)', () => {
  it('skips a disliked combination when another valid one exists', () => {
    const [tee, polo, jeans] = [item('Top'), item('Top'), item('Bottom')];
    const first = generateOutfit({ userId: USER, occasion: 'casual', items: [tee, polo, jeans] });
    expect(ids(first)).toEqual([tee.id, jeans.id]);

    const next = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, polo, jeans],
      disliked: [[tee.id, jeans.id]],
    });

    expect(ids(next)).toEqual([polo.id, jeans.id]);
  });

  it('matches a disliked combination in any order', () => {
    const [tee, polo, jeans] = [item('Top'), item('Top'), item('Bottom')];

    const result = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, polo, jeans],
      disliked: [[jeans.id, tee.id]],
    });

    expect(ids(result)).toEqual([polo.id, jeans.id]);
  });

  it('prefers a liked or unrated outfit over a disliked one, even with shoes or a calmer palette', () => {
    // The disliked outfit has shoes; the other can't, because the shoes are summer-only.
    const tee = item('Top', { season: 'Summer' });
    const jeans = item('Bottom', { season: 'Summer' });
    const sandals = item('Shoes', { season: 'Summer' });
    const sweater = item('Top', { season: 'Winter', color: 'Red' });
    const cords = item('Bottom', { season: 'Winter', color: 'Green' });

    const result = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, jeans, sandals, sweater, cords],
      disliked: [[tee.id, jeans.id, sandals.id]],
    });

    expect(sorted(ids(result))).toEqual(sorted([sweater.id, cords.id]));
  });

  it('still returns a disliked combination when it is the only valid outfit', () => {
    const [tee, jeans] = [item('Top'), item('Bottom')];

    const result = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, jeans],
      disliked: [[tee.id, jeans.id]],
    });

    expect(ids(result)).toEqual([tee.id, jeans.id]);
  });

  it('only avoids the exact combination: a superset or subset is a different outfit', () => {
    const [tee, jeans, sneakers] = [item('Top'), item('Bottom'), item('Shoes')];

    const result = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, jeans, sneakers],
      disliked: [[tee.id, jeans.id]],
    });

    expect(ids(result)).toEqual([tee.id, jeans.id, sneakers.id]);
  });

  it('on Try another, offers unshown unrated outfits before an unshown disliked one', () => {
    const [tee, polo, henley, jeans] = [item('Top'), item('Top'), item('Top'), item('Bottom')];

    const result = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, polo, henley, jeans],
      shown: [[tee.id, jeans.id]],
      disliked: [[polo.id, jeans.id]],
    });

    expect(ids(result)).toEqual([henley.id, jeans.id]);
  });

  it('offers a disliked outfit as the alternative when it is the only unshown one', () => {
    const [tee, polo, jeans] = [item('Top'), item('Top'), item('Bottom')];

    const result = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, polo, jeans],
      shown: [[tee.id, jeans.id]],
      disliked: [[polo.id, jeans.id]],
    });

    expect(ids(result)).toEqual([polo.id, jeans.id]);
  });

  it('never makes an item eligible: a disliked list naming unknown items changes nothing', () => {
    const [tee, jeans] = [item('Top'), item('Bottom')];

    const result = generateOutfit({
      userId: USER,
      occasion: 'casual',
      items: [tee, jeans],
      disliked: [['someone-else-1', 'someone-else-2']],
    });

    expect(ids(result)).toEqual([tee.id, jeans.id]);
  });
});
