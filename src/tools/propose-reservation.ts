// src/tools/propose-reservation.ts
import { z } from "zod";
import { localizedDateTimeSchema } from "../types/schemas.js";
import type { ToolDefinition } from "../types/tool.js";
import { jsonContent, handleApiError } from "./helpers.js";

export const proposeReservationTool: ToolDefinition = {
  name: "propose_reservation",
  title: "Propose reservation",
  description:
    "Use this tool when the user has chosen a specific slot and wants to proceed " +
    "with booking (step 1 of the 2-step reservation flow). Creates a temporary " +
    "5-minute hold on the selected slot so no one else can take it while the user " +
    "confirms.\n\n" +
    "This action is REVERSIBLE — the hold expires automatically after 5 minutes " +
    "if not confirmed. After calling this tool, you MUST present the hold details " +
    "to the user and ask for explicit confirmation before proceeding to " +
    "`confirm_reservation`. Never call `confirm_reservation` without the user " +
    "saying yes.\n\n" +
    "The returned `hold_id` is required for `confirm_reservation` and is only " +
    "valid for the duration shown in `expires_in_seconds`. The `datetime` parameter " +
    "MUST be a `slot.iso_utc` value from a prior tool result — never pass local " +
    "times or human-readable strings.",
  inputSchema: {
    restaurant_id: z
      .string()
      .describe(
        "UUID of the restaurant from a prior find_bookable_restaurant or " +
          "discover_slots result. Must match the restaurant that owns the slot " +
          "being held.",
      ),
    datetime: z
      .string()
      .describe(
        "Exact slot time in UTC ISO 8601 format with Z suffix " +
          '(e.g. "2026-05-14T19:00:00.000Z"). MUST be a slot.iso_utc value from ' +
          "a prior find_bookable_restaurant or discover_slots result. Never pass " +
          "local times, human_readable_fr strings, or invented datetimes.",
      ),
    party_size: z
      .number()
      .int()
      .min(1)
      .max(20)
      .describe("Number of guests for this reservation. Must be between 1 and 20."),
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
