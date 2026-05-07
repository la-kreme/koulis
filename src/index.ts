import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const USER_AGENT = "koulis/1.0";

// Create server instance
const server = new McpServer({
  name: "koulis",
  version: "1.0.0",
});