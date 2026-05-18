import { describe, it, expect, vi, afterAll } from "vitest";
import { createHttpApp } from "../transports/http.js";
import { createRateLimiter } from "../lib/rate-limit.js";

const mockApi = {
  searchRestaurants: vi.fn(),
  getAvailabilities: vi.fn(),
  createHold: vi.fn(),
  createReservation: vi.fn(),
};

const passthrough: (h: string | undefined) => Promise<{ sub: string }> = () =>
  Promise.resolve({ sub: "test-user" });
const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
const app = createHttpApp(mockApi, rateLimiter, passthrough);

afterAll(() => {
  rateLimiter.dispose();
});

describe("GET /health", () => {
  it("returns 200 with status, version, and uptime", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe("string");
    expect((body.version as string).length).toBeGreaterThan(0);
    expect(typeof body.uptime_seconds).toBe("number");
  });

  it("is not rate-limited (100 rapid requests all succeed)", async () => {
    // Rate limiter is set to maxRequests=5, but /health should bypass it
    const results: Response[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(await app.fetch(new Request("http://localhost/health")));
    }

    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
