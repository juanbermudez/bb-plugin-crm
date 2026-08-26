import type { Db } from "./types.js";
import { newRecordId, nowIso } from "./types.js";

/** CRM domain events that can be selected by an EVENT agent trigger. */
export const CRM_EVENT_CATALOG = {
  "company.created": {
    recordKind: "company",
    description: "A company is added to the CRM.",
  },
  "contact.created": {
    recordKind: "contact",
    description: "A contact is added to the CRM.",
  },
  "deal.created": {
    recordKind: "deal",
    description: "A deal is added to the CRM.",
  },
  "deal.stage.changed": {
    recordKind: "deal",
    description: "A deal moves from one pipeline stage to another.",
  },
  "deal.opened": {
    recordKind: "deal",
    description: "A closed deal returns to the open pipeline.",
  },
  "deal.closed": {
    recordKind: "deal",
    description: "An open deal moves to a closed stage.",
  },
} as const;

export type CrmEventType = keyof typeof CRM_EVENT_CATALOG;
export type CrmEventRecordKind = (typeof CRM_EVENT_CATALOG)[CrmEventType]["recordKind"];

export const CRM_EVENT_TYPES = Object.keys(CRM_EVENT_CATALOG) as [
  CrmEventType,
  ...CrmEventType[],
];

export interface CrmEventOutboxRecord {
  id: string;
  type: CrmEventType;
  recordKind: CrmEventRecordKind;
  recordId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  createdAt: string;
  processedAt: string | null;
}

const OUTBOX_SELECT = `
  SELECT
    id,
    type,
    record_kind AS recordKind,
    record_id AS recordId,
    occurred_at AS occurredAt,
    data,
    created_at AS createdAt,
    processed_at AS processedAt
  FROM crm_event_outbox`;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function parseEvent(value: unknown): CrmEventOutboxRecord {
  const row = objectValue(value, "CRM event");
  const id = typeof row.id === "string" && row.id.trim() ? row.id : null;
  const type = typeof row.type === "string" && row.type in CRM_EVENT_CATALOG
    ? row.type as CrmEventType
    : null;
  const recordKind = typeof row.recordKind === "string" &&
      (Object.values(CRM_EVENT_CATALOG) as readonly { recordKind: string }[])
        .some((definition) => definition.recordKind === row.recordKind)
    ? row.recordKind as CrmEventRecordKind
    : null;
  const recordId = typeof row.recordId === "string" && row.recordId.trim() ? row.recordId : null;
  const occurredAt = typeof row.occurredAt === "string" && !Number.isNaN(new Date(row.occurredAt).getTime())
    ? row.occurredAt
    : null;
  const createdAt = typeof row.createdAt === "string" && !Number.isNaN(new Date(row.createdAt).getTime())
    ? row.createdAt
    : null;
  if (!id || !type || !recordKind || !recordId || !occurredAt || !createdAt) {
    throw new Error("CRM event outbox row is invalid.");
  }
  const data = objectValue(typeof row.data === "string" ? JSON.parse(row.data) : row.data, "CRM event data");
  const processedAt = row.processedAt === null || row.processedAt === undefined
    ? null
    : typeof row.processedAt === "string" && !Number.isNaN(new Date(row.processedAt).getTime())
      ? row.processedAt
      : null;
  return { id, type, recordKind, recordId, occurredAt, data, createdAt, processedAt };
}

export class CrmEventStore {
  constructor(private readonly db: Db) {}

  listPending(limit = 100): CrmEventOutboxRecord[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("CRM event outbox limit must be an integer between 1 and 1000.");
    }
    return (this.db.prepare(`${OUTBOX_SELECT}
      WHERE processed_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT ?`).all(limit) as unknown[]).map(parseEvent);
  }

  markProcessed(id: string, processedAt = nowIso()): boolean {
    const result = this.db.prepare(`
      UPDATE crm_event_outbox
      SET processed_at = ?
      WHERE id = ? AND processed_at IS NULL
    `).run(processedAt, id);
    return result.changes === 1;
  }

  /**
   * Insert a synthetic event for integrations/tests. Domain writes normally
   * use the SQLite AFTER triggers in the schema so the outbox is transactional
   * with the record mutation.
   */
  enqueue(input: {
    type: CrmEventType;
    recordKind: CrmEventRecordKind;
    recordId: string;
    occurredAt?: string;
    data?: Record<string, unknown>;
    id?: string;
  }): CrmEventOutboxRecord {
    const definition = CRM_EVENT_CATALOG[input.type];
    if (definition.recordKind !== input.recordKind) {
      throw new Error(`CRM event ${input.type} requires a ${definition.recordKind} record.`);
    }
    const id = input.id ?? newRecordId("crm-event");
    const occurredAt = input.occurredAt ?? nowIso();
    this.db.prepare(`
      INSERT INTO crm_event_outbox (id, type, record_kind, record_id, occurred_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.type,
      input.recordKind,
      input.recordId,
      occurredAt,
      JSON.stringify(input.data ?? {}),
    );
    return parseEvent(this.db.prepare(`${OUTBOX_SELECT} WHERE id = ?`).get(id));
  }
}

export function createCrmEventStore(db: Db): CrmEventStore {
  return new CrmEventStore(db);
}

