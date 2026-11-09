import { describe, expect, it } from 'vitest';
import { parseGenerateOutfitPayload } from '@/lib/validation/outfitValidation';
import { OCCASIONS } from '@/types/outfit';

describe('parseGenerateOutfitPayload', () => {
  it.each(OCCASIONS)('accepts { occasion: "%s" }', (occasion) => {
    expect(parseGenerateOutfitPayload({ occasion })).toEqual({ ok: true, occasion });
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
  ])('rejects %s as an invalid payload', (_label, body) => {
    expect(parseGenerateOutfitPayload(body)).toEqual({ ok: false, error: 'Invalid request payload' });
  });
});
