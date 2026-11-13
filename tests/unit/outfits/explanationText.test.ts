import { describe, expect, it } from 'vitest';
import { OCCASION_FORMALITIES } from '@/services/outfits/generateOutfit';
import { reasonLine } from '@/services/outfits/explanationText';
import { OCCASIONS, PALETTES, type OutfitExplanationDto } from '@/types/outfit';
import type { Color, Season } from '@/types/wardrobe';

const facts = (overrides: Partial<OutfitExplanationDto> = {}): OutfitExplanationDto => ({
  formalities: ['Smart casual', 'Formal'],
  seasons: ['Autumn', 'All-season'],
  palette: 'neutral',
  alternative: false,
  ...overrides,
});

describe('reasonLine (US13)', () => {
  it('states the formality, season and palette the outfit was picked on', () => {
    expect(reasonLine('work', facts(), ['White', 'Navy', 'Brown'])).toBe(
      'Picked for Work because every piece is Smart casual or Formal, they all suit Autumn, and the colors stay in neutrals.',
    );
  });

  it.each<[string, Season[], string]>([
    ['only All-season pieces', ['All-season'], 'every piece is All-season'],
    ['one specific season', ['Summer'], 'they all suit Summer'],
  ])('describes %s', (_label, seasons, phrase) => {
    expect(reasonLine('casual', facts({ formalities: ['Casual'], seasons }), ['Black'])).toContain(phrase);
  });

  it.each<[OutfitExplanationDto['palette'], Color[], string]>([
    ['tonal', ['Navy', 'Indigo'], 'the colors keep to one color family'],
    ['neutral', ['White', 'Black'], 'the colors stay in neutrals'],
    ['one_accent', ['White', 'Red'], 'Red is the only accent color'],
    ['one_accent', ['White', 'Multicolor'], 'one patterned piece is the only accent'],
    ['paired', ['Pink', 'Burgundy', 'Black'], 'it pairs Burgundy with Pink'],
    ['bold', ['Red', 'Green', 'Yellow'], 'it mixes several colors'],
  ])('describes a %s palette from the actual colors', (palette, colors, phrase) => {
    expect(reasonLine('casual', facts({ formalities: ['Casual'], palette }), colors)).toContain(phrase);
  });

  it('adds that Try another gave a different combination', () => {
    expect(reasonLine('work', facts({ alternative: true }), ['White'])).toMatch(
      /\. It's a different combination from the ones you've already seen\.$/,
    );
    expect(reasonLine('work', facts(), ['White'])).not.toContain('different combination');
  });

  it('names the occasion and stays short for every combination of facts', () => {
    const seasonSets: Season[][] = [['All-season'], ['Winter'], ['Summer', 'All-season']];
    for (const occasion of OCCASIONS) {
      const allowed = OCCASION_FORMALITIES[occasion];
      const formalitySets = [allowed.slice(0, 1), allowed.slice(-1), [...allowed]];
      for (const formalities of formalitySets) {
        for (const seasons of seasonSets) {
          for (const palette of PALETTES) {
            for (const alternative of [false, true]) {
              const line = reasonLine(occasion, { formalities, seasons, palette, alternative }, ['Pink', 'Burgundy']);
              expect(line).toMatch(new RegExp(`^Picked for ${occasion} because`, 'i'));
              expect(line.length).toBeLessThanOrEqual(300);
              expect(line).not.toMatch(/perfect|ideal|best|always|must|definitely/i);
            }
          }
        }
      }
    }
  });
});
