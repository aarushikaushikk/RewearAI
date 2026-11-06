/**
 * Values the repository contract suites store. They must satisfy the real User
 * and Session models, because the MongoDB adapters run the same suites;
 * contractFixtures.test.ts checks them against those models.
 */
export const PASSWORD_HASH = '$2b$10$abcdefghijklmnopqrstuuvwxyz012345678901234567890123456';
export const OTHER_PASSWORD_HASH = 'other-hash';

export const USER_IDS: [string, string] = ['user_a', 'user_b'];

export function tokenHashFor(label: string): string {
  return label;
}
