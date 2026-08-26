import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  activityCreateInputSchema,
  companyCreateInputSchema,
  companyUpdateDataSchema,
  contactCreateInputSchema,
  contactUpdateDataSchema,
  currencyCodeSchema,
  dealCreateInputSchema,
  dealUpdateDataSchema,
  fieldEntitySchema,
  fieldValueSchema,
  idSchema,
  type ActivityEntry as ActivityOutput,
  type DashboardSummaryOutput,
  type CurrencyCode,
  type DealStage,
  type Company as CompanyOutput,
  type CompanyListInput,
  type Contact as ContactOutput,
  type ContactListInput,
  type Deal as DealOutput,
  type DealListInput,
  type FieldEntity,
  type FieldValues,
} from "./contracts/core.js";
import { rpcContract } from "./contracts/rpc.js";
import {
  createCompanyStore,
  type Company as StoredCompany,
  type CompanyListOptions,
} from "./db/companies.js";
import {
  createContactStore,
  type Contact as StoredContact,
  type ContactListOptions,
} from "./db/contacts.js";
import {
  createDealStore,
  type Deal as StoredDeal,
  type DealListOptions,
} from "./db/deals.js";
import { createCurrencyStore } from "./db/currency.js";
import { CRM_SCHEMA_VERSION, initializeSchema } from "./db/schema.js";
import {
  createActivityStore,
  type Activity as StoredActivity,
} from "./db/activities.js";
import {
  createSavedViewStore,
  type SavedView as StoredSavedView,
} from "./db/saved-views.js";
import { createCustomFieldStore } from "./db/custom-fields.js";

export const CRM_PLUGIN_VERSION = "0.1.0";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    workspaceName: {
      type: "string",
      label: "Workspace name",
      default: "My CRM",
    },
    reportingCurrency: {
      type: "select",
      label: "Reporting currency",
      options: [
        "USD",
        "EUR",
        "JPY",
        "GBP",
        "CNY",
        "AUD",
        "CAD",
        "CHF",
        "HKD",
        "SGD",
        "ZAR",
      ],
      default: "USD",
    },
    researchApiKey: {
      type: "string",
      label: "Research API key",
      secret: true,
    },
  });

  const db = bb.storage.database();
  initializeSchema(bb, db);
  const companies = createCompanyStore(db);
  const contacts = createContactStore(db);
  const deals = createDealStore(db);
  const currency = createCurrencyStore(db);
  const activities = createActivityStore(db);
  const savedViews = createSavedViewStore(db);
  const customFields = createCustomFieldStore(db);

  function recordFieldValues(entity: FieldEntity, recordId: string): FieldValues {
    return Object.fromEntries(
      customFields.listValues({ entity, recordId }).map((row) => [
        customFields.getRequired(row.fieldId).key,
        row.value,
      ]),
    );
  }

  function writeRecordFieldValues(
    entity: FieldEntity,
    recordId: string,
    values: FieldValues,
  ): void {
    for (const [key, value] of Object.entries(values)) {
      const definition = customFields.byKey(entity, key);
      customFields.upsertValue({
        entity,
        recordId,
        fieldId: definition.id,
        value,
      });
    }
  }

  function customFieldRecordIds(
    entity: FieldEntity,
    filters: Record<string, string[]>,
  ): string[] | undefined {
    const activeFilters = Object.entries(filters).filter(([, values]) => values.length > 0);
    if (activeFilters.length === 0) return undefined;
    const recordColumn = entity === "COMPANY"
      ? "company_id"
      : entity === "CONTACT"
        ? "contact_id"
        : "deal_id";
    let matches: Set<string> | null = null;
    for (const [key, rawValues] of activeFilters) {
      const definition = customFields.byKey(entity, key);
      if (definition.archived) return [];
      const valueColumn = definition.type === "CHECKBOX"
        ? "bool"
        : definition.type === "NUMBER"
          ? "number"
          : definition.type === "DATE"
            ? "date"
            : definition.type === "SELECT"
              ? "option_id"
              : definition.type === "USER"
                ? "user_id"
                : "text";
      const values: Array<string | number> = rawValues.map((value) => {
        if (definition.type === "CHECKBOX") return value === "true" || value === "1" ? 1 : 0;
        if (definition.type === "NUMBER") {
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) throw new Error(`Invalid number filter for ${key}.`);
          return parsed;
        }
        return value;
      });
      const params: Record<string, string | number> = { fieldId: definition.id };
      const placeholders = values.map((value, index) => {
        params[`value${index}`] = value;
        return `@value${index}`;
      });
      const rows = db.prepare(`
        SELECT ${recordColumn} AS recordId
        FROM field_values
        WHERE field_id = @fieldId
          AND ${recordColumn} IS NOT NULL
          AND ${valueColumn} IN (${placeholders.join(", ")})
      `).all(params) as Array<{ recordId: string }>;
      const current = new Set(rows.map((row) => row.recordId));
      if (matches === null) matches = current;
      else {
        const previous: Set<string> = matches;
        matches = new Set<string>(
          [...previous].filter((id: string) => current.has(id)),
        );
      }
      if (matches.size === 0) return [];
    }
    return [...(matches ?? new Set<string>())];
  }

  function companyOutput(
    company: StoredCompany,
    includeRelations = false,
  ): CompanyOutput {
    const counts = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM contacts
            WHERE company_id = @id AND archived_at IS NULL) AS contactCount,
          (SELECT COUNT(*) FROM deals
            WHERE company_id = @id AND archived_at IS NULL
              AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')) AS openDealCount
      `)
      .get({ id: company.id }) as { contactCount: number; openDealCount: number };
    const relatedContacts = includeRelations
      ? db.prepare(`
          SELECT id, first_name AS firstName, last_name AS lastName,
            email, title, image_url AS imageUrl
          FROM contacts
          WHERE company_id = ? AND archived_at IS NULL
          ORDER BY first_name, last_name, id
        `).all(company.id) as NonNullable<CompanyOutput["contacts"]>
      : undefined;
    const relatedDeals = includeRelations
      ? db.prepare(`
          SELECT id, name
          FROM deals
          WHERE company_id = ? AND archived_at IS NULL
          ORDER BY created_at DESC, id DESC
        `).all(company.id) as NonNullable<CompanyOutput["deals"]>
      : undefined;
    const output: CompanyOutput = {
      ...company,
      fields: recordFieldValues("COMPANY", company.id),
      contactCount: counts.contactCount,
      openDealCount: counts.openDealCount,
    };
    return includeRelations
      ? { ...output, contacts: relatedContacts ?? [], deals: relatedDeals ?? [] }
      : output;
  }

  function companyListOptions(input: CompanyListInput): CompanyListOptions {
    const sortBy =
      input.sort === "createdAt" || input.sort === "lastActivity"
        ? input.sort
        : input.sort === "domain" || input.sort === "industry" || input.sort === "owner"
          ? input.sort
          : "name";
    return {
      search: input.q,
      archivedOnly: input.archived,
      ownerIds: input.owner,
      industries: input.industry,
      sources: input.source,
      enrichmentStatuses: input.enrichment,
      recordIds: customFieldRecordIds("COMPANY", input.fields),
      sortBy,
      sortDirection: input.dir,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  function facetCounts(): Record<string, Record<string, number>> {
    const facets: Record<string, Record<string, number>> = {};
    const definitions = [
      ["owner", "COALESCE(owner_id, 'unassigned')"],
      ["industry", "industry"],
      ["enrichment", "enrichment_status"],
      ["source", "source"],
    ] as const;
    for (const [name, expression] of definitions) {
      const rows = db
        .prepare(`SELECT ${expression} AS value, COUNT(*) AS count FROM companies WHERE archived_at IS NULL AND ${expression} IS NOT NULL GROUP BY ${expression}`)
        .all() as Array<{ value: string; count: number }>;
      facets[name] = Object.fromEntries(rows.map((row) => [row.value, row.count]));
    }
    return facets;
  }

  function changed(
    entity: "company" | "contact" | "deal" | "currency" | "activity" | "saved-view" | "custom-field",
    action: string,
    id: string,
  ): void {
    bb.realtime.publish("changed", { entity, action, id });
  }

  function bulk(
    entity: "company" | "contact" | "deal",
    ids: readonly string[],
    action: (id: string) => void,
  ): { requested: number; succeeded: number; failed: number; message: string | null } {
    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        action(id);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        bb.log.warn(
          `CRM ${entity} bulk operation skipped ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return {
      requested: ids.length,
      succeeded,
      failed,
      message: failed === 0 ? null : `${failed} record${failed === 1 ? "" : "s"} could not be changed.`,
    };
  }

  function contactOutput(contact: StoredContact): ContactOutput {
    const company = contact.companyId
      ? (db.prepare(`
          SELECT id, name, domain, icon_url AS iconUrl, icon_dark_url AS iconDarkUrl,
            icon_tone AS iconTone, logo_url AS logoUrl
          FROM companies WHERE id = ?
        `).get(contact.companyId) as
          | {
              id: string;
              name: string;
              domain: string | null;
              iconUrl: string | null;
              iconDarkUrl: string | null;
              iconTone: string | null;
              logoUrl: string | null;
            }
          | undefined)
      : undefined;
    const deals = db.prepare(`
      SELECT deals.id, deals.name
      FROM deals
      INNER JOIN deal_contacts ON deal_contacts.deal_id = deals.id
      WHERE deal_contacts.contact_id = ? AND deals.archived_at IS NULL
      ORDER BY deals.created_at DESC
    `).all(contact.id) as Array<{ id: string; name: string }>;
    const isPrimaryContact =
      db.prepare("SELECT 1 FROM companies WHERE primary_contact_id = ? LIMIT 1").get(contact.id) !==
      undefined;
    return {
      ...contact,
      company: company ?? null,
      isPrimaryContact,
      deals,
      fields: recordFieldValues("CONTACT", contact.id),
    };
  }

  function contactListOptions(input: ContactListInput): ContactListOptions {
    const sortBy =
      input.sort === "email" ||
      input.sort === "title" ||
      input.sort === "company" ||
      input.sort === "owner" ||
      input.sort === "createdAt" ||
      input.sort === "lastActivity"
        ? input.sort
        : "name";
    return {
      search: input.q,
      archivedOnly: input.archived,
      ownerIds: input.owner,
      companyIds: input.company,
      sources: input.source,
      titles: input.title,
      seniorities: input.seniority,
      functions: input.persona,
      recordIds: customFieldRecordIds("CONTACT", input.fields),
      sortBy,
      sortDirection: input.dir,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  function contactFacetCounts(): Record<string, Record<string, number>> {
    const facets: Record<string, Record<string, number>> = {};
    const definitions = [
      ["owner", "COALESCE(owner_id, 'unassigned')"],
      ["company", "COALESCE(company_id, 'unassigned')"],
      ["title", "title"],
      ["seniority", "seniority"],
      ["persona", "function"],
      ["source", "source"],
    ] as const;
    for (const [name, expression] of definitions) {
      const rows = db
        .prepare(`SELECT ${expression} AS value, COUNT(*) AS count FROM contacts WHERE archived_at IS NULL AND ${expression} IS NOT NULL GROUP BY ${expression}`)
        .all() as Array<{ value: string; count: number }>;
      facets[name] = Object.fromEntries(rows.map((row) => [row.value, row.count]));
    }
    return facets;
  }

  function dealOutput(deal: StoredDeal): DealOutput {
    const company = db.prepare(`
      SELECT id, name, domain, icon_url AS iconUrl, icon_dark_url AS iconDarkUrl,
        icon_tone AS iconTone, logo_url AS logoUrl
      FROM companies WHERE id = ?
    `).get(deal.companyId) as {
      id: string;
      name: string;
      domain: string | null;
      iconUrl: string | null;
      iconDarkUrl: string | null;
      iconTone: string | null;
      logoUrl: string | null;
    };
    const relatedContacts = db.prepare(`
      SELECT contacts.id, contacts.first_name AS firstName,
        contacts.last_name AS lastName, contacts.email, contacts.title,
        contacts.image_url AS imageUrl, deal_contacts.role
      FROM deal_contacts
      INNER JOIN contacts ON contacts.id = deal_contacts.contact_id
      WHERE deal_contacts.deal_id = ? AND contacts.archived_at IS NULL
      ORDER BY contacts.last_name COLLATE NOCASE, contacts.first_name COLLATE NOCASE
    `).all(deal.id) as DealOutput["contacts"];
    return {
      ...deal,
      currency: currencyCodeSchema.parse(deal.currency),
      baseCurrency:
        deal.baseCurrency === null ? null : currencyCodeSchema.parse(deal.baseCurrency),
      company,
      contacts: relatedContacts,
      fields: recordFieldValues("DEAL", deal.id),
    };
  }

  function dealListOptions(input: DealListInput): DealListOptions {
    const sortBy =
      input.sort === "company" ||
      input.sort === "owner" ||
      input.sort === "stage" ||
      input.sort === "amount" ||
      input.sort === "expectedClose" ||
      input.sort === "createdAt" ||
      input.sort === "lastActivity"
        ? input.sort
        : "createdAt";
    return {
      search: input.q,
      archivedOnly: input.archived,
      status: input.status,
      ownerIds: input.owner,
      stages: input.stage,
      closings: input.closing,
      recordIds: customFieldRecordIds("DEAL", input.fields),
      sortBy,
      sortDirection: input.dir,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  function dealFacetCounts(): Record<string, Record<string, number>> {
    const facets: Record<string, Record<string, number>> = {};
    const definitions = [
      ["owner", "owner_id"],
      ["company", "company_id"],
      ["stage", "stage"],
      ["currency", "currency"],
    ] as const;
    for (const [name, expression] of definitions) {
      const rows = db
        .prepare(`SELECT ${expression} AS value, COUNT(*) AS count FROM deals WHERE archived_at IS NULL GROUP BY ${expression}`)
        .all() as Array<{ value: string; count: number }>;
      facets[name] = Object.fromEntries(rows.map((row) => [row.value, row.count]));
    }
    return facets;
  }

  function activityOutput(activity: StoredActivity): ActivityOutput {
    return {
      id: activity.id,
      type: activity.type,
      subject: activity.subject,
      body: activity.body,
      occurredAt: activity.occurredAt,
      dueAt: activity.dueAt,
      completedAt: activity.completedAt,
      meta: activity.meta,
      createdAt: activity.createdAt,
      createdBy: {
        id: activity.createdById,
        name: activity.createdById,
        email: "crm-user@bb.invalid",
        image: null,
      },
      company: activity.company,
      contact: activity.contact,
      deal: activity.deal,
      emailThread: activity.emailThread,
      calendarEvent: activity.calendarEvent,
    };
  }

  function stampActivity(activity: StoredActivity): void {
    const stampedAt = activity.createdAt;
    if (activity.companyId) {
      db.prepare("UPDATE companies SET last_activity_at = ? WHERE id = ?")
        .run(stampedAt, activity.companyId);
    }
    if (activity.contactId) {
      db.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?")
        .run(stampedAt, activity.contactId);
    }
    if (activity.dealId) {
      db.prepare("UPDATE deals SET last_activity_at = ? WHERE id = ?")
        .run(stampedAt, activity.dealId);
    }
  }

  const LOCAL_OWNER_ID = "local_user";

  function savedViewDefaultKey(entity: StoredSavedView["entity"]): string {
    return `saved_view_default_${entity}`;
  }

  function defaultSavedViewId(entity: StoredSavedView["entity"]): string | null {
    const value = db.prepare("SELECT value FROM crm_metadata WHERE key = ?")
      .pluck()
      .get(savedViewDefaultKey(entity));
    return typeof value === "string" && value.trim() ? value : null;
  }

  function savedViewOutput(view: StoredSavedView) {
    return {
      ...view,
      isDefault: defaultSavedViewId(view.entity) === view.id,
    };
  }

  function localOwner(id: string) {
    return {
      id,
      name: id,
      email: "crm-user@bb.invalid",
      image: null,
    };
  }

  bb.rpc.register(rpcContract, {
    async status() {
      const { workspaceName, reportingCurrency } = await settings.get();
      return {
        version: CRM_PLUGIN_VERSION,
        schemaVersion: CRM_SCHEMA_VERSION,
        workspaceName,
        reportingCurrency,
      };
    },
    async dashboard_summary({ scope, ownerId }) {
      const { reportingCurrency: configuredCurrency } = await settings.get();
      const reportingCurrency = currencyCodeSchema.parse(configuredCurrency);
      const effectiveOwnerId = ownerId ?? LOCAL_OWNER_ID;
      const ownerSql = scope === "me" ? " AND d.owner_id = @ownerId" : "";
      const activityOwnerSql = scope === "me" ? " AND a.created_by_id = @ownerId" : "";
      const params = { reportingCurrency, ownerId: effectiveOwnerId };
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000);

      const stageRows = db.prepare(`
        SELECT d.stage, COUNT(*) AS count,
          COALESCE(SUM(CASE WHEN d.base_currency = @reportingCurrency
            THEN d.base_amount_cents ELSE 0 END), 0) AS valueCents
        FROM deals d
        WHERE d.archived_at IS NULL
          AND d.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')${ownerSql}
        GROUP BY d.stage
        ORDER BY d.stage
      `).all(params) as DashboardSummaryOutput["pipeline"]["stages"];
      const unconvertedRows = db.prepare(`
        SELECT d.currency, COUNT(*) AS count
        FROM deals d
        WHERE d.archived_at IS NULL
          AND d.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
          AND d.amount_cents IS NOT NULL AND d.base_amount_cents IS NULL${ownerSql}
        GROUP BY d.currency ORDER BY d.currency
      `).all(params) as Array<{ currency: string; count: number }>;

      const monthlyWon = (from: Date, to: Date) => db.prepare(`
        SELECT COUNT(*) AS count,
          COALESCE(SUM(CASE WHEN d.base_currency = @reportingCurrency
            THEN d.base_amount_cents ELSE 0 END), 0) AS valueCents
        FROM deals d
        WHERE d.archived_at IS NULL AND d.stage = 'CLOSED_WON'
          AND d.closed_at >= @from AND d.closed_at < @to${ownerSql}
      `).get({ ...params, from: from.toISOString(), to: to.toISOString() }) as {
        count: number;
        valueCents: number;
      };

      const performance = db.prepare(`
        SELECT
          SUM(CASE WHEN d.stage = 'CLOSED_WON' THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN d.stage = 'CLOSED_LOST' THEN 1 ELSE 0 END) AS losses,
          AVG(CASE WHEN d.stage = 'CLOSED_WON'
            AND d.base_currency = @reportingCurrency THEN d.base_amount_cents END) AS avgDealCents,
          AVG(CASE WHEN d.stage = 'CLOSED_WON'
            THEN MAX(0, julianday(d.closed_at) - julianday(d.created_at)) END) AS avgCycleDays
        FROM deals d
        WHERE d.archived_at IS NULL
          AND d.stage IN ('CLOSED_WON', 'CLOSED_LOST')
          AND d.closed_at >= @cutoff${ownerSql}
      `).get({ ...params, cutoff: cutoff90.toISOString() }) as {
        wins: number | null;
        losses: number | null;
        avgDealCents: number | null;
        avgCycleDays: number | null;
      };
      const wins = Number(performance.wins ?? 0);
      const losses = Number(performance.losses ?? 0);

      const trend = Array.from({ length: 6 }, (_, index) => {
        const offset = index - 5;
        const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
        const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
        const row = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN d.stage = 'CLOSED_WON'
              AND d.closed_at >= @from AND d.closed_at < @to
              AND d.base_currency = @reportingCurrency THEN d.base_amount_cents ELSE 0 END), 0) AS won,
            COALESCE(SUM(CASE WHEN d.created_at >= @from AND d.created_at < @to
              AND d.base_currency = @reportingCurrency THEN d.base_amount_cents ELSE 0 END), 0) AS created
          FROM deals d
          WHERE d.archived_at IS NULL${ownerSql}
        `).get({ ...params, from: from.toISOString(), to: to.toISOString() }) as {
          won: number;
          created: number;
        };
        return {
          month: new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(from),
          won: Number(row.won),
          created: Number(row.created),
        };
      });

      const closingThisMonthTotal = db.prepare(`
        SELECT COUNT(*) AS count,
          COALESCE(SUM(CASE WHEN d.base_currency = @reportingCurrency
            THEN d.base_amount_cents ELSE 0 END), 0) AS valueCents
        FROM deals d
        WHERE d.archived_at IS NULL
          AND d.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
          AND d.expected_close_date >= @fromDate AND d.expected_close_date < @toDate${ownerSql}
      `).get({
        ...params,
        fromDate: monthStart.toISOString().slice(0, 10),
        toDate: nextMonth.toISOString().slice(0, 10),
      }) as { count: number; valueCents: number };

      const biggestRows = db.prepare(`
        SELECT d.id, d.name, d.stage, d.currency, d.amount_cents AS amountCents,
          d.base_amount_cents AS baseAmountCents,
          d.expected_close_date AS expectedCloseDate,
          d.stage_changed_at AS stageChangedAt,
          d.owner_id AS ownerId,
          c.id AS companyId, c.name AS companyName, c.icon_url AS iconUrl,
          c.icon_dark_url AS iconDarkUrl, c.icon_tone AS iconTone
        FROM deals d JOIN companies c ON c.id = d.company_id
        WHERE d.archived_at IS NULL
          AND d.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')${ownerSql}
        ORDER BY (d.base_amount_cents IS NULL), d.base_amount_cents DESC,
          d.amount_cents DESC, d.id DESC LIMIT 6
      `).all(params) as Array<Record<string, unknown>>;

      const overdueIds = db.prepare(`
        SELECT a.id FROM activities a
        WHERE a.type = 'TASK' AND a.completed_at IS NULL
          AND a.due_at IS NOT NULL AND a.due_at < @now${activityOwnerSql}
        ORDER BY a.due_at ASC, a.id ASC LIMIT 10
      `).pluck().all({ ...params, now: now.toISOString() }) as string[];
      const recentIds = db.prepare(`
        SELECT a.id FROM activities a
        WHERE 1 = 1${activityOwnerSql}
        ORDER BY (a.occurred_at IS NULL), a.occurred_at DESC, a.id DESC LIMIT 12
      `).pluck().all(params) as string[];

      const totalDeals = stageRows.reduce((sum, row) => sum + Number(row.count), 0);
      const totalCents = stageRows.reduce((sum, row) => sum + Number(row.valueCents), 0);
      const wonThisMonth = monthlyWon(monthStart, nextMonth);
      const wonPrevMonth = monthlyWon(previousMonth, monthStart);

      return {
        scope,
        reportingCurrency,
        unconverted: {
          count: unconvertedRows.reduce((sum, row) => sum + Number(row.count), 0),
          currencies: unconvertedRows.map((row) => currencyCodeSchema.parse(row.currency)),
        },
        pipeline: {
          stages: stageRows.map((row) => ({
            ...row,
            count: Number(row.count),
            valueCents: Number(row.valueCents),
          })),
          totalCents,
          totalDeals,
        },
        wonThisMonth: { count: Number(wonThisMonth.count), valueCents: Number(wonThisMonth.valueCents) },
        wonPrevMonth: { count: Number(wonPrevMonth.count), valueCents: Number(wonPrevMonth.valueCents) },
        performance: {
          windowDays: 90,
          wins,
          losses,
          winRate: wins + losses === 0 ? null : wins / (wins + losses),
          avgDealCents: performance.avgDealCents === null ? null : Math.round(performance.avgDealCents),
          avgCycleDays: performance.avgCycleDays,
        },
        trend,
        closingThisMonthTotal: {
          count: Number(closingThisMonthTotal.count),
          valueCents: Number(closingThisMonthTotal.valueCents),
        },
        biggestOpen: biggestRows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          stage: row.stage as DashboardSummaryOutput["biggestOpen"][number]["stage"],
          currency: currencyCodeSchema.parse(row.currency),
          company: {
            id: String(row.companyId),
            name: String(row.companyName),
            iconUrl: row.iconUrl === null ? null : String(row.iconUrl),
            iconDarkUrl: row.iconDarkUrl === null ? null : String(row.iconDarkUrl),
            iconTone: row.iconTone === null ? null : String(row.iconTone),
          },
          owner: localOwner(String(row.ownerId)),
          amountCents: row.amountCents === null ? null : Number(row.amountCents),
          baseAmountCents: row.baseAmountCents === null ? null : Number(row.baseAmountCents),
          expectedCloseDate: row.expectedCloseDate === null
            ? null
            : `${String(row.expectedCloseDate)}T00:00:00.000Z`,
          stageChangedAt: String(row.stageChangedAt),
        })),
        overdueTasks: overdueIds.map((id) => {
          const activity = activities.getRequired(id);
          return {
            id: activity.id,
            subject: activity.subject,
            company: activity.company,
            deal: activity.deal,
            dueAt: activity.dueAt,
          };
        }),
        recentActivity: recentIds.map((id) => {
          const activity = activities.getRequired(id);
          return {
            id: activity.id,
            type: activity.type,
            subject: activity.subject,
            body: activity.body,
            createdBy: localOwner(activity.createdById),
            company: activity.company,
            deal: activity.deal,
            createdAt: activity.createdAt,
            meta: activity.meta,
          };
        }),
      } satisfies DashboardSummaryOutput;
    },
    companies_list(input) {
      const options = companyListOptions(input);
      return {
        rows: companies.list(options).map((company) => companyOutput(company)),
        total: companies.count(options),
        facetCounts: facetCounts(),
      };
    },
    companies_get({ id }) {
      return companyOutput(companies.getRequired(id), true);
    },
    companies_create(input) {
      const company = companies.create(input);
      changed("company", "created", company.id);
      return companyOutput(company);
    },
    companies_update({ id, data }) {
      const { fields, ...record } = data;
      const company = db.transaction(() => {
        const updated = companies.update(id, record);
        if (fields) writeRecordFieldValues("COMPANY", id, fields);
        return updated;
      })();
      changed("company", "updated", company.id);
      return companyOutput(company);
    },
    companies_archive({ id }) {
      const company = companies.archive(id);
      changed("company", "archived", company.id);
      return companyOutput(company);
    },
    companies_restore({ id }) {
      const company = companies.restore(id);
      changed("company", "restored", company.id);
      return companyOutput(company);
    },
    companies_purge({ id }) {
      const company = companies.purge(id);
      changed("company", "purged", company.id);
      return companyOutput(company);
    },
    companies_bulkAssignOwner({ ids, ownerId }) {
      return bulk("company", ids, (id) => {
        companies.update(id, { ownerId });
        changed("company", "updated", id);
      });
    },
    companies_bulkArchive({ ids }) {
      return bulk("company", ids, (id) => {
        companies.archive(id);
        changed("company", "archived", id);
      });
    },
    companies_bulkRestore({ ids }) {
      return bulk("company", ids, (id) => {
        companies.restore(id);
        changed("company", "restored", id);
      });
    },
    companies_bulkPurge({ ids }) {
      return bulk("company", ids, (id) => {
        companies.purge(id);
        changed("company", "purged", id);
      });
    },
    contacts_list(input) {
      const options = contactListOptions(input);
      return {
        rows: contacts.list(options).map(contactOutput),
        total: contacts.count(options),
        facetCounts: contactFacetCounts(),
      };
    },
    contacts_get({ id }) {
      return contactOutput(contacts.getRequired(id));
    },
    contacts_create(input) {
      const contact = contacts.create(input);
      changed("contact", "created", contact.id);
      return contactOutput(contact);
    },
    contacts_update({ id, data }) {
      const { fields, ...record } = data;
      const contact = db.transaction(() => {
        const updated = contacts.update(id, record);
        if (fields) writeRecordFieldValues("CONTACT", id, fields);
        return updated;
      })();
      changed("contact", "updated", contact.id);
      return contactOutput(contact);
    },
    contacts_archive({ id }) {
      const contact = contacts.archive(id);
      changed("contact", "archived", contact.id);
      return contactOutput(contact);
    },
    contacts_restore({ id }) {
      const contact = contacts.restore(id);
      changed("contact", "restored", contact.id);
      return contactOutput(contact);
    },
    contacts_purge({ id }) {
      const contact = contacts.purge(id);
      changed("contact", "purged", contact.id);
      return contactOutput(contact);
    },
    contacts_bulkAssignOwner({ ids, ownerId }) {
      return bulk("contact", ids, (id) => {
        contacts.update(id, { ownerId });
        changed("contact", "updated", id);
      });
    },
    contacts_bulkAssignCompany({ ids, companyId }) {
      return bulk("contact", ids, (id) => {
        contacts.update(id, { companyId });
        changed("contact", "updated", id);
      });
    },
    contacts_bulkArchive({ ids }) {
      return bulk("contact", ids, (id) => {
        contacts.archive(id);
        changed("contact", "archived", id);
      });
    },
    contacts_bulkRestore({ ids }) {
      return bulk("contact", ids, (id) => {
        contacts.restore(id);
        changed("contact", "restored", id);
      });
    },
    contacts_bulkPurge({ ids }) {
      return bulk("contact", ids, (id) => {
        contacts.purge(id);
        changed("contact", "purged", id);
      });
    },
    async deals_list(input) {
      const options = dealListOptions(input);
      const { reportingCurrency: configuredCurrency } = await settings.get();
      const reportingCurrency = currencyCodeSchema.parse(configuredCurrency);
      const rows = deals.list(options).map(dealOutput);
      const openValue = db.prepare(`
        SELECT COALESCE(SUM(base_amount_cents), 0) AS value
        FROM deals
        WHERE archived_at IS NULL
          AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
          AND base_currency = @reportingCurrency
      `).get({ reportingCurrency }) as { value: number };
      const missing = db.prepare(`
        SELECT currency, COUNT(*) AS count
        FROM deals
        WHERE archived_at IS NULL
          AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
          AND amount_cents IS NOT NULL
          AND base_amount_cents IS NULL
        GROUP BY currency
        ORDER BY currency
      `).all() as Array<{ currency: CurrencyCode; count: number }>;
      return {
        rows,
        total: deals.count(options),
        facetCounts: dealFacetCounts(),
        openValueCents: openValue.value,
        reportingCurrency,
        unconverted: {
          count: missing.reduce((total, item) => total + item.count, 0),
          currencies: missing.map((item) => item.currency),
        },
      };
    },
    deals_get({ id }) {
      return dealOutput(deals.getRequired(id));
    },
    async deals_create(input) {
      const { reportingCurrency: configuredCurrency } = await settings.get();
      const reportingCurrency = currencyCodeSchema.parse(configuredCurrency);
      const dealCurrency = input.currency ?? reportingCurrency;
      const conversion = input.amountCents == null
        ? null
        : currency.convert(input.amountCents, dealCurrency, reportingCurrency);
      const deal = deals.create({
        ...input,
        currency: dealCurrency,
        baseAmountCents: conversion?.baseAmountCents ?? null,
        baseCurrency: conversion?.baseCurrency ?? null,
        fxRate: conversion?.fxRate ?? null,
        fxRateAt: conversion?.fxRateAt ?? null,
      });
      changed("deal", "created", deal.id);
      return dealOutput(deal);
    },
    deals_update({ id, data }) {
      const { fields, ...record } = data;
      const deal = db.transaction(() => {
        const updated = deals.update(id, record);
        if (fields) writeRecordFieldValues("DEAL", id, fields);
        return updated;
      })();
      changed("deal", "updated", deal.id);
      return dealOutput(deal);
    },
    deals_setStage({ id, stage, closedReason }) {
      if (stage === "CLOSED_LOST" && !closedReason?.trim()) {
        throw new Error("A close reason is required for a lost deal.");
      }
      const deal = deals.update(id, { stage, closedReason });
      changed("deal", "stage-changed", deal.id);
      return dealOutput(deal);
    },
    deals_archive({ id }) {
      const deal = deals.archive(id);
      changed("deal", "archived", deal.id);
      return dealOutput(deal);
    },
    deals_restore({ id }) {
      const deal = deals.restore(id);
      changed("deal", "restored", deal.id);
      return dealOutput(deal);
    },
    deals_purge({ id }) {
      const deal = deals.purge(id);
      changed("deal", "purged", deal.id);
      return dealOutput(deal);
    },
    deals_bulkAssignOwner({ ids, ownerId }) {
      if (ownerId === null) throw new Error("Deals must have an owner.");
      return bulk("deal", ids, (id) => {
        deals.update(id, { ownerId });
        changed("deal", "updated", id);
      });
    },
    deals_bulkSetStage({ ids, stage, closedReason }) {
      if (stage === "CLOSED_LOST" && !closedReason?.trim()) {
        throw new Error("A close reason is required for lost deals.");
      }
      return bulk("deal", ids, (id) => {
        deals.update(id, { stage: stage as DealStage, closedReason });
        changed("deal", "stage-changed", id);
      });
    },
    deals_bulkArchive({ ids }) {
      return bulk("deal", ids, (id) => {
        deals.archive(id);
        changed("deal", "archived", id);
      });
    },
    deals_bulkRestore({ ids }) {
      return bulk("deal", ids, (id) => {
        deals.restore(id);
        changed("deal", "restored", id);
      });
    },
    deals_bulkPurge({ ids }) {
      return bulk("deal", ids, (id) => {
        deals.purge(id);
        changed("deal", "purged", id);
      });
    },
    currency_rates_list(input) {
      return currency.list(input);
    },
    async currency_rates_listEffective({ baseCurrency, limit }) {
      const configured = baseCurrency ?? (await settings.get()).reportingCurrency;
      return currency.listEffective(currencyCodeSchema.parse(configured), limit);
    },
    currency_rates_listAudit(input) {
      return currency.listAudit(input);
    },
    currency_rates_upsertManual(input) {
      const rate = currency.upsertManual(input);
      changed(
        "currency",
        "manual-rate-upserted",
        `${rate.baseCurrency}_${rate.quoteCurrency}`,
      );
      return rate;
    },
    currency_rates_removeManual({ baseCurrency, quoteCurrency, actorId }) {
      const rate = currency.rates.removeManual(baseCurrency, quoteCurrency, actorId);
      if (rate) {
        changed(
          "currency",
          "manual-rate-removed",
          `${rate.baseCurrency}_${rate.quoteCurrency}`,
        );
      }
      return rate;
    },
    async currency_deals_rerate({ id, baseCurrency, rounding, onlyMissing, now }) {
      const configured = baseCurrency ?? (await settings.get()).reportingCurrency;
      const deal = currency.rerateDeal(id, currencyCodeSchema.parse(configured), {
        rounding,
        onlyMissing,
        now,
      });
      changed("deal", "rerated", deal.id);
      return dealOutput(deal);
    },
    async currency_deals_rerateAll({ baseCurrency, rounding, onlyMissing, now }) {
      const configured = baseCurrency ?? (await settings.get()).reportingCurrency;
      const summary = currency.rerateAll(currencyCodeSchema.parse(configured), {
        rounding,
        onlyMissing,
        now,
      });
      changed("deal", "rerated", "*");
      return {
        ...summary,
        missing: summary.missing.map((code) => currencyCodeSchema.parse(code)),
      };
    },
    activity_timeline(input) {
      const page = activities.list(input);
      return {
        entries: page.entries.map(activityOutput),
        nextCursor: page.nextCursor,
      };
    },
    activity_timelineCounts(input) {
      return activities.counts(input);
    },
    activity_myTasks({ actorId, window, limit }) {
      return activities.myTasks({ actorId, window, limit }).map(activityOutput);
    },
    activity_get({ id }) {
      return activityOutput(activities.getRequired(id));
    },
    activity_create(input) {
      const activity = activities.create(input, input.createdById);
      stampActivity(activity);
      changed("activity", "created", activity.id);
      return activityOutput(activity);
    },
    activity_complete({ id, completed }) {
      const activity = activities.complete(id, completed);
      changed("activity", completed ? "completed" : "reopened", activity.id);
      return activityOutput(activity);
    },
    savedViews_list({ entity }) {
      return savedViews
        .list({ entity, ownerId: LOCAL_OWNER_ID })
        .map(savedViewOutput);
    },
    savedViews_create(input) {
      const view = savedViews.create(input, LOCAL_OWNER_ID);
      changed("saved-view", "created", view.id);
      return savedViewOutput(view);
    },
    savedViews_update({ id, data }) {
      const view = savedViews.update(id, data, LOCAL_OWNER_ID);
      changed("saved-view", "updated", view.id);
      return savedViewOutput(view);
    },
    savedViews_delete({ id }) {
      const view = savedViews.getRequired(id, LOCAL_OWNER_ID);
      const result = savedViews.delete(id, LOCAL_OWNER_ID);
      if (defaultSavedViewId(view.entity) === id) {
        db.prepare("DELETE FROM crm_metadata WHERE key = ?")
          .run(savedViewDefaultKey(view.entity));
      }
      changed("saved-view", "deleted", id);
      return result;
    },
    savedViews_setDefault({ id }) {
      const view = savedViews.getRequired(id, LOCAL_OWNER_ID);
      db.prepare(`
        INSERT INTO crm_metadata (key, value, updated_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(savedViewDefaultKey(view.entity), view.id);
      changed("saved-view", "defaulted", view.id);
      return savedViewOutput(view);
    },
    fields_list({ entity, includeArchived }) {
      return customFields.list({ entity, includeArchived });
    },
    fields_byKey({ entity, key }) {
      return customFields.byKey(entity, key);
    },
    fields_filters({ entity }) {
      return customFields.filters(entity);
    },
    fields_coverage({ id }) {
      return customFields.coverage(id);
    },
    fields_create(input) {
      const field = customFields.create(input);
      changed("custom-field", "created", field.id);
      return field;
    },
    fields_update({ id, data }) {
      const field = customFields.update(id, data);
      changed("custom-field", "updated", field.id);
      return field;
    },
    fields_reorder(input) {
      const fields = customFields.reorder(input);
      changed("custom-field", "reordered", input.entity);
      return fields;
    },
    fields_archive({ id }) {
      const field = customFields.archive(id);
      changed("custom-field", "archived", field.id);
      return field;
    },
    fields_restore({ id }) {
      const field = customFields.restore(id);
      changed("custom-field", "restored", field.id);
      return field;
    },
    fields_delete({ id }) {
      const result = customFields.delete(id);
      changed("custom-field", "deleted", id);
      return result;
    },
    fields_options_list(input) {
      return customFields.listOptions(input);
    },
    fields_options_create(input) {
      const option = customFields.createOption(input);
      changed("custom-field", "option-created", option.fieldId);
      return option;
    },
    fields_options_update({ id, data }) {
      const option = customFields.updateOption(id, data);
      changed("custom-field", "option-updated", option.fieldId);
      return option;
    },
    fields_options_archive({ id }) {
      const option = customFields.archiveOption(id);
      changed("custom-field", "option-archived", option.fieldId);
      return option;
    },
    fields_options_restore({ id }) {
      const option = customFields.restoreOption(id);
      changed("custom-field", "option-restored", option.fieldId);
      return option;
    },
    fields_options_delete({ id }) {
      const result = customFields.deleteOption(id);
      changed("custom-field", "option-deleted", id);
      return result;
    },
    fields_values_list(input) {
      return customFields.listValues(input);
    },
    fields_values_create(input) {
      const value = customFields.createValue(input);
      changed("custom-field", "value-created", value.fieldId);
      return value;
    },
    fields_values_update(input) {
      const value = customFields.updateValue(input);
      changed("custom-field", "value-updated", value.fieldId);
      return value;
    },
    fields_values_delete(input) {
      const result = customFields.deleteValue(input);
      changed("custom-field", "value-deleted", input.fieldId);
      return result;
    },
  });

  const agentToolNames = [
    "crm_search",
    "crm_get_record",
    "crm_create_record",
    "crm_update_record",
    "crm_add_activity",
    "crm_list_tasks",
    "crm_set_field",
  ] as const;
  const toolRecordEntity = z.enum(["company", "contact", "deal"]);
  const {
    createdById: _activityCreatedById,
    meta: _activityMeta,
    ...activityToolShape
  } = activityCreateInputSchema.shape;
  const activityToolInputSchema = z
    .object(activityToolShape)
    .strict()
    .refine(
      (value) => value.companyId || value.contactId || value.dealId,
      "An activity has to be about a company, a contact, or a deal.",
    )
    .refine(
      (value) => value.type !== "TASK" || Boolean(value.subject),
      "A task needs a subject.",
    );

  bb.agents.registerTool({
    name: "crm_search",
    description:
      "Search CRM companies, contacts, and deals before creating or changing a record.",
    instructions:
      "Search first. Use the returned record IDs for focused reads and writes; do not infer identity from a similar name.",
    parameters: z.object({
      query: z.string().trim().min(1),
      entity: z.enum(["all", "company", "contact", "deal"]).default("all"),
      limit: z.number().int().min(1).max(25).default(10),
    }),
    execute({ query, entity, limit }) {
      const result: Record<string, unknown[]> = {};
      if (entity === "all" || entity === "company") {
        result.companies = companies.list({ search: query, limit }).map((row) => ({
          id: row.id,
          name: row.name,
          domain: row.domain,
          ownerId: row.ownerId,
          archivedAt: row.archivedAt,
        }));
      }
      if (entity === "all" || entity === "contact") {
        result.contacts = contacts.list({ search: query, limit }).map((row) => ({
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          companyId: row.companyId,
          ownerId: row.ownerId,
          archivedAt: row.archivedAt,
        }));
      }
      if (entity === "all" || entity === "deal") {
        result.deals = deals.list({ search: query, limit }).map((row) => ({
          id: row.id,
          name: row.name,
          companyId: row.companyId,
          ownerId: row.ownerId,
          stage: row.stage,
          amountCents: row.amountCents,
          currency: row.currency,
          archivedAt: row.archivedAt,
        }));
      }
      return JSON.stringify(result);
    },
  });

  bb.agents.registerTool({
    name: "crm_get_record",
    description:
      "Read one CRM company, contact, or deal with its fields and related records.",
    parameters: z.object({ entity: toolRecordEntity, id: idSchema }),
    execute({ entity, id }) {
      const record = entity === "company"
        ? companyOutput(companies.getRequired(id), true)
        : entity === "contact"
          ? contactOutput(contacts.getRequired(id))
          : dealOutput(deals.getRequired(id));
      return JSON.stringify(record);
    },
  });

  bb.agents.registerTool({
    name: "crm_create_record",
    description:
      "Create a CRM company, contact, or deal after a search confirms it is not a duplicate.",
    instructions:
      "Call crm_search first. Never invent an owner, employer, company link, deal amount, or currency.",
    parameters: z.discriminatedUnion("entity", [
      z.object({ entity: z.literal("company"), data: companyCreateInputSchema }),
      z.object({ entity: z.literal("contact"), data: contactCreateInputSchema }),
      z.object({ entity: z.literal("deal"), data: dealCreateInputSchema }),
    ]),
    async execute(input) {
      if (input.entity === "company") {
        const record = companies.create(input.data);
        changed("company", "created", record.id);
        return JSON.stringify(companyOutput(record, true));
      }
      if (input.entity === "contact") {
        const record = contacts.create(input.data);
        changed("contact", "created", record.id);
        return JSON.stringify(contactOutput(record));
      }
      const configured = currencyCodeSchema.parse((await settings.get()).reportingCurrency);
      const sourceCurrency = input.data.currency ?? configured;
      const conversion = input.data.amountCents == null
        ? null
        : currency.convert(input.data.amountCents, sourceCurrency, configured);
      const record = deals.create({
        ...input.data,
        currency: sourceCurrency,
        baseAmountCents: conversion?.baseAmountCents ?? null,
        baseCurrency: conversion?.baseCurrency ?? null,
        fxRate: conversion?.fxRate ?? null,
        fxRateAt: conversion?.fxRateAt ?? null,
      });
      changed("deal", "created", record.id);
      return JSON.stringify(dealOutput(record));
    },
  });

  bb.agents.registerTool({
    name: "crm_update_record",
    description:
      "Apply a validated partial update to one CRM company, contact, or deal.",
    instructions:
      "Read the record first and change only requested fields. Add an activity when context should be preserved.",
    parameters: z.discriminatedUnion("entity", [
      z.object({ entity: z.literal("company"), id: idSchema, data: companyUpdateDataSchema }),
      z.object({ entity: z.literal("contact"), id: idSchema, data: contactUpdateDataSchema }),
      z.object({ entity: z.literal("deal"), id: idSchema, data: dealUpdateDataSchema }),
    ]),
    execute(input) {
      if (input.entity === "company") {
        const { fields, ...data } = input.data;
        const record = db.transaction(() => {
          const updated = companies.update(input.id, data);
          if (fields) writeRecordFieldValues("COMPANY", input.id, fields);
          return updated;
        })();
        changed("company", "updated", record.id);
        return JSON.stringify(companyOutput(record, true));
      }
      if (input.entity === "contact") {
        const { fields, ...data } = input.data;
        const record = db.transaction(() => {
          const updated = contacts.update(input.id, data);
          if (fields) writeRecordFieldValues("CONTACT", input.id, fields);
          return updated;
        })();
        changed("contact", "updated", record.id);
        return JSON.stringify(contactOutput(record));
      }
      const { fields, ...data } = input.data;
      const record = db.transaction(() => {
        const updated = deals.update(input.id, data);
        if (fields) writeRecordFieldValues("DEAL", input.id, fields);
        return updated;
      })();
      changed("deal", "updated", record.id);
      return JSON.stringify(dealOutput(record));
    },
  });

  bb.agents.registerTool({
    name: "crm_add_activity",
    description:
      "Add a note, call, email, meeting, or follow-up task to a CRM record timeline.",
    parameters: activityToolInputSchema,
    execute(input) {
      const activity = activities.create(
        { ...input, createdById: LOCAL_OWNER_ID },
        LOCAL_OWNER_ID,
      );
      stampActivity(activity);
      changed("activity", "created", activity.id);
      return JSON.stringify(activityOutput(activity));
    },
  });

  bb.agents.registerTool({
    name: "crm_list_tasks",
    description: "List incomplete CRM tasks assigned to the installation user.",
    parameters: z.object({
      window: z.enum(["overdue", "upcoming", "all"]).default("all"),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    execute(input) {
      return JSON.stringify(
        activities.myTasks({
          actorId: LOCAL_OWNER_ID,
          window: input.window,
          limit: input.limit,
        }).map(activityOutput),
      );
    },
  });

  bb.agents.registerTool({
    name: "crm_set_field",
    description:
      "Set or clear one typed CRM custom field by its stable key on a company, contact, or deal.",
    parameters: z.object({
      entity: fieldEntitySchema,
      recordId: idSchema,
      key: z.string().trim().min(1),
      value: fieldValueSchema,
    }),
    execute({ entity, recordId, key, value }) {
      const definition = customFields.byKey(entity, key);
      const output = customFields.upsertValue({
        entity,
        recordId,
        fieldId: definition.id,
        value,
      });
      changed("custom-field", "value-updated", definition.id);
      return JSON.stringify({ ...output, key: definition.key });
    },
  });

  bb.agents.configure(() => ({
    tools: [...agentToolNames],
    skills: ["crm"],
    instructions:
      "CRM tools are available. Search before creating, preserve source money, and record evidence or timeline context for consequential updates.",
  }));

  bb.cli.register({
    name: "crm",
    summary: "Manage CRM records, activities, agents, and integrations",
    commands: [
      {
        name: "status",
        summary: "Show CRM extension status",
        usage: "bb crm status",
      },
    ],
    async run(argv) {
      const command = argv[0] ?? "status";
      if (command !== "status") {
        return {
          exitCode: 2,
          stderr: `Unknown CRM command: ${command}\nRun: bb crm status`,
        };
      }
      const { workspaceName, reportingCurrency } = await settings.get();
      return {
        exitCode: 0,
        stdout: [
          `CRM ${CRM_PLUGIN_VERSION}`,
          `Workspace: ${workspaceName}`,
          `Reporting currency: ${reportingCurrency}`,
          `Schema: ${CRM_SCHEMA_VERSION}`,
        ].join("\n"),
      };
    },
  });

  bb.log.info(`CRM ${CRM_PLUGIN_VERSION} loaded`);
}
