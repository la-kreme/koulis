import { describe, it, expect } from "vitest";
import { toolError, ERROR_CODES, type ErrorCode } from "../lib/errors.js";

describe("toolError", () => {
  it("returns canonical shape with default message for each code", () => {
    for (const [code, defaultMessage] of Object.entries(ERROR_CODES)) {
      const result = toolError(code as ErrorCode);
      expect(result).toEqual({
        error: {
          code,
          message: defaultMessage,
        },
      });
    }
  });

  it("uses overridden message when provided", () => {
    const result = toolError("restaurant_not_found", { message: "No such restaurant: rest-xyz" });
    expect(result.error.code).toBe("restaurant_not_found");
    expect(result.error.message).toBe("No such restaurant: rest-xyz");
    expect(result.error.details).toBeUndefined();
  });

  it("includes details when provided", () => {
    const result = toolError("upstream_error", {
      message: "Server error",
      details: { status: 503, retried: 3 },
    });
    expect(result.error.code).toBe("upstream_error");
    expect(result.error.message).toBe("Server error");
    expect(result.error.details).toEqual({ status: 503, retried: 3 });
  });

  it("omits details field when not provided", () => {
    const result = toolError("hold_expired");
    expect("details" in result.error).toBe(false);
  });
});
