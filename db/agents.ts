import {
  newRecordId,
  normalizeOffset,
  normalizeLimit,
  nowIso,
  nullableText,
  RecordNotFoundError,
  requiredText,
  type Db,
} from "./types.js";
import { CRM_EVENT_CATALOG } from "./crm-events.js";

/** Agent definition lifecycle states persisted by the CRM agent workspace. */
export const AGENT_DEFINITION_STATUSES = [
  "DRAFT",
  "DEPLOYING",
  "LIVE",
  "PAUSED",
  "ARCHIVED",
  "DELETED",
] as const;

/** Short alias used by callers that do not need the model's full name. */
export const AGENT_STATUSES = AGENT_DEFINITION_STATUSES;
export type AgentDefinitionStatus = (typeof AGENT_DEFINITION_STATUSES)[number];
export type AgentStatus = AgentDefinitionStatus;

export const AGENT_VERSION_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "READY",
  "DEPLOYED",
  "REJECTED",
] as const;
export type AgentVersionStatus = (typeof AGENT_VERSION_STATUSES)[number];

export const AGENT_TRIGGER_TYPES = ["MANUAL", "SCHEDULE", "EVENT", "WEBHOOK"] as const;
export type AgentTriggerType = (typeof AGENT_TRIGGER_TYPES)[number];

export const AGENT_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const AGENT_ACTION_STATUSES = [
  "PLANNED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

export const AGENT_THREAD_KINDS = ["RECORD", "BUILDER", "RUN"] as const;
export type AgentThreadKind = (typeof AGENT_THREAD_KINDS)[number];

export const AGENT_RECORD_TYPES = ["COMPANY", "CONTACT", "DEAL"] as const;
export type AgentRecordType = (typeof AGENT_RECORD_TYPES)[number];

/** JSON values accepted by persisted agent manifests, inputs, and audit data. */
export type AgentJsonValue =
  | null
  | boolean
  | number
  | string
  | AgentJsonValue[]
  | { [key: string]: AgentJsonValue };

export interface AgentJsonObject {
  [key: string]: AgentJsonValue;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string | null;
  status: AgentDefinitionStatus;
  createdById: string;
  currentVersionId: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Durable deletion result returned by the agent RPC and UI. */
export interface AgentDeletionResult extends AgentDefinition {
  disabledTriggers: number;
  cancelledRuns: number;
}

/** Work fenced by the DELETED state before host-thread cleanup runs. */
export interface AgentDeletionPlan {
  agentId: string;
  actorId: string;
  beforeStatus: AgentDefinitionStatus;
  disabledTriggers: number;
  activeRunIds: string[];
}

/** Public name used by the rest of the plugin for an agent definition. */
export type Agent = AgentDefinition;

export interface AgentVersion {
  id: string;
  agentId: string;
  number: number;
  status: AgentVersionStatus;
  instructions: string;
  manifest: AgentJsonObject;
  modelId: string;
  modelContextWindowTokens: number;
  sandboxPolicy: AgentJsonObject;
  validation: AgentJsonValue | null;
  sourceConversationId: string | null;
  createdById: string;
  deploymentId: string | null;
  approvedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
}

export interface AgentVersionSummary {
  id: string;
  number: number;
  status: AgentVersionStatus;
  deployedAt: string | null;
}

export interface AgentListItem extends AgentDefinition {
  runCount: number;
  currentVersion: AgentVersionSummary | null;
}

export interface AgentDetail extends AgentDefinition {
  currentVersion: AgentVersion | null;
  versions: AgentVersion[];
  triggers: AgentTrigger[];
  runCount: number;
}

export interface AgentTrigger {
  id: string;
  agentId: string;
  versionId: string;
  type: AgentTriggerType;
  name: string;
  config: AgentJsonObject;
  createdById: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunEvent {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  data: AgentJsonValue;
  emittedAt: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  versionId: string;
  triggerId: string | null;
  initiatedById: string | null;
  triggerType: AgentTriggerType;
  status: AgentRunStatus;
  principalId: string | null;
  sessionId: string | null;
  idempotencyKey: string;
  correlationId: string;
  input: AgentJsonValue | null;
  result: AgentJsonValue | null;
  summary: string | null;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  approvalReason: string | null;
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  nextEventSequence: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelRequestedAt: string | null;
  cancelDeliveredAt: string | null;
}

export interface AgentRunDetail extends AgentRun {
  events: AgentRunEvent[];
  actions: AgentAction[];
}

export interface AgentAction {
  id: string;
  agentId: string;
  runId: string;
  type: string;
  provider: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string;
  metadata: AgentJsonValue | null;
  status: AgentActionStatus;
  idempotencyKey: string;
  requestHash: string | null;
  externalId: string | null;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  plannedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface AgentAuditEvent {
  id: string;
  agentId: string;
  versionId: string | null;
  runId: string | null;
  actorUserId: string | null;
  actorType: string;
  actorId: string | null;
  type: string;
  summary: string;
  before: AgentJsonValue | null;
  after: AgentJsonValue | null;
  requestId: string | null;
  emittedAt: string;
}

export interface AgentThreadLink {
  id: string;
  agentId: string;
  threadId: string;
  kind: AgentThreadKind;
  runId: string | null;
  versionId: string | null;
  recordType: AgentRecordType | null;
  recordId: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCreateInput {
  id?: string;
  name: string;
  description?: string | null;
  createdById?: string;
}

export interface AgentUpdateInput {
  name?: string;
  description?: string | null;
}

export interface AgentVersionCreateInput {
  id?: string;
  agentId?: string;
  number?: number;
  status?: AgentVersionStatus;
  instructions: string;
  manifest?: AgentJsonObject;
  modelId?: string;
  modelContextWindowTokens?: number;
  sandboxPolicy?: AgentJsonObject;
  validation?: AgentJsonValue | null;
  sourceConversationId?: string | null;
  createdById?: string;
}

export interface AgentTriggerCreateInput {
  id?: string;
  agentId?: string;
  versionId: string;
  type: AgentTriggerType;
  name: string;
  config?: AgentJsonObject;
  createdById?: string;
  enabled?: boolean;
  nextRunAt?: string | Date | null;
  lastRunAt?: string | Date | null;
}

export interface AgentTriggerUpdateInput {
  name?: string;
  versionId?: string;
  type?: AgentTriggerType;
  config?: AgentJsonObject;
  enabled?: boolean;
  nextRunAt?: string | Date | null;
  lastRunAt?: string | Date | null;
}

export interface AgentRunQueueInput {
  id?: string;
  agentId?: string;
  versionId?: string;
  triggerId?: string | null;
  triggerType?: AgentTriggerType;
  initiatedById?: string | null;
  principalId?: string | null;
  sessionId?: string | null;
  idempotencyKey?: string;
  correlationId?: string;
  input?: AgentJsonValue | null;
  modelId?: string | null;
}

export interface AgentRunApprovalInput {
  reason?: string | null;
  approvedById?: string | null;
}

export interface AgentRunSuccessInput {
  result?: AgentJsonValue | null;
  summary?: string | null;
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
}

export interface AgentRunFailureInput {
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: AgentJsonValue | null;
  summary?: string | null;
}

export interface AgentActionCreateInput {
  id?: string;
  agentId?: string;
  runId: string;
  type: string;
  provider: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  summary: string;
  metadata?: AgentJsonValue | null;
  status?: AgentActionStatus;
  idempotencyKey?: string;
  requestHash?: string | null;
  externalId?: string | null;
}

export interface AgentActionUpdateInput {
  type?: string;
  provider?: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  summary?: string;
  metadata?: AgentJsonValue | null;
  status?: AgentActionStatus;
  requestHash?: string | null;
  externalId?: string | null;
  attemptCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface AgentThreadLinkInput {
  id?: string;
  agentId?: string;
  threadId: string;
  kind?: AgentThreadKind;
  runId?: string | null;
  versionId?: string | null;
  recordType?: AgentRecordType | string | null;
  recordId?: string | null;
  summary?: string | null;
}

export interface AgentListOptions {
  search?: string;
  status?: AgentDefinitionStatus | readonly AgentDefinitionStatus[];
  includeArchived?: boolean;
  archivedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface AgentVersionListOptions {
  status?: AgentVersionStatus | readonly AgentVersionStatus[];
  limit?: number;
  offset?: number;
}

export interface AgentTriggerListOptions {
  type?: AgentTriggerType;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface AgentRunListOptions {
  agentId?: string;
  versionId?: string;
  triggerId?: string;
  status?: AgentRunStatus | readonly AgentRunStatus[];
  limit?: number;
  offset?: number;
  includeEvents?: boolean;
  includeActions?: boolean;
}

export interface AgentAuditListOptions {
  agentId?: string;
  versionId?: string;
  runId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface AgentThreadListOptions {
  kind?: AgentThreadKind;
  runId?: string;
  recordType?: AgentRecordType;
  recordId?: string;
  limit?: number;
  offset?: number;
}

export class AgentStateError extends Error {
  readonly code = "INVALID_STATE" as const;

  constructor(message: string) {
    super(message);
    this.name = "AgentStateError";
  }
}

export class AgentConflictError extends Error {
  readonly code = "CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "AgentConflictError";
  }
}

const AGENT_CREATE_KEYS = new Set(["id", "name", "description", "createdById"]);
const AGENT_UPDATE_KEYS = new Set(["name", "description"]);
const AGENT_VERSION_CREATE_KEYS = new Set([
  "id",
  "agentId",
  "number",
  "status",
  "instructions",
  "manifest",
  "modelId",
  "modelContextWindowTokens",
  "sandboxPolicy",
  "validation",
  "sourceConversationId",
  "createdById",
]);
const AGENT_TRIGGER_CREATE_KEYS = new Set([
  "id",
  "agentId",
  "versionId",
  "type",
  "name",
  "config",
  "createdById",
  "enabled",
  "nextRunAt",
  "lastRunAt",
]);
const AGENT_TRIGGER_UPDATE_KEYS = new Set([
  "name",
  "versionId",
  "type",
  "config",
  "enabled",
  "nextRunAt",
  "lastRunAt",
]);
const AGENT_RUN_QUEUE_KEYS = new Set([
  "id",
  "agentId",
  "versionId",
  "triggerId",
  "triggerType",
  "initiatedById",
  "principalId",
  "sessionId",
  "idempotencyKey",
  "correlationId",
  "input",
  "modelId",
]);
const AGENT_RUN_APPROVAL_KEYS = new Set(["reason", "approvedById"]);
const AGENT_RUN_SUCCESS_KEYS = new Set([
  "result",
  "summary",
  "modelId",
  "inputTokens",
  "outputTokens",
  "costUsd",
]);
const AGENT_RUN_FAILURE_KEYS = new Set(["errorCode", "errorMessage", "result", "summary"]);
const AGENT_ACTION_CREATE_KEYS = new Set([
  "id",
  "agentId",
  "runId",
  "type",
  "provider",
  "targetType",
  "targetId",
  "targetLabel",
  "summary",
  "metadata",
  "status",
  "idempotencyKey",
  "requestHash",
  "externalId",
]);
const AGENT_ACTION_UPDATE_KEYS = new Set([
  "type",
  "provider",
  "targetType",
  "targetId",
  "targetLabel",
  "summary",
  "metadata",
  "status",
  "requestHash",
  "externalId",
  "attemptCount",
  "errorCode",
  "errorMessage",
]);
const AGENT_THREAD_LINK_KEYS = new Set([
  "id",
  "agentId",
  "threadId",
  "kind",
  "runId",
  "versionId",
  "recordType",
  "recordId",
  "summary",
]);

const AGENT_SELECT = `
  SELECT
    agent_definitions.id,
    agent_definitions.name,
    agent_definitions.description,
    agent_definitions.status,
    agent_definitions.created_by_id AS createdById,
    agent_definitions.current_version_id AS currentVersionId,
    agent_definitions.archived_at AS archivedAt,
    agent_definitions.deleted_at AS deletedAt,
    agent_definitions.created_at AS createdAt,
    agent_definitions.updated_at AS updatedAt
  FROM agent_definitions`;

const VERSION_SELECT = `
  SELECT
    id,
    agent_id AS agentId,
    number,
    status,
    instructions,
    manifest,
    model_id AS modelId,
    model_context_window_tokens AS modelContextWindowTokens,
    sandbox_policy AS sandboxPolicy,
    validation,
    source_conversation_id AS sourceConversationId,
    created_by_id AS createdById,
    deployment_id AS deploymentId,
    approved_at AS approvedAt,
    deployed_at AS deployedAt,
    created_at AS createdAt
  FROM agent_versions`;

const TRIGGER_SELECT = `
  SELECT
    id,
    agent_id AS agentId,
    version_id AS versionId,
    type,
    name,
    config,
    created_by_id AS createdById,
    enabled,
    next_run_at AS nextRunAt,
    last_run_at AS lastRunAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM agent_triggers`;

const RUN_SELECT = `
  SELECT
    id,
    agent_id AS agentId,
    version_id AS versionId,
    trigger_id AS triggerId,
    initiated_by_id AS initiatedById,
    trigger_type AS triggerType,
    status,
    principal_id AS principalId,
    session_id AS sessionId,
    idempotency_key AS idempotencyKey,
    correlation_id AS correlationId,
    input,
    result,
    summary,
    model_id AS modelId,
    input_tokens AS inputTokens,
    output_tokens AS outputTokens,
    cost_usd AS costUsd,
    error_code AS errorCode,
    error_message AS errorMessage,
    approval_reason AS approvalReason,
    approval_requested_at AS approvalRequestedAt,
    approved_at AS approvedAt,
    approved_by_id AS approvedById,
    next_event_sequence AS nextEventSequence,
    created_at AS createdAt,
    started_at AS startedAt,
    finished_at AS finishedAt,
    cancel_requested_at AS cancelRequestedAt,
    cancel_delivered_at AS cancelDeliveredAt
  FROM agent_runs`;

const EVENT_SELECT = `
  SELECT
    id,
    run_id AS runId,
    sequence,
    type,
    data,
    emitted_at AS emittedAt
  FROM agent_run_events`;

const ACTION_SELECT = `
  SELECT
    id,
    agent_id AS agentId,
    run_id AS runId,
    type,
    provider,
    target_type AS targetType,
    target_id AS targetId,
    target_label AS targetLabel,
    summary,
    metadata,
    status,
    idempotency_key AS idempotencyKey,
    request_hash AS requestHash,
    external_id AS externalId,
    attempt_count AS attemptCount,
    error_code AS errorCode,
    error_message AS errorMessage,
    planned_at AS plannedAt,
    started_at AS startedAt,
    completed_at AS completedAt,
    updated_at AS updatedAt
  FROM agent_actions`;

const AUDIT_SELECT = `
  SELECT
    id,
    agent_id AS agentId,
    version_id AS versionId,
    run_id AS runId,
    actor_user_id AS actorUserId,
    actor_type AS actorType,
    actor_id AS actorId,
    type,
    summary,
    before,
    after,
    request_id AS requestId,
    emitted_at AS emittedAt
  FROM agent_audit_events`;

const THREAD_SELECT = `
  SELECT
    id,
    agent_id AS agentId,
    thread_id AS threadId,
    kind,
    run_id AS runId,
    version_id AS versionId,
    record_type AS recordType,
    record_id AS recordId,
    summary,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM agent_thread_links`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectInput(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function assertKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown key: ${key}.`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function identifier(value: unknown, label: string): string {
  return requiredText(stringValue(value, label), label);
}

function nullableIdentifier(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return identifier(value, label);
}

function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return nullableText(stringValue(value, label));
}

function assertEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  const candidate = stringValue(value, label);
  if ((values as readonly string[]).includes(candidate)) return candidate as T;
  throw new Error(`Invalid ${label}: ${candidate}.`);
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function assertJsonValue(value: unknown, label: string): asserts value is AgentJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${label} contains a non-finite number.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${label}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key.length === 0) throw new Error(`${label} contains an empty object key.`);
      assertJsonValue(item, `${label}.${key}`);
    }
    return;
  }
  throw new Error(`${label} must contain JSON values only.`);
}

function cloneJson(value: unknown, label: string): AgentJsonValue {
  assertJsonValue(value, label);
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error(`${label} must be JSON serializable.`);
  return JSON.parse(encoded) as AgentJsonValue;
}

function normalizeJsonObject(value: unknown, label: string, fallback: AgentJsonObject = {}): AgentJsonObject {
  const candidate = value === undefined ? fallback : value;
  if (!isPlainObject(candidate)) throw new Error(`${label} must be a JSON object.`);
  return cloneJson(candidate, label) as AgentJsonObject;
}

function validateTriggerConfig(type: AgentTriggerType, config: AgentJsonObject): void {
  if (type !== "EVENT") return;
  const event = config.event;
  if (typeof event !== "string" || !(event in CRM_EVENT_CATALOG)) {
    throw new Error("EVENT triggers require config.event to be a supported CRM event.");
  }
}

function encodeJson(value: unknown, label: string): string {
  const cloned = cloneJson(value, label);
  const encoded = JSON.stringify(cloned);
  if (encoded === undefined) throw new Error(`${label} must be JSON serializable.`);
  return encoded;
}

function decodeJson(value: unknown, label: string, optional = false): AgentJsonValue | null {
  if (value === null || value === undefined) {
    if (optional) return null;
    throw new Error(`${label} is missing.`);
  }
  if (typeof value !== "string") throw new Error(`${label} is not JSON text.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  return cloneJson(parsed, label);
}

function decodeJsonObject(value: unknown, label: string): AgentJsonObject {
  const parsed = decodeJson(value, label);
  if (!isPlainObject(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed as AgentJsonObject;
}

function normalizeTimestamp(
  value: string | Date | null | undefined,
  label: string,
  fallback: string | null,
): string | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid date.`);
    return value.toISOString();
  }
  const text = requiredText(stringValue(value, label), label);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date.`);
  return parsed.toISOString();
}

function normalizeCutoff(value: Date | string, label: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date.toISOString();
}

function nextLeaseTimestamp(previousStartedAt: string): string {
  const previousMs = new Date(previousStartedAt).getTime();
  if (Number.isNaN(previousMs)) throw new Error("Agent run started timestamp must be a valid date.");
  return new Date(Math.max(Date.now(), previousMs + 1)).toISOString();
}

function storedTimestamp(value: unknown, label: string): string {
  const text = requiredText(stringValue(value, label), label);
  if (Number.isNaN(new Date(text).getTime())) throw new Error(`${label} must be a valid timestamp.`);
  return text;
}

function nullableStoredTimestamp(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : storedTimestamp(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

function bounded(value: number | undefined, label: string, fallback = 100): number {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < 1 || result > 100) {
    throw new Error(`${label} must be an integer between 1 and 100.`);
  }
  return result;
}

function normalizeActor(value: unknown, label = "Agent actor"): string {
  if (value === undefined || value === null) return "system";
  return identifier(value, label);
}

function normalizeListStatus<T extends string>(
  value: T | readonly T[] | undefined,
  values: readonly T[],
  label: string,
): T[] {
  if (value === undefined) return [];
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.map((item) => assertEnum(item, values, label));
}

function rowObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error(`Missing ${label} row.`);
  return value as Record<string, unknown>;
}

function rowNullableString(row: Record<string, unknown>, key: string, label: string): string | null {
  return row[key] === null || row[key] === undefined ? null : stringValue(row[key], label);
}

function rowBoolean(row: Record<string, unknown>, key: string, label: string): boolean {
  if (row[key] === 0 || row[key] === false) return false;
  if (row[key] === 1 || row[key] === true) return true;
  throw new Error(`${label} must be 0 or 1 in SQLite.`);
}

function rowInteger(row: Record<string, unknown>, key: string, label: string, nullable = false): number | null {
  if (row[key] === null || row[key] === undefined) {
    if (nullable) return null;
    throw new Error(`${label} is missing.`);
  }
  return nonNegativeInteger(row[key], label);
}

function rowNumber(row: Record<string, unknown>, key: string, label: string): number | null {
  if (row[key] === null || row[key] === undefined) return null;
  return nonNegativeNumber(row[key], label);
}

function parseAgent(value: unknown): AgentDefinition {
  const row = rowObject(value, "agent");
  return {
    id: identifier(row.id, "Agent id"),
    name: requiredText(stringValue(row.name, "Agent name"), "Agent name"),
    description: rowNullableString(row, "description", "Agent description"),
    status: assertEnum(row.status, AGENT_DEFINITION_STATUSES, "agent status"),
    createdById: identifier(row.createdById, "Agent creator"),
    currentVersionId: rowNullableString(row, "currentVersionId", "Agent current version id"),
    archivedAt: nullableStoredTimestamp(row.archivedAt, "Agent archived timestamp"),
    deletedAt: nullableStoredTimestamp(row.deletedAt, "Agent deleted timestamp"),
    createdAt: storedTimestamp(row.createdAt, "Agent created timestamp"),
    updatedAt: storedTimestamp(row.updatedAt, "Agent updated timestamp"),
  };
}

function parseVersion(value: unknown): AgentVersion {
  const row = rowObject(value, "agent version");
  return {
    id: identifier(row.id, "Agent version id"),
    agentId: identifier(row.agentId, "Agent version agent id"),
    number: positiveInteger(row.number, "Agent version number"),
    status: assertEnum(row.status, AGENT_VERSION_STATUSES, "agent version status"),
    instructions: stringValue(row.instructions, "Agent instructions"),
    manifest: decodeJsonObject(row.manifest, "Agent manifest"),
    modelId: identifier(row.modelId, "Agent model id"),
    modelContextWindowTokens: positiveInteger(
      row.modelContextWindowTokens,
      "Agent model context window",
    ),
    sandboxPolicy: decodeJsonObject(row.sandboxPolicy, "Agent sandbox policy"),
    validation: decodeJson(row.validation, "Agent version validation", true),
    sourceConversationId: rowNullableString(
      row,
      "sourceConversationId",
      "Agent source conversation id",
    ),
    createdById: identifier(row.createdById, "Agent version creator"),
    deploymentId: rowNullableString(row, "deploymentId", "Agent deployment id"),
    approvedAt: nullableStoredTimestamp(row.approvedAt, "Agent version approval timestamp"),
    deployedAt: nullableStoredTimestamp(row.deployedAt, "Agent version deployment timestamp"),
    createdAt: storedTimestamp(row.createdAt, "Agent version created timestamp"),
  };
}

function parseTrigger(value: unknown): AgentTrigger {
  const row = rowObject(value, "agent trigger");
  return {
    id: identifier(row.id, "Agent trigger id"),
    agentId: identifier(row.agentId, "Agent trigger agent id"),
    versionId: identifier(row.versionId, "Agent trigger version id"),
    type: assertEnum(row.type, AGENT_TRIGGER_TYPES, "agent trigger type"),
    name: requiredText(stringValue(row.name, "Agent trigger name"), "Agent trigger name"),
    config: decodeJsonObject(row.config, "Agent trigger config"),
    createdById: identifier(row.createdById, "Agent trigger creator"),
    enabled: rowBoolean(row, "enabled", "Agent trigger enabled flag"),
    nextRunAt: nullableStoredTimestamp(row.nextRunAt, "Agent trigger next run timestamp"),
    lastRunAt: nullableStoredTimestamp(row.lastRunAt, "Agent trigger last run timestamp"),
    createdAt: storedTimestamp(row.createdAt, "Agent trigger created timestamp"),
    updatedAt: storedTimestamp(row.updatedAt, "Agent trigger updated timestamp"),
  };
}

function parseEvent(value: unknown): AgentRunEvent {
  const row = rowObject(value, "agent run event");
  return {
    id: identifier(row.id, "Agent run event id"),
    runId: identifier(row.runId, "Agent run event run id"),
    sequence: nonNegativeInteger(row.sequence, "Agent run event sequence"),
    type: requiredText(stringValue(row.type, "Agent run event type"), "Agent run event type"),
    data: decodeJson(row.data, "Agent run event data"),
    emittedAt: storedTimestamp(row.emittedAt, "Agent run event timestamp"),
  };
}

function parseRun(value: unknown): AgentRun {
  const row = rowObject(value, "agent run");
  return {
    id: identifier(row.id, "Agent run id"),
    agentId: identifier(row.agentId, "Agent run agent id"),
    versionId: identifier(row.versionId, "Agent run version id"),
    triggerId: rowNullableString(row, "triggerId", "Agent run trigger id"),
    initiatedById: rowNullableString(row, "initiatedById", "Agent run initiator"),
    triggerType: assertEnum(row.triggerType, AGENT_TRIGGER_TYPES, "agent run trigger type"),
    status: assertEnum(row.status, AGENT_RUN_STATUSES, "agent run status"),
    principalId: rowNullableString(row, "principalId", "Agent run principal"),
    sessionId: rowNullableString(row, "sessionId", "Agent run session id"),
    idempotencyKey: identifier(row.idempotencyKey, "Agent run idempotency key"),
    correlationId: identifier(row.correlationId, "Agent run correlation id"),
    input: decodeJson(row.input, "Agent run input", true),
    result: decodeJson(row.result, "Agent run result", true),
    summary: rowNullableString(row, "summary", "Agent run summary"),
    modelId: rowNullableString(row, "modelId", "Agent run model id"),
    inputTokens: rowInteger(row, "inputTokens", "Agent input tokens", true),
    outputTokens: rowInteger(row, "outputTokens", "Agent output tokens", true),
    costUsd: rowNumber(row, "costUsd", "Agent run cost"),
    errorCode: rowNullableString(row, "errorCode", "Agent run error code"),
    errorMessage: rowNullableString(row, "errorMessage", "Agent run error message"),
    approvalReason: rowNullableString(row, "approvalReason", "Agent approval reason"),
    approvalRequestedAt: nullableStoredTimestamp(
      row.approvalRequestedAt,
      "Agent approval requested timestamp",
    ),
    approvedAt: nullableStoredTimestamp(row.approvedAt, "Agent approval timestamp"),
    approvedById: rowNullableString(row, "approvedById", "Agent approver"),
    nextEventSequence: nonNegativeInteger(row.nextEventSequence, "Agent next event sequence"),
    createdAt: storedTimestamp(row.createdAt, "Agent run created timestamp"),
    startedAt: nullableStoredTimestamp(row.startedAt, "Agent run started timestamp"),
    finishedAt: nullableStoredTimestamp(row.finishedAt, "Agent run finished timestamp"),
    cancelRequestedAt: nullableStoredTimestamp(
      row.cancelRequestedAt,
      "Agent cancellation requested timestamp",
    ),
    cancelDeliveredAt: nullableStoredTimestamp(
      row.cancelDeliveredAt,
      "Agent cancellation delivered timestamp",
    ),
  };
}

function parseAction(value: unknown): AgentAction {
  const row = rowObject(value, "agent action");
  return {
    id: identifier(row.id, "Agent action id"),
    agentId: identifier(row.agentId, "Agent action agent id"),
    runId: identifier(row.runId, "Agent action run id"),
    type: requiredText(stringValue(row.type, "Agent action type"), "Agent action type"),
    provider: requiredText(stringValue(row.provider, "Agent action provider"), "Agent action provider"),
    targetType: rowNullableString(row, "targetType", "Agent action target type"),
    targetId: rowNullableString(row, "targetId", "Agent action target id"),
    targetLabel: rowNullableString(row, "targetLabel", "Agent action target label"),
    summary: requiredText(stringValue(row.summary, "Agent action summary"), "Agent action summary"),
    metadata: decodeJson(row.metadata, "Agent action metadata", true),
    status: assertEnum(row.status, AGENT_ACTION_STATUSES, "agent action status"),
    idempotencyKey: identifier(row.idempotencyKey, "Agent action idempotency key"),
    requestHash: rowNullableString(row, "requestHash", "Agent action request hash"),
    externalId: rowNullableString(row, "externalId", "Agent action external id"),
    attemptCount: nonNegativeInteger(row.attemptCount, "Agent action attempt count"),
    errorCode: rowNullableString(row, "errorCode", "Agent action error code"),
    errorMessage: rowNullableString(row, "errorMessage", "Agent action error message"),
    plannedAt: storedTimestamp(row.plannedAt, "Agent action planned timestamp"),
    startedAt: nullableStoredTimestamp(row.startedAt, "Agent action started timestamp"),
    completedAt: nullableStoredTimestamp(row.completedAt, "Agent action completed timestamp"),
    updatedAt: storedTimestamp(row.updatedAt, "Agent action updated timestamp"),
  };
}

function parseAudit(value: unknown): AgentAuditEvent {
  const row = rowObject(value, "agent audit event");
  return {
    id: identifier(row.id, "Agent audit id"),
    agentId: identifier(row.agentId, "Agent audit agent id"),
    versionId: rowNullableString(row, "versionId", "Agent audit version id"),
    runId: rowNullableString(row, "runId", "Agent audit run id"),
    actorUserId: rowNullableString(row, "actorUserId", "Agent audit actor user id"),
    actorType: requiredText(stringValue(row.actorType, "Agent audit actor type"), "Agent audit actor type"),
    actorId: rowNullableString(row, "actorId", "Agent audit actor id"),
    type: requiredText(stringValue(row.type, "Agent audit type"), "Agent audit type"),
    summary: requiredText(stringValue(row.summary, "Agent audit summary"), "Agent audit summary"),
    before: decodeJson(row.before, "Agent audit before", true),
    after: decodeJson(row.after, "Agent audit after", true),
    requestId: rowNullableString(row, "requestId", "Agent audit request id"),
    emittedAt: storedTimestamp(row.emittedAt, "Agent audit timestamp"),
  };
}

function parseThread(value: unknown): AgentThreadLink {
  const row = rowObject(value, "agent thread link");
  return {
    id: identifier(row.id, "Agent thread link id"),
    agentId: identifier(row.agentId, "Agent thread link agent id"),
    threadId: identifier(row.threadId, "Agent thread id"),
    kind: assertEnum(row.kind, AGENT_THREAD_KINDS, "agent thread kind"),
    runId: rowNullableString(row, "runId", "Agent thread run id"),
    versionId: rowNullableString(row, "versionId", "Agent thread version id"),
    recordType: row.recordType === null || row.recordType === undefined
      ? null
      : assertEnum(row.recordType, AGENT_RECORD_TYPES, "agent thread record type"),
    recordId: rowNullableString(row, "recordId", "Agent thread record id"),
    summary: rowNullableString(row, "summary", "Agent thread summary"),
    createdAt: storedTimestamp(row.createdAt, "Agent thread created timestamp"),
    updatedAt: storedTimestamp(row.updatedAt, "Agent thread updated timestamp"),
  };
}

function normalizeAgentCreate(input: AgentCreateInput, actorId?: string): {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: string;
} {
  const object = objectInput(input, "Agent input");
  assertKeys(object, AGENT_CREATE_KEYS, "Agent input");
  const name = requiredText(stringValue(object.name, "Agent name"), "Agent name");
  if (name.length > 120) throw new Error("Agent name must be at most 120 characters.");
  const description = optionalText(object.description, "Agent description");
  if (description && description.length > 500) {
    throw new Error("Agent description must be at most 500 characters.");
  }
  const createdAt = nowIso();
  return {
    id: object.id === undefined ? newRecordId("agent") : identifier(object.id, "Agent id"),
    name,
    description,
    createdById: normalizeActor(actorId ?? object.createdById, "Agent creator"),
    createdAt,
  };
}

function normalizeAgentUpdate(input: unknown): AgentUpdateInput {
  const object = objectInput(input, "Agent update");
  const data = object.data === undefined ? object : objectInput(object.data, "Agent update data");
  assertKeys(data, AGENT_UPDATE_KEYS, "Agent update");
  const result: AgentUpdateInput = {};
  if (data.name !== undefined) {
    result.name = requiredText(stringValue(data.name, "Agent name"), "Agent name");
    if (result.name.length > 120) throw new Error("Agent name must be at most 120 characters.");
  }
  if (data.description !== undefined) {
    result.description = optionalText(data.description, "Agent description");
    if (result.description && result.description.length > 500) {
      throw new Error("Agent description must be at most 500 characters.");
    }
  }
  if (result.name === undefined && result.description === undefined) {
    throw new Error("Agent update has no changes.");
  }
  return result;
}

function normalizeVersionInput(
  agentIdOrInput: string | AgentVersionCreateInput,
  maybeInput?: AgentVersionCreateInput,
  maybeActorId?: string,
): { agentId: string; value: AgentVersionCreateInput; actorId?: string } {
  if (typeof agentIdOrInput === "string") {
    if (!maybeInput) throw new Error("Agent version input is required.");
    return { agentId: identifier(agentIdOrInput, "Agent id"), value: maybeInput, actorId: maybeActorId };
  }
  const object = objectInput(agentIdOrInput, "Agent version input");
  return {
    agentId: identifier(object.agentId, "Agent id"),
    value: object as unknown as AgentVersionCreateInput,
    actorId: maybeInput as unknown as string | undefined,
  };
}

function normalizeVersionCreate(value: AgentVersionCreateInput, agentId: string, actorId?: string): {
  id: string;
  agentId: string;
  number: number | null;
  status: AgentVersionStatus;
  instructions: string;
  manifest: AgentJsonObject;
  modelId: string;
  modelContextWindowTokens: number;
  sandboxPolicy: AgentJsonObject;
  validation: AgentJsonValue | null;
  sourceConversationId: string | null;
  createdById: string;
  createdAt: string;
} {
  const object = objectInput(value, "Agent version input");
  assertKeys(object, AGENT_VERSION_CREATE_KEYS, "Agent version input");
  const instructions = stringValue(object.instructions, "Agent instructions");
  const modelId = object.modelId === undefined
    ? "default"
    : identifier(object.modelId, "Agent model id");
  const context = object.modelContextWindowTokens === undefined
    ? 1_000_000
    : positiveInteger(object.modelContextWindowTokens, "Agent model context window");
  const status = object.status === undefined
    ? "DRAFT"
    : assertEnum(object.status, AGENT_VERSION_STATUSES, "agent version status");
  const validation = object.validation === undefined || object.validation === null
    ? null
    : cloneJson(object.validation, "Agent version validation");
  return {
    id: object.id === undefined ? newRecordId("agent-version") : identifier(object.id, "Agent version id"),
    agentId,
    number: object.number === undefined ? null : positiveInteger(object.number, "Agent version number"),
    status,
    instructions,
    manifest: normalizeJsonObject(object.manifest, "Agent manifest"),
    modelId,
    modelContextWindowTokens: context,
    sandboxPolicy: normalizeJsonObject(object.sandboxPolicy, "Agent sandbox policy"),
    validation,
    sourceConversationId: nullableIdentifier(object.sourceConversationId, "Agent source conversation id"),
    createdById: normalizeActor(actorId ?? object.createdById, "Agent version creator"),
    createdAt: nowIso(),
  };
}

function normalizeTriggerInput(
  agentIdOrInput: string | AgentTriggerCreateInput,
  maybeInput?: AgentTriggerCreateInput,
  maybeActorId?: string,
): { agentId: string; value: AgentTriggerCreateInput; actorId?: string } {
  if (typeof agentIdOrInput === "string") {
    if (!maybeInput) throw new Error("Agent trigger input is required.");
    return { agentId: identifier(agentIdOrInput, "Agent id"), value: maybeInput, actorId: maybeActorId };
  }
  const object = objectInput(agentIdOrInput, "Agent trigger input");
  return {
    agentId: identifier(object.agentId, "Agent id"),
    value: object as unknown as AgentTriggerCreateInput,
    actorId: maybeInput as unknown as string | undefined,
  };
}

function normalizeTriggerCreate(value: AgentTriggerCreateInput, agentId: string, actorId?: string): {
  id: string;
  agentId: string;
  versionId: string;
  type: AgentTriggerType;
  name: string;
  config: AgentJsonObject;
  createdById: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
} {
  const object = objectInput(value, "Agent trigger input");
  assertKeys(object, AGENT_TRIGGER_CREATE_KEYS, "Agent trigger input");
  const name = requiredText(stringValue(object.name, "Agent trigger name"), "Agent trigger name");
  if (name.length > 160) throw new Error("Agent trigger name must be at most 160 characters.");
  const type = assertEnum(object.type, AGENT_TRIGGER_TYPES, "agent trigger type");
  const config = normalizeJsonObject(object.config, "Agent trigger config");
  validateTriggerConfig(type, config);
  return {
    id: object.id === undefined ? newRecordId("agent-trigger") : identifier(object.id, "Agent trigger id"),
    agentId,
    versionId: identifier(object.versionId, "Agent trigger version id"),
    type,
    name,
    config,
    createdById: normalizeActor(actorId ?? object.createdById, "Agent trigger creator"),
    enabled: object.enabled === undefined ? false : assertBoolean(object.enabled, "Agent trigger enabled"),
    nextRunAt: normalizeTimestamp(
      object.nextRunAt as string | Date | null | undefined,
      "Agent trigger nextRunAt",
      null,
    ),
    lastRunAt: normalizeTimestamp(
      object.lastRunAt as string | Date | null | undefined,
      "Agent trigger lastRunAt",
      null,
    ),
    createdAt: nowIso(),
  };
}

function normalizeTriggerUpdate(input: unknown): AgentTriggerUpdateInput {
  const object = objectInput(input, "Agent trigger update");
  const data = object.data === undefined ? object : objectInput(object.data, "Agent trigger update data");
  assertKeys(data, AGENT_TRIGGER_UPDATE_KEYS, "Agent trigger update");
  const result: AgentTriggerUpdateInput = {};
  if (data.name !== undefined) {
    result.name = requiredText(stringValue(data.name, "Agent trigger name"), "Agent trigger name");
  }
  if (data.versionId !== undefined) result.versionId = identifier(data.versionId, "Agent trigger version id");
  if (data.type !== undefined) result.type = assertEnum(data.type, AGENT_TRIGGER_TYPES, "agent trigger type");
  if (data.config !== undefined) result.config = normalizeJsonObject(data.config, "Agent trigger config");
  if (result.type === "EVENT" && result.config !== undefined) validateTriggerConfig(result.type, result.config);
  if (data.enabled !== undefined) result.enabled = assertBoolean(data.enabled, "Agent trigger enabled");
  if (data.nextRunAt !== undefined) {
    result.nextRunAt = normalizeTimestamp(
      data.nextRunAt as string | Date | null,
      "Agent trigger nextRunAt",
      null,
    );
  }
  if (data.lastRunAt !== undefined) {
    result.lastRunAt = normalizeTimestamp(
      data.lastRunAt as string | Date | null,
      "Agent trigger lastRunAt",
      null,
    );
  }
  if (Object.keys(result).length === 0) throw new Error("Agent trigger update has no changes.");
  return result;
}

function normalizeRunQueue(
  agentIdOrInput: string | AgentRunQueueInput,
  maybeInput?: AgentRunQueueInput,
  maybeActorId?: string,
): { agentId: string; value: AgentRunQueueInput; actorId?: string } {
  if (typeof agentIdOrInput === "string") {
    return {
      agentId: identifier(agentIdOrInput, "Agent id"),
      value: maybeInput ?? {},
      actorId: maybeActorId,
    };
  }
  const object = objectInput(agentIdOrInput, "Agent run input");
  return {
    agentId: identifier(object.agentId, "Agent id"),
    value: object as AgentRunQueueInput,
    actorId: maybeInput as unknown as string | undefined,
  };
}

function normalizeRunQueueValue(value: AgentRunQueueInput, agentId: string, actorId?: string): AgentRunQueueInput {
  const object = objectInput(value, "Agent run input");
  assertKeys(object, AGENT_RUN_QUEUE_KEYS, "Agent run input");
  const result: AgentRunQueueInput = {
    id: object.id === undefined ? undefined : identifier(object.id, "Agent run id"),
    agentId,
    versionId: object.versionId === undefined ? undefined : identifier(object.versionId, "Agent run version id"),
    triggerId: object.triggerId === undefined || object.triggerId === null
      ? null
      : identifier(object.triggerId, "Agent run trigger id"),
    triggerType: object.triggerType === undefined
      ? undefined
      : assertEnum(object.triggerType, AGENT_TRIGGER_TYPES, "Agent run trigger type"),
    initiatedById: object.initiatedById === undefined || object.initiatedById === null
      ? normalizeActor(actorId, "Agent run initiator")
      : identifier(object.initiatedById, "Agent run initiator"),
    principalId: object.principalId === undefined || object.principalId === null
      ? null
      : identifier(object.principalId, "Agent run principal"),
    sessionId: object.sessionId === undefined || object.sessionId === null
      ? null
      : identifier(object.sessionId, "Agent run session id"),
    idempotencyKey: object.idempotencyKey === undefined
      ? newRecordId("agent-run-key")
      : identifier(object.idempotencyKey, "Agent run idempotency key"),
    correlationId: object.correlationId === undefined
      ? newRecordId("agent-correlation")
      : identifier(object.correlationId, "Agent run correlation id"),
    input: object.input === undefined || object.input === null ? null : cloneJson(object.input, "Agent run input payload"),
    modelId: object.modelId === undefined || object.modelId === null
      ? null
      : identifier(object.modelId, "Agent run model id"),
  };
  return result;
}

function normalizeRunApproval(input: AgentRunApprovalInput | undefined): AgentRunApprovalInput {
  if (input === undefined) return {};
  const object = objectInput(input, "Agent approval input");
  assertKeys(object, AGENT_RUN_APPROVAL_KEYS, "Agent approval input");
  return {
    reason: object.reason === undefined || object.reason === null
      ? null
      : nullableText(stringValue(object.reason, "Agent approval reason")),
    approvedById: object.approvedById === undefined || object.approvedById === null
      ? null
      : identifier(object.approvedById, "Agent approver"),
  };
}

function normalizeRunSuccess(input: AgentRunSuccessInput | undefined): AgentRunSuccessInput {
  if (input === undefined) return {};
  const object = objectInput(input, "Agent success input");
  assertKeys(object, AGENT_RUN_SUCCESS_KEYS, "Agent success input");
  const result: AgentRunSuccessInput = {};
  if (object.result !== undefined) result.result = object.result === null ? null : cloneJson(object.result, "Agent run result");
  if (object.summary !== undefined) result.summary = optionalText(object.summary, "Agent run summary");
  if (object.modelId !== undefined) result.modelId = object.modelId === null ? null : identifier(object.modelId, "Agent run model id");
  if (object.inputTokens !== undefined) result.inputTokens = object.inputTokens === null ? null : nonNegativeInteger(object.inputTokens, "Agent input tokens");
  if (object.outputTokens !== undefined) result.outputTokens = object.outputTokens === null ? null : nonNegativeInteger(object.outputTokens, "Agent output tokens");
  if (object.costUsd !== undefined) result.costUsd = object.costUsd === null ? null : nonNegativeNumber(object.costUsd, "Agent run cost");
  return result;
}

function normalizeRunFailure(input: AgentRunFailureInput | string | undefined): AgentRunFailureInput {
  if (typeof input === "string") return { errorMessage: requiredText(input, "Agent run error message") };
  if (input === undefined) return {};
  const object = objectInput(input, "Agent failure input");
  assertKeys(object, AGENT_RUN_FAILURE_KEYS, "Agent failure input");
  return {
    errorCode: object.errorCode === undefined || object.errorCode === null ? null : identifier(object.errorCode, "Agent run error code"),
    errorMessage: object.errorMessage === undefined || object.errorMessage === null
      ? null
      : requiredText(stringValue(object.errorMessage, "Agent run error message"), "Agent run error message"),
    result: object.result === undefined || object.result === null ? null : cloneJson(object.result, "Agent run result"),
    summary: object.summary === undefined ? undefined : optionalText(object.summary, "Agent run summary"),
  };
}

function normalizeActionInput(
  runIdOrInput: string | AgentActionCreateInput,
  maybeInput?: AgentActionCreateInput,
  maybeActorId?: string,
): { runId: string; value: AgentActionCreateInput; actorId?: string } {
  if (typeof runIdOrInput === "string") {
    if (!maybeInput) throw new Error("Agent action input is required.");
    return { runId: identifier(runIdOrInput, "Agent run id"), value: maybeInput, actorId: maybeActorId };
  }
  const object = objectInput(runIdOrInput, "Agent action input");
  return {
    runId: identifier(object.runId, "Agent run id"),
    value: object as unknown as AgentActionCreateInput,
    actorId: maybeInput as unknown as string | undefined,
  };
}

function normalizeActionCreate(value: AgentActionCreateInput, runId: string): AgentActionCreateInput {
  const object = objectInput(value, "Agent action input");
  assertKeys(object, AGENT_ACTION_CREATE_KEYS, "Agent action input");
  return {
    id: object.id === undefined ? undefined : identifier(object.id, "Agent action id"),
    agentId: object.agentId === undefined ? undefined : identifier(object.agentId, "Agent action agent id"),
    runId,
    type: requiredText(stringValue(object.type, "Agent action type"), "Agent action type"),
    provider: requiredText(stringValue(object.provider, "Agent action provider"), "Agent action provider"),
    targetType: object.targetType === undefined || object.targetType === null ? null : nullableText(stringValue(object.targetType, "Agent action target type")),
    targetId: object.targetId === undefined || object.targetId === null ? null : nullableText(stringValue(object.targetId, "Agent action target id")),
    targetLabel: object.targetLabel === undefined || object.targetLabel === null ? null : nullableText(stringValue(object.targetLabel, "Agent action target label")),
    summary: requiredText(stringValue(object.summary, "Agent action summary"), "Agent action summary"),
    metadata: object.metadata === undefined || object.metadata === null ? null : cloneJson(object.metadata, "Agent action metadata"),
    status: object.status === undefined ? "PLANNED" : assertEnum(object.status, AGENT_ACTION_STATUSES, "agent action status"),
    idempotencyKey: object.idempotencyKey === undefined ? newRecordId("agent-action-key") : identifier(object.idempotencyKey, "Agent action idempotency key"),
    requestHash: object.requestHash === undefined || object.requestHash === null ? null : nullableText(stringValue(object.requestHash, "Agent action request hash")),
    externalId: object.externalId === undefined || object.externalId === null ? null : nullableText(stringValue(object.externalId, "Agent action external id")),
  };
}

function normalizeActionUpdate(input: unknown): AgentActionUpdateInput {
  const object = objectInput(input, "Agent action update");
  const data = object.data === undefined ? object : objectInput(object.data, "Agent action update data");
  assertKeys(data, AGENT_ACTION_UPDATE_KEYS, "Agent action update");
  const result: AgentActionUpdateInput = {};
  if (data.type !== undefined) result.type = requiredText(stringValue(data.type, "Agent action type"), "Agent action type");
  if (data.provider !== undefined) result.provider = requiredText(stringValue(data.provider, "Agent action provider"), "Agent action provider");
  if (data.targetType !== undefined) result.targetType = data.targetType === null ? null : nullableText(stringValue(data.targetType, "Agent action target type"));
  if (data.targetId !== undefined) result.targetId = data.targetId === null ? null : nullableText(stringValue(data.targetId, "Agent action target id"));
  if (data.targetLabel !== undefined) result.targetLabel = data.targetLabel === null ? null : nullableText(stringValue(data.targetLabel, "Agent action target label"));
  if (data.summary !== undefined) result.summary = requiredText(stringValue(data.summary, "Agent action summary"), "Agent action summary");
  if (data.metadata !== undefined) result.metadata = data.metadata === null ? null : cloneJson(data.metadata, "Agent action metadata");
  if (data.status !== undefined) result.status = assertEnum(data.status, AGENT_ACTION_STATUSES, "agent action status");
  if (data.requestHash !== undefined) result.requestHash = data.requestHash === null ? null : nullableText(stringValue(data.requestHash, "Agent action request hash"));
  if (data.externalId !== undefined) result.externalId = data.externalId === null ? null : nullableText(stringValue(data.externalId, "Agent action external id"));
  if (data.attemptCount !== undefined) result.attemptCount = nonNegativeInteger(data.attemptCount, "Agent action attempt count");
  if (data.errorCode !== undefined) result.errorCode = data.errorCode === null ? null : nullableText(stringValue(data.errorCode, "Agent action error code"));
  if (data.errorMessage !== undefined) result.errorMessage = data.errorMessage === null ? null : nullableText(stringValue(data.errorMessage, "Agent action error message"));
  if (Object.keys(result).length === 0) throw new Error("Agent action update has no changes.");
  return result;
}

function normalizeThreadInput(
  agentIdOrInput: string | AgentThreadLinkInput,
  maybeInput?: AgentThreadLinkInput,
  maybeActorId?: string,
): { agentId: string; value: AgentThreadLinkInput; actorId?: string } {
  if (typeof agentIdOrInput === "string") {
    if (!maybeInput) throw new Error("Agent thread link input is required.");
    return { agentId: identifier(agentIdOrInput, "Agent id"), value: maybeInput, actorId: maybeActorId };
  }
  const object = objectInput(agentIdOrInput, "Agent thread link input");
  return {
    agentId: identifier(object.agentId, "Agent id"),
    value: object as unknown as AgentThreadLinkInput,
    actorId: maybeInput as unknown as string | undefined,
  };
}

function normalizeThreadCreate(value: AgentThreadLinkInput, agentId: string): AgentThreadLinkInput & { agentId: string } {
  const object = objectInput(value, "Agent thread link input");
  assertKeys(object, AGENT_THREAD_LINK_KEYS, "Agent thread link input");
  const threadId = identifier(object.threadId, "Agent thread id");
  const kind = object.kind === undefined ? undefined : assertEnum(object.kind, AGENT_THREAD_KINDS, "agent thread kind");
  const recordType = object.recordType === undefined || object.recordType === null
    ? null
    : assertEnum(stringValue(object.recordType, "Agent thread record type").toUpperCase(), AGENT_RECORD_TYPES, "agent thread record type");
  const recordId = nullableIdentifier(object.recordId, "Agent thread record id");
  const runId = nullableIdentifier(object.runId, "Agent thread run id");
  const versionId = nullableIdentifier(object.versionId, "Agent thread version id");
  const resolvedKind = kind ?? (runId ? "RUN" : recordType ? "RECORD" : "BUILDER");
  if (resolvedKind === "RECORD" && (!recordType || !recordId)) {
    throw new Error("Record thread links require recordType and recordId.");
  }
  if (resolvedKind === "RUN" && !runId) throw new Error("Run thread links require runId.");
  return {
    id: object.id === undefined ? newRecordId("agent-thread") : identifier(object.id, "Agent thread link id"),
    agentId,
    threadId,
    kind: resolvedKind,
    runId,
    versionId,
    recordType,
    recordId,
    summary: object.summary === undefined || object.summary === null ? null : nullableText(stringValue(object.summary, "Agent thread summary")),
  };
}

function statusError(entity: string, id: string, current: string, next: string): AgentStateError {
  return new AgentStateError(`Cannot transition ${entity} ${id} from ${current} to ${next}.`);
}

function isUniqueError(error: unknown, field: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (typeof candidate.message === "string" && candidate.message.includes(field));
}

export class AgentStore {
  constructor(private readonly db: Db) {}

  get(id: string): AgentDefinition | null {
    const agentId = identifier(id, "Agent id");
    const row = this.db.prepare(`${AGENT_SELECT} WHERE id = ?`).get(agentId);
    return row === undefined ? null : parseAgent(row);
  }

  getRequired(id: string): AgentDefinition {
    const agent = this.get(id);
    if (!agent) throw new RecordNotFoundError("agent", id);
    return agent;
  }

  detail(id: string): AgentDetail | null {
    const agent = this.get(id);
    if (!agent) return null;
    return {
      ...agent,
      currentVersion: agent.currentVersionId ? this.getVersion(agent.currentVersionId) : null,
      versions: this.listVersions(agent.id),
      triggers: this.listTriggers(agent.id, { limit: 100 }),
      runCount: Number(this.db.prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE agent_id = ?").pluck().get(agent.id)),
    };
  }

  getDetail(id: string): AgentDetail | null {
    return this.detail(id);
  }

  list(options: AgentListOptions = {}): AgentListItem[] {
    const object = objectInput(options, "Agent list options");
    assertKeys(object, new Set(["search", "status", "includeArchived", "archivedOnly", "limit", "offset"]), "Agent list options");
    const clauses: string[] = [];
    const params: Record<string, string | number> = {};
    const statuses = normalizeListStatus(object.status as AgentDefinitionStatus | readonly AgentDefinitionStatus[] | undefined, AGENT_DEFINITION_STATUSES, "agent status");
    if (statuses.length > 0) {
      clauses.push(`agent_definitions.status IN (${statuses.map((_, index) => `@status${index}`).join(", ")})`);
      statuses.forEach((status, index) => { params[`status${index}`] = status; });
    } else if (object.archivedOnly === true) {
      clauses.push("agent_definitions.status = 'ARCHIVED'");
    } else if (object.includeArchived !== true) {
      clauses.push("agent_definitions.status NOT IN ('ARCHIVED', 'DELETED')");
    } else {
      clauses.push("agent_definitions.status <> 'DELETED'");
    }
    if (object.search !== undefined) {
      const search = nullableText(stringValue(object.search, "Agent search"));
      if (search) {
        clauses.push("(agent_definitions.name LIKE @search COLLATE NOCASE OR COALESCE(agent_definitions.description, '') LIKE @search COLLATE NOCASE)");
        params.search = `%${search}%`;
      }
    }
    params.limit = bounded(object.limit as number | undefined, "Agent list limit");
    params.offset = normalizeOffset(object.offset as number | undefined);
    const rows = this.db.prepare(`
      ${AGENT_SELECT.replace("  FROM agent_definitions", "")},
      (SELECT COUNT(*) FROM agent_runs r WHERE r.agent_id = agent_definitions.id) AS runCount,
      v.id AS currentVersionRowId,
      v.number AS currentVersionNumber,
      v.status AS currentVersionStatus,
      v.deployed_at AS currentVersionDeployedAt
      FROM agent_definitions
      LEFT JOIN agent_versions v ON v.id = agent_definitions.current_version_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY agent_definitions.updated_at DESC, agent_definitions.id DESC
      LIMIT @limit OFFSET @offset
    `).all(params) as unknown[];
    return rows.map((value) => {
      const row = rowObject(value, "agent list");
      const agent = parseAgent(row);
      return {
        ...agent,
        runCount: nonNegativeInteger(row.runCount, "Agent run count"),
        currentVersion: row.currentVersionRowId === null || row.currentVersionRowId === undefined
          ? null
          : {
              id: identifier(row.currentVersionRowId, "Agent current version id"),
              number: positiveInteger(row.currentVersionNumber, "Agent current version number"),
              status: assertEnum(row.currentVersionStatus, AGENT_VERSION_STATUSES, "agent current version status"),
              deployedAt: nullableStoredTimestamp(row.currentVersionDeployedAt, "Agent current version deployment timestamp"),
            },
      };
    });
  }

  create(input: AgentCreateInput, actorId?: string): AgentDefinition {
    const value = normalizeAgentCreate(input, actorId);
    return this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO agent_definitions
          (id, name, description, status, created_by_id, created_at, updated_at)
        VALUES (@id, @name, @description, 'DRAFT', @createdById, @createdAt, @createdAt)
      `).run(value);
      const agent = this.getRequired(value.id);
      this.insertAudit({
        agentId: agent.id,
        actorId: value.createdById,
        actorType: "USER",
        type: "agent.created",
        summary: "Created agent",
        after: { name: agent.name, description: agent.description, status: agent.status },
      });
      return agent;
    })();
  }

  update(id: string, input: AgentUpdateInput, actorId?: string): AgentDefinition {
    const agentId = identifier(id, "Agent id");
    const value = normalizeAgentUpdate(input);
    return this.db.transaction(() => {
      const before = this.getRequired(agentId);
      if (before.status === "DELETED") throw new RecordNotFoundError("agent", agentId);
      const sets: string[] = [];
      const params: Record<string, string | null> = { id: agentId, updatedAt: nowIso() };
      if (value.name !== undefined) {
        sets.push("name = @name");
        params.name = value.name;
      }
      if (value.description !== undefined) {
        sets.push("description = @description");
        params.description = value.description ?? null;
      }
      sets.push("updated_at = @updatedAt");
      this.db.prepare(`UPDATE agent_definitions SET ${sets.join(", ")} WHERE id = @id`).run(params);
      const after = this.getRequired(agentId);
      this.insertAudit({
        agentId,
        actorId: normalizeActor(actorId ?? before.createdById),
        actorType: "USER",
        type: "agent.updated",
        summary: "Changed agent details",
        before: { name: before.name, description: before.description },
        after: { name: after.name, description: after.description },
      });
      return after;
    })();
  }

  createVersion(
    agentIdOrInput: string | AgentVersionCreateInput,
    inputOrActor?: AgentVersionCreateInput | string,
    actorId?: string,
  ): AgentVersion {
    const normalized = normalizeVersionInput(
      agentIdOrInput,
      typeof inputOrActor === "object" ? inputOrActor : undefined,
      actorId ?? (typeof inputOrActor === "string" ? inputOrActor : undefined),
    );
    const value = normalizeVersionCreate(normalized.value, normalized.agentId, normalized.actorId);
    return this.db.transaction(() => {
      const agent = this.getRequired(value.agentId);
      if (agent.status === "DELETED" || agent.status === "ARCHIVED") {
        throw new AgentStateError(`Cannot add a version to ${agent.status.toLowerCase()} agent ${agent.id}.`);
      }
      const number = value.number ?? Number(this.db.prepare(
        "SELECT COALESCE(MAX(number), 0) + 1 FROM agent_versions WHERE agent_id = ?",
      ).pluck().get(value.agentId));
      positiveInteger(number, "Agent version number");
      this.db.prepare(`
        INSERT INTO agent_versions (
          id, agent_id, number, status, instructions, manifest, model_id,
          model_context_window_tokens, sandbox_policy, validation,
          source_conversation_id, created_by_id, created_at
        ) VALUES (
          @id, @agentId, @number, @status, @instructions, @manifest, @modelId,
          @modelContextWindowTokens, @sandboxPolicy, @validation,
          @sourceConversationId, @createdById, @createdAt
        )
      `).run({
        ...value,
        number,
        manifest: encodeJson(value.manifest, "Agent manifest"),
        sandboxPolicy: encodeJson(value.sandboxPolicy, "Agent sandbox policy"),
        validation: value.validation === null ? null : encodeJson(value.validation, "Agent version validation"),
      });
      const version = this.getVersionRequired(value.id);
      this.insertAudit({
        agentId: value.agentId,
        versionId: version.id,
        actorId: value.createdById,
        actorType: "USER",
        type: "agent.version.created",
        summary: `Created agent version ${version.number}`,
        after: { versionId: version.id, number: version.number, status: version.status },
      });
      return version;
    })();
  }

  getVersion(id: string): AgentVersion | null {
    const versionId = identifier(id, "Agent version id");
    const row = this.db.prepare(`${VERSION_SELECT} WHERE id = ?`).get(versionId);
    return row === undefined ? null : parseVersion(row);
  }

  getVersionRequired(id: string): AgentVersion {
    const version = this.getVersion(id);
    if (!version) throw new RecordNotFoundError("agent version", id);
    return version;
  }

  listVersions(agentId: string, options: AgentVersionListOptions = {}): AgentVersion[] {
    const id = identifier(agentId, "Agent id");
    const object = objectInput(options, "Agent version list options");
    assertKeys(object, new Set(["status", "limit", "offset"]), "Agent version list options");
    const statuses = normalizeListStatus(object.status as AgentVersionStatus | readonly AgentVersionStatus[] | undefined, AGENT_VERSION_STATUSES, "agent version status");
    const clauses = ["agent_id = @agentId"];
    const params: Record<string, string | number> = { agentId: id, limit: bounded(object.limit as number | undefined, "Agent version list limit"), offset: normalizeOffset(object.offset as number | undefined) };
    if (statuses.length > 0) {
      clauses.push(`status IN (${statuses.map((_, index) => `@status${index}`).join(", ")})`);
      statuses.forEach((status, index) => { params[`status${index}`] = status; });
    }
    return (this.db.prepare(`${VERSION_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY number DESC LIMIT @limit OFFSET @offset`).all(params) as unknown[]).map(parseVersion);
  }

  validateVersion(id: string, validation?: AgentJsonValue | null, actorId?: string): AgentVersion {
    return this.transitionVersion(id, "READY", ["DRAFT", "VALIDATING", "REJECTED"], actorId, validation);
  }

  markVersionReady(id: string, validation?: AgentJsonValue | null, actorId?: string): AgentVersion {
    return this.validateVersion(id, validation, actorId);
  }

  deploy(
    agentIdOrInput: string | { id?: string; agentId?: string; versionId: string; actorId?: string; requestId?: string; clientRequestId?: string },
    versionOrActor?: string | { versionId: string; actorId?: string; requestId?: string; clientRequestId?: string },
    actorId?: string,
  ): { id: string; versionId: string; status: "LIVE" } {
    const parsed = this.deployArgs(agentIdOrInput, versionOrActor, actorId);
    return this.db.transaction(() => {
      const agent = this.getRequired(parsed.agentId);
      if (agent.status === "DELETED") throw new RecordNotFoundError("agent", parsed.agentId);
      const version = this.getVersionRequired(parsed.versionId);
      if (version.agentId !== agent.id) throw new RecordNotFoundError("agent version", parsed.versionId);
      if (!(["DRAFT", "LIVE", "PAUSED"] as readonly AgentDefinitionStatus[]).includes(agent.status)) {
        throw statusError("agent", agent.id, agent.status, "LIVE");
      }
      if (!(version.status === "READY" || version.status === "DEPLOYED")) {
        throw new AgentStateError(`Only a validated READY or already DEPLOYED agent version can be deployed; version ${version.id} is ${version.status}.`);
      }
      if (parsed.requestId) {
        const existing = this.db.prepare(`
          ${AUDIT_SELECT}
          WHERE agent_id = ? AND type = 'agent.deployed' AND request_id = ?
        `).get(agent.id, parsed.requestId);
        if (existing) {
          const prior = parseAudit(existing);
          if (prior.versionId !== version.id) throw new AgentConflictError("That deployment request has already been used.");
          return { id: agent.id, versionId: version.id, status: "LIVE" as const };
        }
      }
      const timestamp = nowIso();
      this.db.prepare(`
        UPDATE agent_versions
        SET status = 'READY'
        WHERE agent_id = @agentId AND status = 'DEPLOYED' AND id <> @versionId
      `).run({ agentId: agent.id, versionId: version.id });
      this.db.prepare(`
        UPDATE agent_versions
        SET status = 'DEPLOYED', approved_at = @timestamp,
            deployed_at = @timestamp, deployment_id = @deploymentId
        WHERE id = @versionId
      `).run({ versionId: version.id, timestamp, deploymentId: parsed.requestId ?? newRecordId("deployment") });
      this.db.prepare(`
        UPDATE agent_definitions
        SET current_version_id = @versionId, status = 'LIVE', archived_at = NULL,
            deleted_at = NULL, updated_at = @timestamp
        WHERE id = @agentId
      `).run({ agentId: agent.id, versionId: version.id, timestamp });
      this.db.prepare("UPDATE agent_triggers SET enabled = 0, next_run_at = NULL WHERE agent_id = ?").run(agent.id);
      this.db.prepare("UPDATE agent_triggers SET enabled = 1 WHERE agent_id = ? AND version_id = ?").run(agent.id, version.id);
      this.insertAudit({
        agentId: agent.id,
        versionId: version.id,
        actorId: parsed.actorId,
        actorType: "USER",
        type: "agent.deployed",
        summary: `Deployed agent version ${version.number}`,
        before: { status: agent.status, currentVersionId: agent.currentVersionId },
        after: { status: "LIVE", currentVersionId: version.id },
        requestId: parsed.requestId,
      });
      return { id: agent.id, versionId: version.id, status: "LIVE" as const };
    })();
  }

  pause(id: string, actorId?: string): AgentDefinition {
    return this.changeDefinitionStatus(id, "PAUSED", ["LIVE"], actorId, "agent.paused", "Paused agent");
  }

  resume(id: string, actorId?: string): AgentDefinition {
    return this.changeDefinitionStatus(id, "LIVE", ["PAUSED"], actorId, "agent.resumed", "Resumed agent");
  }

  archive(id: string, actorId?: string): AgentDefinition {
    return this.changeDefinitionStatus(id, "ARCHIVED", ["LIVE", "PAUSED"], actorId, "agent.archived", "Archived agent", true);
  }

  restore(id: string, actorId?: string): AgentDefinition {
    return this.changeDefinitionStatus(id, "PAUSED", ["ARCHIVED"], actorId, "agent.restored", "Restored agent", false, true);
  }

  /**
   * Fence an agent before any asynchronous BB worker cleanup.  DELETED is a
   * durable terminal state: queue/start/trigger paths reject it, while the
   * existing run and thread rows remain available for cancellation and audit.
   */
  beginDeletion(id: string, actorId?: string): AgentDeletionPlan {
    const agentId = identifier(id, "Agent id");
    const actor = normalizeActor(actorId);
    return this.db.transaction(() => {
      const before = this.getRequired(agentId);
      const timestamp = nowIso();
      if (before.status !== "DELETED") {
        this.db.prepare(`
          UPDATE agent_definitions
          SET status = 'DELETED', deleted_at = COALESCE(deleted_at, @deletedAt),
              updated_at = @updatedAt
          WHERE id = @id
        `).run({ id: agentId, deletedAt: timestamp, updatedAt: timestamp });
      }

      // Clear next_run_at even for an already-disabled trigger so a stale
      // schedule cannot be picked up by a concurrent dispatcher sweep.
      const disabled = this.db.prepare(`
        UPDATE agent_triggers
        SET enabled = 0, next_run_at = NULL, updated_at = @updatedAt
        WHERE agent_id = @agentId AND (enabled = 1 OR next_run_at IS NOT NULL)
      `).run({ agentId, updatedAt: timestamp });
      const rows = this.db.prepare(`
        SELECT id
        FROM agent_runs
        WHERE agent_id = @agentId
          AND status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL')
        ORDER BY created_at ASC, id ASC
      `).all({ agentId }) as Array<{ id?: unknown }>;

      return {
        agentId,
        actorId: actor,
        beforeStatus: before.status,
        disabledTriggers: Number(disabled.changes),
        activeRunIds: rows.map((row) => identifier(row.id, "Agent deletion run id")),
      };
    })();
  }

  /**
   * Finish a deletion after the dispatcher has cancelled every run in the
   * plan.  Refuse to report success while an active run remains; callers can
   * retry the idempotent plan after a transient dispatcher failure.
   */
  completeDeletion(plan: AgentDeletionPlan, actorId?: string): AgentDeletionResult {
    const parsedPlan = objectInput(plan, "Agent deletion plan");
    assertKeys(parsedPlan, new Set([
      "agentId",
      "actorId",
      "beforeStatus",
      "disabledTriggers",
      "activeRunIds",
    ]), "Agent deletion plan");
    const agentId = identifier(parsedPlan.agentId, "Agent id");
    const rawActiveRunIds = parsedPlan.activeRunIds;
    if (!Array.isArray(rawActiveRunIds)) {
      throw new Error("Agent deletion plan activeRunIds must be an array of ids.");
    }
    const activeRunIds = rawActiveRunIds.map((runId, index) =>
      identifier(runId, `Agent deletion run id ${index + 1}`));
    const beforeStatus = assertEnum(parsedPlan.beforeStatus, AGENT_DEFINITION_STATUSES, "Agent deletion prior status");
    const plannedDisabledTriggers = nonNegativeInteger(parsedPlan.disabledTriggers, "Agent disabled trigger count");
    const actor = normalizeActor(actorId ?? parsedPlan.actorId);

    return this.db.transaction(() => {
      const agent = this.getRequired(agentId);
      if (agent.status !== "DELETED") {
        throw new AgentStateError(`Agent ${agent.id} must be DELETED before deletion can complete.`);
      }
      // Check the complete agent queue, not merely the caller's plan.  This
      // makes the completion fence safe even if a stale/tampered plan omits a
      // run that was queued before DELETED became durable.
      const active = Number(this.db.prepare(`
        SELECT COUNT(*)
        FROM agent_runs
        WHERE agent_id = @agentId
          AND status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL')
      `).pluck().get({ agentId }));
      if (active > 0) {
        throw new AgentStateError(`Cannot complete deletion for agent ${agent.id}; ${active} active run${active === 1 ? "" : "s"} remain.`);
      }

      const existing = this.db.prepare(`
        ${AUDIT_SELECT}
        WHERE agent_id = @agentId AND type = 'agent.deleted'
        ORDER BY emitted_at DESC, id DESC
        LIMIT 1
      `).get({ agentId });
      let disabledTriggers = plannedDisabledTriggers;
      let cancelledRuns = Number(this.db.prepare(`
        SELECT COUNT(*)
        FROM agent_runs
        WHERE agent_id = @agentId AND status = 'CANCELLED'
          AND error_code = 'AGENT_DELETED'
      `).pluck().get({ agentId }));
      if (existing !== undefined) {
        const prior = parseAudit(existing);
        if (isPlainObject(prior.after)) {
          const priorDisabled = prior.after.disabledTriggers;
          const priorCancelled = prior.after.cancelledRuns;
          if (typeof priorDisabled === "number" && Number.isSafeInteger(priorDisabled) && priorDisabled >= 0) {
            disabledTriggers = priorDisabled;
          }
          if (typeof priorCancelled === "number" && Number.isSafeInteger(priorCancelled) && priorCancelled >= 0) {
            cancelledRuns = priorCancelled;
          }
        }
      } else {
        this.insertAudit({
          agentId,
          actorId: actor,
          actorType: "USER",
          type: "agent.deleted",
          summary: "Deleted agent",
          before: { status: beforeStatus },
          after: { status: "DELETED", disabledTriggers, cancelledRuns },
        });
      }
      return { ...agent, disabledTriggers, cancelledRuns };
    })();
  }

  /** Synchronous database-only fallback used by tests and non-host callers. */
  remove(id: string, actorId?: string): AgentDeletionResult {
    const plan = this.beginDeletion(id, actorId);
    for (const runId of plan.activeRunIds) {
      this.cancelRun(
        runId,
        "The agent was deleted before this run completed.",
        plan.actorId,
        "AGENT_DELETED",
      );
    }
    return this.completeDeletion(plan, actorId);
  }

  createTrigger(
    agentIdOrInput: string | AgentTriggerCreateInput,
    inputOrActor?: AgentTriggerCreateInput | string,
    actorId?: string,
  ): AgentTrigger {
    const normalized = normalizeTriggerInput(
      agentIdOrInput,
      typeof inputOrActor === "object" ? inputOrActor : undefined,
      actorId ?? (typeof inputOrActor === "string" ? inputOrActor : undefined),
    );
    const value = normalizeTriggerCreate(normalized.value, normalized.agentId, normalized.actorId);
    return this.db.transaction(() => {
      const agent = this.getRequired(value.agentId);
      if (agent.status === "DELETED" || agent.status === "ARCHIVED") throw new AgentStateError(`Cannot add a trigger to ${agent.status.toLowerCase()} agent ${agent.id}.`);
      const version = this.getVersionRequired(value.versionId);
      if (version.agentId !== agent.id) throw new RecordNotFoundError("agent version", value.versionId);
      if (value.enabled && (agent.status !== "LIVE" || version.status !== "DEPLOYED")) {
        throw new AgentStateError("Only a deployed version on a live agent can have an enabled trigger.");
      }
      this.db.prepare(`
        INSERT INTO agent_triggers (
          id, agent_id, version_id, type, name, config, created_by_id, enabled,
          next_run_at, last_run_at, created_at, updated_at
        ) VALUES (
          @id, @agentId, @versionId, @type, @name, @config, @createdById, @enabled,
          @nextRunAt, @lastRunAt, @createdAt, @createdAt
        )
      `).run({
        ...value,
        config: encodeJson(value.config, "Agent trigger config"),
        enabled: value.enabled ? 1 : 0,
      });
      const trigger = this.getTriggerRequired(value.id);
      this.insertAudit({
        agentId: agent.id,
        versionId: version.id,
        actorId: value.createdById,
        actorType: "USER",
        type: "agent.trigger.created",
        summary: `Created ${trigger.type.toLowerCase()} trigger ${trigger.name}`,
        after: { triggerId: trigger.id, type: trigger.type, enabled: trigger.enabled },
      });
      return trigger;
    })();
  }

  getTrigger(id: string): AgentTrigger | null {
    const triggerId = identifier(id, "Agent trigger id");
    const row = this.db.prepare(`${TRIGGER_SELECT} WHERE id = ?`).get(triggerId);
    return row === undefined ? null : parseTrigger(row);
  }

  getTriggerRequired(id: string): AgentTrigger {
    const trigger = this.getTrigger(id);
    if (!trigger) throw new RecordNotFoundError("agent trigger", id);
    return trigger;
  }

  listTriggers(agentId: string, options: AgentTriggerListOptions = {}): AgentTrigger[] {
    const id = identifier(agentId, "Agent id");
    const object = objectInput(options, "Agent trigger list options");
    assertKeys(object, new Set(["type", "enabled", "limit", "offset"]), "Agent trigger list options");
    const clauses = ["agent_id = @agentId"];
    const params: Record<string, string | number> = { agentId: id, limit: bounded(object.limit as number | undefined, "Agent trigger list limit"), offset: normalizeOffset(object.offset as number | undefined) };
    if (object.type !== undefined) {
      params.type = assertEnum(object.type, AGENT_TRIGGER_TYPES, "agent trigger type");
      clauses.push("type = @type");
    }
    if (object.enabled !== undefined) {
      clauses.push("enabled = @enabled");
      params.enabled = assertBoolean(object.enabled, "Agent trigger enabled") ? 1 : 0;
    }
    return (this.db.prepare(`${TRIGGER_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY created_at ASC, id ASC LIMIT @limit OFFSET @offset`).all(params) as unknown[]).map(parseTrigger);
  }

  updateTrigger(id: string, input: AgentTriggerUpdateInput, actorId?: string): AgentTrigger {
    const triggerId = identifier(id, "Agent trigger id");
    const value = normalizeTriggerUpdate(input);
    return this.db.transaction(() => {
      const before = this.getTriggerRequired(triggerId);
      const agent = this.getRequired(before.agentId);
      if (agent.status === "DELETED") throw new RecordNotFoundError("agent", agent.id);
      const versionId = value.versionId ?? before.versionId;
      const version = this.getVersionRequired(versionId);
      if (version.agentId !== agent.id) throw new RecordNotFoundError("agent version", versionId);
      validateTriggerConfig(value.type ?? before.type, value.config ?? before.config);
      const enabled = value.enabled ?? before.enabled;
      if (enabled && (agent.status !== "LIVE" || version.status !== "DEPLOYED")) {
        throw new AgentStateError("Only a deployed version on a live agent can have an enabled trigger.");
      }
      const sets: string[] = [];
      const params: Record<string, string | number | null> = { id: triggerId, updatedAt: nowIso() };
      if (value.name !== undefined) { sets.push("name = @name"); params.name = value.name; }
      if (value.versionId !== undefined) { sets.push("version_id = @versionId"); params.versionId = versionId; }
      if (value.type !== undefined) { sets.push("type = @type"); params.type = value.type; }
      if (value.config !== undefined) { sets.push("config = @config"); params.config = encodeJson(value.config, "Agent trigger config"); }
      if (value.enabled !== undefined || value.versionId !== undefined) { sets.push("enabled = @enabled"); params.enabled = enabled ? 1 : 0; }
      if (value.nextRunAt !== undefined) {
        sets.push("next_run_at = @nextRunAt");
        params.nextRunAt = normalizeTimestamp(value.nextRunAt, "Agent trigger nextRunAt", null);
      }
      if (value.lastRunAt !== undefined) {
        sets.push("last_run_at = @lastRunAt");
        params.lastRunAt = normalizeTimestamp(value.lastRunAt, "Agent trigger lastRunAt", null);
      }
      sets.push("updated_at = @updatedAt");
      this.db.prepare(`UPDATE agent_triggers SET ${sets.join(", ")} WHERE id = @id`).run(params);
      if (before.type === "WEBHOOK" && (value.type ?? before.type) !== "WEBHOOK") {
        this.db.prepare(`
          UPDATE agent_webhook_tokens
          SET revoked_at = COALESCE(revoked_at, @revokedAt)
          WHERE trigger_id = @triggerId AND revoked_at IS NULL
        `).run({ triggerId, revokedAt: params.updatedAt });
      }
      const after = this.getTriggerRequired(triggerId);
      this.insertAudit({
        agentId: agent.id,
        versionId: after.versionId,
        actorId: normalizeActor(actorId ?? before.createdById),
        actorType: "USER",
        type: "agent.trigger.updated",
        summary: `Updated trigger ${after.name}`,
        before: { name: before.name, type: before.type, enabled: before.enabled, versionId: before.versionId },
        after: { name: after.name, type: after.type, enabled: after.enabled, versionId: after.versionId },
      });
      return after;
    })();
  }

  deleteTrigger(id: string, actorId?: string): { id: string } {
    const triggerId = identifier(id, "Agent trigger id");
    return this.db.transaction(() => {
      const trigger = this.getTriggerRequired(triggerId);
      this.db.prepare("DELETE FROM agent_triggers WHERE id = ?").run(triggerId);
      this.insertAudit({
        agentId: trigger.agentId,
        versionId: trigger.versionId,
        actorId: normalizeActor(actorId ?? trigger.createdById),
        actorType: "USER",
        type: "agent.trigger.deleted",
        summary: `Deleted trigger ${trigger.name}`,
        before: { triggerId: trigger.id, type: trigger.type, enabled: trigger.enabled },
      });
      return { id: triggerId };
    })();
  }

  enableTrigger(id: string, enabled = true, actorId?: string): AgentTrigger {
    const trigger = this.getTriggerRequired(id);
    return this.updateTrigger(trigger.id, { enabled }, actorId);
  }

  setTriggerEnabled(id: string, enabled: boolean, actorId?: string): AgentTrigger {
    return this.enableTrigger(id, enabled, actorId);
  }

  queueRun(
    agentIdOrInput: string | AgentRunQueueInput,
    inputOrActor?: AgentRunQueueInput | string,
    actorId?: string,
  ): AgentRunDetail {
    const normalized = normalizeRunQueue(
      agentIdOrInput,
      typeof inputOrActor === "object" ? inputOrActor : undefined,
      actorId ?? (typeof inputOrActor === "string" ? inputOrActor : undefined),
    );
    const value = normalizeRunQueueValue(normalized.value, normalized.agentId, normalized.actorId);
    return this.db.transaction(() => {
      const agent = this.getRequired(normalized.agentId);
      if (agent.status !== "LIVE") throw new AgentStateError(`Only a live agent can queue a run; agent ${agent.id} is ${agent.status}.`);
      const versionId = value.versionId ?? agent.currentVersionId;
      if (!versionId) throw new AgentStateError("A live agent must have a current deployed version before it can run.");
      const version = this.getVersionRequired(versionId);
      if (version.agentId !== agent.id || version.status !== "DEPLOYED") throw new AgentStateError("Runs must use the agent's deployed version.");
      let trigger: AgentTrigger | null = null;
      if (value.triggerId) {
        trigger = this.getTriggerRequired(value.triggerId);
        if (trigger.agentId !== agent.id || trigger.versionId !== version.id) throw new AgentStateError("Run trigger does not belong to the selected deployed version.");
        if (trigger.type !== (value.triggerType ?? trigger.type)) throw new AgentStateError("Run trigger type does not match the trigger.");
        if (trigger.type !== "MANUAL" && !trigger.enabled) throw new AgentStateError("The selected trigger is disabled.");
      }
      const triggerType = value.triggerType ?? trigger?.type ?? "MANUAL";
      if (value.triggerId === null && triggerType !== "MANUAL") {
        throw new Error("Non-manual runs require a trigger id.");
      }
      const runId = value.id ?? newRecordId("agent-run");
      const createdAt = nowIso();
      try {
        this.db.prepare(`
          INSERT INTO agent_runs (
            id, agent_id, version_id, trigger_id, initiated_by_id, trigger_type,
            status, principal_id, session_id, idempotency_key, correlation_id,
            input, model_id, created_at
          ) VALUES (
            @id, @agentId, @versionId, @triggerId, @initiatedById, @triggerType,
            'QUEUED', @principalId, @sessionId, @idempotencyKey, @correlationId,
            @input, @modelId, @createdAt
          )
        `).run({
          ...value,
          id: runId,
          agentId: agent.id,
          versionId: version.id,
          triggerId: trigger?.id ?? null,
          triggerType,
          input: value.input === null || value.input === undefined ? null : encodeJson(value.input, "Agent run input payload"),
          createdAt,
        });
      } catch (error) {
        if (isUniqueError(error, "idempotency_key")) {
          const existing = this.db.prepare(`${RUN_SELECT} WHERE idempotency_key = ?`).get(value.idempotencyKey);
          if (existing) {
            const parsed = parseRun(existing);
            if (parsed.agentId !== agent.id) throw new AgentConflictError("That idempotency key belongs to another agent.");
            return this.runDetail(parsed);
          }
        }
        throw error;
      }
      const queuedEventId = newRecordId("agent-event");
      this.db.prepare(
        "INSERT INTO agent_run_events (id, run_id, sequence, type, data, emitted_at) VALUES (?, ?, 0, ?, ?, ?)",
      ).run(queuedEventId, runId, "run.queued", encodeJson({ triggerType }, "Agent run event data"), createdAt);
      this.insertAudit({
        agentId: agent.id,
        versionId: version.id,
        runId,
        actorId: value.initiatedById ?? "system",
        actorType: "USER",
        type: "run.queued",
        summary: "Queued agent run",
        after: { status: "QUEUED", triggerType },
        requestId: value.idempotencyKey,
      });
      return this.getRunDetailRequired(runId);
    })();
  }

  /**
   * Queue a fresh manual run from a terminal run. The original run remains
   * immutable in history; its deployed version and JSON input are carried
   * forward so a retry is auditable and cannot silently pick up new input.
   */
  retryRun(id: string, actorId?: string): AgentRunDetail {
    const run = this.getRunRequired(id);
    if (run.status !== "FAILED" && run.status !== "CANCELLED") {
      throw statusError("agent run", run.id, run.status, "RETRY");
    }
    return this.queueRun(
      run.agentId,
      {
        versionId: run.versionId,
        triggerType: "MANUAL",
        initiatedById: actorId ?? run.initiatedById,
        principalId: run.principalId,
        sessionId: run.sessionId,
        input: run.input,
        modelId: run.modelId,
      },
      actorId,
    );
  }

  getRun(id: string): AgentRunDetail | null {
    const runId = identifier(id, "Agent run id");
    const row = this.db.prepare(`${RUN_SELECT} WHERE id = ?`).get(runId);
    if (row === undefined) return null;
    return this.runDetail(parseRun(row));
  }

  getRunRequired(id: string): AgentRunDetail {
    const run = this.getRun(id);
    if (!run) throw new RecordNotFoundError("agent run", id);
    return run;
  }

  listRuns(agentIdOrOptions: string | AgentRunListOptions, options: AgentRunListOptions = {}): AgentRunDetail[] {
    const object = typeof agentIdOrOptions === "string" ? { ...options, agentId: agentIdOrOptions } : agentIdOrOptions;
    const parsed = objectInput(object, "Agent run list options");
    assertKeys(parsed, new Set(["agentId", "versionId", "triggerId", "status", "limit", "offset", "includeEvents", "includeActions"]), "Agent run list options");
    const clauses: string[] = [];
    const params: Record<string, string | number> = { limit: bounded(parsed.limit as number | undefined, "Agent run list limit"), offset: normalizeOffset(parsed.offset as number | undefined) };
    if (parsed.agentId !== undefined) { params.agentId = identifier(parsed.agentId, "Agent id"); clauses.push("agent_id = @agentId"); }
    if (parsed.versionId !== undefined) { params.versionId = identifier(parsed.versionId, "Agent version id"); clauses.push("version_id = @versionId"); }
    if (parsed.triggerId !== undefined) { params.triggerId = identifier(parsed.triggerId, "Agent trigger id"); clauses.push("trigger_id = @triggerId"); }
    const statuses = normalizeListStatus(parsed.status as AgentRunStatus | readonly AgentRunStatus[] | undefined, AGENT_RUN_STATUSES, "agent run status");
    if (statuses.length > 0) { clauses.push(`status IN (${statuses.map((_, index) => `@status${index}`).join(", ")})`); statuses.forEach((status, index) => { params[`status${index}`] = status; }); }
    const rows = this.db.prepare(`${RUN_SELECT} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`).all(params) as unknown[];
    const includeEvents = parsed.includeEvents !== false;
    const includeActions = parsed.includeActions !== false;
    return rows.map((value) => this.runDetail(parseRun(value), includeEvents, includeActions));
  }

  /**
   * Return RUNNING runs whose dispatch lease has expired and that still have
   * no BB thread link. The query is intentionally bounded so a damaged or
   * abandoned queue cannot make one background sweep unbounded.
   */
  listOrphanedRunningRunIds(cutoff: Date | string, limit = 100): string[] {
    const cutoffAt = normalizeCutoff(cutoff, "Agent run lease cutoff");
    const rows = this.db.prepare(`
      SELECT r.id
      FROM agent_runs AS r
      WHERE r.status = 'RUNNING'
        AND r.started_at IS NOT NULL
        AND r.started_at <= @cutoffAt
        AND NOT EXISTS (
          SELECT 1
          FROM agent_thread_links AS l
          WHERE l.run_id = r.id
        )
      ORDER BY r.started_at ASC, r.id ASC
      LIMIT @limit
    `).all({ cutoffAt, limit: bounded(limit, "Agent orphan recovery limit") }) as Array<{ id?: unknown }>;
    return rows.map((row) => identifier(row.id, "Agent orphaned run id"));
  }

  /**
   * Renew the lease for one orphaned RUNNING run. This compare-and-set style
   * update lets only one dispatcher reclaim a stale row; a dispatcher that
   * was merely slow loses its old startedAt fence before it can link a thread.
   */
  reclaimOrphanedRun(
    id: string,
    cutoff: Date | string,
    actorId?: string,
  ): AgentRunDetail | null {
    const runId = identifier(id, "Agent run id");
    const cutoffAt = normalizeCutoff(cutoff, "Agent run lease cutoff");
    return this.db.transaction(() => {
      const before = this.getRunRequired(runId);
      if (before.status !== "RUNNING" || before.startedAt === null) return null;
      // A deletion fence wins over orphan recovery.  The deleter will cancel
      // this row (and clean up any linked worker) instead of allowing a stale
      // lease to become dispatchable again.
      if (this.getRequired(before.agentId).status === "DELETED") return null;
      if (new Date(before.startedAt).getTime() > new Date(cutoffAt).getTime()) return null;
      const linked = this.db.prepare(
        "SELECT 1 FROM agent_thread_links WHERE run_id = ? LIMIT 1",
      ).get(runId);
      if (linked) return null;

      const renewedStartedAt = nextLeaseTimestamp(before.startedAt);
      const update = this.db.prepare(`
        UPDATE agent_runs
        SET started_at = ?, finished_at = NULL,
            error_code = NULL, error_message = NULL
        WHERE id = ? AND status = 'RUNNING' AND started_at = ?
          AND NOT EXISTS (
            SELECT 1 FROM agent_thread_links WHERE run_id = agent_runs.id
          )
      `).run(renewedStartedAt, runId, before.startedAt);
      if (update.changes !== 1) return null;

      this.appendRunEvent(runId, "run.recovered", {
        reason: "Dispatch lease expired before a BB thread was linked.",
        previousStartedAt: before.startedAt,
      });
      this.insertAudit({
        agentId: before.agentId,
        versionId: before.versionId,
        runId,
        actorId: normalizeActor(actorId),
        actorType: "SYSTEM",
        type: "run.recovered",
        summary: "Recovered an orphaned agent run dispatch lease",
        before: { status: before.status, startedAt: before.startedAt },
        after: { status: "RUNNING", startedAt: renewedStartedAt },
      });
      return this.getRunDetailRequired(runId);
    })();
  }

  startRun(id: string, actorId?: string): AgentRunDetail {
    return this.transitionRun(id, "RUNNING", ["QUEUED"], actorId, "run.started", "Started agent run", (run, timestamp) => {
      this.db.prepare("UPDATE agent_runs SET started_at = ?, finished_at = NULL WHERE id = ?").run(timestamp, run.id);
    });
  }

  requestApproval(id: string, input?: AgentRunApprovalInput, actorId?: string): AgentRunDetail {
    const value = normalizeRunApproval(input);
    return this.transitionRun(id, "WAITING_FOR_APPROVAL", ["RUNNING"], actorId, "run.approval.requested", "Requested approval for agent run", (run, timestamp) => {
      this.db.prepare("UPDATE agent_runs SET approval_reason = ?, approval_requested_at = ? WHERE id = ?").run(value.reason ?? null, timestamp, run.id);
    }, { reason: value.reason ?? null });
  }

  approveRun(id: string, input?: AgentRunApprovalInput | string, actorId?: string): AgentRunDetail {
    const value = normalizeRunApproval(typeof input === "string" ? { approvedById: input } : input);
    const actor = actorId ?? value.approvedById ?? undefined;
    return this.transitionRun(id, "RUNNING", ["WAITING_FOR_APPROVAL"], actor, "run.approved", "Approved agent run", (run, timestamp) => {
      this.db.prepare("UPDATE agent_runs SET approved_at = ?, approved_by_id = ? WHERE id = ?").run(timestamp, value.approvedById ?? actor ?? "system", run.id);
    }, { approvedById: value.approvedById ?? actor ?? "system" });
  }

  succeedRun(id: string, input?: AgentRunSuccessInput, actorId?: string): AgentRunDetail {
    const value = normalizeRunSuccess(input);
    return this.db.transaction(() => {
      const run = this.getRunRequired(id);
      this.assertRunAgentNotDeleted(run);
      if (run.status !== "RUNNING") throw statusError("agent run", run.id, run.status, "SUCCEEDED");
      const timestamp = nowIso();
      const sets: string[] = ["status = 'SUCCEEDED'", "finished_at = @finishedAt"];
      const params: Record<string, string | number | null> = { id: run.id, finishedAt: timestamp };
      if (value.result !== undefined) { sets.push("result = @result"); params.result = value.result === null ? null : encodeJson(value.result, "Agent run result"); }
      if (value.summary !== undefined) { sets.push("summary = @summary"); params.summary = value.summary ?? null; }
      if (value.modelId !== undefined) { sets.push("model_id = @modelId"); params.modelId = value.modelId ?? null; }
      if (value.inputTokens !== undefined) { sets.push("input_tokens = @inputTokens"); params.inputTokens = value.inputTokens ?? null; }
      if (value.outputTokens !== undefined) { sets.push("output_tokens = @outputTokens"); params.outputTokens = value.outputTokens ?? null; }
      if (value.costUsd !== undefined) { sets.push("cost_usd = @costUsd"); params.costUsd = value.costUsd ?? null; }
      this.db.prepare(`UPDATE agent_runs SET ${sets.join(", ")} WHERE id = @id`).run(params);
      this.appendRunEvent(run.id, "run.succeeded", { summary: value.summary ?? run.summary });
      this.insertAudit({ agentId: run.agentId, versionId: run.versionId, runId: run.id, actorId: normalizeActor(actorId), actorType: "SYSTEM", type: "run.succeeded", summary: "Completed agent run", after: { status: "SUCCEEDED" } });
      return this.getRunDetailRequired(run.id);
    })();
  }

  failRun(id: string, input?: AgentRunFailureInput | string, actorId?: string): AgentRunDetail {
    const value = normalizeRunFailure(input);
    return this.db.transaction(() => {
      const run = this.getRunRequired(id);
      this.assertRunAgentNotDeleted(run);
      if (!(run.status === "QUEUED" || run.status === "RUNNING" || run.status === "WAITING_FOR_APPROVAL")) {
        throw statusError("agent run", run.id, run.status, "FAILED");
      }
      const timestamp = nowIso();
      this.db.prepare(`
        UPDATE agent_runs
        SET status = 'FAILED', finished_at = @finishedAt,
            error_code = @errorCode, error_message = @errorMessage,
            result = @result, summary = COALESCE(@summary, summary)
        WHERE id = @id
      `).run({
        id: run.id,
        finishedAt: timestamp,
        errorCode: value.errorCode ?? "RUN_FAILED",
        errorMessage: value.errorMessage ?? "Agent run failed.",
        result: value.result === null || value.result === undefined ? null : encodeJson(value.result, "Agent run result"),
        summary: value.summary ?? null,
      });
      this.appendRunEvent(run.id, "run.failed", { errorCode: value.errorCode ?? "RUN_FAILED", errorMessage: value.errorMessage ?? "Agent run failed." });
      this.insertAudit({ agentId: run.agentId, versionId: run.versionId, runId: run.id, actorId: normalizeActor(actorId), actorType: "SYSTEM", type: "run.failed", summary: "Failed agent run", after: { status: "FAILED", errorCode: value.errorCode ?? "RUN_FAILED" } });
      return this.getRunDetailRequired(run.id);
    })();
  }

  cancelRun(
    id: string,
    reasonOrActor?: string,
    actorId?: string,
    errorCode = "CANCELLED",
  ): AgentRunDetail & { cancelled: boolean } {
    const runId = identifier(id, "Agent run id");
    const reason = reasonOrActor && actorId ? requiredText(reasonOrActor, "Agent cancellation reason") : "Cancelled by user.";
    const actor = actorId ?? (reasonOrActor && !actorId ? reasonOrActor : undefined);
    const cancellationCode = requiredText(errorCode, "Agent cancellation code");
    return this.db.transaction(() => {
      const run = this.getRunRequired(runId);
      if (!(run.status === "QUEUED" || run.status === "RUNNING" || run.status === "WAITING_FOR_APPROVAL")) {
        return { ...run, events: run.events, actions: run.actions, cancelled: false };
      }
      const timestamp = nowIso();
      this.db.prepare(`
        UPDATE agent_runs
        SET status = 'CANCELLED', finished_at = @finishedAt,
            cancel_requested_at = @cancelRequestedAt,
            error_code = @errorCode, error_message = @errorMessage
        WHERE id = @id
      `).run({ id: run.id, finishedAt: timestamp, cancelRequestedAt: timestamp, errorCode: cancellationCode, errorMessage: reason });
      this.db.prepare(`
        UPDATE agent_actions
        SET status = 'CANCELLED', completed_at = @completedAt,
            error_code = @errorCode, error_message = @errorMessage
        WHERE run_id = @runId AND status IN ('PLANNED', 'RUNNING')
      `).run({ runId: run.id, completedAt: timestamp, errorCode: cancellationCode, errorMessage: reason });
      this.appendRunEvent(run.id, "run.cancelled", { reason, errorCode: cancellationCode });
      this.insertAudit({ agentId: run.agentId, versionId: run.versionId, runId: run.id, actorId: normalizeActor(actor), actorType: "USER", type: "run.cancelled", summary: "Cancelled agent run", after: { status: "CANCELLED", reason, errorCode: cancellationCode }, requestId: run.id });
      return { ...this.getRunDetailRequired(run.id), cancelled: true };
    })();
  }

  listRunEvents(runId: string, limit?: number, offset?: number): AgentRunEvent[] {
    const id = identifier(runId, "Agent run id");
    return (this.db.prepare(`${EVENT_SELECT} WHERE run_id = ? ORDER BY sequence ASC LIMIT ? OFFSET ?`).all(id, bounded(limit, "Agent run event limit"), normalizeOffset(offset)) as unknown[]).map(parseEvent);
  }

  createAction(
    runIdOrInput: string | AgentActionCreateInput,
    inputOrActor?: AgentActionCreateInput | string,
    actorId?: string,
  ): AgentAction {
    const normalized = normalizeActionInput(
      runIdOrInput,
      typeof inputOrActor === "object" ? inputOrActor : undefined,
      actorId ?? (typeof inputOrActor === "string" ? inputOrActor : undefined),
    );
    const value = normalizeActionCreate(normalized.value, normalized.runId);
    return this.db.transaction(() => {
      const run = this.getRunRequired(value.runId);
      const agentId = value.agentId ?? run.agentId;
      if (agentId !== run.agentId) throw new AgentStateError("Agent action does not belong to the run's agent.");
      const plannedAt = nowIso();
      const actionId = value.id ?? newRecordId("agent-action");
      try {
        this.db.prepare(`
          INSERT INTO agent_actions (
            id, agent_id, run_id, type, provider, target_type, target_id,
            target_label, summary, metadata, status, idempotency_key,
            request_hash, external_id, planned_at, updated_at
          ) VALUES (
            @id, @agentId, @runId, @type, @provider, @targetType, @targetId,
            @targetLabel, @summary, @metadata, @status, @idempotencyKey,
            @requestHash, @externalId, @plannedAt, @plannedAt
          )
        `).run({
          ...value,
          id: actionId,
          agentId,
          metadata: value.metadata === null || value.metadata === undefined ? null : encodeJson(value.metadata, "Agent action metadata"),
          plannedAt,
        });
      } catch (error) {
        if (isUniqueError(error, "idempotency_key")) {
          const existing = this.db.prepare(`${ACTION_SELECT} WHERE idempotency_key = ?`).get(value.idempotencyKey);
          if (existing) {
            const parsed = parseAction(existing);
            if (parsed.runId !== run.id) throw new AgentConflictError("That action idempotency key belongs to another run.");
            return parsed;
          }
        }
        throw error;
      }
      const action = this.getActionRequired(actionId);
      this.insertAudit({ agentId, versionId: run.versionId, runId: run.id, actorId: normalizeActor(normalized.actorId), actorType: "SYSTEM", type: "action.planned", summary: `Planned ${action.type} action`, after: { actionId: action.id, status: action.status } });
      return action;
    })();
  }

  getAction(id: string): AgentAction | null {
    const actionId = identifier(id, "Agent action id");
    const row = this.db.prepare(`${ACTION_SELECT} WHERE id = ?`).get(actionId);
    return row === undefined ? null : parseAction(row);
  }

  getActionRequired(id: string): AgentAction {
    const action = this.getAction(id);
    if (!action) throw new RecordNotFoundError("agent action", id);
    return action;
  }

  listActions(runId: string, limit?: number, offset?: number): AgentAction[] {
    const id = identifier(runId, "Agent run id");
    return (this.db.prepare(`${ACTION_SELECT} WHERE run_id = ? ORDER BY planned_at ASC, id ASC LIMIT ? OFFSET ?`).all(id, bounded(limit, "Agent action list limit"), normalizeOffset(offset)) as unknown[]).map(parseAction);
  }

  updateAction(id: string, input: AgentActionUpdateInput, actorId?: string): AgentAction {
    const actionId = identifier(id, "Agent action id");
    const value = normalizeActionUpdate(input);
    return this.db.transaction(() => {
      const before = this.getActionRequired(actionId);
      const sets: string[] = [];
      const params: Record<string, string | number | null> = { id: actionId };
      const mutable: Array<[keyof AgentActionUpdateInput, string, (value: unknown) => string | number | null]> = [
        ["type", "type", (value) => value as string],
        ["provider", "provider", (value) => value as string],
        ["targetType", "target_type", (value) => value as string | null],
        ["targetId", "target_id", (value) => value as string | null],
        ["targetLabel", "target_label", (value) => value as string | null],
        ["summary", "summary", (value) => value as string],
        ["requestHash", "request_hash", (value) => value as string | null],
        ["externalId", "external_id", (value) => value as string | null],
        ["attemptCount", "attempt_count", (value) => value as number],
        ["errorCode", "error_code", (value) => value as string | null],
        ["errorMessage", "error_message", (value) => value as string | null],
      ];
      for (const [key, column, convert] of mutable) {
        if (value[key] !== undefined) {
          const param = key;
          sets.push(`${column} = @${param}`);
          params[param] = convert(value[key]);
        }
      }
      if (value.metadata !== undefined) { sets.push("metadata = @metadata"); params.metadata = value.metadata === null ? null : encodeJson(value.metadata, "Agent action metadata"); }
      if (value.status !== undefined) { assertActionTransition(before.status, value.status, before.id); sets.push("status = @status"); params.status = value.status; }
      sets.push("updated_at = @updatedAt"); params.updatedAt = nowIso();
      this.db.prepare(`UPDATE agent_actions SET ${sets.join(", ")} WHERE id = @id`).run(params);
      const after = this.getActionRequired(actionId);
      this.insertAudit({ agentId: after.agentId, runId: after.runId, actorId: normalizeActor(actorId), actorType: "SYSTEM", type: "action.updated", summary: `Updated ${after.type} action`, before: { status: before.status }, after: { status: after.status } });
      return after;
    })();
  }

  startAction(id: string, actorId?: string): AgentAction {
    return this.updateAction(id, { status: "RUNNING", attemptCount: this.getActionRequired(id).attemptCount + 1 }, actorId);
  }

  succeedAction(id: string, externalId?: string | null, actorId?: string): AgentAction {
    return this.updateAction(id, { status: "SUCCEEDED", externalId: externalId ?? undefined }, actorId);
  }

  failAction(id: string, errorMessage?: string, actorId?: string): AgentAction {
    return this.updateAction(id, { status: "FAILED", errorMessage: errorMessage ?? "Agent action failed." }, actorId);
  }

  cancelAction(id: string, errorMessage?: string, actorId?: string): AgentAction {
    return this.updateAction(id, { status: "CANCELLED", errorCode: "CANCELLED", errorMessage: errorMessage ?? "Cancelled by user." }, actorId);
  }

  linkThread(
    agentIdOrInput: string | AgentThreadLinkInput,
    inputOrActor?: AgentThreadLinkInput | string,
    actorId?: string,
    expectedStartedAt?: string,
  ): AgentThreadLink {
    const normalized = normalizeThreadInput(
      agentIdOrInput,
      typeof inputOrActor === "object" ? inputOrActor : undefined,
      actorId ?? (typeof inputOrActor === "string" ? inputOrActor : undefined),
    );
    const value = normalizeThreadCreate(normalized.value, normalized.agentId);
    return this.db.transaction(() => {
      const agent = this.getRequired(value.agentId);
      if (agent.status === "DELETED") throw new RecordNotFoundError("agent", agent.id);
      let run: AgentRunDetail | null = null;
      if (value.runId) {
        run = this.getRunRequired(value.runId);
        if (run.agentId !== agent.id) throw new AgentStateError("Thread run does not belong to the agent.");
        if (expectedStartedAt !== undefined &&
          (run.status !== "RUNNING" || run.startedAt !== expectedStartedAt)) {
          throw new AgentConflictError("The agent run dispatch lease is no longer owned by this dispatcher.");
        }
      }
      if (value.versionId) {
        const version = this.getVersionRequired(value.versionId);
        if (version.agentId !== agent.id) throw new AgentStateError("Thread version does not belong to the agent.");
      }
      const createdAt = nowIso();
      const linkId = value.id ?? newRecordId("agent-thread");
      try {
        this.db.prepare(`
          INSERT INTO agent_thread_links (
            id, agent_id, thread_id, kind, run_id, version_id,
            record_type, record_id, summary, created_at, updated_at
          ) VALUES (
            @id, @agentId, @threadId, @kind, @runId, @versionId,
            @recordType, @recordId, @summary, @createdAt, @createdAt
          )
        `).run({ ...value, id: linkId, createdAt });
      } catch (error) {
        if (isUniqueError(error, "thread_id")) throw new AgentConflictError(`Thread ${value.threadId} is already linked.`);
        throw error;
      }
      const link = this.getThreadRequired(linkId);
      this.insertAudit({ agentId: agent.id, versionId: value.versionId, runId: value.runId, actorId: normalizeActor(normalized.actorId), actorType: "USER", type: "thread.linked", summary: `Linked BB thread ${link.threadId}`, after: { threadId: link.threadId, kind: link.kind } });
      return link;
    })();
  }

  getThread(id: string): AgentThreadLink | null {
    const linkId = identifier(id, "Agent thread link id");
    const row = this.db.prepare(`${THREAD_SELECT} WHERE id = ?`).get(linkId);
    return row === undefined ? null : parseThread(row);
  }

  getThreadRequired(id: string): AgentThreadLink {
    const link = this.getThread(id);
    if (!link) throw new RecordNotFoundError("agent thread link", id);
    return link;
  }

  listThreads(agentId: string, options: AgentThreadListOptions = {}): AgentThreadLink[] {
    const id = identifier(agentId, "Agent id");
    const object = objectInput(options, "Agent thread list options");
    assertKeys(object, new Set(["kind", "runId", "recordType", "recordId", "limit", "offset"]), "Agent thread list options");
    const clauses = ["agent_id = @agentId"];
    const params: Record<string, string | number> = { agentId: id, limit: bounded(object.limit as number | undefined, "Agent thread list limit"), offset: normalizeOffset(object.offset as number | undefined) };
    if (object.kind !== undefined) { params.kind = assertEnum(object.kind, AGENT_THREAD_KINDS, "agent thread kind"); clauses.push("kind = @kind"); }
    if (object.runId !== undefined) { params.runId = identifier(object.runId, "Agent run id"); clauses.push("run_id = @runId"); }
    if (object.recordType !== undefined) { params.recordType = assertEnum(object.recordType, AGENT_RECORD_TYPES, "agent thread record type"); clauses.push("record_type = @recordType"); }
    if (object.recordId !== undefined) { params.recordId = identifier(object.recordId, "Agent thread record id"); clauses.push("record_id = @recordId"); }
    return (this.db.prepare(`${THREAD_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`).all(params) as unknown[]).map(parseThread);
  }

  unlinkThread(id: string, actorId?: string): { id: string } {
    const linkId = identifier(id, "Agent thread link id");
    return this.db.transaction(() => {
      const link = this.getThreadRequired(linkId);
      this.db.prepare("DELETE FROM agent_thread_links WHERE id = ?").run(linkId);
      this.insertAudit({ agentId: link.agentId, versionId: link.versionId, runId: link.runId, actorId: normalizeActor(actorId), actorType: "USER", type: "thread.unlinked", summary: `Unlinked BB thread ${link.threadId}`, before: { threadId: link.threadId, kind: link.kind } });
      return { id: linkId };
    })();
  }

  listAudit(agentIdOrOptions: string | AgentAuditListOptions, options: AgentAuditListOptions = {}): AgentAuditEvent[] {
    const object = typeof agentIdOrOptions === "string" ? { ...options, agentId: agentIdOrOptions } : agentIdOrOptions;
    const parsed = objectInput(object, "Agent audit list options");
    assertKeys(parsed, new Set(["agentId", "versionId", "runId", "type", "limit", "offset"]), "Agent audit list options");
    const clauses: string[] = [];
    const params: Record<string, string | number> = { limit: bounded(parsed.limit as number | undefined, "Agent audit list limit"), offset: normalizeOffset(parsed.offset as number | undefined) };
    if (parsed.agentId !== undefined) { params.agentId = identifier(parsed.agentId, "Agent id"); clauses.push("agent_id = @agentId"); }
    if (parsed.versionId !== undefined) { params.versionId = identifier(parsed.versionId, "Agent version id"); clauses.push("version_id = @versionId"); }
    if (parsed.runId !== undefined) { params.runId = identifier(parsed.runId, "Agent run id"); clauses.push("run_id = @runId"); }
    if (parsed.type !== undefined) { params.type = requiredText(stringValue(parsed.type, "Agent audit type"), "Agent audit type"); clauses.push("type = @type"); }
    return (this.db.prepare(`${AUDIT_SELECT} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY emitted_at DESC, id DESC LIMIT @limit OFFSET @offset`).all(params) as unknown[]).map(parseAudit);
  }

  listRunAudit(runId: string, options: Omit<AgentAuditListOptions, "runId"> = {}): AgentAuditEvent[] {
    return this.listAudit({ ...options, runId });
  }

  audit(agentId: string, options: Omit<AgentAuditListOptions, "agentId"> = {}): AgentAuditEvent[] {
    return this.listAudit({ ...options, agentId });
  }

  private getRunDetailRequired(id: string): AgentRunDetail {
    const run = this.getRun(id);
    if (!run) throw new RecordNotFoundError("agent run", id);
    return run;
  }

  private runDetail(run: AgentRun, includeEvents = true, includeActions = true): AgentRunDetail {
    return {
      ...run,
      events: includeEvents ? this.listRunEvents(run.id) : [],
      actions: includeActions ? this.listActions(run.id) : [],
    };
  }

  private appendRunEvent(runId: string, type: string, data: AgentJsonValue): AgentRunEvent {
    const run = this.db.prepare("SELECT next_event_sequence AS nextEventSequence FROM agent_runs WHERE id = ?").get(runId) as { nextEventSequence: number } | undefined;
    if (!run) throw new RecordNotFoundError("agent run", runId);
    const sequence = nonNegativeInteger(run.nextEventSequence, "Agent next event sequence") + 1;
    const emittedAt = nowIso();
    this.db.prepare("UPDATE agent_runs SET next_event_sequence = ? WHERE id = ?").run(sequence, runId);
    const eventId = newRecordId("agent-event");
    this.db.prepare("INSERT INTO agent_run_events (id, run_id, sequence, type, data, emitted_at) VALUES (?, ?, ?, ?, ?, ?)").run(eventId, runId, sequence, requiredText(type, "Agent run event type"), encodeJson(data, "Agent run event data"), emittedAt);
    return parseEvent(this.db.prepare(`${EVENT_SELECT} WHERE id = ?`).get(eventId));
  }

  private transitionRun(
    id: string,
    next: AgentRunStatus,
    allowed: readonly AgentRunStatus[],
    actorId: string | undefined,
    auditType: string,
    summary: string,
    mutate?: (run: AgentRun, timestamp: string) => void,
    eventData: AgentJsonValue = {},
  ): AgentRunDetail {
    return this.db.transaction(() => {
      const run = this.getRunRequired(id);
      this.assertRunAgentNotDeleted(run);
      if (!allowed.includes(run.status)) throw statusError("agent run", run.id, run.status, next);
      const timestamp = nowIso();
      this.db.prepare("UPDATE agent_runs SET status = ? WHERE id = ?").run(next, run.id);
      mutate?.(run, timestamp);
      this.appendRunEvent(run.id, auditType, eventData);
      this.insertAudit({ agentId: run.agentId, versionId: run.versionId, runId: run.id, actorId: normalizeActor(actorId), actorType: "SYSTEM", type: auditType, summary, before: { status: run.status }, after: { status: next } });
      return this.getRunDetailRequired(run.id);
    })();
  }

  private assertRunAgentNotDeleted(run: AgentRun): void {
    if (this.getRequired(run.agentId).status === "DELETED") {
      throw new AgentStateError(`Cannot transition run ${run.id}; agent ${run.agentId} is DELETED.`);
    }
  }

  private transitionVersion(
    id: string,
    next: AgentVersionStatus,
    allowed: readonly AgentVersionStatus[],
    actorId?: string,
    validation?: AgentJsonValue | null,
  ): AgentVersion {
    const versionId = identifier(id, "Agent version id");
    return this.db.transaction(() => {
      const before = this.getVersionRequired(versionId);
      if (!allowed.includes(before.status)) throw statusError("agent version", versionId, before.status, next);
      const validationText = validation === undefined ? undefined : validation === null ? null : encodeJson(validation, "Agent version validation");
      if (validation !== undefined) {
        this.db.prepare("UPDATE agent_versions SET validation = ? WHERE id = ?").run(validationText, versionId);
      }
      this.db.prepare("UPDATE agent_versions SET status = ? WHERE id = ?").run(next, versionId);
      const after = this.getVersionRequired(versionId);
      this.insertAudit({ agentId: after.agentId, versionId, actorId: normalizeActor(actorId), actorType: "USER", type: "agent.version.validated", summary: `Marked version ${after.number} ready`, before: { status: before.status }, after: { status: after.status } });
      return after;
    })();
  }

  private changeDefinitionStatus(
    id: string,
    next: AgentDefinitionStatus,
    allowed: readonly AgentDefinitionStatus[],
    actorId: string | undefined,
    auditType: string,
    summary: string,
    archive = false,
    restoring = false,
  ): AgentDefinition {
    const agentId = identifier(id, "Agent id");
    return this.db.transaction(() => {
      const before = this.getRequired(agentId);
      if (!allowed.includes(before.status)) throw statusError("agent", agentId, before.status, next);
      const timestamp = nowIso();
      const archivedAt = archive ? timestamp : restoring ? null : before.archivedAt;
      this.db.prepare("UPDATE agent_definitions SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?").run(next, archivedAt, timestamp, agentId);
      if (next === "PAUSED" || next === "ARCHIVED") {
        this.db.prepare("UPDATE agent_triggers SET enabled = 0, next_run_at = NULL WHERE agent_id = ?").run(agentId);
      }
      const after = this.getRequired(agentId);
      this.insertAudit({ agentId, actorId: normalizeActor(actorId ?? before.createdById), actorType: "USER", type: auditType, summary, before: { status: before.status }, after: { status: after.status } });
      return after;
    })();
  }

  private deployArgs(
    agentIdOrInput: string | { id?: string; agentId?: string; versionId: string; actorId?: string; requestId?: string; clientRequestId?: string },
    versionOrActor?: string | { versionId: string; actorId?: string; requestId?: string; clientRequestId?: string },
    actorId?: string,
  ): { agentId: string; versionId: string; actorId: string; requestId?: string } {
    if (typeof agentIdOrInput === "string") {
      if (typeof versionOrActor === "string") return { agentId: identifier(agentIdOrInput, "Agent id"), versionId: identifier(versionOrActor, "Agent version id"), actorId: normalizeActor(actorId) };
      if (!versionOrActor) throw new Error("Agent version id is required.");
      return { agentId: identifier(agentIdOrInput, "Agent id"), versionId: identifier(versionOrActor.versionId, "Agent version id"), actorId: normalizeActor(versionOrActor.actorId ?? actorId), requestId: versionOrActor.requestId ?? versionOrActor.clientRequestId };
    }
    const object = objectInput(agentIdOrInput, "Agent deploy input");
    assertKeys(object, new Set(["id", "agentId", "versionId", "actorId", "requestId", "clientRequestId"]), "Agent deploy input");
    return {
      agentId: identifier(object.id ?? object.agentId, "Agent id"),
      versionId: identifier(object.versionId, "Agent version id"),
      actorId: normalizeActor(object.actorId ?? actorId),
      requestId: object.requestId === undefined && object.clientRequestId === undefined
        ? undefined
        : identifier(object.requestId ?? object.clientRequestId, "Agent deployment request id"),
    };
  }

  private insertAudit(input: {
    agentId: string;
    versionId?: string | null;
    runId?: string | null;
    actorUserId?: string | null;
    actorType?: string;
    actorId?: string | null;
    type: string;
    summary: string;
    before?: AgentJsonValue | null;
    after?: AgentJsonValue | null;
    requestId?: string | null;
  }): AgentAuditEvent {
    const id = newRecordId("agent-audit");
    const emittedAt = nowIso();
    this.db.prepare(`
      INSERT INTO agent_audit_events (
        id, agent_id, version_id, run_id, actor_user_id, actor_type,
        actor_id, type, summary, before, after, request_id, emitted_at
      ) VALUES (
        @id, @agentId, @versionId, @runId, @actorUserId, @actorType,
        @actorId, @type, @summary, @before, @after, @requestId, @emittedAt
      )
    `).run({
      id,
      agentId: identifier(input.agentId, "Agent audit agent id"),
      versionId: input.versionId ?? null,
      runId: input.runId ?? null,
      actorUserId: input.actorUserId ?? input.actorId ?? null,
      actorType: requiredText(input.actorType ?? "SYSTEM", "Agent audit actor type"),
      actorId: input.actorId ?? null,
      type: requiredText(input.type, "Agent audit type"),
      summary: requiredText(input.summary, "Agent audit summary"),
      before: input.before === undefined || input.before === null ? null : encodeJson(input.before, "Agent audit before"),
      after: input.after === undefined || input.after === null ? null : encodeJson(input.after, "Agent audit after"),
      requestId: input.requestId ?? null,
      emittedAt,
    });
    return parseAudit(this.db.prepare(`${AUDIT_SELECT} WHERE id = ?`).get(id));
  }
}

function assertActionTransition(current: AgentActionStatus, next: AgentActionStatus, id: string): void {
  if (current === next) return;
  const valid = (current === "PLANNED" && ["RUNNING", "FAILED", "CANCELLED"].includes(next)) ||
    (current === "RUNNING" && ["SUCCEEDED", "FAILED", "CANCELLED"].includes(next));
  if (!valid) throw statusError("agent action", id, current, next);
}

export function createAgentStore(db: Db): AgentStore {
  return new AgentStore(db);
}

export function createAgent(db: Db, input: AgentCreateInput, actorId?: string): AgentDefinition {
  return new AgentStore(db).create(input, actorId);
}

export function getAgent(db: Db, id: string): AgentDefinition | null {
  return new AgentStore(db).get(id);
}

export function getAgentDetail(db: Db, id: string): AgentDetail | null {
  return new AgentStore(db).detail(id);
}

export function listAgents(db: Db, options: AgentListOptions = {}): AgentListItem[] {
  return new AgentStore(db).list(options);
}

export function updateAgent(db: Db, id: string, input: AgentUpdateInput, actorId?: string): AgentDefinition {
  return new AgentStore(db).update(id, input, actorId);
}

export function createAgentVersion(db: Db, agentId: string, input: AgentVersionCreateInput, actorId?: string): AgentVersion {
  return new AgentStore(db).createVersion(agentId, input, actorId);
}

export function getAgentVersion(db: Db, id: string): AgentVersion | null {
  return new AgentStore(db).getVersion(id);
}

export function listAgentVersions(db: Db, agentId: string, options: AgentVersionListOptions = {}): AgentVersion[] {
  return new AgentStore(db).listVersions(agentId, options);
}

export function validateAgentVersion(db: Db, id: string, validation?: AgentJsonValue | null, actorId?: string): AgentVersion {
  return new AgentStore(db).validateVersion(id, validation, actorId);
}

export function deployAgent(db: Db, agentIdOrInput: string | { id?: string; agentId?: string; versionId: string; actorId?: string; requestId?: string; clientRequestId?: string }, versionOrActor?: string | { versionId: string; actorId?: string; requestId?: string; clientRequestId?: string }, actorId?: string): { id: string; versionId: string; status: "LIVE" } {
  return new AgentStore(db).deploy(agentIdOrInput, versionOrActor, actorId);
}

export function pauseAgent(db: Db, id: string, actorId?: string): AgentDefinition {
  return new AgentStore(db).pause(id, actorId);
}

export function resumeAgent(db: Db, id: string, actorId?: string): AgentDefinition {
  return new AgentStore(db).resume(id, actorId);
}

export function archiveAgent(db: Db, id: string, actorId?: string): AgentDefinition {
  return new AgentStore(db).archive(id, actorId);
}

/** Soft-delete an agent and cancel its persisted active runs. */
export function deleteAgent(db: Db, id: string, actorId?: string): AgentDeletionResult {
  return new AgentStore(db).remove(id, actorId);
}

export function restoreAgent(db: Db, id: string, actorId?: string): AgentDefinition {
  return new AgentStore(db).restore(id, actorId);
}

export function createAgentTrigger(db: Db, agentIdOrInput: string | AgentTriggerCreateInput, inputOrActor?: AgentTriggerCreateInput | string, actorId?: string): AgentTrigger {
  return new AgentStore(db).createTrigger(agentIdOrInput, inputOrActor, actorId);
}

export function getAgentTrigger(db: Db, id: string): AgentTrigger | null {
  return new AgentStore(db).getTrigger(id);
}

export function listAgentTriggers(db: Db, agentId: string, options: AgentTriggerListOptions = {}): AgentTrigger[] {
  return new AgentStore(db).listTriggers(agentId, options);
}

export function updateAgentTrigger(db: Db, id: string, input: AgentTriggerUpdateInput, actorId?: string): AgentTrigger {
  return new AgentStore(db).updateTrigger(id, input, actorId);
}

export function deleteAgentTrigger(db: Db, id: string, actorId?: string): { id: string } {
  return new AgentStore(db).deleteTrigger(id, actorId);
}

export function enableAgentTrigger(db: Db, id: string, enabled = true, actorId?: string): AgentTrigger {
  return new AgentStore(db).enableTrigger(id, enabled, actorId);
}

export function queueAgentRun(db: Db, agentIdOrInput: string | AgentRunQueueInput, inputOrActor?: AgentRunQueueInput | string, actorId?: string): AgentRunDetail {
  return new AgentStore(db).queueRun(agentIdOrInput, inputOrActor, actorId);
}

export function retryAgentRun(db: Db, id: string, actorId?: string): AgentRunDetail {
  return new AgentStore(db).retryRun(id, actorId);
}

export function getAgentRun(db: Db, id: string): AgentRunDetail | null {
  return new AgentStore(db).getRun(id);
}

export function listAgentRuns(db: Db, agentIdOrOptions: string | AgentRunListOptions, options: AgentRunListOptions = {}): AgentRunDetail[] {
  return new AgentStore(db).listRuns(agentIdOrOptions, options);
}

export function startAgentRun(db: Db, id: string, actorId?: string): AgentRunDetail {
  return new AgentStore(db).startRun(id, actorId);
}

export function requestAgentRunApproval(db: Db, id: string, input?: AgentRunApprovalInput, actorId?: string): AgentRunDetail {
  return new AgentStore(db).requestApproval(id, input, actorId);
}

export function approveAgentRun(db: Db, id: string, input?: AgentRunApprovalInput | string, actorId?: string): AgentRunDetail {
  return new AgentStore(db).approveRun(id, input, actorId);
}

export function succeedAgentRun(db: Db, id: string, input?: AgentRunSuccessInput, actorId?: string): AgentRunDetail {
  return new AgentStore(db).succeedRun(id, input, actorId);
}

export function failAgentRun(db: Db, id: string, input?: AgentRunFailureInput | string, actorId?: string): AgentRunDetail {
  return new AgentStore(db).failRun(id, input, actorId);
}

export function cancelAgentRun(db: Db, id: string, reasonOrActor?: string, actorId?: string, errorCode?: string): AgentRunDetail & { cancelled: boolean } {
  return new AgentStore(db).cancelRun(id, reasonOrActor, actorId, errorCode);
}

export function createAgentAction(db: Db, runIdOrInput: string | AgentActionCreateInput, inputOrActor?: AgentActionCreateInput | string, actorId?: string): AgentAction {
  return new AgentStore(db).createAction(runIdOrInput, inputOrActor, actorId);
}

export function getAgentAction(db: Db, id: string): AgentAction | null {
  return new AgentStore(db).getAction(id);
}

export function listAgentActions(db: Db, runId: string, limit?: number, offset?: number): AgentAction[] {
  return new AgentStore(db).listActions(runId, limit, offset);
}

export function updateAgentAction(db: Db, id: string, input: AgentActionUpdateInput, actorId?: string): AgentAction {
  return new AgentStore(db).updateAction(id, input, actorId);
}

export function startAgentAction(db: Db, id: string, actorId?: string): AgentAction {
  return new AgentStore(db).startAction(id, actorId);
}

export function succeedAgentAction(db: Db, id: string, externalId?: string | null, actorId?: string): AgentAction {
  return new AgentStore(db).succeedAction(id, externalId, actorId);
}

export function failAgentAction(db: Db, id: string, errorMessage?: string, actorId?: string): AgentAction {
  return new AgentStore(db).failAction(id, errorMessage, actorId);
}

export function cancelAgentAction(db: Db, id: string, errorMessage?: string, actorId?: string): AgentAction {
  return new AgentStore(db).cancelAction(id, errorMessage, actorId);
}

export function linkAgentThread(db: Db, agentIdOrInput: string | AgentThreadLinkInput, inputOrActor?: AgentThreadLinkInput | string, actorId?: string): AgentThreadLink {
  return new AgentStore(db).linkThread(agentIdOrInput, inputOrActor, actorId);
}

export function getAgentThread(db: Db, id: string): AgentThreadLink | null {
  return new AgentStore(db).getThread(id);
}

export function listAgentThreads(db: Db, agentId: string, options: AgentThreadListOptions = {}): AgentThreadLink[] {
  return new AgentStore(db).listThreads(agentId, options);
}

export function unlinkAgentThread(db: Db, id: string, actorId?: string): { id: string } {
  return new AgentStore(db).unlinkThread(id, actorId);
}

export function listAgentAudit(db: Db, agentIdOrOptions: string | AgentAuditListOptions, options: AgentAuditListOptions = {}): AgentAuditEvent[] {
  return new AgentStore(db).listAudit(agentIdOrOptions, options);
}

export function listAgentRunAudit(db: Db, runId: string, options: Omit<AgentAuditListOptions, "runId"> = {}): AgentAuditEvent[] {
  return new AgentStore(db).listRunAudit(runId, options);
}
