import { describe, it, expect } from 'vitest';
import { User } from '@/models/User';
import { Session } from '@/models/Session';
import {
  OTHER_PASSWORD_HASH,
  PASSWORD_HASH,
  tokenHashFor,
  USER_IDS,
} from '../../contracts/fixtures';

const IN_ONE_HOUR = new Date(Date.now() + 60 * 60 * 1000);
const OBJECT_ID_HEX = /^[a-f0-9]{24}$/;

// Every email and token label the contract suites store.
const EMAILS = [
  'a@example.com',
  'A@EXAMPLE.COM',
  'b@example.com',
  'race@example.com',
  '  MixedCase@Example.COM ',
];
const TOKEN_LABELS = ['hash-1', 'hash-a', 'hash-b', 'phone', 'laptop', 'unknown'];

describe('repository contract fixtures against the real models', () => {
  it.each([
    ['PASSWORD_HASH', PASSWORD_HASH],
    ['OTHER_PASSWORD_HASH', OTHER_PASSWORD_HASH],
  ])('%s is accepted by the User model', async (_name, passwordHash) => {
    await expect(
      new User({ email: 'a@example.com', passwordHash }).validate(),
    ).resolves.toBeUndefined();
  });

  it('uses two different password hashes', () => {
    expect(OTHER_PASSWORD_HASH).not.toBe(PASSWORD_HASH);
  });

  it.each(EMAILS)('email %j is accepted and normalized by the User model', async (email) => {
    const user = new User({ email, passwordHash: PASSWORD_HASH });

    await expect(user.validate()).resolves.toBeUndefined();
    expect(user.email).toBe(email.trim().toLowerCase());
  });

  it.each(USER_IDS)('user ID %s is a 24-character ObjectId string', (userId) => {
    expect(userId).toMatch(OBJECT_ID_HEX);
  });

  it('uses two different user IDs', () => {
    expect(USER_IDS[0]).not.toBe(USER_IDS[1]);
  });

  it.each(TOKEN_LABELS)('token hash for %s is accepted by the Session model', async (label) => {
    const session = new Session({
      userId: USER_IDS[0],
      tokenHash: tokenHashFor(label),
      expiresAt: IN_ONE_HOUR,
    });

    await expect(session.validate()).resolves.toBeUndefined();
  });

  it('gives each label its own token hash', () => {
    expect(new Set(TOKEN_LABELS.map(tokenHashFor)).size).toBe(TOKEN_LABELS.length);
  });
});
