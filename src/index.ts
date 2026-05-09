import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { RESTAURANTS, SLOTS, HOLDS, HOLD_TTL_MS, BOOKINGS_BY_HOLD, type Hold, type Booking } from "./data/data.js";
import { toMcpSummary} from "./mappers/restaurantToMcp.js";

const USER_AGENT = "koulis/1.0";

// Create server instance
const server = new McpServer(
    {
        name: "koulis",
        version: "0.0.1",
    },
    {
        instructions:
            "Koulis exposes bookable restaurant inventory. Workflow: " +
            "(1) find_bookable_restaurant to discover availability, ",
            //"(2) propose_reservation to hold a slot for the user to confirm, " +
            //"(3) confirm_reservation with customer details to finalize. " +
            //"Never invent restaurant_id, slot datetime, or hold_id — they only come from prior tool results. " +
            //"Always have the user confirm the proposal before calling confirm_reservation.",
    }
);

// HELPERS
const SLOT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

function slotsNear(restaurantId: string, target: string): string[] {
  const t = new Date(target).getTime();
  return (SLOTS[restaurantId] ?? [])
    .filter((s) => Math.abs(new Date(s).getTime() - t) <= SLOT_WINDOW_MS)
    .sort(
      (a, b) =>
        Math.abs(new Date(a).getTime() - t) - Math.abs(new Date(b).getTime() - t)
    );
}

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorContent(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function buildSummary(r: typeof RESTAURANTS[number], b: Booking): string {
  const dt = new Date(b.datetime);
  const date = dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const time = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `Réservation confirmée pour ${b.party_size} personne${b.party_size > 1 ? "s" : ""} chez ${r.name}, ${r.address ?? ""}, le ${date} à ${time}. Code : ${b.confirmation_id}.`;
}

// TOOL IMPLEMENTATIONS
// ── 1. DISCOVERY (1-step) ────────────────────────────────────────────────
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
      datetime: z
        .string()
        .describe("Desired ISO datetime, e.g. '2026-05-08T20:00:00'"),
      party_size: z.number().int().min(1).max(20),
      cuisine: z
        .string()
        .optional()
        .describe("Optional cuisine filter, e.g. 'japonaise', 'française'"),
      dietary: z
        .string()
        .optional()
        .describe("Optional dietary filter, e.g. 'vegan', 'sans gluten'"),
    },
  },
  async ({ city, datetime, party_size, cuisine, dietary }) => {
    const cityLc = city.toLowerCase();

    const matches = RESTAURANTS
      .filter((r) => r.city_name?.toLowerCase() === cityLc)
      .map((r) => ({ summary: toMcpSummary(r), slots: slotsNear(r.id, datetime) }))
      .filter(({ slots }) => slots.length > 0)
      .filter(({ summary }) =>
        cuisine ? summary.cuisines.includes(cuisine.toLowerCase()) : true
      )
      .filter(({ summary }) =>
        dietary ? summary.dietary.includes(dietary.toLowerCase()) : true
      )
      .map(({ summary, slots }) => ({ ...summary, available_slots: slots }));

    return jsonContent({
      query: { city, datetime, party_size, cuisine, dietary },
      count: matches.length,
      results: matches,
    });
  }
);

// ── 2. SLOTS DISCOVERY (1-step, par restaurant) ──────────────────────────
const SLOT_WINDOW_DISCOVER_MS = 2 * 60 * 60 * 1000; // ±2h

server.registerTool(
  "discover_slots",
  {
    title: "Discover slots for a restaurant",
    description:
      "Returns available slots for a specific restaurant within ±2h of the desired datetime. " +
      "Use AFTER find_bookable_restaurant has returned a restaurant_id the user is interested in. " +
      "Slots are live inventory and may disappear if the user takes too long to confirm.",
    inputSchema: {
      restaurant_id: z
        .string()
        .describe("UUID returned by find_bookable_restaurant"),
      datetime: z
        .string()
        .describe("Desired ISO datetime, e.g. '2026-05-08T20:00:00'"),
      party_size: z.number().int().min(1).max(20),
    },
  },
  async ({ restaurant_id, datetime, party_size }) => {
    const r = RESTAURANTS.find((x) => x.id === restaurant_id);
    if (!r) {
      return {
        isError: true,
        content: [
          { type: "text" as const, text: `Unknown restaurant_id: ${restaurant_id}` },
        ],
      };
    }

    const target = new Date(datetime).getTime();
    const slots = (SLOTS[restaurant_id] ?? [])
      .filter((s) => Math.abs(new Date(s).getTime() - target) <= SLOT_WINDOW_DISCOVER_MS)
      .sort(
        (a, b) =>
          Math.abs(new Date(a).getTime() - target) -
          Math.abs(new Date(b).getTime() - target)
      );

    return jsonContent({
      restaurant_id,
      restaurant_name: r.name,
      query: { datetime, party_size },
      window_hours: 2,
      count: slots.length,
      available_slots: slots,
      next_step:
        slots.length > 0
          ? "Confirm a slot with the user, then call book_reservation."
          : "No slots in this window. Suggest a different datetime or another restaurant.",
    });
  }
);

// ── 3a. PROPOSE (step 1 du booking) ──────────────────────────────────────
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
    const r = RESTAURANTS.find((x) => x.id === restaurant_id);
    if (!r) return errorContent(`Unknown restaurant_id: ${restaurant_id}`);

    const available = SLOTS[restaurant_id] ?? [];
    if (!available.includes(datetime)) {
      return errorContent(
        `Slot ${datetime} not available at ${r.name}. Available: ${available.join(", ") || "(none)"}`
      );
    }

    const hold: Hold = {
      hold_id: `hold_${randomUUID()}`,
      restaurant_id,
      datetime,
      party_size,
      expires_at: Date.now() + HOLD_TTL_MS,
    };
    HOLDS.set(hold.hold_id, hold);

    return jsonContent({
      hold_id: hold.hold_id,
      restaurant_name: r.name,
      address: r.address,
      datetime,
      party_size,
      expires_in_seconds: HOLD_TTL_MS / 1000,
      next_step:
        "Confirm the proposal explicitly with the user, then call confirm_reservation with hold_id + customer details (name, phone, email).",
    });
  }
);

// ── 3b. CONFIRM (step 2 du booking) ──────────────────────────────────────
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
      special_requests: z
        .string()
        .optional()
        .describe("Allergies, accessibility needs, occasion, etc."),
    },
  },
  async ({ hold_id, customer_name, customer_phone, customer_email, special_requests }) => {
    // Idempotence : si déjà confirmé, on renvoie le même résultat
    const existing = BOOKINGS_BY_HOLD.get(hold_id);
    if (existing) {
      const r = RESTAURANTS.find((x) => x.id === existing.restaurant_id)!;
      return jsonContent({
        status: "confirmed",
        idempotent_replay: true,
        confirmation_id: existing.confirmation_id,
        restaurant: { id: r.id, name: r.name, address: r.address, phone: r.phone },
        datetime: existing.datetime,
        party_size: existing.party_size,
        customer: {
          customer_name: existing.customer_name,
          customer_phone: existing.customer_phone,
          customer_email: existing.customer_email,
        },
        special_requests: existing.special_requests,
        human_readable_summary: buildSummary(r, existing),
      });
    }

    const hold = HOLDS.get(hold_id);
    if (!hold) {
      return errorContent(
        `Unknown or already-released hold_id: ${hold_id}. ` +
          `If the slot is still desired, call propose_reservation again to get a fresh hold.`
      );
    }
    if (Date.now() > hold.expires_at) {
      HOLDS.delete(hold_id);
      return errorContent(
        `Hold ${hold_id} expired (5 min limit). The slot may still be available — call propose_reservation again.`
      );
    }

    const r = RESTAURANTS.find((x) => x.id === hold.restaurant_id)!;
    const booking: Booking = {
      confirmation_id: `bk_${randomUUID()}`,
      restaurant_id: hold.restaurant_id,
      datetime: hold.datetime,
      party_size: hold.party_size,
      customer_name,
      customer_phone,
      customer_email,
      special_requests: special_requests ?? null,
      created_at: new Date().toISOString(),
    };

    BOOKINGS_BY_HOLD.set(hold_id, booking);
    HOLDS.delete(hold_id);

    // Phase 2 : INSERT INTO reservations via koulis-api
    console.error(
      `[BOOKING] ${booking.confirmation_id} | ${r.name} | ${booking.datetime} | ${booking.party_size}p | ${customer_name} | ${customer_phone}`
    );

    return jsonContent({
      status: "confirmed",
      idempotent_replay: false,
      confirmation_id: booking.confirmation_id,
      restaurant: { id: r.id, name: r.name, address: r.address, phone: r.phone },
      datetime: booking.datetime,
      party_size: booking.party_size,
      customer: { customer_name, customer_phone, customer_email },
      special_requests: booking.special_requests,
      human_readable_summary: buildSummary(r, booking),
    });
  }
);

// Boot
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("koulis-mcp v0.0.1 ready on stdio");