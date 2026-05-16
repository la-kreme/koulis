// src/server.ts — MCP server factory (transport-agnostic)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { KoulisApiClient } from "./lib/api-client.js";
import type { ToolDefinition } from "./types/tool.js";
import {
  findBookableRestaurantTool,
  discoverSlotsTool,
  proposeReservationTool,
  confirmReservationTool,
} from "./tools/index.js";
import pkg from "../package.json" with { type: "json" };

const allTools: ToolDefinition[] = [
  findBookableRestaurantTool,
  discoverSlotsTool,
  proposeReservationTool,
  confirmReservationTool,
];

export function createKoulisMcpServer(opts: { apiClient: KoulisApiClient }): McpServer {
  const server = new McpServer(
    { name: "koulis", version: pkg.version },
    {
      instructions:
        "Koulis exposes bookable restaurant inventory. Workflow: " +
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
    },
  );

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      (input) => tool.handler(input as Record<string, unknown>, { apiClient: opts.apiClient }),
    );
  }

  return server;
}
