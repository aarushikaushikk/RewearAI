import { describe, expect, it } from 'vitest';
import { MOOD_GROUPS, VIBE_GROUP, VIBES, vibeForStyle, type Vibe } from '@/services/stylist/styleVibes';

describe('styleVibes (US13)', () => {
  it('puts every vibe in exactly one mood group', () => {
    for (const vibe of VIBES) {
      expect(MOOD_GROUPS).toContain(VIBE_GROUP[vibe]);
    }
  });

  it.each<[string, Vibe]>([
    ['Polished', 'polished'],
    ['Tailored', 'polished'],
    ['Basic', 'minimal'],
    ['Casual', 'relaxed'],
    ['Denim', 'relaxed'],
    ['Western', 'rugged'],
    ['Streetwear', 'edgy'],
    ['Statement', 'bold'],
    ['Party', 'glamorous'],
    ['Vintage', 'retro'],
    ['Relaxed tailoring', 'polished'],
  ])('maps the saved style %s to %s', (style, vibe) => {
    expect(vibeForStyle(style)).toBe(vibe);
  });

  it('ignores case and surrounding spaces', () => {
    expect(vibeForStyle('  wEsTeRn ')).toBe('rugged');
  });

  it.each(['', 'Y2K', 'toString', 'constructor', '__proto__', '✨'])('leaves %j unmapped', (style) => {
    expect(vibeForStyle(style)).toBeNull();
  });

  it('maps every style in the evidence account', () => {
    const seeded = [
      'Sporty', 'Casual', 'Party', 'Polished', 'Elegant', 'Outdoor', 'Playful', 'Cozy', 'Minimal', 'Classic',
      'Evening', 'Heritage', 'Retro', 'Formal', 'Feminine', 'Relaxed', 'Statement', 'Preppy', 'Sleek', 'Rugged',
      'Nautical', 'Utility', 'Boho', 'Romantic', 'Cheerful', 'Breezy', 'Glamorous', 'Streetwear', 'Resort',
      'Western', 'Denim', 'Tailored', 'Relaxed tailoring', 'Edgy', 'Vintage', 'Modern', 'Soft', 'Workwear', 'Basic',
    ];
    expect(seeded.filter((style) => vibeForStyle(style) === null)).toEqual([]);
  });
});
