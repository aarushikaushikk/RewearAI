import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateCsrfOrigin } from '@/lib/auth/csrf';

describe('CSRF Origin Validation', () => {
  const originalAppOrigin = process.env.APP_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.APP_ORIGIN;
  });

  afterEach(() => {
    if (originalAppOrigin) {
      process.env.APP_ORIGIN = originalAppOrigin;
    } else {
      delete process.env.APP_ORIGIN;
    }
    if (originalNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('Safe HTTP Methods', () => {
    it('allows safe HTTP methods (GET, HEAD, OPTIONS) without origin headers', () => {
      expect(validateCsrfOrigin(new Request('http://localhost:3000/api/auth/session', { method: 'GET' }))).toBe(true);
      expect(validateCsrfOrigin(new Request('http://localhost:3000/api/auth/session', { method: 'HEAD' }))).toBe(true);
      expect(validateCsrfOrigin(new Request('http://localhost:3000/api/auth/session', { method: 'OPTIONS' }))).toBe(true);
    });
  });

  describe('Missing Headers (Strict Rejection)', () => {
    it('rejects POST request when both Origin and Referer are missing', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });
      expect(validateCsrfOrigin(req)).toBe(false);
    });

    it('rejects POST request when Host header is missing', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      });
      expect(validateCsrfOrigin(req)).toBe(false);
    });
  });

  describe('Production CSRF Configuration (Strict APP_ORIGIN Enforcement)', () => {
    it('rejects state-changing requests in production if APP_ORIGIN is missing', () => {
      delete process.env.APP_ORIGIN;
      const req = new Request('https://rewear.app/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'rewear.app',
          origin: 'https://rewear.app',
        },
      });

      // Must fail closed when production APP_ORIGIN is not configured
      expect(validateCsrfOrigin(req, { isProduction: true })).toBe(false);
    });

    it('rejects state-changing requests in production if APP_ORIGIN is malformed', () => {
      process.env.APP_ORIGIN = 'not-a-valid-url';
      const req = new Request('https://rewear.app/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'rewear.app',
          origin: 'https://rewear.app',
        },
      });

      expect(validateCsrfOrigin(req, { isProduction: true })).toBe(false);
    });

    it('rejects production requests if APP_ORIGIN has an invalid non-http/https scheme', () => {
      process.env.APP_ORIGIN = 'javascript:alert(1)';
      const req = new Request('https://rewear.app/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'rewear.app',
          origin: 'javascript:alert(1)',
        },
      });

      expect(validateCsrfOrigin(req, { isProduction: true })).toBe(false);
    });

    it('allows valid state-changing requests in production matching configured APP_ORIGIN', () => {
      process.env.APP_ORIGIN = 'https://rewear.app';
      const req = new Request('https://rewear.app/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'rewear.app',
          origin: 'https://rewear.app',
        },
      });

      expect(validateCsrfOrigin(req, { isProduction: true })).toBe(true);
    });

    it('rejects malicious origin in production even if Host matches configured APP_ORIGIN', () => {
      process.env.APP_ORIGIN = 'https://rewear.app';
      const req = new Request('https://rewear.app/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'rewear.app',
          origin: 'https://evil-attacker.com',
        },
      });

      expect(validateCsrfOrigin(req, { isProduction: true })).toBe(false);
    });

    it('never derives trusted origin from untrusted Host header in production', () => {
      delete process.env.APP_ORIGIN;
      const req = new Request('https://attacker-controlled.com/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'attacker-controlled.com',
          origin: 'https://attacker-controlled.com',
        },
      });

      expect(validateCsrfOrigin(req, { isProduction: true })).toBe(false);
    });
  });

  describe('Local Development Configuration', () => {
    it('allows legitimate same-origin POST request matching Host in development', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      });
      expect(validateCsrfOrigin(req, { isProduction: false })).toBe(true);
    });

    it('rejects POST request from malicious origin in development', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://evil-attacker.com',
        },
      });
      expect(validateCsrfOrigin(req, { isProduction: false })).toBe(false);
    });

    it('allows POST when Referer matches Host and Origin is absent in development', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          referer: 'http://localhost:3000/sign-in',
        },
      });
      expect(validateCsrfOrigin(req, { isProduction: false })).toBe(true);
    });

    it('rejects POST when Referer does not match Host in development', () => {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          referer: 'http://attacker.com/malicious-link',
        },
      });
      expect(validateCsrfOrigin(req, { isProduction: false })).toBe(false);
    });
  });
});
