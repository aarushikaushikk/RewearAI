import { RegisterInput, LoginInput, ValidationResult } from '@/types/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Normalizes email by trimming whitespace and converting to lower case.
 */
export function normalizeEmail(email: string): string {
  return email ? email.trim().toLowerCase() : '';
}

/**
 * Validates email format.
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || email.trim().length === 0) {
    return { isValid: false, error: 'Email is required' };
  }

  const normalized = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalized)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  return { isValid: true };
}

/**
 * Validates password criteria (required, minimum length).
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length === 0) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    };
  }

  return { isValid: true };
}

/**
 * Validates registration input payload.
 */
export function validateRegisterInput(input: RegisterInput): ValidationResult {
  const errors: Record<string, string> = {};

  const emailCheck = validateEmail(input.email);
  if (!emailCheck.isValid && emailCheck.error) {
    errors.email = emailCheck.error;
  }

  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.isValid && passwordCheck.error) {
    errors.password = passwordCheck.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates login input payload.
 */
export function validateLoginInput(input: LoginInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.email || input.email.trim().length === 0) {
    errors.email = 'Email is required';
  } else {
    const emailCheck = validateEmail(input.email);
    if (!emailCheck.isValid && emailCheck.error) {
      errors.email = emailCheck.error;
    }
  }

  if (!input.password || input.password.length === 0) {
    errors.password = 'Password is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
