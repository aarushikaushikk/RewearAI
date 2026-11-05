import { CookieOptions } from '@/lib/auth/cookieConfig';
import { MemoryRateLimiter } from '@/lib/auth/rateLimiter';

export const defaultRateLimiter = new MemoryRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

export interface ClientKeyOptions {
  trustProxy?: boolean;
}

/**
 * Extracts client IP with explicit proxy-trust verification.
 * Client-supplied headers like X-Forwarded-For or X-Real-IP are strictly ignored
 * unless TRUST_PROXY=true is explicitly set in configuration.
 */
export function getClientIp(req: Request, options?: ClientKeyOptions): string {
  const trustProxy =
    options?.trustProxy ?? (process.env.TRUST_PROXY === 'true');

  if (trustProxy) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',');
      const clientIp = parts[0].trim();
      if (clientIp) {
        return clientIp;
      }
    }

    const realIp = req.headers.get('x-real-ip');
    if (realIp && realIp.trim().length > 0) {
      return realIp.trim();
    }
  }

  // Safe default: do not trust unverified spoofable headers
  return '127.0.0.1';
}

/**
 * Extracts a client identification key for rate limiting.
 */
export function getClientKey(
  req: Request,
  prefix: string,
  options?: ClientKeyOptions
): string {
  const ip = getClientIp(req, options);
  return `${prefix}:${ip}`;
}

/**
 * Serializes CookieOptions into a standard Set-Cookie header string.
 */
export function serializeCookie(options: CookieOptions): string {
  const parts: string[] = [
    `${options.name}=${options.value}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1).toLowerCase()}`,
  ];

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join('; ');
}
