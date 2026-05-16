// src/types/schemas.ts — Shared Zod schemas for MCP tool outputs
import { z } from "zod";

export const localizedDateTimeSchema = z.object({
  iso_utc: z.string(),
  local_date: z.string(),
  local_time: z.string(),
  local_datetime: z.string(),
  timezone: z.string(),
  human_readable_fr: z.string(),
  human_readable_en: z.string(),
});
