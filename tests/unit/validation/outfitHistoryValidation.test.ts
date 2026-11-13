import { describe, expect, it } from 'vitest';
import {
  INVALID_PAYLOAD_ERROR,
  INVALID_WORN_DATE_ERROR,
  parseMarkWornPayload,
} from '@/lib/validation/outfitHistoryValidation';

const NOW = new Date('2026-11-11T18:00:00.000Z');
const TOP = '64c0000000000000000000a1';
const BOTTOM = '64c0000000000000000000a2';

function payload(overrides: Record<string, unknown> = {}) {
  return { itemIds: [TOP, BOTTOM], occasion: 'work', wornOn: '2026-11-11', ...overrides };
}

describe('parseMarkWornPayload', () => {
  it('accepts exactly { itemIds, occasion, wornOn }', () => {
    expect(parseMarkWornPayload(payload(), NOW)).toEqual({
      ok: true,
      value: { itemIds: [TOP, BOTTOM], occasion: 'work', wornOn: '2026-11-11' },
    });
  });

  it('keeps the item order but lowercases the IDs', () => {
    const result = parseMarkWornPayload(payload({ itemIds: [BOTTOM.toUpperCase(), TOP] }), NOW);

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ itemIds: [BOTTOM, TOP] }) });
  });

  it.each([
    ['a missing body', undefined],
    ['null', null],
    ['an array', [payload()]],
    ['a string', 'itemIds'],
    ['an extra field such as a user ID', payload({ userId: '64b000000000000000000002' })],
    ['an owner field', payload({ owner: '64b000000000000000000002' })],
    ['client-supplied item details', payload({ items: [{ id: TOP, category: 'Top' }] })],
    ['missing itemIds', { occasion: 'work', wornOn: '2026-11-11' }],
    ['missing occasion', { itemIds: [TOP], wornOn: '2026-11-11' }],
    ['missing wornOn', { itemIds: [TOP], occasion: 'work' }],
    ['itemIds that is not an array', payload({ itemIds: TOP })],
    ['no items', payload({ itemIds: [] })],
    ['more than six items', payload({ itemIds: Array.from({ length: 7 }, (_, i) => `64c00000000000000000000${i}`) })],
    ['a non-string item ID', payload({ itemIds: [TOP, 42] })],
    ['an empty item ID', payload({ itemIds: [TOP, ''] })],
    ['an item ID with unsafe characters', payload({ itemIds: [TOP, '{"$ne":null}'] })],
    ['an overlong item ID', payload({ itemIds: [TOP, 'a'.repeat(65)] })],
    ['a repeated item ID', payload({ itemIds: [TOP, TOP] })],
    ['an ID repeated in another case', payload({ itemIds: [TOP, TOP.toUpperCase()] })],
    ['an unknown occasion', payload({ occasion: 'party' })],
    ['an occasion in another case', payload({ occasion: 'Work' })],
    ['a non-string worn date', payload({ wornOn: 20261111 })],
    ['an inherited occasion name', payload({ occasion: 'toString' })],
  ])('rejects %s as an invalid payload', (_label, body) => {
    expect(parseMarkWornPayload(body, NOW)).toEqual({ ok: false, error: INVALID_PAYLOAD_ERROR });
  });

  it.each([
    ['an impossible date', '2026-02-30'],
    ['a malformed date', '11/11/2026'],
    ['a date with a time', '2026-11-11T10:00:00Z'],
    ['a backdated day', '2026-11-09'],
    ['last year', '2025-11-11'],
    ['a future day', '2026-11-13'],
    ['an empty date', ''],
  ])('rejects %s as an invalid worn date', (_label, wornOn) => {
    expect(parseMarkWornPayload(payload({ wornOn }), NOW)).toEqual({
      ok: false,
      error: INVALID_WORN_DATE_ERROR,
    });
  });

  it('accepts the next day while it is already that day somewhere east of UTC', () => {
    expect(parseMarkWornPayload(payload({ wornOn: '2026-11-12' }), NOW)).toMatchObject({ ok: true });
  });

  it('accepts the previous day while it is still that day somewhere west of UTC', () => {
    const earlyUtc = new Date('2026-11-11T06:00:00.000Z');

    expect(parseMarkWornPayload(payload({ wornOn: '2026-11-10' }), earlyUtc)).toMatchObject({ ok: true });
  });

  it('uses the current time when none is given', () => {
    const today = new Date().toISOString().slice(0, 10);

    expect(parseMarkWornPayload(payload({ wornOn: today }))).toMatchObject({ ok: true });
  });
});
