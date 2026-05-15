import { describe, it, expect } from "vitest";
import { normalizeUtc } from "../../lib/api-client.js";

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
