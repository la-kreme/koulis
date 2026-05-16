// src/lib/errors.ts — Standardized error codes for MCP tool responses

export const ERROR_CODES = {
  // Domain errors
  restaurant_not_found: "Restaurant not found",
  no_slots_available: "No slots available for the requested time window",
  hold_expired: "Reservation hold has expired",
  hold_not_found: "Reservation hold not found",
  reservation_not_found: "Reservation not found",
  invalid_input: "Input validation failed",

  // Upstream errors
  upstream_timeout: "Upstream service timed out",
  upstream_unavailable: "Upstream service unavailable",
  upstream_error: "Upstream service returned an error",

  // Reserved for B.2.5
  rate_limit_exceeded: "Rate limit exceeded",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ToolErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function toolError(
  code: ErrorCode,
  override?: { message?: string; details?: Record<string, unknown> },
): ToolErrorBody {
  const body: ToolErrorBody = {
    error: {
      code,
      message: override?.message ?? ERROR_CODES[code],
    },
  };
  if (override?.details) {
    body.error.details = override.details;
  }
  return body;
}
