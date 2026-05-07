import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const USER_AGENT = "koulis/1.0";
// Create server instance
const server = new McpServer({
    name: "koulis",
    version: "1.0.0",
});
