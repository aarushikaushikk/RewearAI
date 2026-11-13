import { describe, expect, it } from 'vitest';
import { COLOR_FAMILY, paletteOf, paletteScore, PALETTES, type Palette } from '@/services/outfits/colorHarmony';
import { COLORS, type Color } from '@/types/wardrobe';

describe('colorHarmony', () => {
  describe('COLOR_FAMILY', () => {
    it('gives every wardrobe color a family', () => {
      for (const color of COLORS) {
        expect(['neutral', 'accent', 'pattern']).toContain(COLOR_FAMILY[color]);
      }
    });

    it('treats navy and indigo as neutral basics and Multicolor as a pattern', () => {
      expect(COLOR_FAMILY.Navy).toBe('neutral');
      expect(COLOR_FAMILY.Indigo).toBe('neutral');
      expect(COLOR_FAMILY.Red).toBe('accent');
      expect(COLOR_FAMILY.Multicolor).toBe('pattern');
    });
  });

  describe('paletteOf', () => {
    it.each<[string, Color[], Palette]>([
      ['one color throughout', ['Red', 'Red'], 'tonal'],
      ['one tonal family', ['Navy', 'Indigo', 'Blue'], 'tonal'],
      ['warm browns', ['Beige', 'Camel', 'Brown'], 'tonal'],
      ['only neutrals', ['White', 'Navy', 'Brown'], 'neutral'],
      ['neutrals with one accent', ['White', 'Navy', 'Red'], 'one_accent'],
      ['neutrals with one Multicolor piece', ['Black', 'Multicolor'], 'one_accent'],
      ['a listed accent pair', ['Burgundy', 'Pink', 'Black'], 'paired'],
      ['two accents of one family with a neutral', ['Red', 'Pink', 'White'], 'paired'],
      ['two unpaired accents', ['Green', 'Orange', 'White'], 'bold'],
      ['three accents', ['Red', 'Blue', 'Yellow'], 'bold'],
      ['two Multicolor pieces', ['Multicolor', 'Multicolor', 'White'], 'bold'],
      ['a Multicolor piece with an accent', ['Multicolor', 'Red'], 'bold'],
    ])('classifies %s', (_label, colors, expected) => {
      expect(paletteOf(colors)).toBe(expected);
    });

    it('does not depend on the order of the colors', () => {
      const colors: Color[] = ['Pink', 'Black', 'Burgundy'];

      expect(paletteOf([...colors].reverse())).toBe(paletteOf(colors));
      expect(paletteOf(['Orange', 'Blue'])).toBe(paletteOf(['Blue', 'Orange']));
    });

    it('refuses an empty outfit instead of guessing', () => {
      expect(() => paletteOf([])).toThrow(RangeError);
    });
  });

  describe('paletteScore', () => {
    it('ranks calmer palettes above bolder ones', () => {
      expect(paletteScore('tonal')).toBeGreaterThan(paletteScore('neutral'));
      expect(paletteScore('neutral')).toBe(paletteScore('one_accent'));
      expect(paletteScore('one_accent')).toBeGreaterThan(paletteScore('paired'));
      expect(paletteScore('paired')).toBeGreaterThan(paletteScore('bold'));
    });

    it('scores every palette', () => {
      for (const palette of PALETTES) {
        expect(Number.isFinite(paletteScore(palette))).toBe(true);
      }
    });
  });
});
