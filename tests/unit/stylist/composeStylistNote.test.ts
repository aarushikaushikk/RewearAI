import { describe, expect, it } from 'vitest';
import { composeStylistNote, type PhotoScores, type StylistItem } from '@/services/stylist/composeStylistNote';
import { PIECE_SENTENCES, variantPrompt, vibePrompt } from '@/services/stylist/stylistLibrary';
import { VIBES, type Vibe } from '@/services/stylist/styleVibes';

let next = 1;
const item = (role: StylistItem['role'], style: string, overrides: Partial<StylistItem> = {}): StylistItem => ({
  id: `item-${next++}`,
  role,
  name: `${style} ${role}`,
  color: 'Black',
  style,
  ...overrides,
});

/** Photo scores where each listed item's photo looks most like `vibe`, by `margin`. */
function scoresFor(entries: [StylistItem, Vibe, number][], favouredWording?: [StylistItem, string]): PhotoScores {
  const map = new Map<string, Map<string, number>>();
  for (const [it, vibe, margin] of entries) {
    const labels = new Map<string, number>(VIBES.map((v) => [vibePrompt(v, it.role), 0.01]));
    labels.set(vibePrompt(vibe, it.role), 0.01 + margin);
    map.set(it.id, labels);
  }
  if (favouredWording) {
    map.get(favouredWording[0].id)?.set(favouredWording[1], 0.5);
  }
  return map;
}

describe('composeStylistNote (US13)', () => {
  it('builds the same basic note from saved metadata every time', () => {
    const items = [item('top', 'Classic'), item('bottom', 'Tailored'), item('outerwear', 'Western')];

    const note = composeStylistNote(items, 'neutral');

    expect(note).toEqual(composeStylistNote(items, 'neutral'));
    expect(note.aiAssisted).toBe(false);
    expect(note.mood).toBe('Sticking to neutral shades can give the outfit a polished, pulled-together feel.');
    // Outerwear comes first in the featured-piece order.
    expect(note.featuredId).toBe(items[2].id);
    expect(note.piece).toBe(PIECE_SENTENCES.rugged[0].text.replace('{name}', 'Western outerwear'));
  });

  it('uses a mix sentence when two mood groups tie', () => {
    const items = [item('top', 'Classic'), item('bottom', 'Sporty')];

    expect(composeStylistNote(items, 'neutral').mood).toMatch(/^Sticking to neutral shades .*polished.*sporty/i);
  });

  it('names the actual accent colors in the palette sentence', () => {
    const items = [item('top', 'Classic', { color: 'Red' }), item('bottom', 'Classic', { color: 'White' })];
    expect(composeStylistNote(items, 'one_accent').mood).toMatch(/^Letting the red stand out against neutrals/);

    const paired = [item('top', 'Classic', { color: 'Pink' }), item('bottom', 'Classic', { color: 'Burgundy' })];
    expect(composeStylistNote(paired, 'paired').mood).toMatch(/^Pairing burgundy with pink/);

    const pattern = [item('top', 'Classic', { color: 'Multicolor' }), item('bottom', 'Classic', { color: 'White' })];
    expect(composeStylistNote(pattern, 'one_accent').mood).toMatch(/^Letting one patterned piece stand out/);
  });

  it('features a different piece on Try another when it can', () => {
    const items = [item('top', 'Classic'), item('shoes', 'Sporty'), item('outerwear', 'Western')];

    const first = composeStylistNote(items, 'neutral');
    const next = composeStylistNote(items, 'neutral', { previousFeatured: first.featuredId });

    expect(first.featuredId).toBe(items[2].id);
    expect(next.featuredId).toBe(items[1].id);
  });

  it('keeps the only stylable piece even if it was featured before', () => {
    const items = [item('top', 'Y2K'), item('bottom', 'Classic')];

    expect(composeStylistNote(items, 'neutral', { previousFeatured: items[1].id }).featuredId).toBe(items[1].id);
  });

  it('uses the generic sentence when no piece has a mapped style', () => {
    const items = [item('top', 'Y2K'), item('bottom', 'Gorpcore')];

    const note = composeStylistNote(items, 'neutral');

    expect(note.piece).toBe('The Y2K top can help pull the look together.');
    expect(note.mood).toMatch(/^Sticking to neutral shades /);
  });

  describe('with photo scores (SigLIP)', () => {
    it('features the piece whose photo looks most like its saved style', () => {
      const [top, outer] = [item('top', 'Classic'), item('outerwear', 'Western')];

      const note = composeStylistNote([top, outer], 'neutral', {
        scores: scoresFor([
          [top, 'classic', 0.6],
          [outer, 'rugged', 0.1],
        ]),
      });

      expect(note.featuredId).toBe(top.id);
      expect(note.aiAssisted).toBe(true);
    });

    it('never shows a vibe outside the saved style, even when it scores highest', () => {
      const outer = item('outerwear', 'Western');

      const note = composeStylistNote([outer, item('top', 'Classic')], 'neutral', {
        scores: scoresFor([[outer, 'minimal', 0.9]]),
      });

      expect(note.piece).toMatch(/rugged|outdoorsy/);
      expect(note.piece).not.toMatch(/clean and simple|pared back/);
    });

    it('chooses the wording that best matches the photo', () => {
      const outer = item('outerwear', 'Western');
      const second = PIECE_SENTENCES.rugged[1];

      const note = composeStylistNote([outer], 'neutral', {
        scores: scoresFor([[outer, 'rugged', 0.2]], [outer, variantPrompt(second, outer.role)]),
      });

      expect(note.piece).toBe(second.text.replace('{name}', outer.name));
      expect(note.aiAssisted).toBe(true);
    });

    it('is not marked AI-assisted when the scores change nothing', () => {
      const [top, outer] = [item('top', 'Classic'), item('outerwear', 'Western')];

      const note = composeStylistNote([top, outer], 'neutral', {
        scores: scoresFor([[outer, 'rugged', 0.6]]),
      });

      expect(note).toEqual(composeStylistNote([top, outer], 'neutral'));
    });

    it('falls back to the basic choice for pieces without scores', () => {
      const [top, outer] = [item('top', 'Classic'), item('outerwear', 'Western')];

      expect(composeStylistNote([top, outer], 'neutral', { scores: new Map() })).toEqual(
        composeStylistNote([top, outer], 'neutral'),
      );
    });
  });

  it('refuses an empty outfit', () => {
    expect(() => composeStylistNote([], 'neutral')).toThrow(RangeError);
  });
});
