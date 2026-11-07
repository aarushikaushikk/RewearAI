import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('Password Utility', () => {
  it('hashes a plain text password and produces a valid bcrypt hash', async () => {
    const plain = 'StrongPassword123!';
    const hash = await hashPassword(plain);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(plain);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
  });

  it('correctly verifies a matching password against its hash', async () => {
    const plain = 'CorrectPassword#42';
    const hash = await hashPassword(plain);

    const isMatch = await verifyPassword(plain, hash);
    expect(isMatch).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const plain = 'CorrectPassword#42';
    const wrong = 'WrongPassword#42';
    const hash = await hashPassword(plain);

    const isMatch = await verifyPassword(wrong, hash);
    expect(isMatch).toBe(false);
  });

  it('throws or handles empty password gracefully', async () => {
    await expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
  });
});
