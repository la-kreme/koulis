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
  // Already has Z or an offset like +02:00 / -05:00 at the end → pass through
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)) return s;
  return `${s}Z`;
}

const API_URL = process.env.KOULIS_API_URL ?? "http://localhost:3001";
const API_TOKEN = process.env.KOULIS_API_TOKEN;

if (!API_TOKEN) {
  // stdout est réservé au protocole MCP — on logge sur stderr.
  console.error(
    "[koulis-mcp] WARNING: KOULIS_API_TOKEN is not set. API calls will fail with 401."
  );
}

export class KoulisApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "KoulisApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const { query, ...rest } = init;

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

  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers });
  } catch (err) {
    throw new KoulisApiError(0, `Network error: ${(err as Error).message}`);
  }

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
    const msg =
      (typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : undefined) ??
      (typeof parsed === "object" && parsed !== null && "error" in parsed
        ? JSON.stringify((parsed as { error: unknown }).error)
        : undefined) ??
      `HTTP ${res.status}`;
    throw new KoulisApiError(res.status, msg, parsed);
  }

  return parsed as T;
}

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
    return request<ApiAvailabilitiesResponse>(
      `/v1/restaurants/${restaurant_id}/availabilities`,
      { method: "GET", query: { ...rest, datetime: normalizeUtc(datetime) } }
    );
  },

  createHold(payload: {
    restaurant_id: string;
    slot_at: string;
    party_size: number;
  }): Promise<ApiHoldResponse> {
    return request<ApiHoldResponse>("/v1/holds", {
      method: "POST",
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
      body: JSON.stringify(payload),
    });
  },
};