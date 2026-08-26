import { z } from "zod";

import { connectionProviderSchema, connectionSchema } from "./connections.js";

export const providerSyncInputSchema = z.object({ id: z.string().trim().min(1).max(256) }).strict();

export const providerSyncOutputSchema = z.object({
  provider: connectionProviderSchema,
  connection: connectionSchema,
  emailMessages: z.number().int().finite().min(0),
  calendarEvents: z.number().int().finite().min(0),
  channels: z.number().int().finite().min(0),
  people: z.number().int().finite().min(0),
  matchedPeople: z.number().int().finite().min(0),
}).strict();

export type ProviderSyncOutput = z.infer<typeof providerSyncOutputSchema>;
