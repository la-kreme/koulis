// src/transports/http.ts — HTTP entry point (production / Railway)
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createKoulisMcpServer } from "../server.js";
import { koulisApi, type KoulisApiClient } from "../lib/api-client.js";
import pkg from "../../package.json" with { type: "json" };

export interface HttpServerOptions {
  port: number;
  apiClient?: KoulisApiClient;
}

export function createHttpApp(apiClient: KoulisApiClient): Hono {
  const app = new Hono();

  app.use(
    "/mcp",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "mcp-session-id", "mcp-protocol-version"],
      exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
    }),
  );

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
  const app = createHttpApp(apiClient);

  serve({ fetch: app.fetch, port: opts.port });
  console.error(`[koulis-mcp] v${pkg.version} HTTP server listening on port ${opts.port}`);
}
