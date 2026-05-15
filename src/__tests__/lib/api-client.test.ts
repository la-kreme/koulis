import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeUtc, KoulisApiError, koulisApi } from "../../lib/api-client.js";

// ── normalizeUtc ────────────────────────────────────────────────────────
describe("normalizeUtc", () => {
  it("passes through a datetime with Z suffix unchanged", () => {
    expect(normalizeUtc("2026-05-12T19:30:00Z")).toBe("2026-05-12T19:30:00Z");
  });

  it("passes through a datetime with positive offset unchanged", () => {
    expect(normalizeUtc("2026-05-12T21:30:00+02:00")).toBe("2026-05-12T21:30:00+02:00");
  });

  it("passes through a datetime with negative offset unchanged", () => {
    expect(normalizeUtc("2026-05-12T14:30:00-05:00")).toBe("2026-05-12T14:30:00-05:00");
  });

  it("appends Z to a naive datetime (no timezone)", () => {
    expect(normalizeUtc("2026-05-12T19:30:00")).toBe("2026-05-12T19:30:00Z");
  });

  it("passes through a datetime with fractional seconds and Z", () => {
    expect(normalizeUtc("2026-05-12T19:30:00.123Z")).toBe("2026-05-12T19:30:00.123Z");
  });

  it("is idempotent: f(f(x)) === f(x)", () => {
    const naive = "2026-05-12T19:30:00";
    const once = normalizeUtc(naive);
    const twice = normalizeUtc(once);
    expect(twice).toBe(once);
  });
});

// ── HTTP client (retry, timeout, error codes) ───────────────────────────
describe("koulisApi HTTP behavior", () => {
  const fetchSpy = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 4xx errors (no retry) ──────────────────────────────────────────
  it("throws KoulisApiError with status 401 on auth failure", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "Invalid token" }, 401));
    try {
      await koulisApi.searchRestaurants({
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KoulisApiError);
      expect((err as KoulisApiError).status).toBe(401);
    }
  });

  it("throws KoulisApiError with status 404", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "Not found" }, 404));
    try {
      await koulisApi.getAvailabilities({
        restaurant_id: "nonexistent",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KoulisApiError);
      expect((err as KoulisApiError).status).toBe(404);
      expect((err as KoulisApiError).message).toBe("Not found");
    }
  });

  it("throws KoulisApiError with status 409 on conflict", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "Slot already held" }, 409));
    try {
      await koulisApi.createHold({
        restaurant_id: "rest-001",
        slot_at: "2026-05-14T19:00:00Z",
        party_size: 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KoulisApiError);
      expect((err as KoulisApiError).status).toBe(409);
    }
  });

  it("throws KoulisApiError with status 410 on expired hold", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "Hold expired" }, 410));
    try {
      await koulisApi.createReservation({
        hold_id: "expired-hold",
        customer_name: "Jean",
        customer_phone: "+33612345678",
        customer_email: "jean@test.com",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KoulisApiError);
      expect((err as KoulisApiError).status).toBe(410);
    }
  });

  it("does NOT retry on 4xx errors", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "Bad request" }, 400));
    await expect(
      koulisApi.searchRestaurants({
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      }),
    ).rejects.toThrow(KoulisApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ── 5xx retry ──────────────────────────────────────────────────────
  it("retries on 500 for retryable endpoints and eventually succeeds", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ message: "Internal error" }, 500))
      .mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }, 200));

    const res = await koulisApi.searchRestaurants({
      city: "Paris",
      datetime: "2026-05-14T19:00:00Z",
      party_size: 2,
    });
    expect(res.count).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws after 3 failed retries on persistent 500", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ message: "Internal error" }, 500));

    await expect(
      koulisApi.searchRestaurants({
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      }),
    ).rejects.toThrow(KoulisApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry createHold (non-retryable POST)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "Server error" }, 500));
    await expect(
      koulisApi.createHold({
        restaurant_id: "rest-001",
        slot_at: "2026-05-14T19:00:00Z",
        party_size: 2,
      }),
    ).rejects.toThrow(KoulisApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries createReservation (idempotent POST)", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ message: "Server error" }, 502))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "confirmed",
          idempotent_replay: false,
          confirmation_id: "CONF-001",
          restaurant_id: "rest-001",
          restaurant_name: "Test",
          slot: {},
          party_size: 2,
          customer_name: "J",
          customer_phone: "123456",
          customer_email: "j@t.com",
          special_requests: null,
          created_at: "2026-01-01T00:00:00Z",
        }),
      );

    const res = await koulisApi.createReservation({
      hold_id: "hold-001",
      customer_name: "J",
      customer_phone: "123456",
      customer_email: "j@t.com",
    });
    expect(res.confirmation_id).toBe("CONF-001");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // ── Network errors ─────────────────────────────────────────────────
  it("throws KoulisApiError with status 0 on network failure", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
    try {
      await koulisApi.createHold({
        restaurant_id: "rest-001",
        slot_at: "2026-05-14T19:00:00Z",
        party_size: 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as KoulisApiError).status).toBe(0);
      expect((err as KoulisApiError).message).toContain("Network error");
    }
  });

  it("retries on network error for retryable endpoints", async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));

    const res = await koulisApi.searchRestaurants({
      city: "Paris",
      datetime: "2026-05-14T19:00:00Z",
      party_size: 2,
    });
    expect(res.count).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // ── Error body parsing ─────────────────────────────────────────────
  it("extracts message from error response body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "Custom API error message" }, 422));
    try {
      await koulisApi.createHold({
        restaurant_id: "rest-001",
        slot_at: "2026-05-14T19:00:00Z",
        party_size: 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as KoulisApiError).message).toBe("Custom API error message");
    }
  });

  it("falls back to 'error' field if no 'message' field", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: { code: "INVALID", detail: "bad" } }, 422),
    );
    try {
      await koulisApi.createHold({
        restaurant_id: "rest-001",
        slot_at: "2026-05-14T19:00:00Z",
        party_size: 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as KoulisApiError).message).toContain("INVALID");
    }
  });

  it("falls back to HTTP status when body has no message/error field", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ foo: "bar" }, 418));
    try {
      await koulisApi.createHold({
        restaurant_id: "rest-001",
        slot_at: "2026-05-14T19:00:00Z",
        party_size: 2,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as KoulisApiError).message).toBe("HTTP 418");
    }
  });

  // ── Query params & normalizeUtc integration ────────────────────────
  it("normalizes naive datetime in search query", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
    await koulisApi.searchRestaurants({
      city: "Paris",
      datetime: "2026-05-14T19:00:00",
      party_size: 2,
    });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("datetime=2026-05-14T19%3A00%3A00Z");
  });
});
