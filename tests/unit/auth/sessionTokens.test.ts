import { describe, it, expect } from 'vitest';
import { generateOpaqueToken, hashToken } from '@/lib/auth/sessionTokens';

describe('Session Tokens Utility', () => {
  it('generates an opaque token of sufficient entropy', () => {
    const token1 = generateOpaqueToken();
    const token2 = generateOpaqueToken();

    expect(token1).toBeDefined();
    expect(typeof token1).toBe('string');
    expect(token1.length).toBeGreaterThanOrEqual(32);
    expect(token1).not.toBe(token2);
  });

  it('hashes the token with SHA-256 producing a deterministic 64-char hex string', () => {
    const token = 'sample-opaque-token-12345';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).not.toBe(token);
  });

  it('throws an error if an empty token is supplied to hashToken', () => {
    expect(() => hashToken('')).toThrow('Token cannot be empty');
  });
});
