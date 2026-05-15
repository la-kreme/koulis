import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { server } from "../server.js";
import {
  SEARCH_RESPONSE,
  AVAILABILITIES_RESPONSE,
  HOLD_RESPONSE,
  RESERVATION_RESPONSE,
} from "./fixtures.js";

// Mock the api-client module
vi.mock("../lib/api-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api-client.js")>();
  return {
    ...actual,
    koulisApi: {
      searchRestaurants: vi.fn(),
      getAvailabilities: vi.fn(),
      createHold: vi.fn(),
      createReservation: vi.fn(),
    },
  };
});

// Import AFTER mock setup
const { koulisApi, KoulisApiError } = await import("../lib/api-client.js");
const mockApi = koulisApi as {
  searchRestaurants: ReturnType<typeof vi.fn>;
  getAvailabilities: ReturnType<typeof vi.fn>;
  createHold: ReturnType<typeof vi.fn>;
  createReservation: ReturnType<typeof vi.fn>;
};

let client: Client;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
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
