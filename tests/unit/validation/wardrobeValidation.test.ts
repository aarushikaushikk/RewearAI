import { describe, expect, it } from 'vitest';
import {
  parseItemDetailsPayload,
  parseNewItemPayload,
  toItemDetails,
  toNewWardrobeItem,
  validateItemDetails,
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

// Editing an item (US4, #9) uses the same rules as Add Clothing, without the image.
function validDetails(overrides: Record<string, string> = {}) {
  const { name, category, color, style, season, formality } = validInput(overrides);
  return { name, category, color, style, season, formality };
}

describe('parseItemDetailsPayload', () => {
  it('keeps only the editable fields, dropping the image, owner and availability', () => {
    expect(
      parseItemDetailsPayload({
        ...validInput(),
        owner: 'someone-else',
        ownerId: 'someone-else',
        isAvailable: false,
        image: { url: 'https://evil.example/x.jpg', publicId: 'x' },
      }),
    ).toEqual(validDetails());
  });

  it('turns missing fields into empty strings so they are reported as field errors', () => {
    expect(parseItemDetailsPayload({})).toEqual({
      name: '',
      category: '',
      color: '',
      style: '',
      season: '',
      formality: '',
    });
  });

  it.each([null, 'text', 42, [], { style: 7 }])('rejects the malformed body %j', (body) => {
    expect(parseItemDetailsPayload(body)).toBeNull();
  });
});

describe('validateItemDetails', () => {
  it('accepts complete details, with or without a name', () => {
    expect(validateItemDetails(validDetails())).toEqual({ isValid: true, errors: {} });
    expect(validateItemDetails(validDetails({ name: '' })).isValid).toBe(true);
  });

  it('does not ask for an image', () => {
    expect(validateItemDetails(validDetails()).errors.image).toBeUndefined();
  });

  it('reports the same field errors as Add Clothing', () => {
    const edited = validDetails({ category: 'Hat', style: ' ', name: 'x'.repeat(81) });
    const added = validateNewItemInput({ ...edited, publicId: 'p' });

    expect(validateItemDetails(edited).errors).toEqual(added.errors);
  });
});

describe('toItemDetails', () => {
  it('trims text and stores a blank name as null', () => {
    expect(toItemDetails(validDetails({ name: '  ', style: ' Oxford ' }))).toEqual({
      name: null,
      category: 'Top',
      color: 'White',
      style: 'Oxford',
      season: 'Summer',
      formality: 'Smart casual',
    });
  });
});
