// src/tools/discover-slots.ts
import { z } from "zod";
import { localizedDateTimeSchema } from "../types/schemas.js";
import type { ToolDefinition } from "../types/tool.js";
import { jsonContent, handleApiError } from "./helpers.js";

export const SLOTS_WINDOW_HOURS = 2;

export const discoverSlotsTool: ToolDefinition = {
  name: "discover_slots",
  title: "Discover slots for a restaurant",
  description:
    "Use this tool when the user wants to see all available time slots at a specific " +
    "restaurant (e.g. 'what times are free at Le Petit Brunch on Saturday?'). " +
    "Requires a `restaurant_id` from a prior `find_bookable_restaurant` result.\n\n" +
    "Returns all bookable slots within a ±2-hour window around the requested datetime. " +
    "Slots are live inventory — they may be taken by another customer at any time. " +
    "When presenting options to the user, use `slot.human_readable_fr` " +
    "(e.g. 'jeudi 14 mai à 21h00'). When the user picks a slot, pass its " +
    "`slot.iso_utc` to `propose_reservation`.\n\n" +
    "If no slots are returned, suggest the user try a different time or another " +
    "restaurant. Do not call `propose_reservation` without a valid slot from this " +
    "tool or from `find_bookable_restaurant`.",
  inputSchema: {
    restaurant_id: z
      .string()
      .describe(
        "UUID of the restaurant, obtained from a prior find_bookable_restaurant result. " +
          "Do not invent this value — it must come from a previous tool response.",
      ),
    datetime: z
      .string()
      .describe(
        'Center of the search window in UTC ISO 8601 format (e.g. "2026-05-08T20:00:00Z"). ' +
          "Returns slots within ±2 hours of this time. Use the same datetime the user " +
          "originally requested, or adjust based on their feedback.",
      ),
    party_size: z
      .number()
      .int()
      .min(1)
      .max(20)
      .describe(
        "Number of guests. Must match the party_size used in find_bookable_restaurant " +
          "to ensure capacity is available.",
      ),
  },
  outputSchema: {
    restaurant_id: z.string(),
    restaurant_name: z.string(),
    restaurant_timezone: z.string(),
    query: z.object({
      datetime: z.string(),
      party_size: z.number(),
    }),
    window_hours: z.number(),
    count: z.number(),
    available_slots: z.array(localizedDateTimeSchema),
    next_step: z.string(),
  },
  async handler(input, ctx) {
    const { restaurant_id, datetime, party_size } = input as {
      restaurant_id: string;
      datetime: string;
      party_size: number;
    };
    try {
      const res = await ctx.apiClient.getAvailabilities({
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
        next_step:
          res.count > 0
            ? "Present slots to the user using slot.human_readable_fr. When the user confirms one, call propose_reservation with that slot.iso_utc."
            : "No slots in this window. Suggest a different datetime or another restaurant.",
      });
    } catch (err) {
      return handleApiError(err, { fallback: "Slot lookup failed" });
    }
  },
};
