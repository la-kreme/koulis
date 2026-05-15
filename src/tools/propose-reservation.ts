// src/tools/propose-reservation.ts
import { z } from "zod";
import { localizedDateTimeSchema } from "../types/schemas.js";
import type { ToolDefinition } from "../types/tool.js";
import { jsonContent, handleApiError } from "./helpers.js";

export const proposeReservationTool: ToolDefinition = {
  name: "propose_reservation",
  title: "Propose reservation",
  description:
    "Step 1 of booking. Creates a 5-minute hold on a slot so the user can confirm. " +
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
      .describe(
        "Slot datetime as UTC ISO 8601 (slot.iso_utc from a previous tool result). " +
          "Example: '2026-05-14T19:00:00.000Z'.",
      ),
    party_size: z.number().int().min(1).max(20),
  },
  outputSchema: {
    hold_id: z.string(),
    restaurant_name: z.string(),
    slot: localizedDateTimeSchema,
    party_size: z.number(),
    expires_in_seconds: z.number(),
    next_step: z.string(),
  },
  async handler(input, ctx) {
    const { restaurant_id, datetime, party_size } = input as {
      restaurant_id: string;
      datetime: string;
      party_size: number;
    };
    try {
      const hold = await ctx.apiClient.createHold({
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
        next_step:
          `Tell the user: "Hold confirmed for ${hold.slot.human_readable_fr} at ${hold.restaurant_name}. ` +
          `You have ${hold.expires_in_seconds} seconds to confirm. Should I proceed with confirmation?" ` +
          `Wait for their explicit OK, then call confirm_reservation with hold_id + customer details.`,
      });
    } catch (err) {
      return handleApiError(err, { fallback: "Hold creation failed" });
    }
  },
};
