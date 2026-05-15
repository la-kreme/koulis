// src/tools/discover-slots.ts
import { z } from "zod";
import type { ToolDefinition } from "../types/tool.js";
import { jsonContent, handleApiError } from "./helpers.js";

export const SLOTS_WINDOW_HOURS = 2;

export const discoverSlotsTool: ToolDefinition = {
  name: "discover_slots",
  title: "Discover slots for a restaurant",
  description:
    "Returns available slots for a specific restaurant within ±2h of the desired datetime. " +
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
      return handleApiError(err, "Slot lookup failed");
    }
  },
};
