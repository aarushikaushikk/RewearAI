import { describe, expect, it } from 'vitest';
import {
  parseNewItemPayload,
  toNewWardrobeItem,
  validateNewItemInput,
} from '@/lib/validation/wardrobeValidation';

function validInput(overrides: Record<string, string> = {}) {
  return {
    publicId: 'rewear/users/u1/abc',
    name: 'Linen shirt',
    category: 'Top',
    color: 'White',
    style: 'Button-down',
    season: 'Summer',
    formality: 'Smart casual',
    ...overrides,
  };
}

describe('parseNewItemPayload', () => {
  it('keeps only the known string fields', () => {
    expect(parseNewItemPayload({ ...validInput(), owner: 'someone-else', isAvailable: false })).toEqual(
      validInput(),
    );
  });

  it('turns missing fields into empty strings so they are reported as field errors', () => {
    expect(parseNewItemPayload({})).toEqual({
      publicId: '',
      name: '',
      category: '',
      color: '',
      style: '',
      season: '',
      formality: '',
    });
  });

  it.each([null, 'text', 42, [], { category: 7 }])('rejects the malformed body %j', (body) => {
    expect(parseNewItemPayload(body)).toBeNull();
  });
});

describe('validateNewItemInput', () => {
  it('accepts complete input', () => {
    expect(validateNewItemInput(validInput())).toEqual({ isValid: true, errors: {} });
  });

  it('accepts an item with no name', () => {
    expect(validateNewItemInput(validInput({ name: '  ' })).isValid).toBe(true);
  });

  it('reports every missing required field, in the order they appear', () => {
    const { isValid, errors } = validateNewItemInput(
      validInput({ publicId: '', category: '', color: '', style: ' ', season: '', formality: '' }),
    );

    expect(isValid).toBe(false);
    expect(Object.keys(errors)).toEqual([
      'image',
      'category',
      'color',
      'season',
      'formality',
      'style',
    ]);
    expect(errors.image).toBe('Upload an image of the item.');
    expect(errors.category).toBe('Choose a category.');
    expect(errors.style).toBe('Enter a style.');
  });

  it.each([
    ['category', 'Hat'],
    ['color', 'Chartreuse'],
    ['season', 'Monsoon'],
    ['formality', 'Black tie'],
  ])('rejects an unknown %s', (field, value) => {
    expect(validateNewItemInput(validInput({ [field]: value })).errors[field]).toBeDefined();
  });

  it('rejects a name over 80 characters and a style over 40', () => {
    const { errors } = validateNewItemInput(
      validInput({ name: 'x'.repeat(81), style: 'y'.repeat(41) }),
    );

    expect(errors.name).toBe('Use 80 characters or fewer.');
    expect(errors.style).toBe('Use 40 characters or fewer.');
  });
});

describe('toNewWardrobeItem', () => {
  it('trims text and stores a blank name as null', () => {
    expect(
      toNewWardrobeItem(validInput({ name: '   ', style: '  Button-down ', publicId: ' p ' })),
    ).toEqual({
      publicId: 'p',
      name: null,
      category: 'Top',
      color: 'White',
      style: 'Button-down',
      season: 'Summer',
      formality: 'Smart casual',
    });
  });
});
