import type {
  EnrichmentQueueOutput,
  EnrichmentQueueRow,
  EnrichmentQueueScheduledRow,
  EnrichmentQueueSubject,
} from "../contracts/enrichment-queue.js";
import { nowIso, type Db } from "./types.js";

const ENRICHMENT_RUN_KINDS = new Set([
  "CRM_ENRICHMENT_REQUEST",
  "CRM_FIELD_BACKFILL",
  "CRM_DUE_TASK",
]);

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL", "FAILED"]);

interface RawRun {
  id: unknown;
  status: unknown;
  input: unknown;
  errorMessage: unknown;
  createdAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  agentName: unknown;
}

interface RawActivity {
  id: unknown;
  subject: unknown;
  due: unknown;
  createdAt: unknown;
  companyId: unknown;
  companyName: unknown;
  contactId: unknown;
  contactName: unknown;
  dealId: unknown;
  dealName: unknown;
}

interface RawDispatchActivity extends RawActivity {
  status: unknown;
  lastError: unknown;
  dispatchCreatedAt: unknown;
  updatedAt: unknown;
}

interface RawTrigger {
  id: unknown;
  due: unknown;
  createdAt: unknown;
  agentId: unknown;
  agentName: unknown;
}

interface RawRecord {
  id: unknown;
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  imageUrl?: unknown;
  iconUrl?: unknown;
  iconDarkUrl?: unknown;
  iconTone?: unknown;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function id(value: unknown): string | null {
  return text(value);
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function timestamp(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate || Number.isNaN(new Date(candidate).getTime())) return null;
  return candidate;
}

function isFuture(value: string, now: string): boolean {
  return new Date(value).getTime() > new Date(now).getTime();
}

function displayName(firstName: unknown, lastName: unknown, fallback: string): string {
  const name = [text(firstName), text(lastName)].filter((part): part is string => part !== null).join(" ");
  return name || fallback;
}

function relatedSubject(
  kind: "company" | "contact" | "deal",
  recordId: unknown,
  recordName: unknown,
): { kind: "company" | "contact" | "deal"; id: string; name: string } | null {
  const record = id(recordId);
  const name = text(recordName);
  return record && name ? { kind, id: record, name } : null;
}

function taskSubject(
  activityId: unknown,
  activityName: unknown,
  relation: {
    companyId?: unknown;
    companyName?: unknown;
    contactId?: unknown;
    contactName?: unknown;
    dealId?: unknown;
    dealName?: unknown;
  } = {},
): EnrichmentQueueSubject | null {
  const taskId = id(activityId);
  if (!taskId) return null;
  const related =
    relatedSubject("contact", relation.contactId, relation.contactName) ??
    relatedSubject("company", relation.companyId, relation.companyName) ??
    relatedSubject("deal", relation.dealId, relation.dealName);
  return {
    kind: "task",
    id: taskId,
    name: text(activityName) ?? "Untitled task",
    related,
  };
}

function operationLabel(input: Record<string, unknown>): string {
  const kind = text(input.kind)?.toUpperCase();
  if (kind === "CRM_DUE_TASK") return "CRM task";
  if (kind === "CRM_FIELD_BACKFILL") {
    const field = text(input.fieldLabel) ?? text(input.fieldId);
    return field ? `Custom field: ${field}` : "Custom field backfill";
  }
  switch (text(input.operation)?.toLowerCase()) {
    case "research":
      return "Research";
    case "socials":
      return "Social lookup";
    case "work-history":
      return "Work history";
    case "brief":
      return "Brief";
    default:
      return "Enrichment";
  }
}

function queueLine(
  status: string,
  operation: string,
  agentName: string | null,
  errorMessage: string | null,
): string {
  if (status === "FAILED") {
    const reason = errorMessage ? `: ${errorMessage.slice(0, 120)}` : "";
    return `${operation} failed${reason}`;
  }
  if (status === "WAITING_FOR_APPROVAL") return `${operation} waiting for approval`;
  const agent = agentName ?? "the local BB agent";
  return status === "RUNNING"
    ? `${operation} running in ${agent}`
    : `${operation} queued for ${agent}`;
}

function runSubject(db: Db, input: Record<string, unknown>): EnrichmentQueueSubject | null {
  const kind = text(input.kind)?.toUpperCase();
  if (kind === "CRM_DUE_TASK") {
    const activity = input.activity;
    if (typeof activity !== "object" || activity === null || Array.isArray(activity)) return null;
    const value = activity as Record<string, unknown>;
    return taskSubject(value.id, value.subject, {
      companyId: value.companyId,
      companyName: recordName(db, "companies", value.companyId),
      contactId: value.contactId,
      contactName: recordName(db, "contacts", value.contactId),
      dealId: value.dealId,
      dealName: recordName(db, "deals", value.dealId),
    });
  }

  const entity = text(input.entity)?.toUpperCase();
  const recordId = id(input.recordId);
  if (!recordId || (entity !== "COMPANY" && entity !== "CONTACT" && entity !== "DEAL")) return null;
  if (entity === "COMPANY") {
    const row = db.prepare(`
      SELECT id, name, icon_url AS iconUrl, icon_dark_url AS iconDarkUrl, icon_tone AS iconTone
      FROM companies
      WHERE id = ?
    `).get(recordId) as RawRecord | undefined;
    const name = text(row?.name);
    if (!row || !name) return null;
    return {
      kind: "company",
      id: recordId,
      name,
      iconUrl: text(row.iconUrl),
      iconDarkUrl: text(row.iconDarkUrl),
      iconTone: text(row.iconTone),
    };
  }
  if (entity === "DEAL") {
    const row = db.prepare(`
      SELECT id, name
      FROM deals
      WHERE id = ?
    `).get(recordId) as RawRecord | undefined;
    const name = text(row?.name);
    if (!row || !name) return null;
    return { kind: "deal", id: recordId, name };
  }
  const row = db.prepare(`
    SELECT id, first_name AS firstName, last_name AS lastName, email, image_url AS imageUrl
    FROM contacts
    WHERE id = ?
  `).get(recordId) as RawRecord | undefined;
  if (!row) return null;
  return {
    kind: "contact",
    id: recordId,
    name: displayName(row.firstName, row.lastName, text(row.email) ?? "Unnamed contact"),
    email: text(row.email),
    imageUrl: text(row.imageUrl),
  };
}

function recordName(db: Db, table: "companies" | "contacts" | "deals", recordId: unknown): string | null {
  const idValue = id(recordId);
  if (!idValue) return null;
  const select = table === "contacts"
    ? "first_name AS name, last_name AS lastName, email"
    : "name";
  const row = db.prepare(`SELECT ${select} FROM ${table} WHERE id = ?`).get(idValue) as RawRecord | undefined;
  if (!row) return null;
  return table === "contacts"
    ? displayName(row.name, row.lastName, text(row.email) ?? "Unnamed contact")
    : text(row.name);
}

function scheduledTaskRows(db: Db, now: string): EnrichmentQueueScheduledRow[] {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.subject,
      a.due_at AS due,
      a.created_at AS createdAt,
      a.company_id AS companyId,
      company.name AS companyName,
      a.contact_id AS contactId,
      trim(coalesce(contact.first_name, '') || ' ' || coalesce(contact.last_name, '')) AS contactName,
      a.deal_id AS dealId,
      deal.name AS dealName
    FROM activities AS a
    LEFT JOIN companies AS company ON company.id = a.company_id
    LEFT JOIN contacts AS contact ON contact.id = a.contact_id
    LEFT JOIN deals AS deal ON deal.id = a.deal_id
    WHERE a.type = 'TASK'
      AND a.completed_at IS NULL
      AND a.due_at IS NOT NULL
      AND a.due_at > @now
    ORDER BY a.due_at ASC, a.created_at DESC, a.id DESC
  `).all({ now }) as RawActivity[];
  return rows.flatMap((row) => {
    const due = timestamp(row.due);
    const createdAt = timestamp(row.createdAt);
    const subject = taskSubject(row.id, row.subject, row);
    if (!due || !createdAt || !subject) return [];
    return [{
      id: `activity:${id(row.id)}`,
      due,
      createdAt,
      line: "CRM task scheduled",
      subject,
      agentName: null,
    }];
  });
}

function dispatchTaskRows(db: Db): EnrichmentQueueRow[] {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.subject,
      a.company_id AS companyId,
      company.name AS companyName,
      a.contact_id AS contactId,
      trim(coalesce(contact.first_name, '') || ' ' || coalesce(contact.last_name, '')) AS contactName,
      a.deal_id AS dealId,
      deal.name AS dealName,
      dispatch.status,
      dispatch.last_error AS lastError,
      dispatch.created_at AS dispatchCreatedAt,
      dispatch.updated_at AS updatedAt
    FROM crm_activity_task_dispatches AS dispatch
    INNER JOIN activities AS a ON a.id = dispatch.activity_id
    LEFT JOIN companies AS company ON company.id = a.company_id
    LEFT JOIN contacts AS contact ON contact.id = a.contact_id
    LEFT JOIN deals AS deal ON deal.id = a.deal_id
    WHERE a.type = 'TASK'
      AND a.completed_at IS NULL
      AND dispatch.run_id IS NULL
      AND dispatch.status IN ('LEASED', 'QUEUED', 'DISPATCHED', 'FAILED')
    ORDER BY dispatch.updated_at DESC, dispatch.activity_id DESC
  `).all() as RawDispatchActivity[];
  return rows.flatMap((row) => {
    const status = text(row.status);
    const createdAt = timestamp(row.dispatchCreatedAt) ?? timestamp(row.updatedAt);
    const subject = taskSubject(row.id, row.subject, row);
    const taskId = id(row.id);
    if (!status || !createdAt || !subject || !taskId) return [];
    const errorMessage = text(row.lastError);
    const failed = status === "FAILED";
    return [{
      id: `dispatch:${taskId}`,
      state: failed ? "failed" : status === "DISPATCHED" ? "running" : "queued",
      line: failed
        ? `CRM task dispatch failed${errorMessage ? `: ${errorMessage.slice(0, 120)}` : ""}`
        : status === "DISPATCHED"
          ? "CRM task running in the local BB agent"
          : "CRM task queued for the local BB agent",
      createdAt,
      startedAt: status === "DISPATCHED" ? timestamp(row.updatedAt) : null,
      finishedAt: null,
      subject,
      agentName: null,
      errorMessage,
    }];
  });
}

function scheduledTriggerRows(db: Db, now: string): EnrichmentQueueScheduledRow[] {
  const rows = db.prepare(`
    SELECT
      trigger.id,
      trigger.next_run_at AS due,
      trigger.created_at AS createdAt,
      agent.id AS agentId,
      agent.name AS agentName
    FROM agent_triggers AS trigger
    INNER JOIN agent_definitions AS agent ON agent.id = trigger.agent_id
    WHERE trigger.type = 'SCHEDULE'
      AND trigger.enabled = 1
      AND trigger.next_run_at IS NOT NULL
      AND trigger.next_run_at > @now
      AND agent.status NOT IN ('ARCHIVED', 'DELETED')
    ORDER BY trigger.next_run_at ASC, trigger.created_at DESC, trigger.id DESC
  `).all({ now }) as RawTrigger[];
  return rows.flatMap((row) => {
    const triggerId = id(row.id);
    const due = timestamp(row.due);
    const createdAt = timestamp(row.createdAt);
    const agentId = id(row.agentId);
    const agentName = text(row.agentName);
    if (!triggerId || !due || !createdAt || !agentId || !agentName) return [];
    return [{
      id: `trigger:${triggerId}`,
      due,
      createdAt,
      line: "Scheduled BB agent run",
      subject: { kind: "agent", id: agentId, name: agentName },
      agentName,
    }];
  });
}

function scheduledRunRow(
  db: Db,
  row: RawRun,
  input: Record<string, unknown>,
  now: string,
): EnrichmentQueueScheduledRow | null {
  const due = timestamp(input.dueAt ?? input.scheduledAt);
  const createdAt = timestamp(row.createdAt);
  const agentName = text(row.agentName);
  if (!due || !createdAt || !isFuture(due, now)) return null;
  const subject = runSubject(db, input);
  if (!subject) return null;
  const runId = id(row.id);
  if (!runId) return null;
  return {
    id: `run:${runId}`,
    due,
    createdAt,
    line: `Scheduled ${operationLabel(input).toLowerCase()}`,
    subject,
    agentName,
  };
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error("Enrichment queue limit must be an integer between 1 and 100.");
  }
  return value;
}

export class EnrichmentQueueStore {
  constructor(private readonly db: Db) {}

  list(limit = 25, now = nowIso()): EnrichmentQueueOutput {
    const pageLimit = boundedLimit(limit);
    const runRows = this.db.prepare(`
      SELECT
        run.id,
        run.status,
        run.input,
        run.error_message AS errorMessage,
        run.created_at AS createdAt,
        run.started_at AS startedAt,
        run.finished_at AS finishedAt,
        agent.name AS agentName
      FROM agent_runs AS run
      INNER JOIN agent_definitions AS agent ON agent.id = run.agent_id
      WHERE run.status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'FAILED')
      ORDER BY
        CASE run.status
          WHEN 'RUNNING' THEN 0
          WHEN 'WAITING_FOR_APPROVAL' THEN 1
          WHEN 'QUEUED' THEN 2
          ELSE 3
        END,
        run.created_at DESC,
        run.id DESC
      LIMIT 1000
    `).all() as RawRun[];

    const rows: EnrichmentQueueRow[] = [];
    const scheduledFromRuns: EnrichmentQueueScheduledRow[] = [];
    for (const run of runRows) {
      const status = text(run.status);
      if (!status || !ACTIVE_STATUSES.has(status)) continue;
      const input = jsonObject(run.input);
      if (!input || !ENRICHMENT_RUN_KINDS.has(text(input.kind)?.toUpperCase() ?? "")) continue;
      const scheduled = scheduledRunRow(this.db, run, input, now);
      if (scheduled) {
        scheduledFromRuns.push(scheduled);
        continue;
      }
      const subject = runSubject(this.db, input);
      const createdAt = timestamp(run.createdAt);
      if (!subject || !createdAt) continue;
      const agentName = text(run.agentName);
      const errorMessage = text(run.errorMessage);
      rows.push({
        id: id(run.id) ?? "unknown-run",
        state: status === "RUNNING" ? "running" : status === "FAILED" ? "failed" : "queued",
        line: queueLine(status, operationLabel(input), agentName, errorMessage),
        createdAt,
        startedAt: timestamp(run.startedAt),
        finishedAt: timestamp(run.finishedAt),
        subject,
        agentName,
        errorMessage,
      });
    }
    rows.push(...dispatchTaskRows(this.db));
    const stateRank: Record<EnrichmentQueueRow["state"], number> = {
      running: 0,
      queued: 1,
      failed: 2,
    };
    rows.sort((left, right) => {
      const rankDelta = stateRank[left.state] - stateRank[right.state];
      if (rankDelta !== 0) return rankDelta;
      const createdDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return createdDelta !== 0 ? createdDelta : left.id.localeCompare(right.id);
    });

    const scheduled = [
      ...scheduledFromRuns,
      ...scheduledTaskRows(this.db, now),
      ...scheduledTriggerRows(this.db, now),
    ].sort((left, right) => {
      const dueDelta = new Date(left.due).getTime() - new Date(right.due).getTime();
      return dueDelta !== 0 ? dueDelta : left.id.localeCompare(right.id);
    });

    return {
      rows: rows.slice(0, pageLimit),
      total: rows.length,
      scheduled: scheduled.slice(0, pageLimit),
      scheduledTotal: scheduled.length,
    };
  }
}

export function createEnrichmentQueueStore(db: Db): EnrichmentQueueStore {
  return new EnrichmentQueueStore(db);
}

export function listEnrichmentQueue(db: Db, limit = 25, now = nowIso()): EnrichmentQueueOutput {
  return new EnrichmentQueueStore(db).list(limit, now);
}
