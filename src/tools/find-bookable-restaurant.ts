// src/tools/find-bookable-restaurant.ts
import { z } from "zod";
import type { ApiRestaurantWithSlots } from "../types/api.js";
import { localizedDateTimeSchema } from "../types/schemas.js";
import type { ToolDefinition } from "../types/tool.js";
import { jsonContent, handleApiError } from "./helpers.js";

export const SEARCH_WINDOW_HOURS = 3;

function toSummary(r: ApiRestaurantWithSlots) {
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

export const findBookableRestaurantTool: ToolDefinition = {
  name: "find_bookable_restaurant",
  title: "Find bookable restaurant",
  description:
    "Use this tool when the user wants to discover restaurants with availability " +
    "in a given city and time window (e.g. 'find me a brunch tomorrow in Lille for 4'). " +
    "Searches the Koulis restaurant catalog and returns matching venues whose slots " +
    "fall within a ±3-hour window around the requested datetime, along with their " +
    "available booking slots.\n\n" +
    "Each result includes an `available_slots` array of LocalizedDateTime objects. " +
    "When presenting times to the user, always use `slot.human_readable_fr` " +
    "(e.g. 'jeudi 14 mai à 21h00') — never display `slot.iso_utc` as it shows raw " +
    "UTC which confuses users. When passing a slot to `propose_reservation`, " +
    "use `slot.iso_utc`.\n\n" +
    "Optionally filter results by cuisine or dietary requirements. " +
    "If the user already knows which restaurant they want, skip this tool and " +
    "use `discover_slots` directly with that restaurant's id.",
  inputSchema: {
    city: z
      .string()
      .min(2)
      .describe(
        'City name in plain language (e.g. "Paris", "Lille", "Lyon"). ' +
          "Case-insensitive. Do not pass postal codes or country codes — " +
          "they return zero results.",
      ),
    datetime: z
      .string()
      .describe(
        'Target date and time in UTC ISO 8601 format (e.g. "2026-05-08T20:00:00Z"). ' +
          "The search returns slots within a ±3-hour window around this time. " +
          "If the user gives a local time like '20h', convert it to UTC using the " +
          "city's timezone (e.g. Paris is UTC+2 in summer, so 20h local = 18:00Z).",
      ),
    party_size: z
      .number()
      .int()
      .min(1)
      .max(20)
      .describe(
        "Number of guests including the user. Integer between 1 and 20. " +
          "For example: a dinner for 2 → party_size = 2.",
      ),
    cuisine: z
      .string()
      .optional()
      .describe(
        'Optional cuisine filter in French (e.g. "japonaise", "française", ' +
          '"italienne"). Only one cuisine can be specified. Omit to search all cuisines.',
      ),
    dietary: z
      .string()
      .optional()
      .describe(
        'Optional dietary requirement filter (e.g. "vegan", "sans gluten", ' +
          '"végétarien"). Omit if the user has no dietary restrictions.',
      ),
  },
  outputSchema: {
    query: z.object({
      city: z.string(),
      datetime: z.string(),
      party_size: z.number(),
      cuisine: z.string().optional(),
      dietary: z.string().optional(),
    }),
    count: z.number(),
    results: z.array(
      z.object({
        restaurant_id: z.string(),
        name: z.string(),
        address: z.string().nullable(),
        city: z.string().nullable(),
        timezone: z.string(),
        cuisines: z.array(z.string()),
        formats: z.array(z.string()),
        dietary: z.array(z.string()),
        atmosphere: z.array(z.string()),
        services: z.array(z.string()),
        price_range: z.number().nullable(),
        rating: z.number().nullable(),
        excerpt: z.string().nullable(),
        available_slots: z.array(localizedDateTimeSchema),
      }),
    ),
  },
  async handler(input, ctx) {
    const { city, datetime, party_size, cuisine, dietary } = input as {
      city: string;
      datetime: string;
      party_size: number;
      cuisine?: string;
      dietary?: string;
    };
    try {
      const res = await ctx.apiClient.searchRestaurants({
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
    } catch (err) {
      return handleApiError(err, { fallback: "Search failed" });
    }
  },
};
