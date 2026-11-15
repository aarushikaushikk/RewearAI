import { describe, expect, it } from 'vitest';
import {
  fillTemplate,
  GENERIC_PIECE_SENTENCE,
  MOOD_ENDINGS,
  MOOD_KEYS,
  PALETTE_OPENERS,
  PIECE_SENTENCES,
  stylistLabels,
  variantPrompt,
  vibePrompt,
} from '@/services/stylist/stylistLibrary';
import { VIBES } from '@/services/stylist/styleVibes';

// The rules every stylist sentence must follow (LLD #18 §6.2, PRD US13 AC4).
const HEDGE = /\b(can|could|may|might|tends? to|often)\b/i;
const BANNED = /\b(perfect(ly)?|flawless|ideal|guarantee[ds]?|always|never fails|must|best|definitely|stunning|beautiful(ly)?)\b/i;
const LEARNS = /\b(learn|remember|your (taste|preferences|history)|you usually)\b/i;
// Garments, fabrics, weather, places and occasions may only come from the slots.
const INVENTED =
  /\b(dress|shirt|blouse|tee|sweater|hoodie|jeans|trousers|pants|chinos|shorts|skirt|blazer|jacket|coat|heels|loafers|sneakers|boots|sandals|scarf|hat|cap|belt|bag|tote|watch|necklace|tie|silk|satin|linen|wool|cotton|leather|suede|denim|cashmere|velvet|rain|snow|sunny|cold|hot|weather|beach|office|wedding|party|brunch|dinner|weekend|work|night out)\b/i;

const SAMPLE = { name: 'Charcoal Item', accent: 'red', accentA: 'burgundy', accentB: 'pink' };

const allSentences = () => [
  ...Object.values(PALETTE_OPENERS).flatMap((opener) =>
    Object.values(MOOD_ENDINGS).map((ending) => fillTemplate(`${opener} ${ending}`, SAMPLE)),
  ),
  ...VIBES.flatMap((vibe) => PIECE_SENTENCES[vibe].map((variant) => fillTemplate(variant.text, SAMPLE))),
  fillTemplate(GENERIC_PIECE_SENTENCE, SAMPLE),
];

describe('stylistLibrary (US13)', () => {
  it('has a mood ending for every group, every mix of two groups, and no mapped style', () => {
    expect(MOOD_KEYS).toHaveLength(4 + 6 + 1);
    for (const key of MOOD_KEYS) {
      expect(MOOD_ENDINGS[key]).toBeTruthy();
    }
  });

  it('has at least two piece sentences for every vibe', () => {
    for (const vibe of VIBES) {
      expect(PIECE_SENTENCES[vibe].length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(allSentences().map((s) => [s]))('follows the stylist rules: %s', (sentence) => {
    expect(sentence).toMatch(HEDGE);
    expect(sentence).not.toMatch(BANNED);
    expect(sentence).not.toMatch(LEARNS);
    expect(sentence.replace(SAMPLE.name, '')).not.toMatch(INVENTED);
    expect(sentence).not.toMatch(/[{}]/);
    expect(sentence).toMatch(/^[A-Z].*\.$/);
    expect(sentence.length).toBeLessThanOrEqual(200);
  });

  it.each(['top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessory'] as const)(
    'uses one fixed, distinct label set for %s photos',
    (role) => {
      const labels = stylistLabels(role);
      expect(stylistLabels(role)).toBe(labels);
      expect(new Set(labels).size).toBe(labels.length);
      for (const vibe of VIBES) {
        expect(labels).toContain(vibePrompt(vibe, role));
        for (const variant of PIECE_SENTENCES[vibe]) {
          expect(labels).toContain(variantPrompt(variant, role));
        }
      }
    },
  );

  it('names the role in photo prompts', () => {
    expect(vibePrompt('rugged', 'outerwear')).toBe('a photo of a rugged jacket');
    expect(vibePrompt('sporty', 'shoes')).toBe('a photo of a sporty pair of shoes');
  });

  it('fills slots as plain text', () => {
    expect(fillTemplate('The {name} can work.', { name: '<b>$& {accent}</b>' })).toBe('The <b>$& {accent}</b> can work.');
  });
});
