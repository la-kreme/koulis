// src/tools/helpers.ts — Shared helpers for tool handlers
import { KoulisApiError } from "../lib/api-client.js";
import { toolError, type ErrorCode } from "../lib/errors.js";
import type { ToolResult } from "../types/tool.js";

export function jsonContent(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

export function errorResult(code: ErrorCode, message?: string): ToolResult {
  const body = toolError(code, message ? { message } : undefined);
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
  };
}

export function handleApiError(
  err: unknown,
  opts: { fallback: string; notFoundCode?: ErrorCode },
): ToolResult {
  const notFound = opts.notFoundCode ?? "restaurant_not_found";

  if (err instanceof KoulisApiError) {
    if (err.status === 0) {
      const isTimeout = err.message.toLowerCase().includes("timeout");
      return errorResult(isTimeout ? "upstream_timeout" : "upstream_unavailable", err.message);
    }
    if (err.status === 401)
      return errorResult(
        "upstream_error",
        "Koulis API authentication failed. Check KOULIS_API_TOKEN.",
      );
    if (err.status === 404) return errorResult(notFound, err.message || undefined);
    if (err.status === 409) return errorResult("upstream_error", err.message || "Conflict");
    if (err.status === 410) return errorResult("hold_expired", err.message || undefined);
    if (err.status === 429) return errorResult("rate_limit_exceeded", err.message || undefined);
    return errorResult("upstream_error", `Koulis API error (${err.status}): ${err.message}`);
  }
  return errorResult(
    "upstream_error",
    `${opts.fallback}: ${(err as Error).message ?? String(err)}`,
  );
}
