import { describe, it, expect } from 'vitest';
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
