// src/tools/confirm-reservation.ts
import { z } from "zod";
import type { ApiReservationResponse } from "../types/api.js";
import { localizedDateTimeSchema } from "../types/schemas.js";
import type { ToolDefinition } from "../types/tool.js";
import { jsonContent, handleApiError } from "./helpers.js";

function buildSummary(r: ApiReservationResponse): string {
  const plural = r.party_size > 1 ? "s" : "";
  return `Réservation confirmée pour ${r.party_size} personne${plural} chez ${r.restaurant_name} le ${r.slot.human_readable_fr}. Code : ${r.confirmation_id}.`;
}

export const confirmReservationTool: ToolDefinition = {
  name: "confirm_reservation",
  title: "Confirm reservation",
  description:
    "Step 2 of booking. IRREVERSIBLE: finalizes the reservation. " +
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
  outputSchema: {
    status: z.string(),
    idempotent_replay: z.boolean(),
    confirmation_id: z.string(),
    restaurant: z.object({
      id: z.string(),
      name: z.string(),
    }),
    slot: localizedDateTimeSchema,
    party_size: z.number(),
    customer: z.object({
      name: z.string(),
      phone: z.string(),
      email: z.string(),
    }),
    special_requests: z.string().nullable(),
    human_readable_summary: z.string(),
  },
  async handler(input, ctx) {
    const { hold_id, customer_name, customer_phone, customer_email, special_requests } = input as {
      hold_id: string;
      customer_name: string;
      customer_phone: string;
      customer_email: string;
      special_requests?: string;
    };
    try {
      const r = await ctx.apiClient.createReservation({
        hold_id,
        customer_name,
        customer_phone,
        customer_email,
        special_requests,
      });
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
    } catch (err) {
      return handleApiError(err, {
        fallback: "Reservation failed",
        notFoundCode: "hold_not_found",
      });
    }
  },
};
