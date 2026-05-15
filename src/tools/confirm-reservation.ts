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
    "Use this tool when the user has explicitly confirmed they want to finalize " +
    "a reservation (step 2 of the 2-step reservation flow). This action is " +
    "IRREVERSIBLE — it creates a confirmed booking that the restaurant will honor.\n\n" +
    "Only call this after the user has reviewed the hold from `propose_reservation` " +
    "and given explicit consent (e.g. 'yes, book it'). The tool is idempotent: " +
    "calling it twice with the same `hold_id` returns the same confirmation " +
    "without creating a duplicate reservation.\n\n" +
    "Requires the customer's name, phone number, and email address. The customer " +
    "will receive a confirmation email with reservation details and a cancellation " +
    "link. When presenting the confirmation to the user, use the " +
    "`human_readable_summary` or `slot.human_readable_fr` — never display " +
    "`slot.iso_utc`.",
  inputSchema: {
    hold_id: z
      .string()
      .describe(
        "Hold identifier returned by propose_reservation. Must be used within the " +
          "hold's TTL (typically 5 minutes). Expired holds return an error.",
      ),
    customer_name: z
      .string()
      .min(1)
      .describe(
        'Full name of the person making the reservation (e.g. "Jean Dupont"). ' +
          "This appears on the booking at the restaurant.",
      ),
    customer_phone: z
      .string()
      .min(6)
      .describe(
        'Phone number with country code (e.g. "+33612345678"). The restaurant ' +
          "may call this number to confirm or in case of changes.",
      ),
    customer_email: z
      .string()
      .email()
      .describe(
        "Email address for the booking confirmation. The customer receives a " +
          "confirmation email with reservation details and a cancellation link.",
      ),
    special_requests: z
      .string()
      .optional()
      .describe(
        "Optional free-text field for special needs: allergies, accessibility " +
          'requirements, celebration, seating preferences, etc. (e.g. "nut allergy, ' +
          'window table if possible").',
      ),
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
