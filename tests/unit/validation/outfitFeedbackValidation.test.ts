import { describe, expect, it } from 'vitest';
import { INVALID_PAYLOAD_ERROR, parseOutfitFeedbackPayload } from '@/lib/validation/outfitValidation';
import { FEEDBACK_RATINGS, OCCASIONS } from '@/types/outfit';

const valid = { occasion: 'work', itemIds: ['item_shirt', 'item_chinos'], rating: 'positive' };
const invalid = { ok: false, error: INVALID_PAYLOAD_ERROR };

describe('parseOutfitFeedbackPayload (US14)', () => {
  it.each(FEEDBACK_RATINGS)('accepts a %s rating', (rating) => {
    expect(parseOutfitFeedbackPayload({ ...valid, rating })).toEqual({
      ok: true,
      occasion: 'work',
      itemIds: ['item_shirt', 'item_chinos'],
      rating,
    });
  });

  it.each(OCCASIONS)('accepts the %s occasion', (occasion) => {
    expect(parseOutfitFeedbackPayload({ ...valid, occasion })).toMatchObject({ ok: true, occasion });
  });

  it.each([
    ['no body', undefined],
    ['an array', [valid]],
    ['a missing rating', { occasion: 'work', itemIds: ['a'] }],
    ['a null rating', { ...valid, rating: null }],
    ['an unknown rating', { ...valid, rating: 'neutral' }],
    ['a differently cased rating', { ...valid, rating: 'Positive' }],
    ['an unknown occasion', { ...valid, occasion: 'party' }],
    ['no items', { ...valid, itemIds: [] }],
    ['a repeated item', { ...valid, itemIds: ['a', 'a'] }],
    ['too many items', { ...valid, itemIds: ['1', '2', '3', '4', '5', '6', '7'] }],
    ['a non-string item', { ...valid, itemIds: [42] }],
    ['an owner ID', { ...valid, ownerId: 'user_sam' }],
    ['an outfit ID', { ...valid, outfitId: 'outfit_1' }],
  ])('rejects %s', (_label, body) => {
    expect(parseOutfitFeedbackPayload(body)).toEqual(invalid);
  });

  it('copies the item IDs, so later changes to the body do not change the result', () => {
    const body = { ...valid, itemIds: ['a', 'b'] };

    const result = parseOutfitFeedbackPayload(body);
    body.itemIds.push('c');

    expect(result).toMatchObject({ itemIds: ['a', 'b'] });
  });
});
