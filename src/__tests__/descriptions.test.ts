import { describe, it, expect } from "vitest";
import { z } from "zod";
import { findBookableRestaurantTool } from "../tools/find-bookable-restaurant.js";
import { discoverSlotsTool } from "../tools/discover-slots.js";
import { proposeReservationTool } from "../tools/propose-reservation.js";
import { confirmReservationTool } from "../tools/confirm-reservation.js";
import type { ToolDefinition } from "../types/tool.js";

const allTools: ToolDefinition[] = [
  findBookableRestaurantTool,
  discoverSlotsTool,
  proposeReservationTool,
  confirmReservationTool,
];

describe("tool descriptions quality", () => {
  it("all tools have descriptions longer than 50 characters", () => {
    for (const tool of allTools) {
      expect(
        tool.description.length,
        `${tool.name} description is too short (${tool.description.length} chars)`,
      ).toBeGreaterThan(50);
    }
  });

  it("all tool descriptions mention when to use", () => {
    for (const tool of allTools) {
      const lower = tool.description.toLowerCase();
      const hasWhenToUse =
        lower.includes("use this tool when") ||
        lower.includes("when to use") ||
        lower.includes("use this tool to");
      expect(hasWhenToUse, `${tool.name} description missing 'when to use' guidance`).toBe(true);
    }
  });

  it("propose_reservation mentions 2-step flow and hold TTL", () => {
    const desc = proposeReservationTool.description.toLowerCase();
    expect(desc).toContain("step 1");
    expect(desc).toContain("confirm");
    expect(desc).toContain("5-minute");
  });

  it("confirm_reservation mentions irreversibility", () => {
    const desc = confirmReservationTool.description.toLowerCase();
    expect(desc).toContain("irreversible");
    expect(desc).toContain("step 2");
  });

  it("all input params have a non-empty .describe()", () => {
    for (const tool of allTools) {
      for (const [key, zodType] of Object.entries(tool.inputSchema)) {
        // Unwrap optional wrapper to get the inner description
        const innerType =
          zodType instanceof z.ZodOptional ? (zodType._def.innerType as z.ZodTypeAny) : zodType;
        const description = zodType.description ?? innerType.description;
        expect(
          description && description.length > 0,
          `${tool.name}.${key} is missing .describe()`,
        ).toBe(true);
      }
    }
  });
});
