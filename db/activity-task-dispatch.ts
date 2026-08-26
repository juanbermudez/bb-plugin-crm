import {
  createActivityStore,
  type Activity,
} from "./activities.js";
import {
  newRecordId,
  nowIso,
  RecordNotFoundError,
  requiredText,
  type Db,
} from "./types.js";

export const CRM_ACTIVITY_TASK_DISPATCH_LEASE_MS = 10 * 60 * 1_000;
export const CRM_ACTIVITY_TASK_DISPATCH_MAX_ATTEMPTS = 3;
export const CRM_ACTIVITY_TASK_DISPATCH_MAX_BATCH = 100;

export const ACTIVITY_TASK_DISPATCH_STATUSES = [
  "LEASED",
  "QUEUED",
  "DISPATCHED",
  "COMPLETED",
  "FAILED",
] as const;
export type ActivityTaskDispatchStatus = (typeof ACTIVITY_TASK_DISPATCH_STATUSES)[number];

export interface ActivityTaskDispatch {
  activityId: string;
  status: ActivityTaskDispatchStatus;
  attempts: number;
  leaseToken: string | null;
  leaseUntil: string | null;
  runId: string | null;
  idempotencyKey: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityTaskDispatchCompletion {
  changed: boolean;
  runId: string | null;
}

export interface LeasedActivityTask {
  activity: Activity;
  dispatch: ActivityTaskDispatch;
}

export interface ClaimDueActivityTaskOptions {
  now?: string | Date;
  leaseMs?: number;
  maxAttempts?: number;
}

type ClaimDueArgument = ClaimDueActivityTaskOptions | string | Date;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return requiredText(value, label);
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, label);
}

function timestamp(value: unknown, label: string): string {
  const valueText = text(value, label);
  const parsed = new Date(valueText);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid timestamp.`);
  return valueText;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return timestamp(value, label);
}

function status(value: unknown): ActivityTaskDispatchStatus {
  if (typeof value === "string" && (ACTIVITY_TASK_DISPATCH_STATUSES as readonly string[]).includes(value)) {
    return value as ActivityTaskDispatchStatus;
  }
  throw new Error(`Invalid activity task dispatch status: ${String(value)}.`);
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function parseDispatch(value: unknown): ActivityTaskDispatch {
  if (!isPlainObject(value)) throw new Error("Activity task dispatch row must be an object.");
  return {
    activityId: text(value.activityId, "Activity task id"),
    status: status(value.status),
    attempts: integer(value.attempts, "Activity task attempts"),
    leaseToken: nullableText(value.leaseToken, "Activity task lease token"),
    leaseUntil: nullableTimestamp(value.leaseUntil, "Activity task lease deadline"),
    runId: nullableText(value.runId, "Activity task run id"),
    idempotencyKey: text(value.idempotencyKey, "Activity task idempotency key"),
    lastError: nullableText(value.lastError, "Activity task error"),
    createdAt: timestamp(value.createdAt, "Activity task created timestamp"),
    updatedAt: timestamp(value.updatedAt, "Activity task updated timestamp"),
  };
}

function normalizeTimestamp(value: string | Date | undefined, label: string, fallback: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid timestamp.`);
    return value.toISOString();
  }
  if (value === undefined) return fallback;
  const normalized = requiredText(value, label);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid timestamp.`);
  return parsed.toISOString();
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > CRM_ACTIVITY_TASK_DISPATCH_MAX_BATCH) {
    throw new Error(`Activity task dispatch limit must be an integer between 1 and ${CRM_ACTIVITY_TASK_DISPATCH_MAX_BATCH}.`);
  }
  return value;
}

function boundedLease(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60 * 60 * 1_000) {
    throw new Error("Activity task dispatch lease must be an integer between 1ms and 1 hour.");
  }
  return value;
}

function boundedAttempts(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new Error("Activity task dispatch max attempts must be an integer between 1 and 10.");
  }
  return value;
}

const DISPATCH_SELECT = `
  SELECT
    activity_id AS activityId,
    status,
    attempts,
    lease_token AS leaseToken,
    lease_until AS leaseUntil,
    run_id AS runId,
    idempotency_key AS idempotencyKey,
    last_error AS lastError,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM crm_activity_task_dispatches`;

/**
 * Durable, local lease state for ordinary CRM TASK activities.  This store
 * never touches BB's host-visible Tasks surface; the resulting agent run is
 * the only dispatch artifact.
 */
export class ActivityTaskDispatchStore {
  private readonly activities;

  constructor(private readonly db: Db) {
    this.activities = createActivityStore(db);
  }

  claimDue(
    limit = CRM_ACTIVITY_TASK_DISPATCH_MAX_BATCH,
    argument: ClaimDueArgument = {},
    legacyLeaseMs?: number,
    legacyMaxAttempts?: number,
  ): LeasedActivityTask[] {
    const options: ClaimDueActivityTaskOptions = typeof argument === "string" || argument instanceof Date
      ? { now: argument, leaseMs: legacyLeaseMs, maxAttempts: legacyMaxAttempts }
      : argument;
    const pageLimit = boundedLimit(limit);
    const now = normalizeTimestamp(options.now, "Activity task dispatch now", nowIso());
    const leaseMs = boundedLease(options.leaseMs ?? CRM_ACTIVITY_TASK_DISPATCH_LEASE_MS);
    const maxAttempts = boundedAttempts(options.maxAttempts ?? CRM_ACTIVITY_TASK_DISPATCH_MAX_ATTEMPTS);
    const leaseUntil = new Date(new Date(now).getTime() + leaseMs).toISOString();

    return this.db.transaction(() => {
      // A task can be completed through any activity writer. Reconcile rows
      // before selecting candidates so a completion race cannot be retried.
      this.db.prepare(`
        UPDATE crm_activity_task_dispatches
        SET status = 'COMPLETED', lease_token = NULL, lease_until = NULL,
            last_error = NULL, updated_at = @updatedAt
        WHERE status <> 'COMPLETED'
          AND activity_id IN (
            SELECT id FROM activities WHERE type = 'TASK' AND completed_at IS NOT NULL
          )
      `).run({ updatedAt: now });

      const rows = this.db.prepare(`
        SELECT a.id AS activityId
        FROM activities AS a
        LEFT JOIN crm_activity_task_dispatches AS d ON d.activity_id = a.id
        WHERE a.type = 'TASK'
          AND a.completed_at IS NULL
          AND a.due_at IS NOT NULL
          AND a.due_at <= @now
          AND (
            d.activity_id IS NULL OR (
              d.status <> 'COMPLETED'
              AND d.run_id IS NULL
              AND d.attempts < @maxAttempts
              AND (d.lease_until IS NULL OR d.lease_until <= @now)
            )
          )
        ORDER BY a.due_at ASC, a.id ASC
        LIMIT @limit
      `).all({ now, maxAttempts, limit: pageLimit }) as Array<{ activityId?: unknown }>;

      const claimed: LeasedActivityTask[] = [];
      for (const row of rows) {
        if (typeof row.activityId !== "string") continue;
        const activity = this.activities.get(row.activityId);
        if (!activity || activity.type !== "TASK" || activity.completedAt !== null || activity.dueAt === null) continue;

        const leaseToken = newRecordId("crm-task-lease");
        const idempotencyKey = `crm-due-task:${activity.id}`;
        const result = this.db.prepare(`
          INSERT INTO crm_activity_task_dispatches (
            activity_id, status, attempts, lease_token, lease_until,
            idempotency_key, last_error, created_at, updated_at
          ) VALUES (
            @activityId, 'LEASED', 1, @leaseToken, @leaseUntil,
            @idempotencyKey, NULL, @createdAt, @updatedAt
          )
          ON CONFLICT(activity_id) DO UPDATE SET
            status = 'LEASED',
            attempts = crm_activity_task_dispatches.attempts + 1,
            lease_token = excluded.lease_token,
            lease_until = excluded.lease_until,
            last_error = NULL,
            updated_at = excluded.updated_at
          WHERE crm_activity_task_dispatches.status <> 'COMPLETED'
            AND crm_activity_task_dispatches.run_id IS NULL
            AND crm_activity_task_dispatches.attempts < @maxAttempts
            AND (crm_activity_task_dispatches.lease_until IS NULL OR crm_activity_task_dispatches.lease_until <= @now)
        `).run({
          activityId: activity.id,
          leaseToken,
          leaseUntil,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
          maxAttempts,
          now,
        });
        if (result.changes !== 1) continue;
        const dispatch = this.getRequired(activity.id);
        claimed.push({ activity, dispatch });
      }
      return claimed;
    })();
  }

  /** Attach the deterministic agent run to the current lease, exactly once. */
  attachRun(activityId: string, leaseToken: string, runId: string): boolean {
    const id = requiredText(activityId, "Activity task id");
    const token = requiredText(leaseToken, "Activity task lease token");
    const run = requiredText(runId, "Activity task run id");
    return this.db.transaction(() => {
      const result = this.db.prepare(`
        UPDATE crm_activity_task_dispatches
        SET status = 'QUEUED', run_id = @runId, lease_token = NULL,
            lease_until = NULL, last_error = NULL, updated_at = @updatedAt
        WHERE activity_id = @activityId
          AND status = 'LEASED'
          AND run_id IS NULL
          AND lease_token = @leaseToken
      `).run({ activityId: id, leaseToken: token, runId: run, updatedAt: nowIso() });
      if (result.changes === 1) return true;
      const current = this.get(id);
      return current?.runId === run;
    })();
  }

  markDispatched(activityId: string, runId: string): boolean {
    const result = this.db.prepare(`
      UPDATE crm_activity_task_dispatches
      SET status = 'DISPATCHED', updated_at = @updatedAt
      WHERE activity_id = @activityId
        AND run_id = @runId
        AND status IN ('QUEUED', 'DISPATCHED')
    `).run({
      activityId: requiredText(activityId, "Activity task id"),
      runId: requiredText(runId, "Activity task run id"),
      updatedAt: nowIso(),
    });
    return result.changes === 1;
  }

  markCompletedWithRun(activityId: string): ActivityTaskDispatchCompletion {
    const id = requiredText(activityId, "Activity task id");
    return this.db.transaction(() => {
      const current = this.get(id);
      if (current === null) return { changed: false, runId: null };
      const result = this.db.prepare(`
        UPDATE crm_activity_task_dispatches
        SET status = 'COMPLETED', lease_token = NULL, lease_until = NULL,
            last_error = NULL, updated_at = @updatedAt
        WHERE activity_id = @activityId AND status <> 'COMPLETED'
      `).run({ activityId: id, updatedAt: nowIso() });
      return { changed: result.changes === 1, runId: current.runId };
    })();
  }

  markCompleted(activityId: string): boolean {
    return this.markCompletedWithRun(activityId).changed;
  }

  /** Re-open an unqueued completion without duplicating an existing run. */
  markReopened(activityId: string): boolean {
    const result = this.db.prepare(`
      UPDATE crm_activity_task_dispatches
      SET status = 'FAILED', lease_token = NULL, lease_until = NULL,
          last_error = NULL, updated_at = @updatedAt
      WHERE activity_id = @activityId
        AND status = 'COMPLETED'
        AND run_id IS NULL
    `).run({ activityId: requiredText(activityId, "Activity task id"), updatedAt: nowIso() });
    return result.changes === 1;
  }

  /** Release only the lease that produced the error; stale workers are fenced. */
  releaseClaim(activityId: string, leaseToken: string, error: unknown): boolean {
    const reason = (error instanceof Error ? error.message : String(error)).trim().slice(0, 500) || "Dispatch failed.";
    const result = this.db.prepare(`
      UPDATE crm_activity_task_dispatches
      SET status = 'FAILED', lease_token = NULL, lease_until = NULL,
          last_error = @lastError, updated_at = @updatedAt
      WHERE activity_id = @activityId
        AND status = 'LEASED'
        AND run_id IS NULL
        AND lease_token = @leaseToken
    `).run({
      activityId: requiredText(activityId, "Activity task id"),
      leaseToken: requiredText(leaseToken, "Activity task lease token"),
      lastError: reason,
      updatedAt: nowIso(),
    });
    return result.changes === 1;
  }

  get(activityId: string): ActivityTaskDispatch | null {
    const row = this.db.prepare(`${DISPATCH_SELECT} WHERE activity_id = ?`).get(requiredText(activityId, "Activity task id"));
    return row === undefined ? null : parseDispatch(row);
  }

  getRequired(activityId: string): ActivityTaskDispatch {
    const value = this.get(activityId);
    if (!value) throw new RecordNotFoundError("activity task dispatch", activityId);
    return value;
  }
}

export function createActivityTaskDispatchStore(db: Db): ActivityTaskDispatchStore {
  return new ActivityTaskDispatchStore(db);
}
