import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKoulisMcpServer } from "../server.js";
import { KoulisApiError } from "../lib/api-client.js";
import type { ToolErrorBody } from "../lib/errors.js";
import { findBookableRestaurantTool } from "../tools/find-bookable-restaurant.js";
import { discoverSlotsTool } from "../tools/discover-slots.js";
import { proposeReservationTool } from "../tools/propose-reservation.js";
import { confirmReservationTool } from "../tools/confirm-reservation.js";
import {
  SEARCH_RESPONSE,
  AVAILABILITIES_RESPONSE,
  HOLD_RESPONSE,
  RESERVATION_RESPONSE,
} from "./fixtures.js";

const mockApi = {
  searchRestaurants: vi.fn(),
  getAvailabilities: vi.fn(),
  createHold: vi.fn(),
  createReservation: vi.fn(),
};

let client: Client;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  const server = createKoulisMcpServer({ apiClient: mockApi });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanup = async () => {
    await client.close();
    await server.close();
  };
});

afterAll(async () => {
  await cleanup();
});

function parseContent(result: Awaited<ReturnType<typeof client.callTool>>) {
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return JSON.parse(text) as Record<string, unknown>;
}

function parseError(result: Awaited<ReturnType<typeof client.callTool>>): ToolErrorBody {
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return JSON.parse(text) as ToolErrorBody;
}

// ── find_bookable_restaurant ─────────────────────────────────────────────
describe("find_bookable_restaurant", () => {
  it("returns mapped restaurant summaries on happy path", async () => {
    mockApi.searchRestaurants.mockResolvedValueOnce(SEARCH_RESPONSE);

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.count).toBe(1);
    const results = data.results as Array<Record<string, unknown>>;
    expect(results[0].restaurant_id).toBe("rest-001");
    expect(results[0].name).toBe("Le Petit Brunch");
    expect(results[0].timezone).toBe("Europe/Paris");
  });

  it("returns structuredContent matching outputSchema", async () => {
    mockApi.searchRestaurants.mockResolvedValueOnce(SEARCH_RESPONSE);

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.structuredContent).toBeDefined();
    const schema = z.object(findBookableRestaurantTool.outputSchema!);
    expect(() => schema.parse(result.structuredContent)).not.toThrow();
  });

  it("returns error content on API 401", async () => {
    mockApi.searchRestaurants.mockRejectedValueOnce(new KoulisApiError(401, "Unauthorized"));

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("authentication failed");
  });

  it("returns error content on network error", async () => {
    mockApi.searchRestaurants.mockRejectedValueOnce(
      new KoulisApiError(0, "Network error: fetch failed"),
    );

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Network error");
  });

  it("returns fallback error on unexpected (non-KoulisApiError) exception", async () => {
    mockApi.searchRestaurants.mockRejectedValueOnce(new Error("something unexpected"));

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Search failed");
    expect(text).toContain("something unexpected");
  });

  it("returns generic error for unhandled API status codes", async () => {
    mockApi.searchRestaurants.mockRejectedValueOnce(new KoulisApiError(503, "Service unavailable"));

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("503");
    expect(text).toContain("Service unavailable");
  });

  it("maps 404 to restaurant_not_found error code", async () => {
    mockApi.searchRestaurants.mockRejectedValueOnce(
      new KoulisApiError(404, "Restaurant not found"),
    );

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBe(true);
    const body = parseError(result);
    expect(body.error.code).toBe("restaurant_not_found");
  });

  it("maps network error to upstream_unavailable error code", async () => {
    mockApi.searchRestaurants.mockRejectedValueOnce(
      new KoulisApiError(0, "Network error: fetch failed"),
    );

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    const body = parseError(result);
    expect(body.error.code).toBe("upstream_unavailable");
  });

  it("maps timeout to upstream_timeout error code", async () => {
    mockApi.searchRestaurants.mockRejectedValueOnce(
      new KoulisApiError(0, "Request timeout after 30000ms"),
    );

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: {
        city: "Paris",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    const body = parseError(result);
    expect(body.error.code).toBe("upstream_timeout");
  });
});

// ── discover_slots ───────────────────────────────────────────────────────
describe("discover_slots", () => {
  it("returns slots with next_step guidance on happy path", async () => {
    mockApi.getAvailabilities.mockResolvedValueOnce(AVAILABILITIES_RESPONSE);

    const result = await client.callTool({
      name: "discover_slots",
      arguments: {
        restaurant_id: "rest-001",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.count).toBe(1);
    expect(data.restaurant_name).toBe("Le Petit Brunch");
    expect(data.restaurant_timezone).toBe("Europe/Paris");
    const slots = data.available_slots as Array<Record<string, unknown>>;
    expect(slots[0].human_readable_fr).toBe("jeudi 14 mai à 21h00");
    expect(data.next_step).toContain("slot.human_readable_fr");
  });

  it("returns structuredContent matching outputSchema", async () => {
    mockApi.getAvailabilities.mockResolvedValueOnce(AVAILABILITIES_RESPONSE);

    const result = await client.callTool({
      name: "discover_slots",
      arguments: {
        restaurant_id: "rest-001",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.structuredContent).toBeDefined();
    const schema = z.object(discoverSlotsTool.outputSchema!);
    expect(() => schema.parse(result.structuredContent)).not.toThrow();
  });

  it("suggests alternatives when no slots found", async () => {
    mockApi.getAvailabilities.mockResolvedValueOnce({
      ...AVAILABILITIES_RESPONSE,
      count: 0,
      slots: [],
    });

    const result = await client.callTool({
      name: "discover_slots",
      arguments: {
        restaurant_id: "rest-001",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    const data = parseContent(result);
    expect(data.count).toBe(0);
    expect(data.next_step).toContain("No slots");
  });

  it("returns error on 404 (restaurant not found)", async () => {
    mockApi.getAvailabilities.mockRejectedValueOnce(
      new KoulisApiError(404, "Restaurant not found"),
    );

    const result = await client.callTool({
      name: "discover_slots",
      arguments: {
        restaurant_id: "nonexistent",
        datetime: "2026-05-14T19:00:00Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Restaurant not found");
  });
});

// ── propose_reservation ──────────────────────────────────────────────────
describe("propose_reservation", () => {
  it("returns hold with human-readable next_step on happy path", async () => {
    mockApi.createHold.mockResolvedValueOnce(HOLD_RESPONSE);

    const result = await client.callTool({
      name: "propose_reservation",
      arguments: {
        restaurant_id: "rest-001",
        datetime: "2026-05-14T19:00:00.000Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.hold_id).toBe("hold-abc");
    expect(data.expires_in_seconds).toBe(300);
    expect(data.next_step).toContain("jeudi 14 mai à 21h00");
  });

  it("returns structuredContent matching outputSchema", async () => {
    mockApi.createHold.mockResolvedValueOnce(HOLD_RESPONSE);

    const result = await client.callTool({
      name: "propose_reservation",
      arguments: {
        restaurant_id: "rest-001",
        datetime: "2026-05-14T19:00:00.000Z",
        party_size: 2,
      },
    });

    expect(result.structuredContent).toBeDefined();
    const schema = z.object(proposeReservationTool.outputSchema!);
    expect(() => schema.parse(result.structuredContent)).not.toThrow();
  });

  it("returns error on 409 conflict (slot already held)", async () => {
    mockApi.createHold.mockRejectedValueOnce(new KoulisApiError(409, "Slot already held"));

    const result = await client.callTool({
      name: "propose_reservation",
      arguments: {
        restaurant_id: "rest-001",
        datetime: "2026-05-14T19:00:00.000Z",
        party_size: 2,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Slot already held");
  });
});

// ── confirm_reservation ──────────────────────────────────────────────────
describe("confirm_reservation", () => {
  it("returns confirmation with human-readable summary on happy path", async () => {
    mockApi.createReservation.mockResolvedValueOnce(RESERVATION_RESPONSE);

    const result = await client.callTool({
      name: "confirm_reservation",
      arguments: {
        hold_id: "hold-abc",
        customer_name: "Jean Dupont",
        customer_phone: "+33612345678",
        customer_email: "jean@example.com",
      },
    });

    expect(result.isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.status).toBe("confirmed");
    expect(data.confirmation_id).toBe("CONF-XYZ");
    expect(data.human_readable_summary).toContain("jeudi 14 mai à 21h00");
    expect(data.human_readable_summary).toContain("CONF-XYZ");
    expect(data.human_readable_summary).toContain("2 personnes");
  });

  it("returns structuredContent matching outputSchema", async () => {
    mockApi.createReservation.mockResolvedValueOnce(RESERVATION_RESPONSE);

    const result = await client.callTool({
      name: "confirm_reservation",
      arguments: {
        hold_id: "hold-abc",
        customer_name: "Jean Dupont",
        customer_phone: "+33612345678",
        customer_email: "jean@example.com",
      },
    });

    expect(result.structuredContent).toBeDefined();
    const schema = z.object(confirmReservationTool.outputSchema!);
    expect(() => schema.parse(result.structuredContent)).not.toThrow();
  });

  it("returns error on 410 expired hold", async () => {
    mockApi.createReservation.mockRejectedValueOnce(new KoulisApiError(410, "Hold expired"));

    const result = await client.callTool({
      name: "confirm_reservation",
      arguments: {
        hold_id: "expired-hold",
        customer_name: "Jean",
        customer_phone: "+33612345678",
        customer_email: "jean@example.com",
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("expired");
  });

  it("maps 410 to hold_expired error code", async () => {
    mockApi.createReservation.mockRejectedValueOnce(new KoulisApiError(410, "Hold expired"));

    const result = await client.callTool({
      name: "confirm_reservation",
      arguments: {
        hold_id: "expired-hold",
        customer_name: "Jean",
        customer_phone: "+33612345678",
        customer_email: "jean@example.com",
      },
    });

    const body = parseError(result);
    expect(body.error.code).toBe("hold_expired");
  });

  it("maps 404 to hold_not_found error code (not restaurant_not_found)", async () => {
    mockApi.createReservation.mockRejectedValueOnce(new KoulisApiError(404, "Hold not found"));

    const result = await client.callTool({
      name: "confirm_reservation",
      arguments: {
        hold_id: "nonexistent",
        customer_name: "Jean",
        customer_phone: "+33612345678",
        customer_email: "jean@example.com",
      },
    });

    const body = parseError(result);
    expect(body.error.code).toBe("hold_not_found");
  });

  it("includes singular 'personne' for party_size=1", async () => {
    mockApi.createReservation.mockResolvedValueOnce({
      ...RESERVATION_RESPONSE,
      party_size: 1,
    });

    const result = await client.callTool({
      name: "confirm_reservation",
      arguments: {
        hold_id: "hold-abc",
        customer_name: "Jean Dupont",
        customer_phone: "+33612345678",
        customer_email: "jean@example.com",
      },
    });

    const data = parseContent(result);
    expect(data.human_readable_summary).toContain("1 personne ");
    expect(data.human_readable_summary).not.toContain("personnes");
  });
});
