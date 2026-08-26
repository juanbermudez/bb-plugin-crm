import { z } from "zod";
import { idSchema, rpcJsonObjectSchema, timestampSchema } from "./core.js";

/** Stable discriminator for runs created from CRM timeline tasks. */
export const CRM_DUE_TASK_RUN_KIND = "CRM_DUE_TASK" as const;

const nullableText = z.string().trim().nullable();

/**
 * The task snapshot is intentionally explicit.  In particular, createdById
 * is retained as source data and is never interpreted as a BB user/assignee.
 */
export const crmDueTaskActivitySchema = z
  .object({
    id: idSchema,
    subject: z.string().trim().min(1),
    body: nullableText,
    occurredAt: timestampSchema.nullable(),
    dueAt: timestampSchema,
    completedAt: timestampSchema.nullable(),
    companyId: idSchema.nullable(),
    contactId: idSchema.nullable(),
    dealId: idSchema.nullable(),
    createdById: idSchema,
    meta: rpcJsonObjectSchema,
  })
  .strict();

export type CrmDueTaskActivity = z.infer<typeof crmDueTaskActivitySchema>;

/** Strict payload forwarded to the configured live agent run. */
export const crmDueTaskRunInputSchema = z
  .object({
    kind: z.literal(CRM_DUE_TASK_RUN_KIND),
    activity: crmDueTaskActivitySchema,
    requestedAt: timestampSchema,
  })
  .strict();

export type CrmDueTaskRunInput = z.infer<typeof crmDueTaskRunInputSchema>;
