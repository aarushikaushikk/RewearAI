import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates a cryptographically secure, opaque random session token.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Computes the SHA-256 hash of an opaque token for secure database storage.
 * Only the hash is stored in the database.
 */
export function hashToken(token: string): string {
  if (!token || token.trim().length === 0) {
    throw new Error('Token cannot be empty');
  }
  return createHash('sha256').update(token).digest('hex');
}
