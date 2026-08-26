import {
  newRecordId,
  normalizeDomain,
  nullableText,
  nowIso,
  requiredText,
  RecordNotFoundError,
  type Db,
} from "./types.js";

export const FACT_BANDS = ["VERIFIED", "PROBABLE", "POSSIBLE"] as const;
export type FactBand = (typeof FACT_BANDS)[number];

export const FACT_STATUSES = [
  "APPLIED",
  "PROPOSED",
  "DISMISSED",
  "SUPERSEDED",
] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const FACT_FIELDS = [
  "name",
  "title",
  "linkedinUrl",
  "twitterUrl",
  "githubUrl",
  "employer",
  "seniority",
  "function",
  "location",
  "tenure",
] as const;
export type FactField = (typeof FACT_FIELDS)[number];

export const EVIDENCE_KINDS = [
  "profile.email-match",
  "linkedin.employer-and-name",
  "crm.thread-reply",
  "crm.signature-block",
  "github.account-identity",
  "crm.meeting-attendance",
  "web.cited-claim",
  "handle.name-form",
  "search.cites-profile",
  "employer-only",
  "contradiction",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface Evidence {
  kind: EvidenceKind;
  detail: string;
  sourceUrl: string | null;
}

export type EvidenceInput = Omit<Evidence, "sourceUrl"> & {
  sourceUrl?: string | null;
};

export interface ContactFact {
  id: string;
  contactId: string;
  field: FactField;
  value: string;
  score: number;
  band: FactBand;
  evidence: Evidence[];
  method: string;
  sourceUrl: string | null;
  sessionId: string | null;
  status: FactStatus;
  decidedById: string | null;
  decidedAt: string | null;
  observedAt: string;
  supersededAt: string | null;
  /** The older fact this row replaced, when known. */
  supersedesId: string | null;
  /** The newer fact that replaced this row, when known. */
  supersededById: string | null;
  createdAt: string;
}

export interface ContactFactCreateInput {
  id?: string;
  contactId: string;
  field: FactField;
  value: string;
  score: number;
  band: FactBand;
  evidence: readonly EvidenceInput[];
  method: string;
  sourceUrl?: string | null;
  sessionId?: string | null;
  status?: FactStatus;
  decidedById?: string | null;
  decidedAt?: string | null;
  observedAt?: string;
  supersededAt?: string | null;
  supersedesId?: string | null;
}

export type FactDecision = "accept" | "dismiss";

export interface FactListOptions {
  field?: FactField;
  statuses?: readonly FactStatus[];
  includeSuperseded?: boolean;
  limit?: number;
}

export interface BriefSections {
  currentRole?: string;
  tenure?: string;
  previousRoles?: string[];
  seniority?: string;
  function?: string;
  location?: string;
}

export interface ContactBrief {
  id: string;
  contactId: string;
  version: number;
  narrative: string;
  sections: BriefSections;
  score: number;
  sourceUrl: string | null;
  sessionId: string | null;
  refreshedAt: string;
  createdAt: string;
}

export interface ContactBriefCreateInput {
  id?: string;
  contactId: string;
  /** When omitted, the store allocates the next version atomically. */
  version?: number;
  narrative: string;
  sections: BriefSections;
  score: number;
  sourceUrl?: string | null;
  sessionId?: string | null;
  refreshedAt?: string;
}

export interface WorkHistoryRole {
  id: string;
  contactId: string;
  title: string | null;
  organizationName: string | null;
  organizationDomain: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  description: string | null;
  isCurrent: boolean;
  score: number;
  band: FactBand;
  evidence: Evidence[];
  method: string;
  sourceUrl: string | null;
  sessionId: string | null;
  status: FactStatus;
  decidedById: string | null;
  decidedAt: string | null;
  observedAt: string;
  supersededAt: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  createdAt: string;
}

export interface WorkHistoryCreateInput {
  id?: string;
  contactId: string;
  title?: string | null;
  organizationName?: string | null;
  organizationDomain?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
  isCurrent?: boolean;
  score: number;
  band: FactBand;
  evidence: readonly EvidenceInput[];
  method: string;
  sourceUrl?: string | null;
  sessionId?: string | null;
  status?: FactStatus;
  decidedById?: string | null;
  decidedAt?: string | null;
  observedAt?: string;
  supersededAt?: string | null;
  supersedesId?: string | null;
}

export interface WorkHistoryListOptions {
  statuses?: readonly FactStatus[];
  includeSuperseded?: boolean;
  limit?: number;
}

export class EvidenceConflictError extends Error {
  readonly code = "CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "EvidenceConflictError";
  }
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonValue(value: unknown, label: string): asserts value is JsonValue {
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

function encodeJson(value: unknown, label: string): string {
  assertJsonValue(value, label);
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error(`${label} must be JSON serializable.`);
  return encoded;
}

function decodeJson(value: unknown, label: string): unknown {
  if (typeof value !== "string") throw new Error(`${label} is not JSON text.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  assertJsonValue(parsed, label);
  return parsed;
}

function assertOneOf<T extends string>(value: string, values: readonly T[], label: string): T {
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${label}: ${value}.`);
}

function score(value: number, label = "score"): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number between 0 and 1.`);
  }
  return value;
}

function normalizedEvidence(input: readonly EvidenceInput[]): Evidence[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("At least one evidence item is required.");
  }
  return input.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Evidence item ${index} must be an object.`);
    }
    const source = item as EvidenceInput;
    return {
      kind: assertOneOf(source.kind, EVIDENCE_KINDS, "evidence kind"),
      detail: requiredText(source.detail, "Evidence detail"),
      sourceUrl: nullableText(source.sourceUrl),
    };
  });
}

function normalizedSections(input: BriefSections): BriefSections {
  if (!isPlainObject(input)) throw new Error("Brief sections must be an object.");
  const allowed = new Set([
    "currentRole",
    "tenure",
    "previousRoles",
    "seniority",
    "function",
    "location",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`Unknown brief section: ${key}.`);
  }
  const output: BriefSections = {};
  for (const key of ["currentRole", "tenure", "seniority", "function", "location"] as const) {
    const value = (input as BriefSections)[key];
    if (value !== undefined) {
      if (typeof value !== "string") throw new Error(`Brief ${key} must be text.`);
      output[key] = requiredText(value, `Brief ${key}`);
    }
  }
  if (input.previousRoles !== undefined) {
    if (!Array.isArray(input.previousRoles)) throw new Error("Brief previousRoles must be an array.");
    output.previousRoles = input.previousRoles.map((value, index) => {
      if (typeof value !== "string") throw new Error(`Brief previousRoles[${index}] must be text.`);
      return requiredText(value, `Brief previousRoles[${index}]`);
    });
  }
  return output;
}

function normalizeFactInput(input: ContactFactCreateInput): ContactFact {
  const now = nowIso();
  const status = assertOneOf(input.status ?? "PROPOSED", FACT_STATUSES, "fact status");
  const field = assertOneOf(input.field, FACT_FIELDS, "fact field");
  const fact: ContactFact = {
    id: input.id?.trim() || newRecordId("fact"),
    contactId: requiredText(input.contactId, "Fact contact"),
    field,
    value: requiredText(input.value, "Fact value"),
    score: score(input.score),
    band: assertOneOf(input.band, FACT_BANDS, "fact band"),
    evidence: normalizedEvidence(input.evidence),
    method: requiredText(input.method, "Fact method"),
    sourceUrl: nullableText(input.sourceUrl),
    sessionId: nullableText(input.sessionId),
    status,
    decidedById: nullableText(input.decidedById),
    decidedAt: input.decidedAt ?? null,
    observedAt: input.observedAt ?? now,
    supersededAt: input.supersededAt ?? (status === "SUPERSEDED" ? now : null),
    supersedesId: nullableText(input.supersedesId),
    supersededById: null,
    createdAt: now,
  };
  if (status === "SUPERSEDED" && !fact.supersededAt) fact.supersededAt = now;
  return fact;
}

function normalizeBriefInput(input: ContactBriefCreateInput): ContactBrief {
  const now = nowIso();
  const version = input.version;
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) {
    throw new Error("Brief version must be a positive integer.");
  }
  return {
    id: input.id?.trim() || newRecordId("brief"),
    contactId: requiredText(input.contactId, "Brief contact"),
    version: version ?? 0,
    narrative: requiredText(input.narrative, "Brief narrative"),
    sections: normalizedSections(input.sections),
    score: score(input.score, "Brief score"),
    sourceUrl: nullableText(input.sourceUrl),
    sessionId: nullableText(input.sessionId),
    refreshedAt: input.refreshedAt ?? now,
    createdAt: now,
  };
}

function normalizeWorkHistoryInput(input: WorkHistoryCreateInput): WorkHistoryRole {
  const now = nowIso();
  const status = assertOneOf(input.status ?? "PROPOSED", FACT_STATUSES, "work-history status");
  return {
    id: input.id?.trim() || newRecordId("work"),
    contactId: requiredText(input.contactId, "Work-history contact"),
    title: nullableText(input.title),
    organizationName: nullableText(input.organizationName),
    organizationDomain: normalizeDomain(input.organizationDomain),
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    location: nullableText(input.location),
    description: nullableText(input.description),
    isCurrent: input.isCurrent ?? (input.endDate == null),
    score: score(input.score, "Work-history score"),
    band: assertOneOf(input.band, FACT_BANDS, "work-history band"),
    evidence: normalizedEvidence(input.evidence),
    method: requiredText(input.method, "Work-history method"),
    sourceUrl: nullableText(input.sourceUrl),
    sessionId: nullableText(input.sessionId),
    status,
    decidedById: nullableText(input.decidedById),
    decidedAt: input.decidedAt ?? null,
    observedAt: input.observedAt ?? now,
    supersededAt: input.supersededAt ?? (status === "SUPERSEDED" ? now : null),
    supersedesId: nullableText(input.supersedesId),
    supersededById: null,
    createdAt: now,
  };
}

const FACT_SELECT = `
  SELECT
    id,
    contact_id AS contactId,
    field,
    value,
    score,
    band,
    evidence,
    method,
    source_url AS sourceUrl,
    session_id AS sessionId,
    status,
    decided_by_id AS decidedById,
    decided_at AS decidedAt,
    observed_at AS observedAt,
    superseded_at AS supersededAt,
    supersedes_id AS supersedesId,
    superseded_by_id AS supersededById,
    created_at AS createdAt
  FROM contact_facts`;

function parseFact(value: unknown): ContactFact {
  if (!value || typeof value !== "object") throw new Error("Missing contact fact row.");
  const source = value as Record<string, unknown>;
  return {
    id: requiredText(String(source.id), "Fact id"),
    contactId: requiredText(String(source.contactId), "Fact contact"),
    field: assertOneOf(String(source.field), FACT_FIELDS, "fact field"),
    value: requiredText(String(source.value), "Fact value"),
    score: score(Number(source.score)),
    band: assertOneOf(String(source.band), FACT_BANDS, "fact band"),
    evidence: normalizedEvidence(decodeJson(source.evidence, "Fact evidence") as EvidenceInput[]),
    method: requiredText(String(source.method), "Fact method"),
    sourceUrl: nullableText(source.sourceUrl as string | null | undefined),
    sessionId: nullableText(source.sessionId as string | null | undefined),
    status: assertOneOf(String(source.status), FACT_STATUSES, "fact status"),
    decidedById: nullableText(source.decidedById as string | null | undefined),
    decidedAt: (source.decidedAt as string | null | undefined) ?? null,
    observedAt: requiredText(String(source.observedAt), "Fact observed timestamp"),
    supersededAt: (source.supersededAt as string | null | undefined) ?? null,
    supersedesId: (source.supersedesId as string | null | undefined) ?? null,
    supersededById: (source.supersededById as string | null | undefined) ?? null,
    createdAt: requiredText(String(source.createdAt), "Fact created timestamp"),
  };
}

export class ContactFactStore {
  constructor(private readonly db: Db) {}

  get(id: string): ContactFact | null {
    const raw = this.db.prepare(`${FACT_SELECT} WHERE id = ?`).get(id);
    return raw === undefined ? null : parseFact(raw);
  }

  getRequired(id: string): ContactFact {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("contact fact", id);
    return value;
  }

  list(contactId: string, options: FactListOptions = {}): ContactFact[] {
    const clauses = ["contact_id = ?"];
    const params: unknown[] = [requiredText(contactId, "Fact contact")];
    if (options.field !== undefined) {
      clauses.push("field = ?");
      params.push(assertOneOf(options.field, FACT_FIELDS, "fact field"));
    }
    if (options.statuses !== undefined) {
      const statuses = options.statuses.map((status) =>
        assertOneOf(status, FACT_STATUSES, "fact status"),
      );
      const filtered = options.includeSuperseded === false
        ? statuses.filter((status) => status !== "SUPERSEDED")
        : statuses;
      if (filtered.length === 0) return [];
      clauses.push(`status IN (${filtered.map(() => "?").join(", ")})`);
      params.push(...filtered);
    } else if (options.includeSuperseded === false) {
      clauses.push("status <> 'SUPERSEDED'");
    }
    const limit = options.limit ?? 500;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1_000) {
      throw new Error("Fact list limit must be an integer between 0 and 1000.");
    }
    params.push(limit);
    return this.db
      .prepare(`${FACT_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY observed_at DESC, created_at DESC, id DESC LIMIT ?`)
      .all(...params)
      .map(parseFact);
  }

  latest(contactId: string, field: FactField): ContactFact | null {
    return this.list(contactId, {
      field,
      statuses: ["APPLIED", "PROPOSED"],
    })[0] ?? null;
  }

  create(input: ContactFactCreateInput): ContactFact {
    const fact = normalizeFactInput(input);
    return this.db.transaction(() => {
      const superseded = fact.supersedesId
        ? this.getRequired(fact.supersedesId)
        : null;
      if (superseded && (superseded.contactId !== fact.contactId || superseded.field !== fact.field)) {
        throw new EvidenceConflictError("A fact may only supersede a fact for the same contact and field.");
      }
      const insert = this.db.prepare(`
        INSERT INTO contact_facts (
          id, contact_id, field, value, score, band, evidence, method, source_url,
          session_id, status, decided_by_id, decided_at, observed_at,
          superseded_at, supersedes_id, superseded_by_id, created_at
        ) VALUES (
          @id, @contactId, @field, @value, @score, @band, @evidence, @method,
          @sourceUrl, @sessionId, @status, @decidedById, @decidedAt,
          @observedAt, @supersededAt, @supersedesId, NULL, @createdAt
        )`);
      insert.run({
        id: fact.id,
        contactId: fact.contactId,
        field: fact.field,
        value: fact.value,
        score: fact.score,
        band: fact.band,
        evidence: encodeJson(fact.evidence, "Fact evidence"),
        method: fact.method,
        sourceUrl: fact.sourceUrl,
        sessionId: fact.sessionId,
        status: fact.status,
        decidedById: fact.decidedById,
        decidedAt: fact.decidedAt,
        observedAt: fact.observedAt,
        supersededAt: fact.supersededAt,
        supersedesId: fact.supersedesId,
        createdAt: fact.createdAt,
      });
      const supersedeIds = new Set<string>();
      if (superseded) supersedeIds.add(superseded.id);
      if (fact.status === "APPLIED") {
        const rows = this.db
          .prepare(
            `SELECT id FROM contact_facts
             WHERE contact_id = ? AND field = ? AND id <> ?
               AND status IN ('APPLIED', 'PROPOSED')`,
          )
          .all(fact.contactId, fact.field, fact.id) as Array<{ id: string }>;
        rows.forEach((item) => supersedeIds.add(item.id));
      }
      const supersede = this.db.prepare(`
        UPDATE contact_facts
        SET status = 'SUPERSEDED', superseded_at = @at, superseded_by_id = @by
        WHERE id = @id AND status <> 'SUPERSEDED'
      `);
      const supersededAt = nowIso();
      for (const id of supersedeIds) supersede.run({ id, at: supersededAt, by: fact.id });
      return this.getRequired(fact.id);
    })();
  }

  decide(id: string, decision: FactDecision, decidedById: string): ContactFact {
    if (decision !== "accept" && decision !== "dismiss") {
      throw new Error(`Invalid fact decision: ${decision}.`);
    }
    const actor = requiredText(decidedById, "Fact decision author");
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      if (current.status !== "PROPOSED") {
        throw new EvidenceConflictError("That fact has already been settled.");
      }
      const now = nowIso();
      if (decision === "accept") {
        const previous = this.db
          .prepare(
            `SELECT id FROM contact_facts
             WHERE contact_id = ? AND field = ? AND id <> ?
               AND status IN ('APPLIED', 'PROPOSED')`,
          )
          .all(current.contactId, current.field, current.id) as Array<{ id: string }>;
        const supersede = this.db.prepare(`
          UPDATE contact_facts
          SET status = 'SUPERSEDED', superseded_at = @at, superseded_by_id = @by
          WHERE id = @id
        `);
        for (const row of previous) supersede.run({ id: row.id, at: now, by: current.id });
      }
      this.db.prepare(`
        UPDATE contact_facts
        SET status = @status, decided_by_id = @decidedById, decided_at = @decidedAt
        WHERE id = @id
      `).run({
        id,
        status: decision === "accept" ? "APPLIED" : "DISMISSED",
        decidedById: actor,
        decidedAt: now,
      });
      if (decision === "accept") this.applyFactToContact(current.contactId, current.field, current.value, now);
      return this.getRequired(id);
    })();
  }

  supersede(id: string, replacementId?: string): ContactFact {
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      if (current.status === "SUPERSEDED") {
        throw new EvidenceConflictError("That fact is already superseded.");
      }
      if (replacementId !== undefined) {
        const replacement = this.getRequired(replacementId);
        if (
          replacement.id === current.id ||
          replacement.contactId !== current.contactId ||
          replacement.field !== current.field
        ) {
          throw new EvidenceConflictError("A replacement fact must share the contact and field.");
        }
        if (replacement.status === "SUPERSEDED") {
          throw new EvidenceConflictError("A superseded fact cannot replace another fact.");
        }
        this.db.prepare("UPDATE contact_facts SET supersedes_id = ? WHERE id = ?").run(current.id, replacement.id);
      }
      this.db.prepare(`
        UPDATE contact_facts
        SET status = 'SUPERSEDED', superseded_at = ?, superseded_by_id = ?
        WHERE id = ?
      `).run(nowIso(), replacementId ?? null, current.id);
      return this.getRequired(current.id);
    })();
  }

  private applyFactToContact(contactId: string, field: FactField, value: string, updatedAt: string): void {
    const column: Partial<Record<FactField, string>> = {
      title: "title",
      linkedinUrl: "linkedin_url",
      twitterUrl: "twitter_url",
      githubUrl: "github_url",
      seniority: "seniority",
      function: "function",
    };
    if (field === "name") {
      const [firstName, ...rest] = value.trim().split(/\s+/);
      this.db.prepare(`
        UPDATE contacts
        SET first_name = @firstName, last_name = @lastName, updated_at = @updatedAt
        WHERE id = @contactId
      `).run({
        contactId,
        firstName,
        lastName: rest.length > 0 ? rest.join(" ") : null,
        updatedAt,
      });
      return;
    }
    const target = column[field];
    if (!target) return;
    this.db.prepare(`UPDATE contacts SET ${target} = @value, updated_at = @updatedAt WHERE id = @contactId`).run({
      contactId,
      value,
      updatedAt,
    });
  }
}

const BRIEF_SELECT = `
  SELECT
    id,
    contact_id AS contactId,
    version,
    narrative,
    sections,
    score,
    source_url AS sourceUrl,
    session_id AS sessionId,
    refreshed_at AS refreshedAt,
    created_at AS createdAt
  FROM contact_briefs`;

function parseBrief(value: unknown): ContactBrief {
  if (!value || typeof value !== "object") throw new Error("Missing contact brief row.");
  const source = value as Record<string, unknown>;
  return {
    id: requiredText(String(source.id), "Brief id"),
    contactId: requiredText(String(source.contactId), "Brief contact"),
    version: Number(source.version),
    narrative: requiredText(String(source.narrative), "Brief narrative"),
    sections: normalizedSections(decodeJson(source.sections, "Brief sections") as BriefSections),
    score: score(Number(source.score), "Brief score"),
    sourceUrl: nullableText(source.sourceUrl as string | null | undefined),
    sessionId: nullableText(source.sessionId as string | null | undefined),
    refreshedAt: requiredText(String(source.refreshedAt), "Brief refreshed timestamp"),
    createdAt: requiredText(String(source.createdAt), "Brief created timestamp"),
  };
}

export class ContactBriefStore {
  constructor(private readonly db: Db) {}

  get(id: string): ContactBrief | null {
    const raw = this.db.prepare(`${BRIEF_SELECT} WHERE id = ?`).get(id);
    return raw === undefined ? null : parseBrief(raw);
  }

  getRequired(id: string): ContactBrief {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("contact brief", id);
    return value;
  }

  getVersion(contactId: string, version: number): ContactBrief | null {
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("Brief version must be a positive integer.");
    const raw = this.db.prepare(`${BRIEF_SELECT} WHERE contact_id = ? AND version = ?`).get(contactId, version);
    return raw === undefined ? null : parseBrief(raw);
  }

  list(contactId: string, limit = 100): ContactBrief[] {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1_000) {
      throw new Error("Brief list limit must be an integer between 0 and 1000.");
    }
    return this.db
      .prepare(`${BRIEF_SELECT} WHERE contact_id = ? ORDER BY version DESC LIMIT ?`)
      .all(requiredText(contactId, "Brief contact"), limit)
      .map(parseBrief);
  }

  latest(contactId: string): ContactBrief | null {
    const raw = this.db
      .prepare(`${BRIEF_SELECT} WHERE contact_id = ? ORDER BY version DESC LIMIT 1`)
      .get(requiredText(contactId, "Brief contact"));
    return raw === undefined ? null : parseBrief(raw);
  }

  create(input: ContactBriefCreateInput): ContactBrief {
    const brief = normalizeBriefInput(input);
    return this.db.transaction(() => {
      const nextVersion = Number(
        this.db
          .prepare("SELECT COALESCE(MAX(version), 0) + 1 FROM contact_briefs WHERE contact_id = ?")
          .pluck()
          .get(brief.contactId),
      );
      const version = brief.version || nextVersion;
      const insert = this.db.prepare(`
        INSERT INTO contact_briefs (
          id, contact_id, version, narrative, sections, score, source_url,
          session_id, refreshed_at, created_at
        ) VALUES (
          @id, @contactId, @version, @narrative, @sections, @score, @sourceUrl,
          @sessionId, @refreshedAt, @createdAt
        )`);
      insert.run({
        id: brief.id,
        contactId: brief.contactId,
        version,
        narrative: brief.narrative,
        sections: encodeJson(brief.sections, "Brief sections"),
        score: brief.score,
        sourceUrl: brief.sourceUrl,
        sessionId: brief.sessionId,
        refreshedAt: brief.refreshedAt,
        createdAt: brief.createdAt,
      });
      return this.getRequired(brief.id);
    })();
  }

  /** Alias used by callers that conceptually replace the current brief. */
  save(input: ContactBriefCreateInput): ContactBrief {
    return this.create(input);
  }
}

const WORK_SELECT = `
  SELECT
    id,
    contact_id AS contactId,
    title,
    organization_name AS organizationName,
    organization_domain AS organizationDomain,
    start_date AS startDate,
    end_date AS endDate,
    location,
    description,
    is_current AS isCurrent,
    score,
    band,
    evidence,
    method,
    source_url AS sourceUrl,
    session_id AS sessionId,
    status,
    decided_by_id AS decidedById,
    decided_at AS decidedAt,
    observed_at AS observedAt,
    superseded_at AS supersededAt,
    supersedes_id AS supersedesId,
    superseded_by_id AS supersededById,
    created_at AS createdAt
  FROM contact_work_history`;

function parseWorkHistory(value: unknown): WorkHistoryRole {
  if (!value || typeof value !== "object") throw new Error("Missing work-history row.");
  const source = value as Record<string, unknown>;
  return {
    id: requiredText(String(source.id), "Work-history id"),
    contactId: requiredText(String(source.contactId), "Work-history contact"),
    title: nullableText(source.title as string | null | undefined),
    organizationName: nullableText(source.organizationName as string | null | undefined),
    organizationDomain: nullableText(source.organizationDomain as string | null | undefined),
    startDate: (source.startDate as string | null | undefined) ?? null,
    endDate: (source.endDate as string | null | undefined) ?? null,
    location: nullableText(source.location as string | null | undefined),
    description: nullableText(source.description as string | null | undefined),
    isCurrent: Number(source.isCurrent) === 1,
    score: score(Number(source.score), "Work-history score"),
    band: assertOneOf(String(source.band), FACT_BANDS, "work-history band"),
    evidence: normalizedEvidence(decodeJson(source.evidence, "Work-history evidence") as EvidenceInput[]),
    method: requiredText(String(source.method), "Work-history method"),
    sourceUrl: nullableText(source.sourceUrl as string | null | undefined),
    sessionId: nullableText(source.sessionId as string | null | undefined),
    status: assertOneOf(String(source.status), FACT_STATUSES, "work-history status"),
    decidedById: nullableText(source.decidedById as string | null | undefined),
    decidedAt: (source.decidedAt as string | null | undefined) ?? null,
    observedAt: requiredText(String(source.observedAt), "Work-history observed timestamp"),
    supersededAt: (source.supersededAt as string | null | undefined) ?? null,
    supersedesId: (source.supersedesId as string | null | undefined) ?? null,
    supersededById: (source.supersededById as string | null | undefined) ?? null,
    createdAt: requiredText(String(source.createdAt), "Work-history created timestamp"),
  };
}

export class ContactWorkHistoryStore {
  constructor(private readonly db: Db) {}

  get(id: string): WorkHistoryRole | null {
    const raw = this.db.prepare(`${WORK_SELECT} WHERE id = ?`).get(id);
    return raw === undefined ? null : parseWorkHistory(raw);
  }

  getRequired(id: string): WorkHistoryRole {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("contact work-history row", id);
    return value;
  }

  list(contactId: string, options: WorkHistoryListOptions = {}): WorkHistoryRole[] {
    const clauses = ["contact_id = ?"];
    const params: unknown[] = [requiredText(contactId, "Work-history contact")];
    if (options.statuses !== undefined) {
      const statuses = options.statuses.map((status) =>
        assertOneOf(status, FACT_STATUSES, "work-history status"),
      );
      const filtered = options.includeSuperseded === false
        ? statuses.filter((status) => status !== "SUPERSEDED")
        : statuses;
      if (filtered.length === 0) return [];
      clauses.push(`status IN (${filtered.map(() => "?").join(", ")})`);
      params.push(...filtered);
    } else if (options.includeSuperseded === false) {
      clauses.push("status <> 'SUPERSEDED'");
    }
    const limit = options.limit ?? 500;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1_000) {
      throw new Error("Work-history list limit must be an integer between 0 and 1000.");
    }
    params.push(limit);
    return this.db
      .prepare(`${WORK_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY is_current DESC, start_date DESC, observed_at DESC, id DESC LIMIT ?`)
      .all(...params)
      .map(parseWorkHistory);
  }

  create(input: WorkHistoryCreateInput): WorkHistoryRole {
    const role = normalizeWorkHistoryInput(input);
    return this.db.transaction(() => {
      const superseded = role.supersedesId
        ? this.getRequired(role.supersedesId)
        : null;
      if (superseded && superseded.contactId !== role.contactId) {
        throw new EvidenceConflictError("A work-history row may only supersede a row for the same contact.");
      }
      this.db.prepare(`
        INSERT INTO contact_work_history (
          id, contact_id, title, organization_name, organization_domain,
          start_date, end_date, location, description, is_current, score, band,
          evidence, method, source_url, session_id, status, decided_by_id,
          decided_at, observed_at, superseded_at, supersedes_id,
          superseded_by_id, created_at
        ) VALUES (
          @id, @contactId, @title, @organizationName, @organizationDomain,
          @startDate, @endDate, @location, @description, @isCurrent, @score,
          @band, @evidence, @method, @sourceUrl, @sessionId, @status,
          @decidedById, @decidedAt, @observedAt, @supersededAt, @supersedesId,
          NULL, @createdAt
        )`).run({
        id: role.id,
        contactId: role.contactId,
        title: role.title,
        organizationName: role.organizationName,
        organizationDomain: role.organizationDomain,
        startDate: role.startDate,
        endDate: role.endDate,
        location: role.location,
        description: role.description,
        isCurrent: role.isCurrent ? 1 : 0,
        score: role.score,
        band: role.band,
        evidence: encodeJson(role.evidence, "Work-history evidence"),
        method: role.method,
        sourceUrl: role.sourceUrl,
        sessionId: role.sessionId,
        status: role.status,
        decidedById: role.decidedById,
        decidedAt: role.decidedAt,
        observedAt: role.observedAt,
        supersededAt: role.supersededAt,
        supersedesId: role.supersedesId,
        createdAt: role.createdAt,
      });
      if (superseded) {
        this.db.prepare(`
          UPDATE contact_work_history
          SET status = 'SUPERSEDED', superseded_at = ?, superseded_by_id = ?
          WHERE id = ? AND status <> 'SUPERSEDED'
        `).run(nowIso(), role.id, superseded.id);
      }
      return this.getRequired(role.id);
    })();
  }

  decide(id: string, decision: FactDecision, decidedById: string): WorkHistoryRole {
    if (decision !== "accept" && decision !== "dismiss") {
      throw new Error(`Invalid work-history decision: ${decision}.`);
    }
    const actor = requiredText(decidedById, "Work-history decision author");
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      if (current.status !== "PROPOSED") {
        throw new EvidenceConflictError("That work-history row has already been settled.");
      }
      const now = nowIso();
      this.db.prepare(`
        UPDATE contact_work_history
        SET status = @status, decided_by_id = @decidedById, decided_at = @decidedAt
        WHERE id = @id
      `).run({
        id,
        status: decision === "accept" ? "APPLIED" : "DISMISSED",
        decidedById: actor,
        decidedAt: now,
      });
      return this.getRequired(id);
    })();
  }

  supersede(id: string, replacementId?: string): WorkHistoryRole {
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      if (current.status === "SUPERSEDED") {
        throw new EvidenceConflictError("That work-history row is already superseded.");
      }
      if (replacementId !== undefined) {
        const replacement = this.getRequired(replacementId);
        if (replacement.id === current.id || replacement.contactId !== current.contactId) {
          throw new EvidenceConflictError("A replacement work-history row must share the contact.");
        }
        if (replacement.status === "SUPERSEDED") {
          throw new EvidenceConflictError("A superseded row cannot replace another row.");
        }
        this.db.prepare("UPDATE contact_work_history SET supersedes_id = ? WHERE id = ?").run(current.id, replacement.id);
      }
      this.db.prepare(`
        UPDATE contact_work_history
        SET status = 'SUPERSEDED', superseded_at = ?, superseded_by_id = ?
        WHERE id = ?
      `).run(nowIso(), replacementId ?? null, current.id);
      return this.getRequired(current.id);
    })();
  }
}

export class EvidenceStore {
  readonly facts: ContactFactStore;
  readonly briefs: ContactBriefStore;
  readonly workHistory: ContactWorkHistoryStore;

  constructor(db: Db) {
    this.facts = new ContactFactStore(db);
    this.briefs = new ContactBriefStore(db);
    this.workHistory = new ContactWorkHistoryStore(db);
  }
}

export function createEvidenceStore(db: Db): EvidenceStore {
  return new EvidenceStore(db);
}

export function createContactFact(db: Db, input: ContactFactCreateInput): ContactFact {
  return new ContactFactStore(db).create(input);
}

export function getContactFact(db: Db, id: string): ContactFact | null {
  return new ContactFactStore(db).get(id);
}

export function listContactFacts(db: Db, contactId: string, options?: FactListOptions): ContactFact[] {
  return new ContactFactStore(db).list(contactId, options);
}

export function decideContactFact(db: Db, id: string, decision: FactDecision, decidedById: string): ContactFact {
  return new ContactFactStore(db).decide(id, decision, decidedById);
}

export function supersedeContactFact(db: Db, id: string, replacementId?: string): ContactFact {
  return new ContactFactStore(db).supersede(id, replacementId);
}

export function createContactBrief(db: Db, input: ContactBriefCreateInput): ContactBrief {
  return new ContactBriefStore(db).create(input);
}

export function getContactBrief(db: Db, id: string): ContactBrief | null {
  return new ContactBriefStore(db).get(id);
}

export function getLatestContactBrief(db: Db, contactId: string): ContactBrief | null {
  return new ContactBriefStore(db).latest(contactId);
}

export function getContactBriefVersion(db: Db, contactId: string, version: number): ContactBrief | null {
  return new ContactBriefStore(db).getVersion(contactId, version);
}

export function listContactBriefVersions(db: Db, contactId: string, limit?: number): ContactBrief[] {
  return new ContactBriefStore(db).list(contactId, limit);
}

export const saveContactBrief = createContactBrief;

export function createContactWorkHistory(db: Db, input: WorkHistoryCreateInput): WorkHistoryRole {
  return new ContactWorkHistoryStore(db).create(input);
}

export function getContactWorkHistory(db: Db, id: string): WorkHistoryRole | null {
  return new ContactWorkHistoryStore(db).get(id);
}

export function listContactWorkHistory(db: Db, contactId: string, options?: WorkHistoryListOptions): WorkHistoryRole[] {
  return new ContactWorkHistoryStore(db).list(contactId, options);
}

export function decideContactWorkHistory(db: Db, id: string, decision: FactDecision, decidedById: string): WorkHistoryRole {
  return new ContactWorkHistoryStore(db).decide(id, decision, decidedById);
}

export function supersedeContactWorkHistory(db: Db, id: string, replacementId?: string): WorkHistoryRole {
  return new ContactWorkHistoryStore(db).supersede(id, replacementId);
}
