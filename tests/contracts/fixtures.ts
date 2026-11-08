import { createHash } from 'node:crypto';

/**
 * Values the repository contract suites store. They must satisfy the real User
 * and Session models, because the MongoDB adapters run the same suites;
 * contractFixtures.test.ts checks them against those models.
 */
export const PASSWORD_HASH = `$2b$10$${'a'.repeat(53)}`;
export const OTHER_PASSWORD_HASH = `$2b$10$${'b'.repeat(53)}`;

export const USER_IDS: [string, string] = ['64b000000000000000000001', '64b000000000000000000002'];

/** A SHA-256 hex digest, the same form as hashToken() produces. */
export function tokenHashFor(label: string): string {
  return createHash('sha256').update(label).digest('hex');
}
