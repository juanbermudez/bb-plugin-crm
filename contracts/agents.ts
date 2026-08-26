import { z } from "zod";
import {
  idSchema,
  rpcJsonObjectSchema,
  rpcJsonValueSchema,
  timestampSchema,
} from "./core.js";

const nonEmptyText = z.string().trim().min(1);
const nullableText = z.string().trim().nullable();
const listLimitSchema = z.number().int().finite().min(1).max(100).default(100);
const offsetSchema = z.number().int().finite().min(0).default(0);
const jsonValue = rpcJsonValueSchema;
const jsonObject = rpcJsonObjectSchema;

export const agentDefinitionStatuses = [
  "DRAFT",
  "DEPLOYING",
  "LIVE",
  "PAUSED",
  "ARCHIVED",
  "DELETED",
] as const;
export const agentVersionStatuses = [
  "DRAFT",
  "VALIDATING",
  "READY",
  "DEPLOYED",
  "REJECTED",
] as const;
export const agentTriggerTypes = ["MANUAL", "SCHEDULE", "EVENT", "WEBHOOK"] as const;
export const agentRunStatuses = [
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export const agentActionStatuses = [
  "PLANNED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export const agentThreadKinds = ["RECORD", "BUILDER", "RUN"] as const;
export const agentRecordTypes = ["COMPANY", "CONTACT", "DEAL"] as const;

export const agentDefinitionStatusSchema = z.enum(agentDefinitionStatuses);
export const agentVersionStatusSchema = z.enum(agentVersionStatuses);
export const agentTriggerTypeSchema = z.enum(agentTriggerTypes);
export const agentRunStatusSchema = z.enum(agentRunStatuses);
export const agentActionStatusSchema = z.enum(agentActionStatuses);
export const agentThreadKindSchema = z.enum(agentThreadKinds);
export const agentRecordTypeSchema = z.enum(agentRecordTypes);

export type AgentDefinitionStatus = z.infer<typeof agentDefinitionStatusSchema>;
export type AgentVersionStatus = z.infer<typeof agentVersionStatusSchema>;
export type AgentTriggerType = z.infer<typeof agentTriggerTypeSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type AgentActionStatus = z.infer<typeof agentActionStatusSchema>;
export type AgentThreadKind = z.infer<typeof agentThreadKindSchema>;
export type AgentRecordType = z.infer<typeof agentRecordTypeSchema>;

export const agentDefinitionSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    description: nullableText,
    status: agentDefinitionStatusSchema,
    createdById: idSchema,
    currentVersionId: idSchema.nullable(),
    archivedAt: timestampSchema.nullable(),
    deletedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export const agentSchema = agentDefinitionSchema;

export const agentVersionSummarySchema = z
  .object({
    id: idSchema,
    number: z.number().int().finite().min(1),
    status: agentVersionStatusSchema,
    deployedAt: timestampSchema.nullable(),
  })
  .strict();

export const agentVersionSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    number: z.number().int().finite().min(1),
    status: agentVersionStatusSchema,
    instructions: nonEmptyText,
    manifest: jsonObject,
    modelId: nonEmptyText,
    modelContextWindowTokens: z.number().int().finite().min(1),
    sandboxPolicy: jsonObject,
    validation: jsonValue.nullable(),
    sourceConversationId: idSchema.nullable(),
    createdById: idSchema,
    deploymentId: idSchema.nullable(),
    approvedAt: timestampSchema.nullable(),
    deployedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict();
export type AgentVersion = z.infer<typeof agentVersionSchema>;

export const agentListItemSchema = agentDefinitionSchema
  .extend({
    runCount: z.number().int().finite().min(0),
    currentVersion: agentVersionSummarySchema.nullable(),
  })
  .strict();
export type AgentListItem = z.infer<typeof agentListItemSchema>;

export const agentDetailSchema = agentDefinitionSchema
  .extend({
    currentVersion: agentVersionSchema.nullable(),
    versions: z.array(agentVersionSchema),
    triggers: z.array(
      z
        .object({
          id: idSchema,
          agentId: idSchema,
          versionId: idSchema,
          type: agentTriggerTypeSchema,
          name: nonEmptyText,
          config: jsonObject,
          createdById: idSchema,
          enabled: z.boolean(),
          nextRunAt: timestampSchema.nullable(),
          lastRunAt: timestampSchema.nullable(),
          createdAt: timestampSchema,
          updatedAt: timestampSchema,
        })
        .strict(),
    ),
    runCount: z.number().int().finite().min(0),
  })
  .strict();
export type AgentDetail = z.infer<typeof agentDetailSchema>;

export const agentTriggerSchema = agentDetailSchema.shape.triggers.element;
export type AgentTrigger = z.infer<typeof agentTriggerSchema>;

export const agentRunEventSchema = z
  .object({
    id: idSchema,
    runId: idSchema,
    sequence: z.number().int().finite().min(0),
    type: nonEmptyText,
    data: jsonValue,
    emittedAt: timestampSchema,
  })
  .strict();
export type AgentRunEvent = z.infer<typeof agentRunEventSchema>;

export const agentRunSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    versionId: idSchema,
    triggerId: idSchema.nullable(),
    initiatedById: idSchema.nullable(),
    triggerType: agentTriggerTypeSchema,
    status: agentRunStatusSchema,
    principalId: idSchema.nullable(),
    sessionId: idSchema.nullable(),
    idempotencyKey: nonEmptyText,
    correlationId: nonEmptyText,
    input: jsonValue.nullable(),
    result: jsonValue.nullable(),
    summary: nullableText,
    modelId: nullableText,
    inputTokens: z.number().int().finite().min(0).nullable(),
    outputTokens: z.number().int().finite().min(0).nullable(),
    costUsd: z.number().finite().min(0).nullable(),
    errorCode: nullableText,
    errorMessage: nullableText,
    approvalReason: nullableText,
    approvalRequestedAt: timestampSchema.nullable(),
    approvedAt: timestampSchema.nullable(),
    approvedById: nullableText,
    nextEventSequence: z.number().int().finite().min(0),
    createdAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    finishedAt: timestampSchema.nullable(),
    cancelRequestedAt: timestampSchema.nullable(),
    cancelDeliveredAt: timestampSchema.nullable(),
  })
  .strict();
export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentActionSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    runId: idSchema,
    type: nonEmptyText,
    provider: nonEmptyText,
    targetType: nullableText,
    targetId: nullableText,
    targetLabel: nullableText,
    summary: nonEmptyText,
    metadata: jsonValue.nullable(),
    status: agentActionStatusSchema,
    idempotencyKey: nonEmptyText,
    requestHash: nullableText,
    externalId: nullableText,
    attemptCount: z.number().int().finite().min(0),
    errorCode: nullableText,
    errorMessage: nullableText,
    plannedAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    updatedAt: timestampSchema,
  })
  .strict();
export type AgentAction = z.infer<typeof agentActionSchema>;

export const agentRunDetailSchema = agentRunSchema
  .extend({
    events: z.array(agentRunEventSchema),
    actions: z.array(agentActionSchema),
  })
  .strict();
export type AgentRunDetail = z.infer<typeof agentRunDetailSchema>;

export const agentCancelledRunSchema = agentRunDetailSchema
  .extend({ cancelled: z.boolean() })
  .strict();

export const agentAuditEventSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    versionId: idSchema.nullable(),
    runId: idSchema.nullable(),
    actorUserId: nullableText,
    actorType: nonEmptyText,
    actorId: nullableText,
    type: nonEmptyText,
    summary: nonEmptyText,
    before: jsonValue.nullable(),
    after: jsonValue.nullable(),
    requestId: nullableText,
    emittedAt: timestampSchema,
  })
  .strict();
export type AgentAuditEvent = z.infer<typeof agentAuditEventSchema>;

export const agentThreadLinkSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    threadId: idSchema,
    kind: agentThreadKindSchema,
    runId: idSchema.nullable(),
    versionId: idSchema.nullable(),
    recordType: agentRecordTypeSchema.nullable(),
    recordId: idSchema.nullable(),
    summary: nullableText,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type AgentThreadLink = z.infer<typeof agentThreadLinkSchema>;

export const agentCreateInputSchema = z
  .object({
    id: idSchema.optional(),
    name: nonEmptyText.max(120),
    description: z.string().trim().max(500).nullable().optional().default(null),
    createdById: idSchema.optional(),
  })
  .strict();
export type AgentCreateInput = z.infer<typeof agentCreateInputSchema>;

export const agentUpdateDataSchema = z
  .object({
    name: nonEmptyText.max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Agent update has no changes.");

export const agentUpdateInputSchema = z
  .object({ id: idSchema, data: agentUpdateDataSchema })
  .strict();
export type AgentUpdateInput = z.infer<typeof agentUpdateInputSchema>;

export const agentListInputSchema = z
  .object({
    search: z.string().trim().max(200).default(""),
    status: agentDefinitionStatusSchema.or(z.array(agentDefinitionStatusSchema).min(1)).optional(),
    includeArchived: z.boolean().default(false),
    archivedOnly: z.boolean().default(false),
    limit: listLimitSchema,
    offset: offsetSchema,
  })
  .strict();
export type AgentListInput = z.infer<typeof agentListInputSchema>;

export const agentVersionListInputSchema = z
  .object({
    agentId: idSchema,
    status: agentVersionStatusSchema.or(z.array(agentVersionStatusSchema).min(1)).optional(),
    limit: listLimitSchema,
    offset: offsetSchema,
  })
  .strict();

export const agentVersionCreateDataSchema = z
  .object({
    id: idSchema.optional(),
    number: z.number().int().finite().min(1).optional(),
    status: agentVersionStatusSchema.default("DRAFT"),
    instructions: nonEmptyText,
    manifest: jsonObject.default({}),
    modelId: nonEmptyText.default("default"),
    modelContextWindowTokens: z.number().int().finite().min(1).default(1_000_000),
    sandboxPolicy: jsonObject.default({}),
    validation: jsonValue.nullable().default(null),
    sourceConversationId: idSchema.nullable().default(null),
    createdById: idSchema.optional(),
  })
  .strict();

export const agentVersionCreateInputSchema = z
  .object({ agentId: idSchema, data: agentVersionCreateDataSchema })
  .strict();
export type AgentVersionCreateInput = z.infer<typeof agentVersionCreateInputSchema>;

export const agentVersionValidateInputSchema = z
  .object({ id: idSchema, actorId: idSchema.optional() })
  .strict();

export const agentDeployInputSchema = z
  .object({
    agentId: idSchema,
    versionId: idSchema,
    actorId: idSchema.optional(),
    requestId: idSchema.optional(),
    clientRequestId: idSchema.optional(),
  })
  .strict()
  .refine((value) => !(value.requestId && value.clientRequestId), {
    message: "Use one deployment request id.",
    path: ["clientRequestId"],
  });

export const agentIdActionInputSchema = z
  .object({ id: idSchema, actorId: idSchema.optional() })
  .strict();

export const agentTriggerListInputSchema = z
  .object({
    agentId: idSchema,
    type: agentTriggerTypeSchema.optional(),
    enabled: z.boolean().optional(),
    limit: listLimitSchema,
    offset: offsetSchema,
  })
  .strict();

export const agentTriggerCreateDataSchema = z
  .object({
    id: idSchema.optional(),
    versionId: idSchema,
    type: agentTriggerTypeSchema,
    name: nonEmptyText.max(160),
    config: jsonObject.default({}),
    createdById: idSchema.optional(),
    enabled: z.boolean().default(false),
    nextRunAt: timestampSchema.nullable().default(null),
    lastRunAt: timestampSchema.nullable().default(null),
  })
  .strict();

export const agentTriggerCreateInputSchema = z
  .object({ agentId: idSchema, data: agentTriggerCreateDataSchema })
  .strict();

export const agentTriggerUpdateDataSchema = z
  .object({
    name: nonEmptyText.max(160).optional(),
    versionId: idSchema.optional(),
    type: agentTriggerTypeSchema.optional(),
    config: jsonObject.optional(),
    enabled: z.boolean().optional(),
    nextRunAt: timestampSchema.nullable().optional(),
    lastRunAt: timestampSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Agent trigger update has no changes.");

export const agentTriggerUpdateInputSchema = z
  .object({ id: idSchema, data: agentTriggerUpdateDataSchema })
  .strict();

export const agentTriggerDeleteInputSchema = agentIdActionInputSchema;
export const agentTriggerEnableInputSchema = z
  .object({ id: idSchema, enabled: z.boolean().default(true), actorId: idSchema.optional() })
  .strict();

const agentRunFilters = {
  agentId: idSchema.optional(),
  versionId: idSchema.optional(),
  triggerId: idSchema.optional(),
  status: agentRunStatusSchema.or(z.array(agentRunStatusSchema).min(1)).optional(),
  limit: listLimitSchema,
  offset: offsetSchema,
  includeEvents: z.boolean().default(true),
  includeActions: z.boolean().default(true),
};

export const agentRunListInputSchema = z.object(agentRunFilters).strict();

export const agentRunGetInputSchema = z.object({ id: idSchema }).strict();

export const agentRunQueueInputSchema = z
  .object({
    agentId: idSchema,
    id: idSchema.optional(),
    versionId: idSchema.optional(),
    initiatedById: idSchema.nullable().optional(),
    principalId: idSchema.nullable().optional(),
    sessionId: idSchema.nullable().optional(),
    idempotencyKey: nonEmptyText.optional(),
    correlationId: nonEmptyText.optional(),
    input: jsonValue.nullable().optional(),
    modelId: idSchema.nullable().optional(),
  })
  .strict();
export type AgentRunQueueInput = z.infer<typeof agentRunQueueInputSchema>;

export const agentRunApprovalRequestInputSchema = z
  .object({ id: idSchema, reason: nullableText.optional(), actorId: idSchema.optional() })
  .strict();

export const agentRunApproveInputSchema = z
  .object({ id: idSchema, approvedById: idSchema.nullable().optional(), actorId: idSchema.optional() })
  .strict();

export const agentRunSuccessInputSchema = z
  .object({
    id: idSchema,
    result: jsonValue.nullable().optional(),
    summary: nullableText.optional(),
    modelId: idSchema.nullable().optional(),
    inputTokens: z.number().int().finite().min(0).nullable().optional(),
    outputTokens: z.number().int().finite().min(0).nullable().optional(),
    costUsd: z.number().finite().min(0).nullable().optional(),
    actorId: idSchema.optional(),
  })
  .strict();

export const agentRunFailureInputSchema = z
  .object({
    id: idSchema,
    errorCode: idSchema.nullable().optional(),
    errorMessage: nullableText.optional(),
    result: jsonValue.nullable().optional(),
    summary: nullableText.optional(),
    actorId: idSchema.optional(),
  })
  .strict();

export const agentRunCancelInputSchema = z
  .object({ id: idSchema, reason: nonEmptyText.optional(), actorId: idSchema.optional() })
  .strict();

export const agentActionListInputSchema = z
  .object({ runId: idSchema, limit: listLimitSchema, offset: offsetSchema })
  .strict();
export const agentActionGetInputSchema = z.object({ id: idSchema }).strict();
export const agentAuditListInputSchema = z
  .object({
    agentId: idSchema.optional(),
    versionId: idSchema.optional(),
    runId: idSchema.optional(),
    type: nonEmptyText.optional(),
    limit: listLimitSchema,
    offset: offsetSchema,
  })
  .strict();

export const agentThreadListInputSchema = z
  .object({
    agentId: idSchema,
    kind: agentThreadKindSchema.optional(),
    runId: idSchema.optional(),
    recordType: agentRecordTypeSchema.optional(),
    recordId: idSchema.optional(),
    limit: listLimitSchema,
    offset: offsetSchema,
  })
  .strict();
export const agentThreadGetInputSchema = z.object({ id: idSchema }).strict();

/** Create a visible BB thread scoped to one CRM record. */
export const agentThreadRecordCreateInputSchema = z
  .object({
    agentId: idSchema,
    recordType: agentRecordTypeSchema,
    recordId: idSchema,
  })
  .strict();
export type AgentThreadRecordCreateInput = z.infer<
  typeof agentThreadRecordCreateInputSchema
>;

/** Retry a terminal run with the same deployed agent version and input. */
export const agentRunRetryInputSchema = z
  .object({ id: idSchema, actorId: idSchema.optional() })
  .strict();
export type AgentRunRetryInput = z.infer<typeof agentRunRetryInputSchema>;
