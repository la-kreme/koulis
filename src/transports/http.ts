// src/transports/http.ts — HTTP entry point (production / Railway)
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import type { Context, Next } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createKoulisMcpServer } from "../server.js";
import { koulisApi, type KoulisApiClient } from "../lib/api-client.js";
import { createRateLimiter, type RateLimiter } from "../lib/rate-limit.js";
import pkg from "../../package.json" with { type: "json" };

export interface HttpServerOptions {
  port: number;
  apiClient?: KoulisApiClient;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
}

function getClientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = c.req.header("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export function createHttpApp(apiClient: KoulisApiClient, rateLimiter: RateLimiter): Hono {
  const app = new Hono();

  // ── Healthcheck (NOT rate-limited) ────────────────────────────────────
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      version: pkg.version,
      uptime_seconds: Math.floor(process.uptime()),
    }),
  );

  // ── MCP Server Card (Smithery / registry discovery) ───────────────────
  app.get("/.well-known/mcp/server-card.json", (c) =>
    c.json({
      serverInfo: {
        name: "koulis",
        version: pkg.version,
      },
      authentication: {
        required: false,
      },
      tools: [
        {
          name: "find_bookable_restaurant",
          description: "Search restaurants with available slots by city, date, and party size.",
        },
        {
          name: "discover_slots",
          description: "List all available time slots for a specific restaurant.",
        },
        {
          name: "propose_reservation",
          description: "Create a 5-minute hold on a slot (step 1 of 2-step booking).",
        },
        {
          name: "confirm_reservation",
          description: "Finalize the reservation with customer details (step 2, irreversible).",
        },
      ],
    }),
  );

  // ── CORS on /mcp ─────────────────────────────────────────────────────
  app.use(
    "/mcp",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "mcp-session-id", "mcp-protocol-version"],
      exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
    }),
  );

  // ── Rate limit on /mcp ────────────────────────────────────────────────
  app.use("/mcp", async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const result = rateLimiter.check(ip);

    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(result.resetSeconds));

    if (!result.allowed) {
      return c.json(
        { error: { code: "rate_limit_exceeded", message: "Rate limit exceeded" } },
        429,
      );
    }

    await next();
  });

  // ── MCP endpoint ──────────────────────────────────────────────────────
  app.all("/mcp", async (c) => {
    const start = Date.now();

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createKoulisMcpServer({ apiClient });
    await server.connect(transport);

    const response = await transport.handleRequest(c.req.raw);

    const elapsed = Date.now() - start;
    console.error(`[koulis-mcp] ${c.req.method} /mcp ${response.status} ${elapsed}ms`);

    return response;
  });

  return app;
}

export function startHttpServer(opts: HttpServerOptions) {
  const apiClient = opts.apiClient ?? koulisApi;
  const windowMs = opts.rateLimitWindowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const maxRequests = opts.rateLimitMax ?? Number(process.env.RATE_LIMIT_MAX ?? 60);
  const rateLimiter = createRateLimiter({ windowMs, maxRequests });
  const app = createHttpApp(apiClient, rateLimiter);

  serve({ fetch: app.fetch, port: opts.port });
  console.error(
    `[koulis-mcp] v${pkg.version} HTTP server listening on port ${opts.port} ` +
      `(rate limit: ${maxRequests} req/${windowMs / 1000}s)`,
  );
}
