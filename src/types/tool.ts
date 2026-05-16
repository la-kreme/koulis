// src/types/tool.ts — Shared tool definition types
import type { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { KoulisApiClient } from "../lib/api-client.js";

export interface ToolContext {
  apiClient: KoulisApiClient;
}

export type ToolResult = CallToolResult;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  outputSchema?: z.ZodRawShape;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}
