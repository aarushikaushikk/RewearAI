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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

/**
 * Narrows an untrusted login body to known string fields.
 * Returns null when its shape is wrong. Missing fields become empty strings so
 * that validateLoginInput can report them as field-level errors.
 */
export function parseLoginPayload(body: unknown): LoginInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const { email, password } = body;
  if (!isOptionalString(email) || !isOptionalString(password)) {
    return null;
  }

  return { email: email ?? '', password: password ?? '' };
}

/**
 * Narrows an untrusted registration body to known fields.
 * Returns null when its shape is wrong. Missing email or password become empty
 * strings so that validateRegisterInput can report them as field-level errors.
 */
export function parseRegisterPayload(body: unknown): RegisterInput | null {
  const credentials = parseLoginPayload(body);
  if (!credentials) {
    return null;
  }

  const { name } = body as Record<string, unknown>;
  if (name !== null && !isOptionalString(name)) {
    return null;
  }

  return { ...credentials, name: name ?? null };
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
