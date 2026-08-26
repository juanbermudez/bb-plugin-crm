import { createActivity } from "./activities.js";
import {
  DEAL_STAGES,
  isClosedStage,
  newRecordId,
  normalizeCurrency,
  normalizeLimit,
  normalizeOffset,
  nullableText,
  nowIso,
  RecordNotFoundError,
  requiredText,
  type Db,
  type DealStage,
  type ListOptions,
} from "./types.js";

const SYSTEM_ACTIVITY_AUTHOR_ID = "local_user";

export interface Deal {
  id: string;
  name: string;
  description: string | null;
  companyId: string;
  ownerId: string;
  stage: DealStage;
  stageChangedAt: string;
  amountCents: number | null;
  currency: string;
  expectedCloseDate: string | null;
  closedAt: string | null;
  closedReason: string | null;
  /** Frozen reporting-currency snapshot; ordinary edits never rewrite it. */
  baseAmountCents: number | null;
  baseCurrency: string | null;
  fxRate: number | null;
  fxRateAt: string | null;
  lastActivityAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DealCreateInput = Partial<
  Omit<Deal, "id" | "createdAt" | "updatedAt" | "archivedAt">
> & {
  id?: string;
  name: string;
  companyId: string;
  ownerId: string;
};

/** Base money fields are intentionally absent: changing source money does not re-rate a deal. */
export type DealUpdateInput = Partial<
  Omit<
    Deal,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "archivedAt"
    | "stageChangedAt"
    | "baseAmountCents"
    | "baseCurrency"
    | "fxRate"
    | "fxRateAt"
  >
>;

export interface DealListOptions extends ListOptions {
  companyId?: string;
  ownerId?: string;
  ownerIds?: readonly string[];
  stage?: DealStage;
  stages?: readonly DealStage[];
  status?: "all" | "open" | "closed";
  closings?: readonly ("overdue" | "this-month" | "next-month" | "later" | "none")[];
  sortBy?: "name" | "company" | "owner" | "stage" | "amount" | "expectedClose" | "createdAt" | "lastActivity";
  sortDirection?: "asc" | "desc";
}

const DEAL_SELECT = `
  SELECT
    id,
    name,
    description,
    company_id AS companyId,
    owner_id AS ownerId,
    stage,
    stage_changed_at AS stageChangedAt,
    amount_cents AS amountCents,
    currency,
    expected_close_date AS expectedCloseDate,
    closed_at AS closedAt,
    closed_reason AS closedReason,
    base_amount_cents AS baseAmountCents,
    base_currency AS baseCurrency,
    fx_rate AS fxRate,
    fx_rate_at AS fxRateAt,
    last_activity_at AS lastActivityAt,
    archived_at AS archivedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM deals`;

const DEAL_COLUMNS = [
  "name",
  "description",
  "company_id",
  "owner_id",
  "stage",
  "stage_changed_at",
  "amount_cents",
  "currency",
  "expected_close_date",
  "closed_at",
  "closed_reason",
  "last_activity_at",
] as const;

type DealColumn = (typeof DEAL_COLUMNS)[number];

function assertStage(value: string): DealStage {
  if ((DEAL_STAGES as readonly string[]).includes(value)) return value as DealStage;
  throw new Error(`Invalid deal stage: ${value}.`);
}

function positiveInteger(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function finiteRate(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) throw new Error("FX rate must be greater than zero.");
  return value;
}

function row(value: unknown): Deal {
  return value as Deal;
}

function normalizeCreate(input: DealCreateInput): Deal {
  const now = nowIso();
  const stage = assertStage(input.stage ?? "DEMO_BOOKED");
  const closed = isClosedStage(stage);
  const closedAt = input.closedAt ?? (closed ? now : null);
  return {
    id: input.id?.trim() || newRecordId("deal"),
    name: requiredText(input.name, "Deal name"),
    description: nullableText(input.description),
    companyId: requiredText(input.companyId, "Deal company"),
    ownerId: requiredText(input.ownerId, "Deal owner"),
    stage,
    stageChangedAt: input.stageChangedAt ?? now,
    amountCents: positiveInteger(input.amountCents, "Deal amount"),
    currency: normalizeCurrency(input.currency),
    expectedCloseDate: input.expectedCloseDate ?? null,
    closedAt,
    closedReason: nullableText(input.closedReason),
    baseAmountCents: positiveInteger(input.baseAmountCents, "Deal base amount"),
    baseCurrency: nullableText(input.baseCurrency)?.toUpperCase() ?? null,
    fxRate: finiteRate(input.fxRate),
    fxRateAt: input.fxRateAt ?? null,
    lastActivityAt: input.lastActivityAt ?? null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function dbValues(value: Deal): Record<string, string | number | null> {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    company_id: value.companyId,
    owner_id: value.ownerId,
    stage: value.stage,
    stage_changed_at: value.stageChangedAt,
    amount_cents: value.amountCents,
    currency: value.currency,
    expected_close_date: value.expectedCloseDate,
    closed_at: value.closedAt,
    closed_reason: value.closedReason,
    base_amount_cents: value.baseAmountCents,
    base_currency: value.baseCurrency,
    fx_rate: value.fxRate,
    fx_rate_at: value.fxRateAt,
    last_activity_at: value.lastActivityAt,
    archived_at: value.archivedAt,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export class DealStore {
  constructor(private readonly db: Db) {}

  get(id: string, options: { includeArchived?: boolean } = {}): Deal | null {
    const condition = options.includeArchived === false ? " AND archived_at IS NULL" : "";
    return row(this.db.prepare(`${DEAL_SELECT} WHERE id = ?${condition}`).get(id)) ?? null;
  }

  getRequired(id: string): Deal {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("deal", id);
    return value;
  }

  create(input: DealCreateInput): Deal {
    const value = normalizeCreate(input);
    const insert = this.db.prepare(`
      INSERT INTO deals (
        id, name, description, company_id, owner_id, stage, stage_changed_at,
        amount_cents, currency, expected_close_date, closed_at, closed_reason,
        base_amount_cents, base_currency, fx_rate, fx_rate_at, last_activity_at,
        archived_at, created_at, updated_at
      ) VALUES (
        @id, @name, @description, @company_id, @owner_id, @stage,
        @stage_changed_at, @amount_cents, @currency, @expected_close_date,
        @closed_at, @closed_reason, @base_amount_cents, @base_currency,
        @fx_rate, @fx_rate_at, @last_activity_at, @archived_at, @created_at,
        @updated_at
      )`);
    return this.db.transaction(() => {
      insert.run(dbValues(value));
      return this.getRequired(value.id);
    })();
  }

  list(options: DealListOptions = {}): Deal[] {
    const { where, params } = this.listWhere(options);
    params.limit = normalizeLimit(options.limit);
    params.offset = normalizeOffset(options.offset);
    const sortColumns: Record<NonNullable<DealListOptions["sortBy"]>, string> = {
      name: "name",
      company: "company_id",
      owner: "owner_id",
      stage: "stage",
      amount: "base_amount_cents",
      expectedClose: "expected_close_date",
      createdAt: "created_at",
      lastActivity: "last_activity_at",
    };
    const sortColumn = sortColumns[options.sortBy ?? "createdAt"];
    const direction = options.sortDirection === "asc" ? "ASC" : "DESC";
    return this.db
      .prepare(`${DEAL_SELECT}${where} ORDER BY ${sortColumn} ${direction}, id ${direction} LIMIT @limit OFFSET @offset`)
      .all(params)
      .map(row);
  }

  count(options: Omit<DealListOptions, "limit" | "offset"> = {}): number {
    const { where, params } = this.listWhere(options);
    return (
      this.db.prepare(`SELECT COUNT(*) AS count FROM deals${where}`).get(params) as {
        count: number;
      }
    ).count;
  }

  private listWhere(options: DealListOptions): {
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
    if (options.companyId !== undefined) {
      clauses.push("company_id = @companyId");
      params.companyId = options.companyId;
    }
    if (options.ownerId !== undefined) {
      clauses.push("owner_id = @ownerId");
      params.ownerId = options.ownerId;
    }
    if (options.ownerIds !== undefined && options.ownerIds.length > 0) {
      const placeholders = options.ownerIds.map((value, index) => {
        const key = `owner${index}`;
        params[key] = value;
        return `@${key}`;
      });
      clauses.push(`owner_id IN (${placeholders.join(", ")})`);
    }
    if (options.stage !== undefined) {
      clauses.push("stage = @stage");
      params.stage = assertStage(options.stage);
    }
    if (options.stages !== undefined && options.stages.length > 0) {
      const placeholders = options.stages.map((value, index) => {
        const key = `stage${index}`;
        params[key] = assertStage(value);
        return `@${key}`;
      });
      clauses.push(`stage IN (${placeholders.join(", ")})`);
    }
    if (options.status === "open") {
      clauses.push("stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')");
    } else if (options.status === "closed") {
      clauses.push("stage IN ('CLOSED_WON', 'CLOSED_LOST')");
    }
    if (options.closings !== undefined && options.closings.length > 0) {
      const today = new Date();
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth();
      const isoDate = (value: Date) => value.toISOString().slice(0, 10);
      const thisStart = isoDate(new Date(Date.UTC(year, month, 1)));
      const nextStart = isoDate(new Date(Date.UTC(year, month + 1, 1)));
      const laterStart = isoDate(new Date(Date.UTC(year, month + 2, 1)));
      params.today = isoDate(today);
      params.thisStart = thisStart;
      params.nextStart = nextStart;
      params.laterStart = laterStart;
      const closingClauses = options.closings.map((closing) => {
        if (closing === "overdue") return "(expected_close_date < @today AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST'))";
        if (closing === "this-month") return "(expected_close_date >= @thisStart AND expected_close_date < @nextStart)";
        if (closing === "next-month") return "(expected_close_date >= @nextStart AND expected_close_date < @laterStart)";
        if (closing === "later") return "expected_close_date >= @laterStart";
        return "expected_close_date IS NULL";
      });
      clauses.push(`(${closingClauses.join(" OR ")})`);
    }
    const search = options.search?.trim();
    if (search) {
      clauses.push(`(
        name LIKE @search COLLATE NOCASE OR
        description LIKE @search COLLATE NOCASE OR
        currency LIKE @search COLLATE NOCASE
      )`);
      params.search = `%${search}%`;
    }
    return {
      where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  update(id: string, input: DealUpdateInput): Deal {
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      const next: Deal = { ...current };
      let stageChanged = false;
      let stageChangeReason: string | null = null;
      const has = (key: keyof DealUpdateInput): boolean => input[key] !== undefined;
      if (has("name")) next.name = requiredText(input.name as string, "Deal name");
      if (has("description")) next.description = nullableText(input.description);
      if (has("companyId")) next.companyId = requiredText(input.companyId as string, "Deal company");
      if (has("ownerId")) next.ownerId = requiredText(input.ownerId as string, "Deal owner");
      if (has("amountCents")) next.amountCents = positiveInteger(input.amountCents, "Deal amount");
      if (has("currency")) next.currency = normalizeCurrency(input.currency);
      if (has("expectedCloseDate")) next.expectedCloseDate = input.expectedCloseDate ?? null;
      if (has("closedAt")) next.closedAt = input.closedAt ?? null;
      if (has("closedReason")) next.closedReason = nullableText(input.closedReason);
      if (has("lastActivityAt")) next.lastActivityAt = input.lastActivityAt ?? null;
      if (has("stage")) {
        const stage = assertStage(input.stage as string);
        if (stage !== current.stage) {
          stageChanged = true;
          stageChangeReason = has("closedReason") ? nullableText(input.closedReason) : null;
          next.stage = stage;
          next.stageChangedAt = nowIso();
          if (isClosedStage(stage)) {
            if (!has("closedAt")) next.closedAt = next.closedAt ?? nowIso();
          } else if (!has("closedAt")) {
            next.closedAt = null;
            next.closedReason = null;
          }
        }
      }
      next.updatedAt = nowIso();
      const values = dbValues(next);
      const changed: DealColumn[] = DEAL_COLUMNS.filter((column) => column in values);
      this.db
        .prepare(`UPDATE deals SET ${changed.map((column) => `${column} = @${column}`).join(", ")}, updated_at = @updated_at WHERE id = @id`)
        .run(values);
      if (stageChanged) {
        const occurredAt = next.stageChangedAt;
        createActivity(
          this.db,
          {
            type: "STAGE_CHANGE",
            subject: "Stage changed",
            body: stageChangeReason,
            occurredAt,
            dealId: next.id,
            createdById: SYSTEM_ACTIVITY_AUTHOR_ID,
            meta: { from: current.stage, to: next.stage },
          },
          SYSTEM_ACTIVITY_AUTHOR_ID,
        );
        this.db
          .prepare(`
            UPDATE deals
            SET last_activity_at = CASE
              WHEN last_activity_at IS NULL OR last_activity_at < @occurredAt
                THEN @occurredAt
              ELSE last_activity_at
            END
            WHERE id = @id
          `)
          .run({ id: next.id, occurredAt });
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
      return this.getRequired(id);
    })();
  }

  archive(id: string): Deal {
    return this.setArchived(id, nowIso());
  }

  restore(id: string): Deal {
    return this.setArchived(id, null);
  }

  private setArchived(id: string, archivedAt: string | null): Deal {
    return this.db.transaction(() => {
      this.getRequired(id);
      this.db.prepare("UPDATE deals SET archived_at = @archivedAt, updated_at = @updatedAt WHERE id = @id").run({
        id,
        archivedAt,
        updatedAt: nowIso(),
      });
      return this.getRequired(id);
    })();
  }

  purge(id: string): Deal {
    return this.db.transaction(() => {
      const value = this.getRequired(id);
      this.db.prepare("DELETE FROM deals WHERE id = ?").run(id);
      return value;
    })();
  }
}

export function createDealStore(db: Db): DealStore {
  return new DealStore(db);
}

export function createDeal(db: Db, input: DealCreateInput): Deal {
  return new DealStore(db).create(input);
}

export function getDeal(db: Db, id: string, options?: { includeArchived?: boolean }): Deal | null {
  return new DealStore(db).get(id, options);
}

export function listDeals(db: Db, options?: DealListOptions): Deal[] {
  return new DealStore(db).list(options);
}

export function updateDeal(db: Db, id: string, input: DealUpdateInput): Deal {
  return new DealStore(db).update(id, input);
}

export function archiveDeal(db: Db, id: string): Deal {
  return new DealStore(db).archive(id);
}

export function restoreDeal(db: Db, id: string): Deal {
  return new DealStore(db).restore(id);
}

export function purgeDeal(db: Db, id: string): Deal {
  return new DealStore(db).purge(id);
}

export const deleteDeal = purgeDeal;
