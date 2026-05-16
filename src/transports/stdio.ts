// src/transports/stdio.ts — Stdio entry point (dev / Claude Desktop)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKoulisMcpServer } from "../server.js";
import { koulisApi } from "../lib/api-client.js";
import pkg from "../../package.json" with { type: "json" };

const server = createKoulisMcpServer({ apiClient: koulisApi });
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`koulis-mcp v${pkg.version} ready on stdio (connected to API)`);
