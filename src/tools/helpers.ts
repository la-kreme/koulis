// src/tools/helpers.ts — Shared helpers for tool handlers
import { KoulisApiError } from "../lib/api-client.js";
import type { ToolResult } from "../types/tool.js";

export function jsonContent(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function errorContent(message: string): ToolResult {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

export function handleApiError(err: unknown, fallback: string): ToolResult {
  if (err instanceof KoulisApiError) {
    if (err.status === 0) return errorContent(`Network error reaching Koulis API: ${err.message}`);
    if (err.status === 401)
      return errorContent("Koulis API authentication failed. Check KOULIS_API_TOKEN.");
    if (err.status === 404) return errorContent(err.message || "Not found");
    if (err.status === 409) return errorContent(err.message || "Conflict");
    if (err.status === 410) return errorContent(err.message || "Resource expired");
    return errorContent(`Koulis API error (${err.status}): ${err.message}`);
  }
  return errorContent(`${fallback}: ${(err as Error).message ?? String(err)}`);
}
