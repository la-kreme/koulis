// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { koulisApi, KoulisApiError } from "./lib/api-client.js";
import pkg from "../package.json" with { type: "json" };
const SEARCH_WINDOW_HOURS = 3;
const SLOTS_WINDOW_HOURS = 2;
const server = new McpServer({ name: "koulis", version: pkg.version }, {
    instructions: "Koulis exposes bookable restaurant inventory. Workflow: " +
        "(1) find_bookable_restaurant to discover availability, " +
        "(2) discover_slots to confirm available times at a chosen restaurant, " +
        "(3) propose_reservation to hold a slot for the user to confirm, " +
        "(4) confirm_reservation with customer details to finalize. " +
        "Never invent restaurant_id, slot datetime, or hold_id — they only come from prior tool results. " +
        "Always have the user explicitly confirm the proposal before calling confirm_reservation. " +
        "\n\n" +
        "## Handling datetimes (CRITICAL)\n" +
        "Every slot returned by Koulis is a structured object — not a raw datetime string. " +
        "It has these fields:\n" +
        "- slot.human_readable_fr — pre-formatted French string (e.g. 'jeudi 14 mai à 21h00')\n" +
        "- slot.human_readable_en — pre-formatted English string\n" +
        "- slot.local_time — 'HH:mm' in the restaurant's timezone (e.g. '21:00')\n" +
        "- slot.iso_utc — UTC datetime for inter-service calls\n" +
        "- slot.timezone — restaurant's IANA timezone (e.g. 'Europe/Paris')\n" +
        "\n" +
        "### Rules\n" +
        "1. WHEN DISPLAYING a time to the user, ALWAYS use slot.human_readable_fr (or _en). " +
        "Never display slot.iso_utc — it shows '19:00Z' which is confusing and reads as UTC, " +
        "not the restaurant's local time.\n" +
        "2. WHEN CALLING propose_reservation, pass slot.iso_utc as the `datetime` parameter. " +
        "Never pass slot.local_time or slot.human_readable_fr — the API requires strict UTC.\n" +
        "3. The slot is already localized to the RESTAURANT's timezone — not the user's. " +
        "Do not attempt to re-convert it. Trust the human_readable_fr field as-is.",
});
// ── Helpers ──────────────────────────────────────────────────────────────
function jsonContent(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function errorContent(message) {
    return { isError: true, content: [{ type: "text", text: message }] };
}
function handleApiError(err, fallback) {
    if (err instanceof KoulisApiError) {
        if (err.status === 0)
            return errorContent(`Network error reaching Koulis API: ${err.message}`);
        if (err.status === 401)
            return errorContent("Koulis API authentication failed. Check KOULIS_API_TOKEN.");
        if (err.status === 404)
            return errorContent(err.message || "Not found");
        if (err.status === 409)
            return errorContent(err.message || "Conflict");
        if (err.status === 410)
            return errorContent(err.message || "Resource expired");
        return errorContent(`Koulis API error (${err.status}): ${err.message}`);
    }
    return errorContent(`${fallback}: ${err.message ?? String(err)}`);
}
function toSummary(r) {
    return {
        restaurant_id: r.id,
        name: r.name,
        address: r.address,
        city: r.city_name,
        timezone: r.timezone,
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
// Build a French summary using the pre-localized human_readable_fr field.
// Prior versions of this function called `new Date(...).toLocaleTimeString("fr-FR", ...)`,
// which uses the PROCESS timezone — not the restaurant's. That meant a user in NY
// booking a Paris restaurant would see the time shifted by 6 hours. The Koulis API
// now pre-localizes every slot to the restaurant's IANA timezone, so we just read it.
function buildSummary(r) {
    const plural = r.party_size > 1 ? "s" : "";
    return `Réservation confirmée pour ${r.party_size} personne${plural} chez ${r.restaurant_name} le ${r.slot.human_readable_fr}. Code : ${r.confirmation_id}.`;
}
// ── 1. DISCOVERY ─────────────────────────────────────────────────────────
server.registerTool("find_bookable_restaurant", {
    title: "Find bookable restaurant",
    description: "Returns restaurants in the Koulis network matching a city and time window, " +
        "with their available slots. Use this BEFORE any booking action. " +
        "Optionally filter by cuisine or dietary requirements. " +
        "\n\n" +
        "Each result's `available_slots` is an array of LocalizedDateTime objects. " +
        "Each object has slot.human_readable_fr (for display) and slot.iso_utc (for booking calls). " +
        "ALWAYS use slot.human_readable_fr when listing slots to the user.",
    inputSchema: {
        city: z.string().describe("City name, e.g. 'Paris'"),
        datetime: z.string().describe("Desired ISO datetime UTC, e.g. '2026-05-08T20:00:00Z'"),
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
}, async ({ city, datetime, party_size, cuisine, dietary }) => {
    try {
        const res = await koulisApi.searchRestaurants({
            city,
            datetime,
            party_size,
            window_hours: SEARCH_WINDOW_HOURS,
            cuisine,
            dietary,
        });
        return jsonContent({
            query: { city, datetime, party_size, cuisine, dietary },
            count: res.count,
            results: res.results.map(toSummary),
        });
    }
    catch (err) {
        return handleApiError(err, "Search failed");
    }
});
// ── 2. SLOTS DISCOVERY ───────────────────────────────────────────────────
server.registerTool("discover_slots", {
    title: "Discover slots for a restaurant",
    description: "Returns available slots for a specific restaurant within ±2h of the desired datetime. " +
        "Use AFTER find_bookable_restaurant has returned a restaurant_id the user is interested in. " +
        "Slots are live inventory and may disappear if the user takes too long to confirm. " +
        "\n\n" +
        "Each returned slot is a LocalizedDateTime object. When listing options to the user, " +
        "use slot.human_readable_fr (e.g. 'jeudi 14 mai à 21h00'). When the user picks one, " +
        "pass that slot's slot.iso_utc to propose_reservation.",
    inputSchema: {
        restaurant_id: z.string().describe("UUID returned by find_bookable_restaurant"),
        datetime: z.string().describe("Desired ISO datetime UTC, e.g. '2026-05-08T20:00:00Z'"),
        party_size: z.number().int().min(1).max(20),
    },
}, async ({ restaurant_id, datetime, party_size }) => {
    try {
        const res = await koulisApi.getAvailabilities({
            restaurant_id,
            datetime,
            party_size,
            window_hours: SLOTS_WINDOW_HOURS,
        });
        return jsonContent({
            restaurant_id: res.restaurant_id,
            restaurant_name: res.restaurant_name,
            restaurant_timezone: res.restaurant_timezone,
            query: { datetime, party_size },
            window_hours: SLOTS_WINDOW_HOURS,
            count: res.count,
            available_slots: res.slots.map((s) => s.slot),
            next_step: res.count > 0
                ? "Present slots to the user using slot.human_readable_fr. When the user confirms one, call propose_reservation with that slot.iso_utc."
                : "No slots in this window. Suggest a different datetime or another restaurant.",
        });
    }
    catch (err) {
        return handleApiError(err, "Slot lookup failed");
    }
});
// ── 3a. PROPOSE ──────────────────────────────────────────────────────────
server.registerTool("propose_reservation", {
    title: "Propose reservation",
    description: "Step 1 of booking. Creates a 5-minute hold on a slot so the user can confirm. " +
        "REVERSIBLE: holds expire automatically; if the user changes their mind, do nothing — the hold dies on its own. " +
        "Always have the user explicitly confirm before calling confirm_reservation. " +
        "\n\n" +
        "The `datetime` parameter MUST be a UTC ISO 8601 string. " +
        "If you got the slot from discover_slots or find_bookable_restaurant, pass slot.iso_utc — " +
        "NOT slot.local_time or slot.human_readable_fr. The API rejects non-UTC datetimes.",
    inputSchema: {
        restaurant_id: z.string().describe("UUID from find_bookable_restaurant"),
        datetime: z
            .string()
            .describe("Slot datetime as UTC ISO 8601 (slot.iso_utc from a previous tool result). " +
            "Example: '2026-05-14T19:00:00.000Z'."),
        party_size: z.number().int().min(1).max(20),
    },
}, async ({ restaurant_id, datetime, party_size }) => {
    try {
        const hold = await koulisApi.createHold({
            restaurant_id,
            slot_at: datetime,
            party_size,
        });
        return jsonContent({
            hold_id: hold.hold_id,
            restaurant_name: hold.restaurant_name,
            slot: hold.slot,
            party_size: hold.party_size,
            expires_in_seconds: hold.expires_in_seconds,
            next_step: `Tell the user: "Hold confirmed for ${hold.slot.human_readable_fr} at ${hold.restaurant_name}. ` +
                `You have ${hold.expires_in_seconds} seconds to confirm. Should I proceed with confirmation?" ` +
                `Wait for their explicit OK, then call confirm_reservation with hold_id + customer details.`,
        });
    }
    catch (err) {
        return handleApiError(err, "Hold creation failed");
    }
});
// ── 3b. CONFIRM ──────────────────────────────────────────────────────────
server.registerTool("confirm_reservation", {
    title: "Confirm reservation",
    description: "Step 2 of booking. IRREVERSIBLE: finalizes the reservation. " +
        "Only call AFTER explicit user confirmation of the hold returned by propose_reservation. " +
        "Idempotent: calling twice with the same hold_id returns the same confirmation. " +
        "\n\n" +
        "When confirming the booking back to the user, use the returned slot.human_readable_fr " +
        "or the pre-formatted human_readable_summary — never slot.iso_utc. The user needs to read " +
        "their local arrival time clearly.",
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
}, async (input) => {
    try {
        const r = await koulisApi.createReservation(input);
        return jsonContent({
            status: r.status,
            idempotent_replay: r.idempotent_replay,
            confirmation_id: r.confirmation_id,
            restaurant: { id: r.restaurant_id, name: r.restaurant_name },
            slot: r.slot,
            party_size: r.party_size,
            customer: {
                name: r.customer_name,
                phone: r.customer_phone,
                email: r.customer_email,
            },
            special_requests: r.special_requests,
            human_readable_summary: buildSummary(r),
        });
    }
    catch (err) {
        return handleApiError(err, "Reservation failed");
    }
});
// ── BOOT ─────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`koulis-mcp v${pkg.version} ready on stdio (connected to API)`);
