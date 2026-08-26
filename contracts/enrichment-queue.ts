import { z } from "zod";

import { idSchema, timestampSchema } from "./core.js";

const nonEmptyText = z.string().trim().min(1);

export const enrichmentQueueStateSchema = z.enum(["running", "queued", "failed"]);
export type EnrichmentQueueState = z.infer<typeof enrichmentQueueStateSchema>;

const recordSubjectSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
  })
  .strict();

export const enrichmentQueueSubjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("contact"),
      id: idSchema,
      name: nonEmptyText,
      email: z.string().trim().nullable(),
      imageUrl: z.string().trim().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("company"),
      id: idSchema,
      name: nonEmptyText,
      iconUrl: z.string().trim().nullable(),
      iconDarkUrl: z.string().trim().nullable(),
      iconTone: z.string().trim().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("deal"),
      id: idSchema,
      name: nonEmptyText,
    })
    .strict(),
  z
    .object({
      kind: z.literal("agent"),
      id: idSchema,
      name: nonEmptyText,
    })
    .strict(),
  z
    .object({
      kind: z.literal("task"),
      id: idSchema,
      name: nonEmptyText,
      related: recordSubjectSchema
        .extend({ kind: z.enum(["company", "contact", "deal"]) })
        .strict()
        .nullable(),
    })
    .strict(),
]);
export type EnrichmentQueueSubject = z.infer<typeof enrichmentQueueSubjectSchema>;

export const enrichmentQueueRowSchema = z
  .object({
    id: idSchema,
    state: enrichmentQueueStateSchema,
    line: nonEmptyText,
    createdAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    finishedAt: timestampSchema.nullable(),
    subject: enrichmentQueueSubjectSchema,
    agentName: nonEmptyText.nullable(),
    errorMessage: z.string().trim().nullable(),
  })
  .strict();
export type EnrichmentQueueRow = z.infer<typeof enrichmentQueueRowSchema>;

export const enrichmentQueueScheduledRowSchema = z
  .object({
    id: idSchema,
    due: timestampSchema,
    createdAt: timestampSchema,
    line: nonEmptyText,
    subject: enrichmentQueueSubjectSchema,
    agentName: nonEmptyText.nullable(),
  })
  .strict();
export type EnrichmentQueueScheduledRow = z.infer<
  typeof enrichmentQueueScheduledRowSchema
>;

export const enrichmentQueueInputSchema = z
  .object({
    limit: z.number().int().finite().min(1).max(100).default(25),
  })
  .strict();
export type EnrichmentQueueInput = z.infer<typeof enrichmentQueueInputSchema>;

export const enrichmentQueueOutputSchema = z
  .object({
    rows: z.array(enrichmentQueueRowSchema),
    total: z.number().int().finite().min(0),
    scheduled: z.array(enrichmentQueueScheduledRowSchema),
    scheduledTotal: z.number().int().finite().min(0),
  })
  .strict();
export type EnrichmentQueueOutput = z.infer<typeof enrichmentQueueOutputSchema>;
