import { AgentStore } from "./agents.js";
import { requiredText, type Db } from "./types.js";

/** CRM record kinds whose durable agent artifacts can be purged. */
export const PURGE_RECORD_TYPES = ["COMPANY", "CONTACT", "DEAL"] as const;
export type PurgeRecordType = (typeof PURGE_RECORD_TYPES)[number];

const ACTIVE_RUN_STATUSES = new Set([
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
]);

const TARGET_TYPE_KEYS = new Set([
  "recordtype",
  "recordkind",
  "entity",
  "kind",
  "type",
]);

const TARGET_ID_KEYS = new Set(["recordid", "id"]);

export interface PurgeRecordArtifactsOptions {
  /** Audit actor used by the existing agent cancellation lifecycle. */
  actorId?: string;
  /** Cancellation message retained on active runs and their actions. */
  reason?: string;
}

export interface PurgeRecordArtifactsResult {
  entity: PurgeRecordType;
  recordId: string;
  /** All runs whose JSON input identified the purged record, including terminal runs. */
  matchedRunIds: string[];
  /** Only nonterminal matched runs; these are retained but moved to CANCELLED. */
  cancelledRunIds: string[];
  /** Record- or run-linked thread rows removed as dangling purge artifacts. */
  removedThreadLinkIds: string[];
  /** Pending, unprocessed outbox rows removed for the purged record. */
  removedPendingEventIds: string[];
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeRecordType(value: string): PurgeRecordType {
  const candidate = requiredText(value, "Purge record type").toUpperCase();
  if ((PURGE_RECORD_TYPES as readonly string[]).includes(candidate)) {
    return candidate as PurgeRecordType;
  }
  throw new Error(`Invalid purge record type: ${candidate}.`);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeMatches(value: unknown, recordType: PurgeRecordType): boolean {
  return typeof value === "string" && value.trim().toUpperCase() === recordType;
}

/**
 * Agent inputs are intentionally extensible. Match only the source-compatible
 * record/entity pairs and direct CRM foreign-key-shaped fields; do not treat a
 * bare arbitrary `id` as a CRM record target. Recursing lets event, activity,
 * webhook, and enrichment payloads use the same cleanup policy.
 */
function inputTargetsRecord(
  value: unknown,
  recordType: PurgeRecordType,
  recordId: string,
): boolean {
  if (Array.isArray(value)) return value.some((item) => inputTargetsRecord(item, recordType, recordId));
  if (!isJsonObject(value)) return false;

  let hasMatchingType = false;
  let hasMatchingId = false;
  const directIdKey = `${recordType.toLowerCase()}id`;

  for (const [rawKey, candidate] of Object.entries(value)) {
    const key = normalizeKey(rawKey);
    if (TARGET_TYPE_KEYS.has(key) && typeMatches(candidate, recordType)) {
      hasMatchingType = true;
    }
    if (TARGET_ID_KEYS.has(key) && candidate === recordId) {
      hasMatchingId = true;
    }
    if (key === directIdKey && candidate === recordId) {
      return true;
    }
  }

  if (hasMatchingType && hasMatchingId) return true;
  return Object.values(value).some((child) => inputTargetsRecord(child, recordType, recordId));
}

function parseRunInput(value: unknown): unknown {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // The schema rejects malformed JSON, but tolerate legacy/corrupt rows and
    // leave them untouched rather than broadening a purge match.
    return null;
  }
}

interface AgentRunTargetRow {
  id?: unknown;
  status?: unknown;
  input?: unknown;
}

/**
 * Cancel active record-targeted runs, unlink their record/run threads, and
 * discard only unprocessed CRM events. Run rows, run events, actions, audits,
 * processed outbox history, and unrelated thread links remain available for
 * audit. This transaction is deliberately DB-only so purge callers can invoke
 * it immediately before or after deleting the CRM row.
 */
export function purgeRecordArtifacts(
  db: Db,
  recordType: string,
  recordId: string,
  options: PurgeRecordArtifactsOptions = {},
): PurgeRecordArtifactsResult {
  const entity = normalizeRecordType(recordType);
  const id = requiredText(recordId, "Purge record id");
  const actorId = options.actorId === undefined
    ? "crm-record-purge"
    : requiredText(options.actorId, "Purge cancellation actor");
  const reason = options.reason === undefined
    ? `The ${entity.toLowerCase()} ${id} was purged before this agent run completed.`
    : requiredText(options.reason, "Purge cancellation reason");

  return db.transaction(() => {
    const rows = db.prepare(
      "SELECT id, status, input FROM agent_runs ORDER BY created_at ASC, id ASC",
    ).all() as AgentRunTargetRow[];
    const matchedRunIds: string[] = [];
    const cancelledRunIds: string[] = [];
    for (const row of rows) {
      if (typeof row.id !== "string") continue;
      if (!inputTargetsRecord(parseRunInput(row.input), entity, id)) continue;
      matchedRunIds.push(row.id);
      if (typeof row.status === "string" && ACTIVE_RUN_STATUSES.has(row.status)) {
        cancelledRunIds.push(row.id);
      }
    }

    // Reuse the established cancellation lifecycle so active child actions,
    // run events, and audit rows receive the same durable treatment as any
    // other cancellation. Terminal runs are intentionally left untouched.
    const agents = new AgentStore(db);
    for (const runId of cancelledRunIds) {
      agents.cancelRun(runId, reason, actorId, "RECORD_PURGED");
    }

    const runPlaceholders = matchedRunIds.map(() => "?").join(", ");
    const threadWhere = matchedRunIds.length > 0
      ? `(record_type = ? AND record_id = ?) OR run_id IN (${runPlaceholders})`
      : "record_type = ? AND record_id = ?";
    const threadParams: string[] = [entity, id, ...matchedRunIds];
    const threadRows = db.prepare(
      `SELECT id FROM agent_thread_links WHERE ${threadWhere} ORDER BY id ASC`,
    ).all(...threadParams) as Array<{ id?: unknown }>;
    const removedThreadLinkIds = threadRows
      .flatMap((row) => typeof row.id === "string" ? [row.id] : []);
    if (removedThreadLinkIds.length > 0) {
      const placeholders = removedThreadLinkIds.map(() => "?").join(", ");
      db.prepare(`DELETE FROM agent_thread_links WHERE id IN (${placeholders})`).run(...removedThreadLinkIds);
    }

    const eventRows = db.prepare(`
      SELECT id
      FROM crm_event_outbox
      WHERE record_kind = ? AND record_id = ? AND processed_at IS NULL
      ORDER BY created_at ASC, id ASC
    `).all(entity.toLowerCase(), id) as Array<{ id?: unknown }>;
    const removedPendingEventIds = eventRows
      .flatMap((row) => typeof row.id === "string" ? [row.id] : []);
    if (removedPendingEventIds.length > 0) {
      const placeholders = removedPendingEventIds.map(() => "?").join(", ");
      db.prepare(`DELETE FROM crm_event_outbox WHERE id IN (${placeholders})`).run(...removedPendingEventIds);
    }

    return {
      entity,
      recordId: id,
      matchedRunIds,
      cancelledRunIds,
      removedThreadLinkIds,
      removedPendingEventIds,
    };
  })();
}
