import {
  ACTIVITY_TYPES,
  newRecordId,
  nullableText,
  nowIso,
  RecordNotFoundError,
  requiredText,
  type ActivityType,
  type Db,
} from "./types.js";

export const COMPOSABLE_ACTIVITY_TYPES = [
  "NOTE",
  "CALL",
  "EMAIL",
  "MEETING",
  "TASK",
] as const;

export type ComposableActivityType = (typeof COMPOSABLE_ACTIVITY_TYPES)[number];

export const TIMELINE_FILTERS = [
  "all",
  "history",
  "notes",
  "upcoming",
  "done",
  "email",
  "meetings",
] as const;

export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

export type ActivityMetaValue =
  | string
  | number
  | boolean
  | null
  | ActivityMetaValue[]
  | { [key: string]: ActivityMetaValue };

export interface ActivityMeta {
  [key: string]: ActivityMetaValue;
}

export interface ActivityCompanyRef {
  id: string;
  name: string;
}

export interface ActivityContactRef {
  id: string;
  firstName: string;
  lastName: string | null;
}

export interface ActivityDealRef {
  id: string;
  name: string;
}

export interface ActivityEmailThreadRef {
  id: string;
  messageCount: number;
  lastMessageAt: string;
}

export interface ActivityCalendarEventRef {
  id: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  location: string | null;
  conferenceUrl: string | null;
  attendeeCount: number;
}

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  occurredAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  createdById: string;
  meta: ActivityMeta;
  emailThreadId: string | null;
  calendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
  company: ActivityCompanyRef | null;
  contact: ActivityContactRef | null;
  deal: ActivityDealRef | null;
  emailThread: ActivityEmailThreadRef | null;
  calendarEvent: ActivityCalendarEventRef | null;
}

export type ActivityEntry = Activity;

export interface ActivityCreateInput {
  id?: string;
  type: ActivityType;
  subject?: string | null;
  body?: string | null;
  occurredAt?: string | Date | null;
  dueAt?: string | Date | null;
  completedAt?: string | Date | null;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  /** RPC callers can pass the acting user as the second create argument. */
  createdById?: string;
  meta?: ActivityMeta | null;
  emailThreadId?: string | null;
  calendarEventId?: string | null;
}

export interface ActivityUpdateInput {
  subject?: string | null;
  body?: string | null;
  occurredAt?: string | Date | null;
  dueAt?: string | Date | null;
  completed?: boolean;
  meta?: ActivityMeta | null;
}

export interface ActivityListOptions {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  filter?: TimelineFilter;
  cursor?: string;
  limit?: number;
}

export interface ActivityPage {
  entries: Activity[];
  nextCursor: string | null;
}

export interface ActivityCounts {
  all: number;
  notes: number;
  upcoming: number;
  done: number;
  email: number;
  meetings: number;
}

export interface MyTasksOptions {
  actorId: string;
  window?: "overdue" | "upcoming" | "all";
  limit?: number;
  now?: string | Date;
}

export class ActivityConflictError extends Error {
  readonly code = "CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "ActivityConflictError";
  }
}

function assertActivityType(value: string): ActivityType {
  if ((ACTIVITY_TYPES as readonly string[]).includes(value)) return value as ActivityType;
  throw new Error(`Invalid activity type: ${value}.`);
}

function assertTimelineFilter(value: string): TimelineFilter {
  if ((TIMELINE_FILTERS as readonly string[]).includes(value)) return value as TimelineFilter;
  throw new Error(`Invalid timeline filter: ${value}.`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonValue(value: unknown, label: string): asserts value is ActivityMetaValue {
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
      assertJsonValue(item, `${label}.${key}`);
    }
    return;
  }
  throw new Error(`${label} must contain JSON values only.`);
}

function normalizeMeta(value: ActivityMeta | null | undefined): ActivityMeta {
  if (value === null || value === undefined) return {};
  if (!isPlainObject(value)) throw new Error("Activity meta must be a JSON object.");
  assertJsonValue(value, "Activity meta");
  return JSON.parse(JSON.stringify(value)) as ActivityMeta;
}

function parseMeta(value: unknown): ActivityMeta {
  if (value === null || value === undefined || value === "") return {};
  if (typeof value !== "string") throw new Error("Activity meta is not JSON text.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Activity meta is not valid JSON.");
  }
  return normalizeMeta(parsed as ActivityMeta);
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
  const text = requiredText(value, label);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date.`);
  return parsed.toISOString();
}

function nullableId(value: string | null | undefined, label: string): string | null {
  return value === null || value === undefined ? null : requiredText(value, label);
}

function limit(value: number | undefined): number {
  const result = value ?? 30;
  if (!Number.isSafeInteger(result) || result < 1 || result > 100) {
    throw new Error("Activity list limit must be an integer between 1 and 100.");
  }
  return result;
}

interface ActivityCursor {
  occurredAt: string | null;
  id: string;
}

function encodeCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): ActivityCursor | null {
  const text = value.trim();
  if (!text) throw new Error("Activity cursor is required.");
  try {
    const parsed = JSON.parse(Buffer.from(text, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      typeof parsed.id !== "string" ||
      parsed.id.trim().length === 0 ||
      (parsed.occurredAt !== null && typeof parsed.occurredAt !== "string")
    ) {
      throw new Error("Invalid cursor shape.");
    }
    return { id: parsed.id, occurredAt: parsed.occurredAt as string | null };
  } catch {
    return null;
  }
}

const ACTIVITY_SELECT = `
  SELECT
    a.id,
    a.type,
    a.subject,
    a.body,
    a.occurred_at AS occurredAt,
    a.due_at AS dueAt,
    a.completed_at AS completedAt,
    a.company_id AS companyId,
    a.contact_id AS contactId,
    a.deal_id AS dealId,
    a.created_by_id AS createdById,
    a.meta,
    a.email_thread_id AS emailThreadId,
    a.calendar_event_id AS calendarEventId,
    a.created_at AS createdAt,
    a.updated_at AS updatedAt,
    c.id AS companyRefId,
    c.name AS companyRefName,
    p.id AS contactRefId,
    p.first_name AS contactRefFirstName,
    p.last_name AS contactRefLastName,
    d.id AS dealRefId,
    d.name AS dealRefName,
    et.id AS emailThreadRefId,
    et.message_count AS emailThreadMessageCount,
    et.last_message_at AS emailThreadLastMessageAt,
    ce.id AS calendarEventRefId,
    ce.starts_at AS calendarEventStartsAt,
    ce.ends_at AS calendarEventEndsAt,
    ce.is_all_day AS calendarEventIsAllDay,
    ce.location AS calendarEventLocation,
    ce.conference_url AS calendarEventConferenceUrl,
    (SELECT COUNT(*) FROM calendar_attendees AS ca WHERE ca.event_id = ce.id)
      AS calendarEventAttendeeCount
  FROM activities AS a
  LEFT JOIN companies AS c ON c.id = a.company_id
  LEFT JOIN contacts AS p ON p.id = a.contact_id
  LEFT JOIN deals AS d ON d.id = a.deal_id
  LEFT JOIN email_threads AS et ON et.id = a.email_thread_id
  LEFT JOIN calendar_events AS ce ON ce.id = a.calendar_event_id`;

function parseActivity(value: unknown): Activity {
  if (!value || typeof value !== "object") throw new Error("Missing activity row.");
  const row = value as Record<string, unknown>;
  const type = assertActivityType(String(row.type));
  const company = row.companyRefId === null || row.companyRefId === undefined
    ? null
    : {
        id: requiredText(String(row.companyRefId), "Activity company id"),
        name: requiredText(String(row.companyRefName), "Activity company name"),
      };
  const contact = row.contactRefId === null || row.contactRefId === undefined
    ? null
    : {
        id: requiredText(String(row.contactRefId), "Activity contact id"),
        firstName: requiredText(String(row.contactRefFirstName), "Activity contact first name"),
        lastName: nullableText(row.contactRefLastName as string | null | undefined),
      };
  const deal = row.dealRefId === null || row.dealRefId === undefined
    ? null
    : {
        id: requiredText(String(row.dealRefId), "Activity deal id"),
        name: requiredText(String(row.dealRefName), "Activity deal name"),
      };
  const emailThread = row.emailThreadRefId === null || row.emailThreadRefId === undefined
    ? null
    : {
        id: requiredText(String(row.emailThreadRefId), "Activity email thread id"),
        messageCount: Number(row.emailThreadMessageCount),
        lastMessageAt: requiredText(
          String(row.emailThreadLastMessageAt),
          "Activity email thread timestamp",
        ),
      };
  const calendarEvent = row.calendarEventRefId === null || row.calendarEventRefId === undefined
    ? null
    : {
        id: requiredText(String(row.calendarEventRefId), "Activity calendar event id"),
        startsAt: requiredText(
          String(row.calendarEventStartsAt),
          "Activity calendar event start",
        ),
        endsAt: requiredText(
          String(row.calendarEventEndsAt),
          "Activity calendar event end",
        ),
        isAllDay: row.calendarEventIsAllDay === 1 || row.calendarEventIsAllDay === true,
        location: nullableText(row.calendarEventLocation as string | null | undefined),
        conferenceUrl: nullableText(
          row.calendarEventConferenceUrl as string | null | undefined,
        ),
        attendeeCount: Number(row.calendarEventAttendeeCount),
      };
  return {
    id: requiredText(String(row.id), "Activity id"),
    type,
    subject: nullableText(row.subject as string | null | undefined),
    body: nullableText(row.body as string | null | undefined),
    occurredAt: (row.occurredAt as string | null | undefined) ?? null,
    dueAt: (row.dueAt as string | null | undefined) ?? null,
    completedAt: (row.completedAt as string | null | undefined) ?? null,
    companyId: (row.companyId as string | null | undefined) ?? null,
    contactId: (row.contactId as string | null | undefined) ?? null,
    dealId: (row.dealId as string | null | undefined) ?? null,
    createdById: requiredText(String(row.createdById), "Activity author"),
    meta: parseMeta(row.meta),
    emailThreadId: (row.emailThreadId as string | null | undefined) ?? null,
    calendarEventId: (row.calendarEventId as string | null | undefined) ?? null,
    createdAt: requiredText(String(row.createdAt), "Activity created timestamp"),
    updatedAt: requiredText(String(row.updatedAt), "Activity updated timestamp"),
    company,
    contact,
    deal,
    emailThread,
    calendarEvent,
  };
}

function filterClause(filter: TimelineFilter): string | null {
  switch (filter) {
    case "all":
      return null;
    case "history":
      return "NOT (a.type = 'TASK' AND a.completed_at IS NULL)";
    case "notes":
      return "a.type IN ('NOTE', 'CALL', 'EMAIL', 'MEETING')";
    case "upcoming":
      return "a.type = 'TASK' AND a.completed_at IS NULL";
    case "done":
      return "a.type = 'TASK' AND a.completed_at IS NOT NULL";
    case "email":
      return "a.type = 'EMAIL'";
    case "meetings":
      return "a.type = 'MEETING'";
  }
}

function normalizeCreateInput(input: ActivityCreateInput, actorId?: string): {
  id: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  occurredAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  createdById: string;
  meta: ActivityMeta;
  emailThreadId: string | null;
  calendarEventId: string | null;
  createdAt: string;
} {
  const type = assertActivityType(input.type);
  const companyId = nullableId(input.companyId, "Activity company");
  const contactId = nullableId(input.contactId, "Activity contact");
  const dealId = nullableId(input.dealId, "Activity deal");
  if (!companyId && !contactId && !dealId) {
    throw new Error("An activity has to be about a company, a contact, or a deal.");
  }
  const createdById = requiredText(actorId ?? input.createdById ?? "", "Activity author");
  const subject = nullableText(input.subject);
  if (type === "TASK" && !subject) throw new Error("A task needs a subject.");
  const createdAt = nowIso();
  return {
    id: input.id?.trim() || newRecordId("act"),
    type,
    subject,
    body: nullableText(input.body),
    occurredAt: normalizeTimestamp(input.occurredAt, "Activity occurredAt", createdAt),
    dueAt: type === "TASK" ? normalizeTimestamp(input.dueAt, "Activity dueAt", null) : null,
    completedAt: type === "TASK" ? normalizeTimestamp(input.completedAt, "Activity completedAt", null) : null,
    companyId,
    contactId,
    dealId,
    createdById,
    meta: normalizeMeta(input.meta),
    emailThreadId: nullableId(input.emailThreadId, "Activity email thread"),
    calendarEventId: nullableId(input.calendarEventId, "Activity calendar event"),
    createdAt,
  };
}

export class ActivityStore {
  constructor(private readonly db: Db) {}

  get(id: string): Activity | null {
    const raw = this.db.prepare(`${ACTIVITY_SELECT} WHERE a.id = ?`).get(requiredText(id, "Activity id"));
    return raw === undefined ? null : parseActivity(raw);
  }

  getRequired(id: string): Activity {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("activity", id);
    return value;
  }

  create(input: ActivityCreateInput, actorId?: string): Activity {
    const value = normalizeCreateInput(input, actorId);
    return this.db.transaction(() => {
      let companyId = value.companyId;
      if (!companyId && value.dealId) {
        const deal = this.db.prepare("SELECT company_id AS companyId FROM deals WHERE id = ?").get(value.dealId) as
          | { companyId: string }
          | undefined;
        if (!deal) throw new RecordNotFoundError("deal", value.dealId);
        companyId = deal.companyId;
      } else if (!companyId && value.contactId) {
        const contact = this.db.prepare("SELECT company_id AS companyId FROM contacts WHERE id = ?").get(value.contactId) as
          | { companyId: string | null }
          | undefined;
        if (!contact) throw new RecordNotFoundError("contact", value.contactId);
        companyId = contact.companyId;
      }
      this.db.prepare(`
        INSERT INTO activities (
          id, type, subject, body, occurred_at, due_at, completed_at,
          company_id, contact_id, deal_id, created_by_id, meta,
          email_thread_id, calendar_event_id, created_at, updated_at
        ) VALUES (
          @id, @type, @subject, @body, @occurredAt, @dueAt, @completedAt,
          @companyId, @contactId, @dealId, @createdById, @meta,
          @emailThreadId, @calendarEventId, @createdAt, @updatedAt
        )`).run({
        id: value.id,
        type: value.type,
        subject: value.subject,
        body: value.body,
        occurredAt: value.occurredAt,
        dueAt: value.dueAt,
        completedAt: value.completedAt,
        companyId,
        contactId: value.contactId,
        dealId: value.dealId,
        createdById: value.createdById,
        meta: JSON.stringify(value.meta),
        emailThreadId: value.emailThreadId,
        calendarEventId: value.calendarEventId,
        createdAt: value.createdAt,
        updatedAt: value.createdAt,
      });
      return this.getRequired(value.id);
    })();
  }

  update(id: string, input: ActivityUpdateInput): Activity {
    const activityId = requiredText(id, "Activity id");
    return this.db.transaction(() => {
      const current = this.getRequired(activityId);
      if (input.completed !== undefined && current.type !== "TASK") {
        throw new ActivityConflictError("Only tasks can be completed.");
      }
      const sets: string[] = [];
      const params: Record<string, string | null> = { id: activityId, updatedAt: nowIso() };
      if (input.subject !== undefined) {
        sets.push("subject = @subject");
        params.subject = nullableText(input.subject);
      }
      if (input.body !== undefined) {
        sets.push("body = @body");
        params.body = nullableText(input.body);
      }
      if (input.occurredAt !== undefined) {
        sets.push("occurred_at = @occurredAt");
        params.occurredAt = normalizeTimestamp(input.occurredAt, "Activity occurredAt", null);
      }
      if (input.dueAt !== undefined) {
        sets.push("due_at = @dueAt");
        params.dueAt = current.type === "TASK"
          ? normalizeTimestamp(input.dueAt, "Activity dueAt", null)
          : null;
      }
      if (input.completed !== undefined) {
        sets.push("completed_at = @completedAt");
        params.completedAt = input.completed ? nowIso() : null;
      }
      if (input.meta !== undefined) {
        sets.push("meta = @meta");
        params.meta = JSON.stringify(normalizeMeta(input.meta));
      }
      if (sets.length === 0) return current;
      sets.push("updated_at = @updatedAt");
      this.db.prepare(`UPDATE activities SET ${sets.join(", ")} WHERE id = @id`).run(params);
      return this.getRequired(activityId);
    })();
  }

  complete(id: string, completed = true): Activity {
    return this.update(id, { completed });
  }

  completeTask(id: string, completed = true): Activity {
    return this.complete(id, completed);
  }

  list(options: ActivityListOptions = {}): ActivityPage {
    const timelineFilter = assertTimelineFilter(options.filter ?? "all");
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    // Match the source timeline's precedence when callers accidentally provide
    // more than one anchor: deal, then contact, then company.
    if (options.dealId !== undefined) {
      clauses.push("a.deal_id = ?");
      params.push(requiredText(options.dealId, "Activity deal"));
    } else if (options.contactId !== undefined) {
      clauses.push("a.contact_id = ?");
      params.push(requiredText(options.contactId, "Activity contact"));
    } else if (options.companyId !== undefined) {
      clauses.push("a.company_id = ?");
      params.push(requiredText(options.companyId, "Activity company"));
    } else {
      throw new Error("A timeline needs a company, a contact, or a deal.");
    }
    const filter = filterClause(timelineFilter);
    if (filter) clauses.push(filter);

    if (options.cursor !== undefined) {
      const cursor = decodeCursor(options.cursor) ?? this.cursorFromId(options.cursor);
      if (!cursor) throw new Error("Activity cursor does not identify an activity.");
      if (cursor.occurredAt === null) {
        clauses.push("a.occurred_at IS NULL AND a.id < ?");
        params.push(cursor.id);
      } else {
        clauses.push(`(
          (a.occurred_at IS NOT NULL AND a.occurred_at < ?) OR
          (a.occurred_at = ? AND a.id < ?) OR
          a.occurred_at IS NULL
        )`);
        params.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
      }
    }

    const pageLimit = limit(options.limit);
    params.push(pageLimit + 1);
    const rawRows = this.db.prepare(`
      ${ACTIVITY_SELECT}
      WHERE ${clauses.join(" AND ")}
      ORDER BY (a.occurred_at IS NULL) ASC, a.occurred_at DESC, a.id DESC
      LIMIT ?
    `).all(...params) as unknown[];
    const hasMore = rawRows.length > pageLimit;
    const visibleRows = hasMore ? rawRows.slice(0, pageLimit) : rawRows;
    const entries = visibleRows.map(parseActivity);
    const last = entries[entries.length - 1];
    return {
      entries,
      nextCursor: hasMore && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
    };
  }

  timeline(options: ActivityListOptions): ActivityPage {
    return this.list(options);
  }

  listEntries(options: ActivityListOptions = {}): Activity[] {
    return this.list(options).entries;
  }

  counts(anchor: Pick<ActivityListOptions, "companyId" | "contactId" | "dealId">): ActivityCounts {
    const filters: Array<[keyof ActivityCounts, TimelineFilter]> = [
      ["all", "all"],
      ["notes", "notes"],
      ["upcoming", "upcoming"],
      ["done", "done"],
      ["email", "email"],
      ["meetings", "meetings"],
    ];
    const result = {} as ActivityCounts;
    for (const [key, filter] of filters) {
      const clauses: string[] = [];
      const params: string[] = [];
      if (anchor.dealId !== undefined) {
        clauses.push("a.deal_id = ?");
        params.push(requiredText(anchor.dealId, "Activity deal"));
      } else if (anchor.contactId !== undefined) {
        clauses.push("a.contact_id = ?");
        params.push(requiredText(anchor.contactId, "Activity contact"));
      } else if (anchor.companyId !== undefined) {
        clauses.push("a.company_id = ?");
        params.push(requiredText(anchor.companyId, "Activity company"));
      } else {
        throw new Error("A timeline needs a company, a contact, or a deal.");
      }
      const filterClauseText = filterClause(filter);
      if (filterClauseText) clauses.push(filterClauseText);
      result[key] = Number(
        this.db.prepare(`SELECT COUNT(*) AS count FROM activities AS a WHERE ${clauses.join(" AND ")}`).pluck().get(...params),
      );
    }
    return result;
  }

  myTasks(options: MyTasksOptions): Activity[] {
    const actorId = requiredText(options.actorId, "Task owner");
    const taskWindow = options.window ?? "all";
    if (taskWindow !== "all" && taskWindow !== "overdue" && taskWindow !== "upcoming") {
      throw new Error(`Invalid task window: ${taskWindow}.`);
    }
    const now = normalizeTimestamp(options.now, "Task window timestamp", nowIso());
    const clauses = [
      "a.type = 'TASK'",
      "a.completed_at IS NULL",
      "a.created_by_id = ?",
    ];
    const params: Array<string | number> = [actorId];
    if (taskWindow === "overdue") {
      clauses.push("a.due_at IS NOT NULL AND a.due_at < ?");
      params.push(now ?? nowIso());
    } else if (taskWindow === "upcoming") {
      clauses.push("a.due_at IS NOT NULL AND a.due_at >= ?");
      params.push(now ?? nowIso());
    }
    params.push(limit(options.limit));
    return this.db.prepare(`
      ${ACTIVITY_SELECT}
      WHERE ${clauses.join(" AND ")}
      ORDER BY (a.due_at IS NULL) ASC, a.due_at ASC, a.created_at DESC, a.id DESC
      LIMIT ?
    `).all(...params).map(parseActivity);
  }

  private cursorFromId(id: string): ActivityCursor | null {
    const row = this.db.prepare("SELECT id, occurred_at AS occurredAt FROM activities WHERE id = ?").get(id) as
      | { id: string; occurredAt: string | null }
      | undefined;
    return row ? { id: row.id, occurredAt: row.occurredAt } : null;
  }
}

export function createActivityStore(db: Db): ActivityStore {
  return new ActivityStore(db);
}

export function createActivity(db: Db, input: ActivityCreateInput, actorId?: string): Activity {
  return new ActivityStore(db).create(input, actorId);
}

export function getActivity(db: Db, id: string): Activity | null {
  return new ActivityStore(db).get(id);
}

export function listActivities(db: Db, options: ActivityListOptions): ActivityPage {
  return new ActivityStore(db).list(options);
}

export function timelineActivities(db: Db, options: ActivityListOptions): ActivityPage {
  return new ActivityStore(db).timeline(options);
}

export function updateActivity(db: Db, id: string, input: ActivityUpdateInput): Activity {
  return new ActivityStore(db).update(id, input);
}

export function completeActivity(db: Db, id: string, completed = true): Activity {
  return new ActivityStore(db).complete(id, completed);
}

export function listMyTasks(db: Db, options: MyTasksOptions): Activity[] {
  return new ActivityStore(db).myTasks(options);
}

export const completeTask = completeActivity;
