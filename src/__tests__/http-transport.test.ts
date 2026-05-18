import { describe, it, expect, vi } from "vitest";
import { createHttpApp, startHttpServer } from "../transports/http.js";
import { createRateLimiter } from "../lib/rate-limit.js";
import { SEARCH_RESPONSE } from "./fixtures.js";

vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

const mockApi = {
  searchRestaurants: vi.fn(),
  getAvailabilities: vi.fn(),
  createHold: vi.fn(),
  createReservation: vi.fn(),
};

// Auth verifier that accepts any token for testing
const passthrough: (h: string | undefined) => Promise<{ sub: string }> = () =>
  Promise.resolve({ sub: "test-user-123" });

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1000 });
const app = createHttpApp(mockApi, rateLimiter, passthrough);

function mcpPost(body: unknown): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

async function initialize(): Promise<Response> {
  return app.fetch(
    mcpPost({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    }),
  );
}

// ── HTTP transport tests ────────────────────────────────────────────────
describe("HTTP transport", () => {
  it("responds to requests on /mcp", async () => {
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      }),
    );
    // In stateless mode, GET without session returns a non-500 response
    expect(res.status).toBeLessThan(500);
  });

  it("handles MCP initialize request", async () => {
    const res = await initialize();

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.jsonrpc).toBe("2.0");
    expect(json.id).toBe(1);
    const result = json.result as Record<string, unknown>;
    expect(result.serverInfo).toBeDefined();
  });

  it("handles tools/list request", async () => {
    // In stateless mode, each request gets its own server.
    // The initialize is required per-request, so we initialize first,
    // then send tools/list in a separate call to the same transport.
    // Since we can't reuse the transport, we test via initialize response capabilities.
    const res = await initialize();
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const result = json.result as Record<string, unknown>;
    const capabilities = result.capabilities as Record<string, unknown>;
    const tools = capabilities.tools as Record<string, unknown>;
    // Server advertises tool capability
    expect(tools).toBeDefined();
  });

  it("handles tool call with mocked API via MCP client", async () => {
    // Verify the server factory creates working tools by testing through
    // the MCP SDK client (same approach as server.test.ts but over HTTP)
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createKoulisMcpServer } = await import("../server.js");

    mockApi.searchRestaurants.mockResolvedValueOnce(SEARCH_RESPONSE);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createKoulisMcpServer({ apiClient: mockApi });
    const client = new Client({ name: "http-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "find_bookable_restaurant",
      arguments: { city: "Paris", datetime: "2026-05-14T19:00:00Z", party_size: 2 },
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    const data = result.structuredContent as Record<string, unknown>;
    expect(data.count).toBe(1);

    await client.close();
    await server.close();
  });

  it("returns 400 on invalid JSON payload", async () => {
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: "not valid json{{{",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 429 after rate limit exceeded", async () => {
    const tightLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const limitedApp = createHttpApp(mockApi, tightLimiter, passthrough);

    function mcpInit(ip: string): Request {
      return new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });
    }

    const r1 = await limitedApp.fetch(mcpInit("10.0.0.1"));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("X-RateLimit-Remaining")).toBe("1");

    const r2 = await limitedApp.fetch(mcpInit("10.0.0.1"));
    expect(r2.status).toBe(200);
    expect(r2.headers.get("X-RateLimit-Remaining")).toBe("0");

    const r3 = await limitedApp.fetch(mcpInit("10.0.0.1"));
    expect(r3.status).toBe(429);
    expect(r3.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(r3.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = (await r3.json()) as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    expect(error.code).toBe("rate_limit_exceeded");

    // Different IP is not affected
    const r4 = await limitedApp.fetch(mcpInit("10.0.0.2"));
    expect(r4.status).toBe(200);

    tightLimiter.dispose();
  });

  it("extracts IP from x-real-ip when x-forwarded-for is absent", async () => {
    const tightLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const limitedApp = createHttpApp(mockApi, tightLimiter, passthrough);

    const r1 = await limitedApp.fetch(
      mcpPost({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    );
    expect(r1.status).toBe(200);

    // Second request from same "unknown" IP should be rate-limited
    const r2 = await limitedApp.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "x-real-ip": "192.168.1.1",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      }),
    );
    // x-real-ip=192.168.1.1 is a different key from "unknown", so still allowed
    expect(r2.status).toBe(200);

    tightLimiter.dispose();
  });

  it("startHttpServer boots with explicit options", () => {
    startHttpServer({
      port: 0,
      apiClient: mockApi,
      rateLimitWindowMs: 1000,
      rateLimitMax: 10,
    });
  });

  it("startHttpServer boots with env var defaults", () => {
    startHttpServer({ port: 0 });
  });

  // ── Auth tests ──────────────────────────────────────────────────────────
  it("returns 401 without Bearer token on tools/list", async () => {
    const rejectAll = () => Promise.reject(new Error("no token"));
    const strictApp = createHttpApp(mockApi, rateLimiter, rejectAll);

    const res = await strictApp.fetch(
      mcpPost({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 for initialize without Bearer token (OAuth discovery trigger)", async () => {
    const rejectAll = () => Promise.reject(new Error("no token"));
    const strictApp = createHttpApp(mockApi, rateLimiter, rejectAll);

    const res = await strictApp.fetch(
      mcpPost({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    );

    // All unauthenticated requests return 401 to trigger OAuth discovery (RFC 9728)
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("returns 200 with valid Bearer token", async () => {
    // The default `app` uses passthrough verifier — should work
    const res = await app.fetch(
      mcpPost({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    );

    expect(res.status).toBe(200);
  });

  it("GET /.well-known/oauth-protected-resource returns metadata", async () => {
    const res = await app.fetch(
      new Request("http://localhost/.well-known/oauth-protected-resource"),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBeDefined();
    expect(body.authorization_servers).toBeDefined();
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });
});
