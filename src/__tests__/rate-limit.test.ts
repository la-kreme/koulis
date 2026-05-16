import { describe, it, expect, vi } from "vitest";
import { createRateLimiter } from "../lib/rate-limit.js";

describe("createRateLimiter", () => {
  it("allows requests under the limit with decreasing remaining", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });

    const r1 = limiter.check("ip1");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check("ip1");
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check("ip1");
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    limiter.dispose();
  });

  it("blocks requests over the limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });

    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");

    const r4 = limiter.check("ip1");
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.resetSeconds).toBeGreaterThan(0);
    expect(r4.resetSeconds).toBeLessThanOrEqual(60);

    limiter.dispose();
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();

    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });

    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    const after = limiter.check("ip1");
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(2);

    limiter.dispose();
    vi.useRealTimers();
  });

  it("isolates keys from each other", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });

    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);

    const r = limiter.check("ip2");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);

    limiter.dispose();
  });
});
