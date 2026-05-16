// src/lib/rate-limit.ts — In-memory IP rate limiter

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimiter {
  check: (key: string) => RateLimitResult;
  dispose: () => void;
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const buckets = new Map<string, number[]>();

  function cleanup() {
    const cutoff = Date.now() - config.windowMs;
    for (const [key, timestamps] of buckets) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, valid);
      }
    }
  }

  const interval = setInterval(cleanup, config.windowMs);

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - config.windowMs;
    const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length < config.maxRequests) {
      timestamps.push(now);
      buckets.set(key, timestamps);
      return {
        allowed: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - timestamps.length,
        resetSeconds: Math.ceil(config.windowMs / 1000),
      };
    }

    const oldest = timestamps[0];
    const resetMs = oldest + config.windowMs - now;
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetSeconds: Math.ceil(resetMs / 1000),
    };
  }

  function dispose() {
    clearInterval(interval);
    buckets.clear();
  }

  return { check, dispose };
}
