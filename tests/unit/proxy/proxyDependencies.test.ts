// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Proxy runs on every request, including prefetches, so it must stay free of
// password hashing, token crypto, and auth service code. Loading any of these
// modules fails the test.
vi.mock('@/services/authService', () => {
  throw new Error('authService must not be loaded by the proxy dependency graph');
});
vi.mock('@/lib/auth/sessionTokens', () => {
  throw new Error('sessionTokens must not be loaded by the proxy dependency graph');
});
vi.mock('@/lib/auth/password', () => {
  throw new Error('password must not be loaded by the proxy dependency graph');
});

describe('proxy dependency boundary', () => {
  it('loads cookieConfig without the auth service or crypto modules', async () => {
    const cookieConfig = await import('@/lib/auth/cookieConfig');
    expect(cookieConfig.SESSION_COOKIE_NAME).toBe('rewear_session');
  });

  it('loads the proxy without the auth service or crypto modules', async () => {
    const proxyModule = await import('@/proxy');
    expect(typeof proxyModule.proxy).toBe('function');
  });
});
