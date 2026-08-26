import { z } from "zod";
import { connectionTimestampSchema } from "./connections.js";

export const archiveRetentionDaysSchema = z
  .number()
  .finite()
  .int()
  .min(1)
  .max(3_650);

export const archiveRetentionGetInputSchema = z.null();

export const archiveRetentionSettingsSchema = z
  .object({
    retentionDays: archiveRetentionDaysSchema,
  })
  .strict();

export const archiveRetentionPruneInputSchema = z
  .object({
    now: connectionTimestampSchema.optional(),
    batchSize: z.number().finite().int().min(1).max(1_000).default(100),
  })
  .strict();

export const archiveRetentionPruneResultSchema = z
  .object({
    retentionDays: archiveRetentionDaysSchema,
    cutoffAt: connectionTimestampSchema,
    batchSize: z.number().finite().int().min(1).max(1_000),
    companiesDeleted: z.number().finite().int().min(0),
    contactsDeleted: z.number().finite().int().min(0),
    dealsDeleted: z.number().finite().int().min(0),
    totalDeleted: z.number().finite().int().min(0),
    hasMore: z.boolean(),
  })
  .strict();

export type ArchiveRetentionSettings = z.infer<typeof archiveRetentionSettingsSchema>;
export type ArchiveRetentionPruneInput = z.infer<typeof archiveRetentionPruneInputSchema>;
export type ArchiveRetentionPruneResult = z.infer<typeof archiveRetentionPruneResultSchema>;
