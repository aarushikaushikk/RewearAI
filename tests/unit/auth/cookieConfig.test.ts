import { describe, it, expect } from 'vitest';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { SESSION_DURATION_MS } from '@/lib/auth/sessionConfig';
import { SESSION_DURATION_MS as SERVICE_SESSION_DURATION_MS } from '@/services/authService';

describe('session duration configuration', () => {
  it('keeps the seven-day session duration', () => {
    expect(SESSION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('stays available from authService for existing callers', () => {
    expect(SERVICE_SESSION_DURATION_MS).toBe(SESSION_DURATION_MS);
  });

  it('sets the session cookie max age from the shared duration', () => {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const options = getSessionCookieOptions('token-value', expiresAt);

    expect(options.name).toBe(SESSION_COOKIE_NAME);
    expect(options.maxAge).toBe(SESSION_DURATION_MS / 1000);
    expect(options.expires).toBe(expiresAt);
    expect(options.httpOnly).toBe(true);
  });
});
