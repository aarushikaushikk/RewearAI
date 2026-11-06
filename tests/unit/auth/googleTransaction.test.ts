import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGoogleSettings } from '@/lib/auth/googleOidc';
import { openTransaction, sealTransaction, TRANSACTION_LIFETIME_MS } from '@/lib/auth/googleTransaction';

const SECRET = 'test-client-secret-value';
const TRANSACTION = { state: 'state-value', nonce: 'nonce-value', codeVerifier: 'verifier-value' };
const NOW = 1_800_000_000_000;

describe('the Google transaction cookie value', () => {
  it('reads back what was sealed', () => {
    expect(openTransaction(sealTransaction(TRANSACTION, SECRET, NOW), SECRET, NOW)).toEqual(TRANSACTION);
  });

  it('hides its contents', () => {
    const sealed = sealTransaction(TRANSACTION, SECRET, NOW);
    const decoded = Buffer.from(sealed, 'base64url').toString('latin1');

    for (const value of Object.values(TRANSACTION)) {
      expect(decoded).not.toContain(value);
    }
  });

  it('differs every time, even for the same contents', () => {
    expect(sealTransaction(TRANSACTION, SECRET, NOW)).not.toBe(sealTransaction(TRANSACTION, SECRET, NOW));
  });

  it('is only readable with the same secret', () => {
    expect(openTransaction(sealTransaction(TRANSACTION, SECRET, NOW), 'another-secret', NOW)).toBeNull();
  });

  it('is accepted until it expires, and not after', () => {
    const sealed = sealTransaction(TRANSACTION, SECRET, NOW);

    expect(openTransaction(sealed, SECRET, NOW + TRANSACTION_LIFETIME_MS)).toEqual(TRANSACTION);
    expect(openTransaction(sealed, SECRET, NOW + TRANSACTION_LIFETIME_MS + 1)).toBeNull();
  });

  it('refuses a change to any part', () => {
    const bytes = Buffer.from(sealTransaction(TRANSACTION, SECRET, NOW), 'base64url');

    for (let i = 0; i < bytes.length; i += 1) {
      const changed = Buffer.from(bytes);
      changed[i] ^= 1;
      expect(openTransaction(changed.toString('base64url'), SECRET, NOW)).toBeNull();
    }
  });

  it.each(['', 'not-sealed', 'A'.repeat(10), 'é', '{"state":"x"}'])('refuses %j', (value) => {
    expect(openTransaction(value, SECRET, NOW)).toBeNull();
  });
});

describe('Google settings', () => {
  const configure = (origin: string, id = 'client-id', secret = 'client-secret') => {
    vi.stubEnv('GOOGLE_CLIENT_ID', id);
    vi.stubEnv('GOOGLE_CLIENT_SECRET', secret);
    vi.stubEnv('APP_ORIGIN', origin);
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds the callback URL from APP_ORIGIN', () => {
    configure('https://rewear.example');

    expect(getGoogleSettings()).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://rewear.example/api/auth/google/callback',
    });
  });

  it.each([
    ['a missing client ID', () => configure('https://rewear.example', '')],
    ['a blank client ID', () => configure('https://rewear.example', '   ')],
    ['a missing client secret', () => configure('https://rewear.example', 'id', '')],
    ['a missing origin', () => configure('')],
    ['an origin that is not a URL', () => configure('rewear.example')],
    ['an origin with a path', () => configure('https://rewear.example/app')],
    ['an origin with a query', () => configure('https://rewear.example?x=1')],
    ['an origin with credentials', () => configure('https://user:pass@rewear.example')],
    ['another scheme', () => configure('ftp://rewear.example')],
  ])('is unavailable with %s', (_name, setUp) => {
    setUp();

    expect(getGoogleSettings()).toBeNull();
  });

  it('requires HTTPS in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    configure('http://rewear.example');

    expect(getGoogleSettings()).toBeNull();
  });

  it.each(['http://localhost:3000', 'http://127.0.0.1:3000'])('allows %s for local use', (origin) => {
    vi.stubEnv('NODE_ENV', 'production');
    configure(origin);

    expect(getGoogleSettings()?.redirectUri).toBe(`${origin}/api/auth/google/callback`);
  });
});
