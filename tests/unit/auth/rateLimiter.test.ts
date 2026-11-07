import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';
import { getClientIp, getClientKey } from '@/lib/auth/routeUtils';

describe('Rate Limiting & Client IP Security', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  beforeEach(() => {
    delete process.env.TRUST_PROXY;
  });

  afterEach(() => {
    if (originalTrustProxy) {
      process.env.TRUST_PROXY = originalTrustProxy;
    } else {
      delete process.env.TRUST_PROXY;
    }
  });

  describe('Client IP Resolution & Anti-Spoofing', () => {
    it('ignores client-supplied X-Forwarded-For and X-Real-IP headers when trustProxy is disabled', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        headers: {
          'x-forwarded-for': '198.51.100.42, 203.0.113.195',
          'x-real-ip': '198.51.100.42',
        },
      });

      // When trustProxy is not explicitly enabled, spoofed headers must NOT be trusted
      const ip = getClientIp(req, { trustProxy: false });
      expect(ip).toBe('127.0.0.1');

      const key = getClientKey(req, 'login', { trustProxy: false });
      expect(key).toBe('login:127.0.0.1');
    });

    it('trusts X-Forwarded-For header only when trustProxy is explicitly enabled', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        headers: {
          'x-forwarded-for': '203.0.113.50, 10.0.0.1',
        },
      });

      const ip = getClientIp(req, { trustProxy: true });
      expect(ip).toBe('203.0.113.50');

      const key = getClientKey(req, 'login', { trustProxy: true });
      expect(key).toBe('login:203.0.113.50');
    });

    it('trusts X-Real-IP when trustProxy is enabled and X-Forwarded-For is absent', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        headers: {
          'x-real-ip': '198.51.100.99',
        },
      });

      const ip = getClientIp(req, { trustProxy: true });
      expect(ip).toBe('198.51.100.99');
    });
  });

  describe('MemoryRateLimiter Functionality', () => {
    let rateLimiter: MemoryRateLimiter;

    beforeEach(() => {
      rateLimiter = new MemoryRateLimiter({ maxAttempts: 3, windowMs: 1000 });
    });

    it('enforces limit and returns retryAfterSeconds on breach', async () => {
      const key = 'user@example.com';
      await rateLimiter.recordAttempt(key);
      await rateLimiter.recordAttempt(key);
      await rateLimiter.recordAttempt(key);

      const check = await rateLimiter.check(key);
      expect(check.isAllowed).toBe(false);
      expect(check.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('resets attempts when explicitly requested', async () => {
      const key = 'user_reset@example.com';
      await rateLimiter.recordAttempt(key);
      await rateLimiter.recordAttempt(key);
      await rateLimiter.recordAttempt(key);

      expect((await rateLimiter.check(key)).isAllowed).toBe(false);

      await rateLimiter.reset(key);
      expect((await rateLimiter.check(key)).isAllowed).toBe(true);
    });
  });
});
