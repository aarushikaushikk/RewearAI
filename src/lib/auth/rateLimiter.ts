export interface RateLimitResult {
  isAllowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Interface for rate-limiting implementations.
 * Enables dependency injection for testing and future production adapters.
 */
export interface IRateLimiter {
  check(key: string): Promise<RateLimitResult>;
  recordAttempt(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
}

interface AttemptRecord {
  timestamps: number[];
}

/**
 * In-memory sliding-window rate limiter.
 *
 * NOTE: This implementation is strictly designed for local development and automated testing.
 * In a multi-instance, serverless, or production deployment, an atomic distributed store
 * (e.g. Redis via Upstash or MongoDB TTL collection) must be configured to prevent
 * rate-limit bypass across instances.
 */
export class MemoryRateLimiter implements IRateLimiter {
  private attempts: Map<string, AttemptRecord> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(options: RateLimiterOptions = { maxAttempts: 5, windowMs: 15 * 60 * 1000 }) {
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) {
      return { isAllowed: true };
    }

    // Filter out attempts outside the current window
    const validTimestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);
    record.timestamps = validTimestamps;

    if (validTimestamps.length >= this.maxAttempts) {
      const oldestAttempt = validTimestamps[0];
      const retryAfterMs = oldestAttempt + this.windowMs - now;
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return {
        isAllowed: false,
        retryAfterSeconds,
      };
    }

    return { isAllowed: true };
  }

  async recordAttempt(key: string): Promise<void> {
    const now = Date.now();
    const record = this.attempts.get(key) || { timestamps: [] };

    // Filter expired attempts first
    record.timestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);
    record.timestamps.push(now);

    this.attempts.set(key, record);
  }

  async reset(key: string): Promise<void> {
    this.attempts.delete(key);
  }

  clear(): void {
    this.attempts.clear();
  }
}
