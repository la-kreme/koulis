import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jose before importing auth module
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";
import {
  verifyBearerToken,
  isUnauthenticatedMethod,
  PROTECTED_RESOURCE_METADATA,
  WWW_AUTHENTICATE_HEADER,
} from "../../lib/auth.js";

const mockJwtVerify = vi.mocked(jwtVerify);

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── verifyBearerToken ───────────────────────────────────────────────

  describe("verifyBearerToken", () => {
    it("throws when no authorization header is provided", async () => {
      await expect(verifyBearerToken(undefined)).rejects.toThrow("No authorization header");
    });

    it("throws when authorization header is not Bearer format", async () => {
      await expect(verifyBearerToken("Basic abc123")).rejects.toThrow(
        "Invalid authorization header format",
      );
    });

    it("returns payload on valid Bearer token", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { sub: "user-42", iss: "https://example.com" },
        protectedHeader: { alg: "RS256" },
        key: {} as CryptoKey,
         
      });

      const result = await verifyBearerToken("Bearer valid-token-here");

      expect(result.sub).toBe("user-42");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const expectedOpts = { issuer: expect.any(String), audience: expect.any(String) };
      expect(mockJwtVerify).toHaveBeenCalledWith("valid-token-here", "mock-jwks", expectedOpts);
    });

    it("throws when JWT verification fails", async () => {
      mockJwtVerify.mockRejectedValue(new Error("token expired"));

      await expect(verifyBearerToken("Bearer expired-token")).rejects.toThrow("token expired");
    });
  });

  // ── isUnauthenticatedMethod ─────────────────────────────────────────

  describe("isUnauthenticatedMethod", () => {
    it("returns false for null/undefined body", () => {
      expect(isUnauthenticatedMethod(null)).toBe(false);
      expect(isUnauthenticatedMethod(undefined)).toBe(false);
    });

    it("returns true for initialize method", () => {
      expect(isUnauthenticatedMethod({ method: "initialize" })).toBe(true);
    });

    it("returns true for notifications/* methods", () => {
      expect(isUnauthenticatedMethod({ method: "notifications/initialized" })).toBe(true);
      expect(isUnauthenticatedMethod({ method: "notifications/cancelled" })).toBe(true);
    });

    it("returns false for tools/list", () => {
      expect(isUnauthenticatedMethod({ method: "tools/list" })).toBe(false);
    });

    it("returns false for tools/call", () => {
      expect(isUnauthenticatedMethod({ method: "tools/call" })).toBe(false);
    });

    it("returns false for object without method field", () => {
      expect(isUnauthenticatedMethod({ id: 1 })).toBe(false);
    });

    it("handles batch of unauthenticated methods", () => {
      expect(
        isUnauthenticatedMethod([
          { method: "initialize" },
          { method: "notifications/initialized" },
        ]),
      ).toBe(true);
    });

    it("returns false for batch with mixed methods", () => {
      expect(isUnauthenticatedMethod([{ method: "initialize" }, { method: "tools/list" }])).toBe(
        false,
      );
    });

    it("returns false for batch with invalid entries", () => {
      expect(isUnauthenticatedMethod([null, { method: "initialize" }])).toBe(false);
    });

    it("returns false for non-object/non-array body", () => {
      expect(isUnauthenticatedMethod("string")).toBe(false);
      expect(isUnauthenticatedMethod(42)).toBe(false);
    });
  });

  // ── Constants ───────────────────────────────────────────────────────

  describe("constants", () => {
    it("PROTECTED_RESOURCE_METADATA has required fields", () => {
      expect(PROTECTED_RESOURCE_METADATA.resource).toBeDefined();
      expect(PROTECTED_RESOURCE_METADATA.authorization_servers).toBeInstanceOf(Array);
      expect(PROTECTED_RESOURCE_METADATA.bearer_methods_supported).toContain("header");
    });

    it("WWW_AUTHENTICATE_HEADER contains resource_metadata", () => {
      expect(WWW_AUTHENTICATE_HEADER).toContain("resource_metadata");
      expect(WWW_AUTHENTICATE_HEADER).toContain(".well-known/oauth-protected-resource");
    });
  });
});
