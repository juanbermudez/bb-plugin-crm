import { createActivity } from "./activities.js";
import { companyForEmail } from "./companies.js";
import {
  ENRICHMENT_STATUSES,
  activityFilterClause,
  isSqliteUniqueConstraint,
  newRecordId,
  nowIso,
  nullableText,
  normalizeEmail,
  normalizeLimit,
  normalizeOffset,
  RECORD_SOURCES,
  RecordConflictError,
  RecordNotFoundError,
  requiredText,
  type Db,
  type EnrichmentStatus,
  type ListOptions,
  type RecordSource,
} from "./types.js";

const SYSTEM_ACTIVITY_AUTHOR_ID = "local_user";

export interface Contact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  seniority: string | null;
  function: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  githubUrl: string | null;
  imageUrl: string | null;
  socialsCheckedAt: string | null;
  enrichmentStatus: EnrichmentStatus;
  enrichedAt: string | null;
  enrichmentError: string | null;
  companyId: string | null;
  ownerId: string | null;
  source: RecordSource;
  lastActivityAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ContactCreateInput = Partial<Omit<Contact, "id" | "createdAt" | "updatedAt" | "archivedAt">> & {
  id?: string;
  firstName: string;
};

export type ContactUpdateInput = Partial<Omit<Contact, "id" | "createdAt" | "updatedAt" | "archivedAt">>;

export interface ContactListOptions extends ListOptions {
  companyId?: string | null;
  companyIds?: readonly string[];
  ownerId?: string | null;
  ownerIds?: readonly string[];
  titles?: readonly string[];
  seniorities?: readonly string[];
  functions?: readonly string[];
  sources?: readonly RecordSource[];
  source?: RecordSource;
  enrichmentStatus?: EnrichmentStatus;
  sortBy?: "name" | "email" | "title" | "company" | "owner" | "createdAt" | "lastActivity" | "archivedAt";
  sortDirection?: "asc" | "desc";
}

const CONTACT_SELECT = `
  SELECT
    id,
    first_name AS firstName,
    last_name AS lastName,
    email,
    phone,
    title,
    seniority,
    function,
    linkedin_url AS linkedinUrl,
    twitter_url AS twitterUrl,
    github_url AS githubUrl,
    image_url AS imageUrl,
    socials_checked_at AS socialsCheckedAt,
    enrichment_status AS enrichmentStatus,
    enriched_at AS enrichedAt,
    enrichment_error AS enrichmentError,
    company_id AS companyId,
    owner_id AS ownerId,
    source,
    last_activity_at AS lastActivityAt,
    archived_at AS archivedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM contacts`;

const CONTACT_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "title",
  "seniority",
  "function",
  "linkedin_url",
  "twitter_url",
  "github_url",
  "image_url",
  "socials_checked_at",
  "enrichment_status",
  "enriched_at",
  "enrichment_error",
  "company_id",
  "owner_id",
  "source",
  "last_activity_at",
] as const;

type ContactColumn = (typeof CONTACT_COLUMNS)[number];

function assertEnum<T extends string>(value: string, values: readonly T[], label: string): T {
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${label}: ${value}.`);
}

function row(value: unknown): Contact {
  return value as Contact;
}

function normalizeCreate(input: ContactCreateInput): Contact {
  const now = nowIso();
  return {
    id: input.id?.trim() || newRecordId("con"),
    firstName: requiredText(input.firstName, "Contact first name"),
    lastName: nullableText(input.lastName),
    email: normalizeEmail(input.email),
    phone: nullableText(input.phone),
    title: nullableText(input.title),
    seniority: nullableText(input.seniority),
    function: nullableText(input.function),
    linkedinUrl: nullableText(input.linkedinUrl),
    twitterUrl: nullableText(input.twitterUrl),
    githubUrl: nullableText(input.githubUrl),
    imageUrl: nullableText(input.imageUrl),
    socialsCheckedAt: input.socialsCheckedAt ?? null,
    enrichmentStatus: assertEnum(
      input.enrichmentStatus ?? "PENDING",
      ENRICHMENT_STATUSES,
      "enrichment status",
    ),
    enrichedAt: input.enrichedAt ?? null,
    enrichmentError: nullableText(input.enrichmentError),
    companyId: nullableText(input.companyId),
    ownerId: nullableText(input.ownerId),
    source: assertEnum(input.source ?? "MANUAL", RECORD_SOURCES, "source"),
    lastActivityAt: input.lastActivityAt ?? null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function dbValues(value: Contact): Record<string, string | null> {
  return {
    id: value.id,
    first_name: value.firstName,
    last_name: value.lastName,
    email: value.email,
    phone: value.phone,
    title: value.title,
    seniority: value.seniority,
    function: value.function,
    linkedin_url: value.linkedinUrl,
    twitter_url: value.twitterUrl,
    github_url: value.githubUrl,
    image_url: value.imageUrl,
    socials_checked_at: value.socialsCheckedAt,
    enrichment_status: value.enrichmentStatus,
    enriched_at: value.enrichedAt,
    enrichment_error: value.enrichmentError,
    company_id: value.companyId,
    owner_id: value.ownerId,
    source: value.source,
    last_activity_at: value.lastActivityAt,
    archived_at: value.archivedAt,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

function nameOf(value: Pick<Contact, "firstName" | "lastName">): string {
  return [value.firstName, value.lastName].filter(Boolean).join(" ");
}

function activeContactForEmail(
  db: Db,
  email: string,
  excludeId?: string,
): { id: string; firstName: string; lastName: string | null } | undefined {
  const where = excludeId === undefined
    ? "email = ? COLLATE NOCASE AND archived_at IS NULL"
    : "email = ? COLLATE NOCASE AND archived_at IS NULL AND id <> ?";
  const statement = db.prepare(`
    SELECT id, first_name AS firstName, last_name AS lastName
    FROM contacts
    WHERE ${where}
    LIMIT 1`);
  return (excludeId === undefined
    ? statement.get(email)
    : statement.get(email, excludeId)) as
      | { id: string; firstName: string; lastName: string | null }
      | undefined;
}

function assertContactEmailAvailable(db: Db, email: string | null, excludeId?: string): void {
  if (!email) return;
  const existing = activeContactForEmail(db, email, excludeId);
  if (existing) {
    throw new RecordConflictError(
      "contact",
      "email",
      email,
      `${nameOf(existing)} already uses ${email}.`,
    );
  }
}

function rethrowContactEmailConflict(error: unknown, email: string | null): never {
  if (email && isSqliteUniqueConstraint(error, "contacts", "email")) {
    throw new RecordConflictError(
      "contact",
      "email",
      email,
      "Another contact already uses that email address.",
    );
  }
  throw error;
}

function suppressContact(db: Db, value: Contact): void {
  if (!value.email) return;
  db.prepare(`
    INSERT INTO suppressed_contacts (email, reason)
    VALUES (@email, @reason)
    ON CONFLICT(email) DO NOTHING
  `).run({
    email: value.email,
    reason: `Deleted from the CRM (${nameOf(value)})`,
  });
}

function allowContactAgain(db: Db, email: string | null): void {
  if (!email) return;
  db.prepare("DELETE FROM suppressed_contacts WHERE email = ? COLLATE NOCASE").run(email);
}

export class ContactStore {
  constructor(private readonly db: Db) {}

  get(id: string, options: { includeArchived?: boolean } = {}): Contact | null {
    const condition = options.includeArchived === false ? " AND archived_at IS NULL" : "";
    return row(
      this.db.prepare(`${CONTACT_SELECT} WHERE id = ?${condition}`).get(id),
    ) ?? null;
  }

  getRequired(id: string): Contact {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("contact", id);
    return value;
  }

  create(input: ContactCreateInput): Contact {
    const value = normalizeCreate(input);
    assertContactEmailAvailable(this.db, value.email);
    const companyId = value.companyId ?? (value.email
      ? companyForEmail(this.db, value.email, {
          ownerId: value.ownerId,
          source: value.source === "CALENDAR" ? "CALENDAR" : "EMAIL",
        })
      : null);
    const next = { ...value, companyId };
    return this.db.transaction(() => {
      allowContactAgain(this.db, next.email);
      try {
        this.db.prepare(`
          INSERT INTO contacts (
            id, first_name, last_name, email, phone, title, seniority, function,
            linkedin_url, twitter_url, github_url, image_url, socials_checked_at,
            enrichment_status, enriched_at, enrichment_error, company_id, owner_id,
            source, last_activity_at, archived_at, created_at, updated_at
          ) VALUES (
            @id, @first_name, @last_name, @email, @phone, @title, @seniority,
            @function, @linkedin_url, @twitter_url, @github_url, @image_url,
            @socials_checked_at, @enrichment_status, @enriched_at,
            @enrichment_error, @company_id, @owner_id, @source, @last_activity_at,
            @archived_at, @created_at, @updated_at
          )`).run(dbValues(next));
      } catch (error) {
        rethrowContactEmailConflict(error, next.email);
      }
      return this.getRequired(next.id);
    })();
  }

  list(options: ContactListOptions = {}): Contact[] {
    const { where, params } = this.listWhere(options);
    params.limit = normalizeLimit(options.limit);
    params.offset = normalizeOffset(options.offset);
    const sortColumns: Record<NonNullable<ContactListOptions["sortBy"]>, string> = {
      name: "last_name",
      email: "email",
      title: "title",
      company: "(SELECT name FROM companies WHERE companies.id = contacts.company_id)",
      owner: "owner_id",
      createdAt: "created_at",
      lastActivity: "last_activity_at",
      archivedAt: "archived_at",
    };
    const sortColumn = sortColumns[options.sortBy ?? "name"];
    const direction = options.sortDirection === "desc" ? "DESC" : "ASC";
    const nullLast = options.sortBy === "lastActivity" || options.sortBy === "archivedAt"
      ? `${sortColumn} IS NULL ASC, `
      : "";
    const nameTieDirection = options.sortBy === "name" ? direction : "ASC";
    return this.db
      .prepare(`${CONTACT_SELECT}${where} ORDER BY ${nullLast}${sortColumn} COLLATE NOCASE ${direction}, last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ${nameTieDirection}, id ${direction} LIMIT @limit OFFSET @offset`)
      .all(params)
      .map(row);
  }

  count(options: Omit<ContactListOptions, "limit" | "offset"> = {}): number {
    const { where, params } = this.listWhere(options);
    return (
      this.db.prepare(`SELECT COUNT(*) AS count FROM contacts${where}`).get(params) as {
        count: number;
      }
    ).count;
  }

  private listWhere(options: ContactListOptions): {
    where: string;
    params: Record<string, string | number>;
  } {
    const clauses: string[] = [];
    const params: Record<string, string | number> = {};
    if (options.recordIds !== undefined) {
      if (options.recordIds.length === 0) clauses.push("1 = 0");
      else {
        const placeholders = options.recordIds.map((value, index) => {
          const key = `recordId${index}`;
          params[key] = value;
          return `@${key}`;
        });
        clauses.push(`id IN (${placeholders.join(", ")})`);
      }
    }
    if (options.archivedOnly) clauses.push("archived_at IS NOT NULL");
    else if (!options.includeArchived) clauses.push("archived_at IS NULL");
    if (options.companyId === null) clauses.push("company_id IS NULL");
    else if (options.companyId !== undefined) {
      clauses.push("company_id = @companyId");
      params.companyId = options.companyId;
    }
    if (options.companyIds !== undefined && options.companyIds.length > 0) {
      const conditions: string[] = [];
      const assigned = options.companyIds.filter((value) => value !== "unassigned");
      if (options.companyIds.includes("unassigned")) conditions.push("company_id IS NULL");
      if (assigned.length > 0) {
        const placeholders = assigned.map((value, index) => {
          const key = `company${index}`;
          params[key] = value;
          return `@${key}`;
        });
        conditions.push(`company_id IN (${placeholders.join(", ")})`);
      }
      clauses.push(`(${conditions.join(" OR ")})`);
    }
    if (options.ownerId === null) clauses.push("owner_id IS NULL");
    else if (options.ownerId !== undefined) {
      clauses.push("owner_id = @ownerId");
      params.ownerId = options.ownerId;
    }
    if (options.ownerIds !== undefined && options.ownerIds.length > 0) {
      const conditions: string[] = [];
      const assigned = options.ownerIds.filter((value) => value !== "unassigned");
      if (options.ownerIds.includes("unassigned")) conditions.push("owner_id IS NULL");
      if (assigned.length > 0) {
        const placeholders = assigned.map((value, index) => {
          const key = `owner${index}`;
          params[key] = value;
          return `@${key}`;
        });
        conditions.push(`owner_id IN (${placeholders.join(", ")})`);
      }
      clauses.push(`(${conditions.join(" OR ")})`);
    }
    if (options.titles !== undefined && options.titles.length > 0) {
      const placeholders = options.titles.map((value, index) => {
        const key = `title${index}`;
        params[key] = value;
        return `@${key}`;
      });
      clauses.push(`title IN (${placeholders.join(", ")})`);
    }
    if (options.seniorities !== undefined && options.seniorities.length > 0) {
      const placeholders = options.seniorities.map((value, index) => {
        const key = `seniority${index}`;
        params[key] = value;
        return `@${key}`;
      });
      clauses.push(`seniority IN (${placeholders.join(", ")})`);
    }
    if (options.functions !== undefined && options.functions.length > 0) {
      const placeholders = options.functions.map((value, index) => {
        const key = `function${index}`;
        params[key] = value;
        return `@${key}`;
      });
      clauses.push(`function IN (${placeholders.join(", ")})`);
    }
    if (options.source !== undefined) {
      assertEnum(options.source, RECORD_SOURCES, "source");
      clauses.push("source = @source");
      params.source = options.source;
    }
    if (options.sources !== undefined && options.sources.length > 0) {
      const placeholders = options.sources.map((value, index) => {
        const key = `source${index}`;
        params[key] = assertEnum(value, RECORD_SOURCES, "source");
        return `@${key}`;
      });
      clauses.push(`source IN (${placeholders.join(", ")})`);
    }
    if (options.enrichmentStatus !== undefined) {
      assertEnum(options.enrichmentStatus, ENRICHMENT_STATUSES, "enrichment status");
      clauses.push("enrichment_status = @enrichmentStatus");
      params.enrichmentStatus = options.enrichmentStatus;
    }
    const search = options.search?.trim();
    if (search) {
      clauses.push(`(
        first_name LIKE @search COLLATE NOCASE OR
        last_name LIKE @search COLLATE NOCASE OR
        email LIKE @search COLLATE NOCASE OR
        title LIKE @search COLLATE NOCASE OR
        company_id IN (
          SELECT id FROM companies
          WHERE name LIKE @search COLLATE NOCASE
        )
      )`);
      params.search = `%${search}%`;
    }
    const activity = activityFilterClause(options.activity, "last_activity_at", params);
    if (activity) clauses.push(activity);
    return {
      where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  update(id: string, input: ContactUpdateInput): Contact {
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      const next: Contact = { ...current };
      let enrichmentStatusChanged = false;
      const has = (key: keyof ContactUpdateInput): boolean => input[key] !== undefined;
      if (has("firstName")) next.firstName = requiredText(input.firstName as string, "Contact first name");
      if (has("lastName")) next.lastName = nullableText(input.lastName);
      if (has("email")) next.email = normalizeEmail(input.email);
      if (has("phone")) next.phone = nullableText(input.phone);
      if (has("title")) next.title = nullableText(input.title);
      if (has("seniority")) next.seniority = nullableText(input.seniority);
      if (has("function")) next.function = nullableText(input.function);
      if (has("linkedinUrl")) next.linkedinUrl = nullableText(input.linkedinUrl);
      if (has("twitterUrl")) next.twitterUrl = nullableText(input.twitterUrl);
      if (has("githubUrl")) next.githubUrl = nullableText(input.githubUrl);
      if (has("imageUrl")) next.imageUrl = nullableText(input.imageUrl);
      if (has("socialsCheckedAt")) next.socialsCheckedAt = input.socialsCheckedAt ?? null;
      if (has("enrichmentStatus")) {
        next.enrichmentStatus = assertEnum(input.enrichmentStatus as string, ENRICHMENT_STATUSES, "enrichment status");
        enrichmentStatusChanged = next.enrichmentStatus !== current.enrichmentStatus;
      }
      if (has("enrichedAt")) next.enrichedAt = input.enrichedAt ?? null;
      if (has("enrichmentError")) next.enrichmentError = nullableText(input.enrichmentError);
      if (has("companyId")) next.companyId = nullableText(input.companyId);
      if (has("ownerId")) next.ownerId = nullableText(input.ownerId);
      if (has("source")) next.source = assertEnum(input.source as string, RECORD_SOURCES, "source");
      if (has("lastActivityAt")) next.lastActivityAt = input.lastActivityAt ?? null;
      next.updatedAt = nowIso();
      const values = dbValues(next);
      const changed: readonly ContactColumn[] = CONTACT_COLUMNS;
      assertContactEmailAvailable(this.db, next.email, id);
      try {
        this.db
          .prepare(`UPDATE contacts SET ${changed.map((column) => `${column} = @${column}`).join(", ")}, updated_at = @updated_at WHERE id = @id`)
          .run(values);
      } catch (error) {
        rethrowContactEmailConflict(error, next.email);
      }
      if (has("email")) allowContactAgain(this.db, next.email);
      if (enrichmentStatusChanged) {
        const occurredAt = next.updatedAt;
        createActivity(
          this.db,
          {
            type: "ENRICHMENT",
            subject: "Enrichment status changed",
            body: next.enrichmentError,
            occurredAt,
            contactId: next.id,
            createdById: SYSTEM_ACTIVITY_AUTHOR_ID,
            meta: { from: current.enrichmentStatus, to: next.enrichmentStatus },
          },
          SYSTEM_ACTIVITY_AUTHOR_ID,
        );
        this.db
          .prepare(`
            UPDATE contacts
            SET last_activity_at = CASE
              WHEN last_activity_at IS NULL OR last_activity_at < @occurredAt
                THEN @occurredAt
              ELSE last_activity_at
            END
            WHERE id = @id
          `)
          .run({ id: next.id, occurredAt });
        if (next.companyId) {
          this.db
            .prepare(`
              UPDATE companies
              SET last_activity_at = CASE
                WHEN last_activity_at IS NULL OR last_activity_at < @occurredAt
                  THEN @occurredAt
                ELSE last_activity_at
              END
              WHERE id = @companyId
            `)
            .run({ companyId: next.companyId, occurredAt });
        }
      }
      return this.getRequired(id);
    })();
  }

  archive(id: string): Contact {
    return this.setArchived(id, nowIso());
  }

  restore(id: string): Contact {
    return this.setArchived(id, null);
  }

  private setArchived(id: string, archivedAt: string | null): Contact {
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      if (archivedAt === null) assertContactEmailAvailable(this.db, current.email, id);
      try {
        this.db.prepare("UPDATE contacts SET archived_at = @archivedAt, updated_at = @updatedAt WHERE id = @id").run({
          id,
          archivedAt,
          updatedAt: nowIso(),
        });
      } catch (error) {
        rethrowContactEmailConflict(error, current.email);
      }
      return this.getRequired(id);
    })();
  }

  purge(id: string): Contact {
    return this.db.transaction(() => {
      const value = this.getRequired(id);
      this.db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
      suppressContact(this.db, value);
      return value;
    })();
  }
}

export function createContactStore(db: Db): ContactStore {
  return new ContactStore(db);
}

export function createContact(db: Db, input: ContactCreateInput): Contact {
  return new ContactStore(db).create(input);
}

export function getContact(db: Db, id: string, options?: { includeArchived?: boolean }): Contact | null {
  return new ContactStore(db).get(id, options);
}

export function listContacts(db: Db, options?: ContactListOptions): Contact[] {
  return new ContactStore(db).list(options);
}

export function updateContact(db: Db, id: string, input: ContactUpdateInput): Contact {
  return new ContactStore(db).update(id, input);
}

export function archiveContact(db: Db, id: string): Contact {
  return new ContactStore(db).archive(id);
}

export function restoreContact(db: Db, id: string): Contact {
  return new ContactStore(db).restore(id);
}

export function purgeContact(db: Db, id: string): Contact {
  return new ContactStore(db).purge(id);
}

export function isContactSuppressed(db: Db, email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return db.prepare("SELECT 1 FROM suppressed_contacts WHERE email = ? COLLATE NOCASE LIMIT 1").get(normalized) !== undefined;
}

export const deleteContact = purgeContact;
