// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { koulisApi, KoulisApiError } from "./lib/api-client.js";
import type {
  ApiRestaurantWithSlots,
  ApiReservationResponse,
} from "./types/api.js";

const server = new McpServer(
  { name: "koulis", version: "0.1.0" },
  {
    instructions:
      "Koulis exposes bookable restaurant inventory. Workflow: " +
      "(1) find_bookable_restaurant to discover availability, " +
      "(2) discover_slots to confirm available times at a chosen restaurant, " +
      "(3) propose_reservation to hold a slot for the user to confirm, " +
      "(4) confirm_reservation with customer details to finalize. " +
      "Never invent restaurant_id, slot datetime, or hold_id — they only come from prior tool results. " +
      "Always have the user explicitly confirm the proposal before calling confirm_reservation.",
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────
function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorContent(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function handleApiError(err: unknown, fallback: string) {
  if (err instanceof KoulisApiError) {
    if (err.status === 0) return errorContent(`Network error reaching Koulis API: ${err.message}`);
    if (err.status === 401) return errorContent("Koulis API authentication failed. Check KOULIS_API_TOKEN.");
    if (err.status === 404) return errorContent(err.message || "Not found");
    if (err.status === 409) return errorContent(err.message || "Conflict");
    if (err.status === 410) return errorContent(err.message || "Resource expired");
    return errorContent(`Koulis API error (${err.status}): ${err.message}`);
  }
  return errorContent(`${fallback}: ${(err as Error).message ?? String(err)}`);
}

function toSummary(r: ApiRestaurantWithSlots) {
  return {
    restaurant_id: r.id,
    name: r.name,
    address: r.address,
    city: r.city_name,
    cuisines: r.cuisines,
    formats: r.formats,
    dietary: r.dietary,
    atmosphere: r.atmosphere,
    services: r.services,
    price_range: r.price_range,
    rating: r.rating,
    excerpt: r.excerpt,
    available_slots: r.available_slots,
  };
}

function buildSummary(r: ApiReservationResponse): string {
  const dt = new Date(r.slot_at);
  const date = dt.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const plural = r.party_size > 1 ? "s" : "";
  return `Réservation confirmée pour ${r.party_size} personne${plural} chez ${r.restaurant_name} le ${date} à ${time}. Code : ${r.confirmation_id}.`;
}

// ── 1. DISCOVERY ─────────────────────────────────────────────────────────
server.registerTool(
  "find_bookable_restaurant",
  {
    title: "Find bookable restaurant",
    description:
      "Returns restaurants in the Koulis network matching a city and time window, " +
      "with their available slots. Use this BEFORE any booking action. " +
      "Optionally filter by cuisine or dietary requirements.",
    inputSchema: {
      city: z.string().describe("City name, e.g. 'Paris'"),
      datetime: z.string().describe("Desired ISO datetime, e.g. '2026-05-08T20:00:00'"),
      party_size: z.number().int().min(1).max(20),
      cuisine: z.string().optional().describe("Optional cuisine filter, e.g. 'japonaise', 'française'"),
      dietary: z.string().optional().describe("Optional dietary filter, e.g. 'vegan', 'sans gluten'"),
    },
  },
  async ({ city, datetime, party_size, cuisine, dietary }) => {
    try {
      const res = await koulisApi.searchRestaurants({
        city, datetime, party_size, window_hours: 3, cuisine, dietary,
      });
      return jsonContent({
        query: { city, datetime, party_size, cuisine, dietary },
        count: res.count,
        results: res.results.map(toSummary),
      });
    } catch (err) {
      return handleApiError(err, "Search failed");
    }
  }
);

// ── 2. SLOTS DISCOVERY ───────────────────────────────────────────────────
server.registerTool(
  "discover_slots",
  {
    title: "Discover slots for a restaurant",
    description:
      "Returns available slots for a specific restaurant within ±2h of the desired datetime. " +
      "Use AFTER find_bookable_restaurant has returned a restaurant_id the user is interested in. " +
      "Slots are live inventory and may disappear if the user takes too long to confirm.",
    inputSchema: {
      restaurant_id: z.string().describe("UUID returned by find_bookable_restaurant"),
      datetime: z.string().describe("Desired ISO datetime, e.g. '2026-05-08T20:00:00'"),
      party_size: z.number().int().min(1).max(20),
    },
  },
  async ({ restaurant_id, datetime, party_size }) => {
    try {
      const res = await koulisApi.getAvailabilities({
        restaurant_id, datetime, party_size, window_hours: 2,
      });
      return jsonContent({
        restaurant_id: res.restaurant_id,
        restaurant_name: res.restaurant_name,
        query: { datetime, party_size },
        window_hours: 2,
        count: res.count,
        available_slots: res.slots.map((s) => s.slot_at),
        next_step:
          res.count > 0
            ? "Confirm a slot with the user, then call propose_reservation."
            : "No slots in this window. Suggest a different datetime or another restaurant.",
      });
    } catch (err) {
      return handleApiError(err, "Slot lookup failed");
    }
  }
);

// ── 3a. PROPOSE ──────────────────────────────────────────────────────────
server.registerTool(
  "propose_reservation",
  {
    title: "Propose reservation",
    description:
      "Step 1 of booking. Creates a 5-minute hold on a slot so the user can confirm. " +
      "REVERSIBLE: holds expire automatically; if the user changes their mind, do nothing — the hold dies on its own. " +
      "Always have the user explicitly confirm before calling confirm_reservation.",
    inputSchema: {
      restaurant_id: z.string().describe("UUID from find_bookable_restaurant"),
      datetime: z.string().describe("Exact slot datetime from discover_slots"),
      party_size: z.number().int().min(1).max(20),
    },
  },
  async ({ restaurant_id, datetime, party_size }) => {
    try {
      const hold = await koulisApi.createHold({
        restaurant_id, slot_at: datetime, party_size,
      });
      return jsonContent({
        hold_id: hold.hold_id,
        restaurant_name: hold.restaurant_name,
        slot_at: hold.slot_at,
        party_size: hold.party_size,
        expires_in_seconds: hold.expires_in_seconds,
        next_step:
          "Confirm the proposal explicitly with the user, then call confirm_reservation with hold_id + customer details (name, phone, email).",
      });
    } catch (err) {
      return handleApiError(err, "Hold creation failed");
    }
  }
);

// ── 3b. CONFIRM ──────────────────────────────────────────────────────────
server.registerTool(
  "confirm_reservation",
  {
    title: "Confirm reservation",
    description:
      "Step 2 of booking. IRREVERSIBLE: finalizes the reservation. " +
      "Only call AFTER explicit user confirmation of the hold returned by propose_reservation. " +
      "Idempotent: calling twice with the same hold_id returns the same confirmation.",
    inputSchema: {
      hold_id: z.string(),
      customer_name: z.string().min(1),
      customer_phone: z.string().min(6),
      customer_email: z.string().email(),
      special_requests: z.string().optional().describe("Allergies, accessibility needs, occasion, etc."),
    },
  },
  async (input) => {
    try {
      const r = await koulisApi.createReservation(input);
      return jsonContent({
        status: r.status,
        idempotent_replay: r.idempotent_replay,
        confirmation_id: r.confirmation_id,
        restaurant: { id: r.restaurant_id, name: r.restaurant_name },
        slot_at: r.slot_at,
        party_size: r.party_size,
        customer: {
          name: r.customer_name,
          phone: r.customer_phone,
          email: r.customer_email,
        },
        special_requests: r.special_requests,
        human_readable_summary: buildSummary(r),
      });
    } catch (err) {
      return handleApiError(err, "Reservation failed");
    }
  }
);

// ── BOOT ─────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("koulis-mcp v0.1.0 ready on stdio (connected to API)");