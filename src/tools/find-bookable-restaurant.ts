// src/tools/find-bookable-restaurant.ts
import { z } from "zod";
import type { ApiRestaurantWithSlots } from "../types/api.js";
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
    "Returns restaurants in the Koulis network matching a city and time window, " +
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
    dietary: z.string().optional().describe("Optional dietary filter, e.g. 'vegan', 'sans gluten'"),
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
      return handleApiError(err, "Search failed");
    }
  },
};
