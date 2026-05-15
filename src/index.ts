// src/index.ts — Boot entry point (stdio transport)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js";
import pkg from "../package.json" with { type: "json" };

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`koulis-mcp v${pkg.version} ready on stdio (connected to API)`);
