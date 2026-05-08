import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { RESTAURANTS, SLOTS, HOLDS, HOLD_TTL_MS, type Hold } from "./data/data.js";
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

// Boot
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("koulis-mcp v0.0.1 ready on stdio");