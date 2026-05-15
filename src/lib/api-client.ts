// src/lib/api-client.ts
import type {
  ApiAvailabilitiesResponse,
  ApiHoldResponse,
  ApiReservationResponse,
  ApiSearchResponse,
} from "../types/api.js";

/**
 * Normalise a datetime string to ensure it carries an explicit UTC offset.
 *
 * Since the Temporal refactor of koulis-api, the server rejects any datetime
 * without an explicit timezone suffix (Z or ±HH:MM) with a 400. LLM agents
 * that consume our MCP tools sometimes send naive datetimes like
 * "2026-05-12T20:00:00" depending on how the user phrases their request.
 *
 * This helper acts as a safety net: if the string already has a timezone
 * indicator, it passes through unchanged. Otherwise, we append "Z" (UTC)
 * — the only safe assumption when no timezone is specified.
 *
 * Idempotent: `normalizeUtc(normalizeUtc(s)) === normalizeUtc(s)`.
 *
 * DO NOT REMOVE — this compensates for unpredictable LLM output and
 * prevents 400s that would confuse end users.
 */
export function normalizeUtc(s: string): string {
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)) return s;
  return `${s}Z`;
}

// ── Config ──────────────────────────────────────────────────────────────
const API_URL = process.env.KOULIS_API_URL ?? "http://localhost:3001";
const API_TOKEN = process.env.KOULIS_API_TOKEN;
const DEBUG = process.env.DEBUG === "koulis-mcp";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;
const RETRY_FACTOR = 3;

if (!API_TOKEN) {
  console.error("[koulis-mcp] WARNING: KOULIS_API_TOKEN is not set. API calls will fail with 401.");
}

function debug(msg: string) {
  if (DEBUG) console.error(`[koulis-mcp] ${msg}`);
}

// ── Error class ─────────────────────────────────────────────────────────
export class KoulisApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "KoulisApiError";
  }
}

// ── Retry helper ────────────────────────────────────────────────────────
function isRetryable(status: number): boolean {
  return status === 0 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Core request with timeout + retry ───────────────────────────────────
type RequestOptions = RequestInit & {
  query?: Record<string, string | number | undefined>;
  retryable?: boolean;
};

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { query, retryable = false, ...rest } = init;

  let url = `${API_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${API_TOKEN ?? ""}`);
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const attempts = retryable ? MAX_RETRIES : 1;
  let lastError: KoulisApiError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...rest, headers, signal: controller.signal });
      clearTimeout(timeout);

      const elapsed = Date.now() - start;
      debug(`${rest.method ?? "GET"} ${path} ${res.status} ${elapsed}ms`);

      const text = await res.text();
      let parsed: unknown = undefined;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      if (!res.ok) {
        const obj =
          typeof parsed === "object" && parsed !== null
            ? (parsed as Record<string, unknown>)
            : null;
        const msg =
          (obj && "message" in obj ? String(obj.message) : undefined) ??
          (obj && "error" in obj ? JSON.stringify(obj.error) : undefined) ??
          `HTTP ${res.status}`;
        const error = new KoulisApiError(res.status, msg, parsed);

        if (retryable && isRetryable(res.status) && attempt < attempts) {
          const delay = RETRY_BASE_MS * RETRY_FACTOR ** (attempt - 1);
          debug(`Retryable ${res.status}, attempt ${attempt}/${attempts}, sleeping ${delay}ms`);
          lastError = error;
          await sleep(delay);
          continue;
        }
        throw error;
      }

      return parsed as T;
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof KoulisApiError) throw err;

      const elapsed = Date.now() - start;
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const message = isTimeout
        ? `Request timeout after ${REQUEST_TIMEOUT_MS}ms`
        : `Network error: ${(err as Error).message}`;
      const error = new KoulisApiError(0, message);

      debug(`${rest.method ?? "GET"} ${path} FAILED ${elapsed}ms — ${message}`);

      if (retryable && attempt < attempts) {
        const delay = RETRY_BASE_MS * RETRY_FACTOR ** (attempt - 1);
        debug(`Retryable network error, attempt ${attempt}/${attempts}, sleeping ${delay}ms`);
        lastError = error;
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new KoulisApiError(0, "Request failed after retries");
}

// ── Public API client ───────────────────────────────────────────────────
export const koulisApi = {
  searchRestaurants(params: {
    city: string;
    datetime: string;
    party_size: number;
    window_hours?: number;
    cuisine?: string;
    dietary?: string;
  }): Promise<ApiSearchResponse> {
    return request<ApiSearchResponse>("/v1/restaurants/search", {
      method: "GET",
      retryable: true,
      query: { ...params, datetime: normalizeUtc(params.datetime) },
    });
  },

  getAvailabilities(params: {
    restaurant_id: string;
    datetime: string;
    party_size: number;
    window_hours?: number;
  }): Promise<ApiAvailabilitiesResponse> {
    const { restaurant_id, datetime, ...rest } = params;
    return request<ApiAvailabilitiesResponse>(`/v1/restaurants/${restaurant_id}/availabilities`, {
      method: "GET",
      retryable: true,
      query: { ...rest, datetime: normalizeUtc(datetime) },
    });
  },

  createHold(payload: {
    restaurant_id: string;
    slot_at: string;
    party_size: number;
  }): Promise<ApiHoldResponse> {
    return request<ApiHoldResponse>("/v1/holds", {
      method: "POST",
      retryable: false,
      body: JSON.stringify({ ...payload, slot_at: normalizeUtc(payload.slot_at) }),
    });
  },

  createReservation(payload: {
    hold_id: string;
    customer_name: string;
    customer_phone: string;
    customer_email: string;
    special_requests?: string;
  }): Promise<ApiReservationResponse> {
    return request<ApiReservationResponse>("/v1/reservations", {
      method: "POST",
      retryable: true,
      body: JSON.stringify(payload),
    });
  },
};
