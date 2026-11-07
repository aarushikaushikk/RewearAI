import { describe, it, expect } from 'vitest';
import { parseLoginPayload, parseRegisterPayload } from '@/lib/validation/authValidation';

describe('auth payload parsing', () => {
  const NOT_OBJECTS = [null, 123, 'text', true, [], [{ email: 'a@example.com' }]];
  const BAD_FIELDS = [
    { email: 123, password: 'Password123!' },
    { email: null, password: 'Password123!' },
    { email: { $ne: '' }, password: 'Password123!' },
    { email: ['a@example.com'], password: 'Password123!' },
    { email: 'a@example.com', password: 12345678 },
    { email: 'a@example.com', password: { $ne: '' } },
    { email: 'a@example.com', password: null },
  ];

  it.each(NOT_OBJECTS)('parseLoginPayload rejects non-object body %j', (body) => {
    expect(parseLoginPayload(body)).toBeNull();
  });

  it.each(BAD_FIELDS)('parseLoginPayload rejects wrongly typed fields %j', (body) => {
    expect(parseLoginPayload(body)).toBeNull();
  });

  it('parseLoginPayload keeps only known string fields', () => {
    expect(
      parseLoginPayload({ email: 'a@example.com', password: 'secret-value', role: 'admin' }),
    ).toEqual({ email: 'a@example.com', password: 'secret-value' });
  });

  it('parseLoginPayload leaves missing fields to field-level validation', () => {
    expect(parseLoginPayload({})).toEqual({ email: '', password: '' });
  });

  it.each(NOT_OBJECTS)('parseRegisterPayload rejects non-object body %j', (body) => {
    expect(parseRegisterPayload(body)).toBeNull();
  });

  it.each([...BAD_FIELDS, { email: 'a@example.com', password: 'Password123!', name: 123 }])(
    'parseRegisterPayload rejects wrongly typed fields %j',
    (body) => {
      expect(parseRegisterPayload(body)).toBeNull();
    },
  );

  it('parseRegisterPayload keeps only known fields', () => {
    expect(
      parseRegisterPayload({
        email: 'a@example.com',
        password: 'Password123!',
        name: 'Alice',
        userId: 'someone-else',
      }),
    ).toEqual({ email: 'a@example.com', password: 'Password123!', name: 'Alice' });
  });

  it.each([null, undefined])('parseRegisterPayload accepts an absent name (%j)', (name) => {
    expect(
      parseRegisterPayload({ email: 'a@example.com', password: 'Password123!', name }),
    ).toEqual({ email: 'a@example.com', password: 'Password123!', name: null });
  });
});
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateRegisterInput,
  validateLoginInput,
} from '@/lib/validation/authValidation';

describe('Auth Validation Utilities', () => {
  describe('normalizeEmail', () => {
    it('trims whitespace and converts to lowercase', () => {
      expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    });
  });

  describe('validateEmail', () => {
    it('accepts valid email addresses', () => {
      expect(validateEmail('test@example.com').isValid).toBe(true);
      expect(validateEmail('user.name+tag@sub.domain.org').isValid).toBe(true);
    });

    it('rejects missing or empty email', () => {
      const res = validateEmail('');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Email is required');
    });

    it('rejects invalid email formats', () => {
      expect(validateEmail('notanemail').isValid).toBe(false);
      expect(validateEmail('user@').isValid).toBe(false);
      expect(validateEmail('@domain.com').isValid).toBe(false);
      expect(validateEmail('user@domain').isValid).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('accepts passwords of 8 characters or more', () => {
      expect(validatePassword('12345678').isValid).toBe(true);
      expect(validatePassword('StrongPassword123!').isValid).toBe(true);
    });

    it('rejects passwords shorter than 8 characters', () => {
      const res = validatePassword('short');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Password must be at least 8 characters long');
    });

    it.each(['        ', '								'])('rejects a password of only whitespace: %j', (password) => {
      const res = validatePassword(password);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Password is required');
    });

    it('keeps spaces in a password that has other characters', () => {
      expect(validatePassword('  pass word  ').isValid).toBe(true);
    });

    it('rejects empty password', () => {
      const res = validatePassword('');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Password is required');
    });
  });

  describe('validateRegisterInput', () => {
    it('validates valid input including optional name', () => {
      const result = validateRegisterInput({
        email: 'person@example.com',
        password: 'ValidPassword123',
        name: 'Jane Doe',
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('validates valid input with omitted name', () => {
      const result = validateRegisterInput({
        email: 'person@example.com',
        password: 'ValidPassword123',
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('returns error map when email and password are both invalid', () => {
      const result = validateRegisterInput({
        email: 'bad-email',
        password: '123',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.email).toBeDefined();
      expect(result.errors.password).toBeDefined();
    });
  });

  describe('name length', () => {
    const base = { email: 'person@example.com', password: 'ValidPassword123' };

    it('rejects a name over 100 characters', () => {
      const result = validateRegisterInput({ ...base, name: 'x'.repeat(101) });
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBe('Name must be 100 characters or fewer');
    });

    it('accepts a name of exactly 100 characters', () => {
      expect(validateRegisterInput({ ...base, name: 'x'.repeat(100) }).isValid).toBe(true);
    });

    it('ignores surrounding spaces when measuring', () => {
      expect(validateRegisterInput({ ...base, name: `  ${'x'.repeat(100)}  ` }).isValid).toBe(true);
    });

    it.each([null, undefined, ''])('accepts an absent name (%j)', (name) => {
      expect(validateRegisterInput({ ...base, name }).isValid).toBe(true);
    });

    it('reports email problems first, so the existing API message stays the same', () => {
      const result = validateRegisterInput({ ...base, email: 'bad', name: 'x'.repeat(101) });
      expect(Object.values(result.errors)[0]).toBe('Please enter a valid email address');
    });
  });

  describe('validateLoginInput', () => {
    it('validates correct login credentials format', () => {
      const result = validateLoginInput({
        email: 'person@example.com',
        password: 'ValidPassword123',
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('reports missing email and password', () => {
      const result = validateLoginInput({
        email: '',
        password: '',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.email).toBe('Email is required');
      expect(result.errors.password).toBe('Password is required');
    });
  });
});
