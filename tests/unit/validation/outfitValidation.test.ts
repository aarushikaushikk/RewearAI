import { describe, expect, it } from 'vitest';
import {
  MAX_SHOWN_OUTFITS,
  parseGenerateOutfitPayload,
  parseSaveOutfitPayload,
} from '@/lib/validation/outfitValidation';
import { OCCASIONS } from '@/types/outfit';

describe('parseGenerateOutfitPayload', () => {
  it.each(OCCASIONS)('accepts { occasion: "%s" }', (occasion) => {
    expect(parseGenerateOutfitPayload({ occasion })).toEqual({ ok: true, occasion, shown: [] });
  });

  it('accepts the item IDs of outfits already shown (US8)', () => {
    const shown = [['item_1', 'item_2'], ['item_3', 'item_4', 'item_5']];

    expect(parseGenerateOutfitPayload({ occasion: 'work', shown })).toEqual({ ok: true, occasion: 'work', shown });
  });

  it(`accepts up to ${MAX_SHOWN_OUTFITS} shown outfits`, () => {
    const shown = Array.from({ length: MAX_SHOWN_OUTFITS }, (_, i) => [`item_${i}`]);

    expect(parseGenerateOutfitPayload({ occasion: 'work', shown })).toMatchObject({ ok: true, shown });
  });

  it.each([
    ['a missing occasion', {}],
    ['an empty occasion', { occasion: '' }],
    ['a differently cased occasion', { occasion: 'Work' }],
    ['an unsupported occasion', { occasion: 'party' }],
    ['a padded occasion', { occasion: ' work ' }],
    ['a number', { occasion: 1 }],
    ['null', { occasion: null }],
  ])('asks for an occasion for %s', (_label, body) => {
    expect(parseGenerateOutfitPayload(body)).toEqual({ ok: false, error: 'Choose an occasion to continue.' });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'work'],
    ['an array', ['work']],
    ['a client-supplied user ID', { occasion: 'work', userId: 'someone-else' }],
    ['client-supplied item IDs', { occasion: 'work', itemIds: ['item-1'] }],
    ['an owner field', { occasion: 'work', ownerId: 'someone-else' }],
    ['shown that is not a list', { occasion: 'work', shown: 'item_1' }],
    ['a shown outfit that is not a list', { occasion: 'work', shown: ['item_1'] }],
    ['an empty shown outfit', { occasion: 'work', shown: [[]] }],
    ['a shown outfit with too many items', { occasion: 'work', shown: [['a', 'b', 'c', 'd', 'e', 'f', 'g']] }],
    ['a shown outfit with a repeated item', { occasion: 'work', shown: [['item_1', 'item_1']] }],
    ['a shown item ID that is not a string', { occasion: 'work', shown: [[1]] }],
    ['an empty shown item ID', { occasion: 'work', shown: [['']] }],
    ['an overlong shown item ID', { occasion: 'work', shown: [['x'.repeat(65)]] }],
    [
      'too many shown outfits',
      { occasion: 'work', shown: Array.from({ length: MAX_SHOWN_OUTFITS + 1 }, (_, i) => [`item_${i}`]) },
    ],
  ])('rejects %s as an invalid payload', (_label, body) => {
    expect(parseGenerateOutfitPayload(body)).toEqual({ ok: false, error: 'Invalid request payload' });
  });
});

describe('parseSaveOutfitPayload', () => {
  const itemIds = ['item_1', 'item_2', 'item_3'];

  it.each(OCCASIONS)('accepts a %s outfit with its item IDs', (occasion) => {
    expect(parseSaveOutfitPayload({ occasion, itemIds })).toEqual({ ok: true, occasion, itemIds });
  });

  it('accepts up to six items, one per outfit role', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];

    expect(parseSaveOutfitPayload({ occasion: 'work', itemIds: six })).toEqual({
      ok: true,
      occasion: 'work',
      itemIds: six,
    });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an array', [itemIds]],
    ['a missing occasion', { itemIds }],
    ['an unsupported occasion', { occasion: 'party', itemIds }],
    ['missing items', { occasion: 'work' }],
    ['no items', { occasion: 'work', itemIds: [] }],
    ['too many items', { occasion: 'work', itemIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    ['items that are not a list', { occasion: 'work', itemIds: 'item_1' }],
    ['a blank item ID', { occasion: 'work', itemIds: ['item_1', ''] }],
    ['a non-string item ID', { occasion: 'work', itemIds: ['item_1', 2] }],
    ['an overlong item ID', { occasion: 'work', itemIds: ['x'.repeat(65)] }],
    ['the same item twice', { occasion: 'work', itemIds: ['item_1', 'item_1'] }],
    ['an owner ID', { occasion: 'work', itemIds, userId: 'someone-else' }],
    ['an explanation', { occasion: 'work', itemIds, explanation: 'Looks great' }],
  ])('rejects %s', (_label, body) => {
    expect(parseSaveOutfitPayload(body)).toEqual({ ok: false, error: 'Invalid request payload' });
  });
});
