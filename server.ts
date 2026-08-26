import type {
  BbPluginApi,
  PluginCliContext,
  PluginCliResult,
} from "@get-bb/plugin-sdk";
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";
import {
  createAgentDispatcher,
  type AgentDispatchResult,
} from "./agent-dispatch.js";
import {
  activityCreateInputSchema,
  companyCreateInputSchema,
  companyListInputSchema,
  companyUpdateDataSchema,
  contactCreateInputSchema,
  contactListInputSchema,
  contactUpdateDataSchema,
  currencyCodeSchema,
  dealCreateInputSchema,
  dealListInputSchema,
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
import { createEvidenceStore } from "./db/evidence.js";
import {
  createAgentStore,
  type AgentJsonValue,
  type AgentTrigger,
} from "./db/agents.js";
import {
  createConnectionStore,
  createTrackingSiteStore,
  createTrackingStore,
} from "./db/connections.js";

export const CRM_PLUGIN_VERSION = "0.1.0";

/**
 * The dispatcher is deliberately a short, bounded service loop. Tests can
 * lower this through CRM_AGENT_DISPATCH_INTERVAL_MS without waiting on a
 * production-sized interval, while a real host still gets a pause between
 * sweeps when there is no work.
 */
export const CRM_AGENT_DISPATCH_INTERVAL_MS = 5_000;
export const CRM_AGENT_DISPATCH_MAX_BATCH = 100;
export const CRM_AGENT_DISPATCH_SERVICE_NAME = "crm-agent-dispatcher";

const safeProjectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const publicProjectSchema = z
  .object({ id: safeProjectIdSchema })
  .passthrough();
const NO_PROJECT_DIAGNOSTIC =
  "CRM agent dispatcher is waiting for a non-deleted BB project; queued agent runs remain QUEUED.";

function manifestProjectId(manifest: unknown): string | null {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    return null;
  }
  const value = (manifest as Record<string, unknown>).projectId;
  const parsed = safeProjectIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isDeletedProject(value: Record<string, unknown>): boolean {
  if (value.deleted === true) return true;
  const deletedAt = value.deletedAt;
  return (typeof deletedAt === "string" && deletedAt.trim().length > 0) ||
    (typeof deletedAt === "number" && Number.isFinite(deletedAt));
}

type CrmRecordEntity = "company" | "contact" | "deal";
type CrmOutputFormat = "json" | "csv";

class CrmCliUsageError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "CrmCliUsageError";
  }
}

interface ParsedCliArgs {
  positionals: string[];
  options: Map<string, string[]>;
  flags: Set<string>;
}

const CLI_BOOLEAN_FLAGS = new Set([
  "all",
  "archived",
  "help",
  "json",
]);

function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--") || token === "--") {
      positionals.push(token);
      continue;
    }
    const assignment = token.slice(2).indexOf("=");
    const rawKey = assignment < 0 ? token.slice(2) : token.slice(2, assignment);
    const key = rawKey.trim().toLowerCase();
    if (!key) throw new CrmCliUsageError("Option names must not be empty.");
    if (assignment >= 0) {
      const value = token.slice(2 + assignment + 1);
      if (!value) throw new CrmCliUsageError(`Option --${key} needs a value.`);
      const values = options.get(key) ?? [];
      values.push(value);
      options.set(key, values);
      continue;
    }
    if (CLI_BOOLEAN_FLAGS.has(key) || index === argv.length - 1 || argv[index + 1]?.startsWith("--")) {
      flags.add(key);
      continue;
    }
    const values = options.get(key) ?? [];
    values.push(argv[index + 1]!);
    options.set(key, values);
    index += 1;
  }
  return { positionals, options, flags };
}

function assertCliArgs(
  args: ParsedCliArgs,
  allowedOptions: readonly string[],
  allowedFlags: readonly string[] = ["json"],
): void {
  const allowedOptionSet = new Set(allowedOptions);
  const allowedFlagSet = new Set(allowedFlags);
  for (const key of args.options.keys()) {
    if (!allowedOptionSet.has(key)) throw new CrmCliUsageError(`Unknown option: --${key}`);
  }
  for (const key of args.flags) {
    if (!allowedFlagSet.has(key)) throw new CrmCliUsageError(`Unknown option: --${key}`);
  }
}

function oneCliOption(args: ParsedCliArgs, name: string): string | undefined {
  const values = args.options.get(name) ?? [];
  if (values.length > 1) throw new CrmCliUsageError(`Option --${name} may only be used once.`);
  return values[0];
}

function aliasedCliOption(args: ParsedCliArgs, ...names: string[]): string | undefined {
  const found = names
    .map((name) => ({ name, value: oneCliOption(args, name) }))
    .filter((entry): entry is { name: string; value: string } => entry.value !== undefined);
  if (found.length > 1) {
    throw new CrmCliUsageError(`Use only one of ${found.map((entry) => `--${entry.name}`).join(", ")}.`);
  }
  return found[0]?.value;
}

function cliOptionValues(args: ParsedCliArgs, name: string): string[] {
  return (args.options.get(name) ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function cliInteger(value: string | undefined, label: string, bounds?: { min: number; max: number }): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new CrmCliUsageError(`${label} must be a non-negative integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (bounds && (parsed < bounds.min || parsed > bounds.max))) {
    const suffix = bounds ? ` between ${bounds.min} and ${bounds.max}` : "";
    throw new CrmCliUsageError(`${label} must be an integer${suffix}.`);
  }
  return parsed;
}

function requiredCliPositionals(
  args: ParsedCliArgs,
  count: number,
  usage: string,
): string[] {
  if (args.positionals.length !== count) {
    throw new CrmCliUsageError(`Usage: ${usage}`);
  }
  return args.positionals;
}

function recordEntity(value: string | undefined): CrmRecordEntity {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "company" || normalized === "companies") return "company";
  if (normalized === "contact" || normalized === "contacts") return "contact";
  if (normalized === "deal" || normalized === "deals") return "deal";
  throw new CrmCliUsageError("Entity must be company, contact, or deal.");
}

function cliFormat(value: string | undefined): CrmOutputFormat {
  const normalized = value?.trim().toLowerCase() ?? "json";
  if (normalized === "json" || normalized === "csv") return normalized;
  throw new CrmCliUsageError("Format must be json or csv.");
}

function isCliRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCliJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CrmCliUsageError(`${label} must be valid JSON.`);
  }
}

function parseCliJsonObject(raw: string, label: string): Record<string, unknown> {
  const value = parseCliJson(raw, label);
  if (!isCliRecord(value)) throw new CrmCliUsageError(`${label} must be a JSON object.`);
  return value;
}

function parseCliSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "payload"}: ${issue.message}`)
    .join("; ");
  throw new CrmCliUsageError(`${label} is invalid${details ? ` (${details})` : ""}.`);
}

function cliPayload(
  args: ParsedCliArgs,
  positionals: readonly string[],
  usage: string,
): Record<string, unknown> {
  const option = oneCliOption(args, "data");
  if (option !== undefined && positionals.length > 0) {
    throw new CrmCliUsageError(`Usage: ${usage}`);
  }
  const raw = option ?? positionals[0];
  if (raw === undefined) throw new CrmCliUsageError(`Usage: ${usage}`);
  if (positionals.length > (option === undefined ? 1 : 0)) {
    throw new CrmCliUsageError(`Usage: ${usage}`);
  }
  return parseCliJsonObject(raw, "Payload");
}

const CRM_EXPORT_COLUMNS: Record<CrmRecordEntity, readonly string[]> = {
  company: ["id", "name", "domain", "ownerId"],
  contact: ["id", "firstName", "lastName", "email", "phone", "title", "companyId", "ownerId"],
  deal: ["id", "name", "companyId", "ownerId", "stage", "amountCents", "currency", "expectedCloseDate"],
};

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeCsv(entity: CrmRecordEntity, rows: readonly Record<string, unknown>[]): string {
  const columns = CRM_EXPORT_COLUMNS[entity];
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  return `${lines.join("\n")}\n`;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new CrmCliUsageError("CSV payload has an unterminated quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
}

function parseCsvRecords(entity: CrmRecordEntity, text: string): Record<string, unknown>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new CrmCliUsageError("CSV payload must include a header row.");
  const columns = rows[0]!.map((column) => column.replace(/^\ufeff/u, "").trim());
  const expected = CRM_EXPORT_COLUMNS[entity];
  if (columns.length !== expected.length || columns.some((column, index) => column !== expected[index])) {
    throw new CrmCliUsageError(`CSV header must be: ${expected.join(",")}`);
  }
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== columns.length) {
      throw new CrmCliUsageError(`CSV row ${rowIndex + 2} has ${values.length} columns; expected ${columns.length}.`);
    }
    return Object.fromEntries(columns.map((column, index) => [column, values[index] === "" ? null : values[index]]));
  });
}

function exportRecord(entity: CrmRecordEntity, row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(CRM_EXPORT_COLUMNS[entity].map((column) => [column, row[column] ?? null]));
}

function csvOrJsonValue(value: unknown, label: string): unknown {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") return value;
  const parsed = Number(value);
  if (label === "amountCents") {
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new CrmCliUsageError("amountCents must be a non-negative integer.");
    }
    return parsed;
  }
  return value;
}

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
  const evidenceStore = createEvidenceStore(db);
  const agents = createAgentStore(db);
  const connections = createConnectionStore(db);
  const trackingSites = createTrackingSiteStore(db);
  const tracking = createTrackingStore(db);

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
    entity:
      | "company"
      | "contact"
      | "deal"
      | "currency"
      | "activity"
      | "saved-view"
      | "custom-field"
      | "contact-fact"
      | "contact-brief"
      | "contact-work-history"
      | "agent"
      | "agent-version"
      | "agent-trigger"
      | "agent-run"
      | "agent-action"
      | "agent-audit"
      | "agent-thread"
      | "connection"
      | "tracking-site"
      | "tracking-token"
      | "tracking-event"
      | "tracking-aggregate",
    action: string,
    id: string,
  ): void {
    bb.realtime.publish("changed", { entity, action, id });
  }

  function changedContactEvidence(
    entity: "contact-fact" | "contact-brief" | "contact-work-history",
    action: string,
    id: string,
    contactId: string,
  ): void {
    changed(entity, action, id);
    // Evidence is part of the contact detail projection. Publish a contact
    // invalidation as well so a mounted record drawer refreshes immediately.
    changed("contact", "evidence-updated", contactId);
  }

  type AvailableProject = { id: string; deletedAt?: unknown; deleted?: unknown };
  type PreparedProject = { projectId: string | null };

  let preparedProject: PreparedProject | null = null;
  let preferredManifestProjectId: string | null = null;

  async function readAvailableProjects(): Promise<AvailableProject[]> {
    const listed = await bb.sdk.projects.list({ includePersonal: true });
    if (!Array.isArray(listed)) {
      throw new Error("BB projects.list returned a non-array response.");
    }
    const projects: AvailableProject[] = [];
    for (const raw of listed) {
      const parsed = publicProjectSchema.safeParse(raw);
      if (!parsed.success) {
        bb.log.warn("CRM agent dispatcher ignored a malformed BB project response.");
        continue;
      }
      const project = parsed.data as AvailableProject;
      if (!isDeletedProject(project)) projects.push(project);
    }
    return projects;
  }

  function chooseProject(
    projects: readonly AvailableProject[],
    preferredId: string | null,
  ): string | null {
    if (preferredId !== null) {
      const preferred = projects.find((project) => project.id === preferredId);
      if (preferred) return preferred.id;
    }
    return projects[0]?.id ?? null;
  }

  /**
   * Project selection is intentionally lazy. The SDK is only consulted when a
   * run is about to spawn a thread, and the service can pre-seed one validated
   * choice for a sweep so a no-project condition leaves rows queued.
   */
  const lazyProjectResolver = async (): Promise<string> => {
    const prepared = preparedProject;
    if (prepared !== null) {
      preparedProject = null;
      if (prepared.projectId === null) throw new Error(NO_PROJECT_DIAGNOSTIC);
      return prepared.projectId;
    }
    const projects = await readAvailableProjects();
    const projectId = chooseProject(projects, preferredManifestProjectId);
    if (projectId === null) throw new Error(NO_PROJECT_DIAGNOSTIC);
    return projectId;
  };

  const dispatcher = createAgentDispatcher({
    bb,
    db,
    projectId: lazyProjectResolver,
    cleanupHiddenThreads: true,
  });

  type DispatcherLifecycleEvent = "thread.idle" | "thread.failed" | "thread.deleted";
  type DispatcherLifecycleHandler = (payload: unknown) => void | Promise<void>;
  const dispatcherLifecycleHandlers = new Map<DispatcherLifecycleEvent, DispatcherLifecycleHandler>();
  dispatcher.registerLifecycleHooks({
    on(event, handler) {
      dispatcherLifecycleHandlers.set(
        event as DispatcherLifecycleEvent,
        handler as unknown as DispatcherLifecycleHandler,
      );
    },
  });

  function publishLinkedRunLifecycle(threadId: string): void {
    const link = db.prepare(`
      SELECT id AS linkId, run_id AS runId
      FROM agent_thread_links
      WHERE thread_id = ? AND kind = 'RUN'
      LIMIT 1
    `).get(threadId) as { linkId?: unknown; runId?: unknown } | undefined;
    if (typeof link?.linkId !== "string" || typeof link.runId !== "string") return;
    const run = agents.getRun(link.runId);
    if (!run) return;
    const action = run.status === "SUCCEEDED"
      ? "succeeded"
      : run.status === "FAILED"
        ? "failed"
        : run.status === "CANCELLED"
          ? "cancelled"
          : "updated";
    changed("agent-thread", "lifecycle", link.linkId);
    changed("agent-run", action, run.id);
    changed("agent", "run-updated", run.agentId);
  }

  const idleLifecycleHandler = dispatcherLifecycleHandlers.get("thread.idle");
  const failedLifecycleHandler = dispatcherLifecycleHandlers.get("thread.failed");
  const deletedLifecycleHandler = dispatcherLifecycleHandlers.get("thread.deleted");
  if (!idleLifecycleHandler || !failedLifecycleHandler || !deletedLifecycleHandler) {
    throw new Error("CRM agent dispatcher did not register all lifecycle hooks.");
  }
  // Wrap the dispatcher's hooks so terminal transitions also invalidate the
  // mounted agent run/thread views. The wrapper keeps exactly one BB listener
  // for each event, which makes reloads and duplicate host signals idempotent.
  bb.events.on("thread.idle", async (payload) => {
    await idleLifecycleHandler(payload);
    publishLinkedRunLifecycle(payload.thread.id);
  });
  bb.events.on("thread.failed", async (payload) => {
    await failedLifecycleHandler(payload);
    publishLinkedRunLifecycle(payload.thread.id);
  });
  bb.events.on("thread.deleted", async (payload) => {
    await deletedLifecycleHandler(payload);
    publishLinkedRunLifecycle(payload.thread.id);
  });

  function scheduleConfig(trigger: AgentTrigger): {
    cron: string | null;
    timezone: string | undefined;
    input: AgentJsonValue | null;
  } {
    const config = trigger.config as Record<string, unknown>;
    const cron = typeof config.cron === "string" && config.cron.trim().length > 0
      ? config.cron.trim()
      : null;
    const timezone = typeof config.timezone === "string" && config.timezone.trim().length > 0
      ? config.timezone.trim()
      : undefined;
    return {
      cron,
      timezone,
      input: config.input === undefined ? null : config.input as AgentJsonValue,
    };
  }

  function nextScheduleAt(cron: string, currentDate: Date, timezone?: string): string {
    const expression = CronExpressionParser.parse(cron, {
      currentDate,
      ...(timezone === undefined ? {} : { tz: timezone }),
    });
    return expression.next().toDate().toISOString();
  }

  function scheduleFailure(trigger: AgentTrigger, reason: string): void {
    bb.log.error(`CRM agent schedule ${trigger.id} is invalid: ${reason}`);
    try {
      const updated = agents.updateTrigger(
        trigger.id,
        { nextRunAt: null },
        "crm-dispatcher",
      );
      changed("agent-trigger", "updated", updated.id);
      changed("agent", "trigger-updated", updated.agentId);
    } catch (error) {
      bb.log.warn(
        `CRM agent schedule ${trigger.id} could not be paused: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  function publishTriggerUpdate(trigger: AgentTrigger, action: string): void {
    changed("agent-trigger", action, trigger.id);
    changed("agent", "trigger-updated", trigger.agentId);
  }

  async function enqueueDueScheduleRuns(signal: AbortSignal): Promise<void> {
    const now = new Date();
    const nowIso = now.toISOString();
    const rows = db.prepare(`
      SELECT id
      FROM agent_triggers
      WHERE type = 'SCHEDULE' AND enabled = 1
        AND (next_run_at IS NULL OR next_run_at <= ?)
      ORDER BY COALESCE(next_run_at, ''), id
      LIMIT ?
    `).all(nowIso, CRM_AGENT_DISPATCH_MAX_BATCH) as Array<{ id?: unknown }>;

    for (const row of rows) {
      if (signal.aborted) return;
      if (typeof row.id !== "string") continue;
      let trigger: AgentTrigger | null;
      try {
        trigger = agents.getTrigger(row.id);
      } catch (error) {
        bb.log.error(
          `CRM agent schedule row ${row.id} could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      if (!trigger || !trigger.enabled || trigger.type !== "SCHEDULE") continue;

      const config = scheduleConfig(trigger);
      if (config.cron === null) {
        scheduleFailure(trigger, "config.cron is required");
        continue;
      }

      if (trigger.nextRunAt === null) {
        try {
          const nextRunAt = nextScheduleAt(config.cron, now, config.timezone);
          const updated = agents.updateTrigger(
            trigger.id,
            { nextRunAt },
            "crm-dispatcher",
          );
          publishTriggerUpdate(updated, "scheduled");
        } catch (error) {
          scheduleFailure(
            trigger,
            error instanceof Error ? error.message : String(error),
          );
        }
        continue;
      }

      const dueDate = new Date(trigger.nextRunAt);
      if (Number.isNaN(dueDate.getTime())) {
        scheduleFailure(trigger, "nextRunAt is not a valid timestamp");
        continue;
      }

      let nextRunAt: string;
      try {
        // Compute from now so one delayed sweep does not replay an unbounded
        // backlog of missed occurrences.
        nextRunAt = nextScheduleAt(config.cron, now, config.timezone);
      } catch (error) {
        scheduleFailure(
          trigger,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }

      const dueAt = dueDate.toISOString();
      const idempotencyKey = `crm-schedule:${trigger.id}:${dueAt}`;
      try {
        const run = agents.queueRun(
          trigger.agentId,
          {
            versionId: trigger.versionId,
            triggerId: trigger.id,
            triggerType: "SCHEDULE",
            input: config.input,
            idempotencyKey,
            correlationId: idempotencyKey,
          },
          "crm-dispatcher",
        );
        changed("agent-run", "queued", run.id);
        changed("agent", "run-queued", run.agentId);
        const updated = agents.updateTrigger(
          trigger.id,
          { lastRunAt: dueAt, nextRunAt },
          "crm-dispatcher",
        );
        publishTriggerUpdate(updated, "scheduled");
      } catch (error) {
        bb.log.error(
          `CRM agent schedule ${trigger.id} could not queue its due run: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  function publishDispatchResult(result: AgentDispatchResult): void {
    if (result.kind === "dispatched") {
      changed("agent-run", "started", result.run.id);
      changed("agent", "run-updated", result.run.agentId);
      changed("agent-thread", "linked", result.thread.id);
    } else if (result.kind === "failed") {
      changed("agent-run", "failed", result.run.id);
      changed("agent", "run-updated", result.run.agentId);
    }
  }

  async function reconcileRunningLinkedRuns(signal: AbortSignal): Promise<void> {
    const rows = db.prepare(`
      SELECT l.thread_id AS threadId
      FROM agent_thread_links AS l
      INNER JOIN agent_runs AS r ON r.id = l.run_id
      WHERE l.kind = 'RUN' AND r.status = 'RUNNING'
      ORDER BY l.created_at ASC, l.id ASC
      LIMIT ?
    `).all(CRM_AGENT_DISPATCH_MAX_BATCH) as Array<{ threadId?: unknown }>;

    for (const row of rows) {
      if (signal.aborted) return;
      if (typeof row.threadId !== "string") continue;
      try {
        const result = await dispatcher.reconcileThread(row.threadId);
        if (result.kind === "succeeded" || result.kind === "failed" || result.kind === "cancelled") {
          publishLinkedRunLifecycle(row.threadId);
        }
      } catch (error) {
        bb.log.error(
          `CRM agent run linked to BB thread ${row.threadId} could not be reconciled: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async function performDispatcherSweep(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await reconcileRunningLinkedRuns(signal);
    if (signal.aborted) return;
    await enqueueDueScheduleRuns(signal);
    if (signal.aborted) return;

    const queued = agents.listRuns({
      status: "QUEUED",
      limit: CRM_AGENT_DISPATCH_MAX_BATCH,
      includeEvents: true,
      includeActions: true,
    });
    if (queued.length === 0) return;

    let projects: AvailableProject[];
    try {
      projects = await readAvailableProjects();
    } catch (error) {
      bb.log.error(
        `CRM agent dispatcher could not list BB projects; queued runs remain QUEUED: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
    if (projects.length === 0) {
      bb.log.warn(`${NO_PROJECT_DIAGNOSTIC} (${queued.length} queued run${queued.length === 1 ? "" : "s"}).`);
      return;
    }

    for (const run of queued) {
      if (signal.aborted) return;
      let preferredId: string | null = null;
      try {
        preferredId = manifestProjectId(agents.getVersionRequired(run.versionId).manifest);
      } catch (error) {
        bb.log.error(
          `CRM agent run ${run.id} could not read its deployed version: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      const projectId = chooseProject(projects, preferredId);
      if (projectId === null) {
        bb.log.warn(`${NO_PROJECT_DIAGNOSTIC} Run ${run.id} remains QUEUED.`);
        continue;
      }
      preferredManifestProjectId = preferredId;
      preparedProject = { projectId };
      try {
        const result = await dispatcher.dispatchQueuedRun(run.id);
        publishDispatchResult(result);
      } catch (error) {
        bb.log.error(
          `CRM agent run ${run.id} dispatch sweep failed; its persisted state was preserved: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        preparedProject = null;
        preferredManifestProjectId = null;
      }
    }
  }

  let sweepInFlight: Promise<void> | null = null;
  async function runDispatcherSweep(signal: AbortSignal): Promise<void> {
    if (sweepInFlight !== null) {
      await sweepInFlight;
      return;
    }
    const current = (async () => {
      try {
        await performDispatcherSweep(signal);
      } catch (error) {
        bb.log.error(
          `CRM agent dispatcher sweep failed; persisted runs remain available for retry: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    })();
    sweepInFlight = current;
    try {
      await current;
    } finally {
      if (sweepInFlight === current) sweepInFlight = null;
    }
  }

  function configuredDispatcherInterval(): number {
    const raw = process.env.CRM_AGENT_DISPATCH_INTERVAL_MS;
    if (raw === undefined) return CRM_AGENT_DISPATCH_INTERVAL_MS;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 10 && parsed <= 3_600_000
      ? parsed
      : CRM_AGENT_DISPATCH_INTERVAL_MS;
  }

  function waitForDispatcherInterval(signal: AbortSignal, delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(done, delayMs);
      const abort = () => {
        clearTimeout(timer);
        done();
      };
      function done(): void {
        signal.removeEventListener("abort", abort);
        resolve();
      }
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  function waitForDispatcherStop(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const abort = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  let dispatcherServiceRunning = false;
  bb.background.service(CRM_AGENT_DISPATCH_SERVICE_NAME, {
    async start(signal) {
      // The host starts one instance, but this guard keeps deterministic test
      // drivers and accidental duplicate starts from creating extra workers.
      if (dispatcherServiceRunning) {
        await waitForDispatcherStop(signal);
        return;
      }
      dispatcherServiceRunning = true;
      try {
        const intervalMs = configuredDispatcherInterval();
        while (!signal.aborted) {
          await runDispatcherSweep(signal);
          if (signal.aborted) break;
          await waitForDispatcherInterval(signal, intervalMs);
        }
      } finally {
        dispatcherServiceRunning = false;
      }
    },
  });

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

  function contactRelationship(
    contact: StoredContact,
  ): NonNullable<ContactOutput["relationship"]> {
    const emailSummary = db.prepare(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN json_type(a.meta, '$.messageCount') IN ('integer', 'real')
              AND CAST(json_extract(a.meta, '$.messageCount') AS INTEGER) > 0
            THEN CAST(json_extract(a.meta, '$.messageCount') AS INTEGER)
            ELSE 1
          END
        ), 0) AS emails,
        COUNT(DISTINCT COALESCE(a.email_thread_id, a.id)) AS threads,
        MAX(COALESCE(a.occurred_at, a.created_at)) AS lastReplyAt
      FROM activities AS a
      WHERE a.contact_id = ? AND a.type = 'EMAIL'
    `).get(contact.id) as {
      emails: number;
      threads: number;
      lastReplyAt: string | null;
    };
    const meetings = Number(
      db
        .prepare("SELECT COUNT(*) AS count FROM activities WHERE contact_id = ? AND type = 'MEETING'")
        .pluck()
        .get(contact.id),
    );
    const nextMeeting = db.prepare(`
      SELECT
        COALESCE(NULLIF(trim(subject), ''), 'Meeting') AS title,
        COALESCE(occurred_at, created_at) AS startsAt
      FROM activities
      WHERE contact_id = ?
        AND type = 'MEETING'
        AND COALESCE(occurred_at, created_at) > ?
      ORDER BY COALESCE(occurred_at, created_at) ASC, id ASC
      LIMIT 1
    `).get(contact.id, new Date().toISOString()) as
      | { title: string; startsAt: string }
      | undefined;
    const colleagues = contact.companyId
      ? db.prepare(`
          SELECT id, first_name AS firstName, last_name AS lastName, title
          FROM contacts
          WHERE company_id = ? AND id <> ? AND archived_at IS NULL
          ORDER BY (last_activity_at IS NULL), last_activity_at DESC,
            last_name COLLATE NOCASE, first_name COLLATE NOCASE, id
          LIMIT 4
        `).all(contact.companyId, contact.id) as Array<{
          id: string;
          firstName: string;
          lastName: string | null;
          title: string | null;
        }>
      : [];

    return {
      emails: Number(emailSummary.emails ?? 0),
      threads: Number(emailSummary.threads ?? 0),
      lastReplyAt: emailSummary.lastReplyAt ?? null,
      meetings,
      nextMeeting: nextMeeting
        ? { title: nextMeeting.title, startsAt: nextMeeting.startsAt }
        : null,
      colleagues: colleagues.map((colleague) => ({
        id: colleague.id,
        name: [colleague.firstName, colleague.lastName].filter(Boolean).join(" "),
        title: colleague.title,
      })),
    };
  }

  function contactEvidenceOutput(contactId: string): Pick<
    ContactOutput,
    "facts" | "brief" | "workHistory" | "relationship"
  > {
    const facts: NonNullable<ContactOutput["facts"]> = evidenceStore.facts
      .list(contactId, {
        statuses: ["APPLIED", "PROPOSED"],
        includeSuperseded: false,
      })
      .map((fact) => ({
        id: fact.id,
        field: fact.field,
        value: fact.value,
        score: fact.score,
        band: fact.band,
        evidence: fact.evidence.map((item) => ({
          kind: item.kind,
          detail: item.detail,
          sourceUrl: item.sourceUrl,
        })),
        method: fact.method,
        sourceUrl: fact.sourceUrl,
        status: fact.status,
        observedAt: fact.observedAt,
      }));
    const storedBrief = evidenceStore.briefs.latest(contactId);
    const brief: ContactOutput["brief"] = storedBrief
      ? {
          narrative: storedBrief.narrative,
          sections: storedBrief.sections,
          score: storedBrief.score,
          sourceUrl: storedBrief.sourceUrl,
          refreshedAt: storedBrief.refreshedAt,
        }
      : null;
    const workHistory: NonNullable<ContactOutput["workHistory"]> = evidenceStore.workHistory
      .list(contactId, {
        statuses: ["APPLIED", "PROPOSED"],
        includeSuperseded: false,
      })
      .map((role) => ({
        ...role,
        evidence: role.evidence.map((item) => ({
          kind: item.kind,
          detail: item.detail,
          sourceUrl: item.sourceUrl,
        })),
      }));
    return {
      facts,
      brief,
      workHistory,
      relationship: contactRelationship(contacts.getRequired(contactId)),
    };
  }

  function contactOutput(
    contact: StoredContact,
    includeEvidence = false,
  ): ContactOutput {
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
    const output: ContactOutput = {
      ...contact,
      company: company ?? null,
      isPrimaryContact,
      deals,
      fields: recordFieldValues("CONTACT", contact.id),
    };
    return includeEvidence
      ? { ...output, ...contactEvidenceOutput(contact.id) }
      : output;
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
    connections_list(input) {
      return connections.list(input);
    },
    connections_get({ id }) {
      return connections.getRequired(id);
    },
    connections_health({ id }) {
      return connections.getRequired(id).health;
    },
    connections_upsert(input) {
      const existing = input.id
        ? connections.get(input.id)
        : connections.list({ provider: input.provider }).find((row) =>
            row.externalAccountId === (input.externalAccountId ?? null));
      const connection = connections.upsert(input);
      changed("connection", existing ? "updated" : "created", connection.id);
      return connection;
    },
    connections_disable({ id, at }) {
      const connection = connections.disable(id, at);
      changed("connection", "disabled", connection.id);
      return connection;
    },
    connections_syncSuccess({ connectionId, ...input }) {
      const connection = connections.recordSyncSuccess(connectionId, input);
      changed("connection", "sync-succeeded", connection.id);
      changed("connection", "health-updated", connection.id);
      return connection;
    },
    connections_syncFailure({ connectionId, ...input }) {
      const connection = connections.recordSyncFailure(connectionId, input);
      changed("connection", "sync-failed", connection.id);
      changed("connection", "health-updated", connection.id);
      return connection;
    },
    connections_syncCursors({ id }) {
      return connections.listSyncCursors(id);
    },
    connections_syncResult(input) {
      const { connectionId, result, ...data } = input;
      const connection = result === "SUCCESS"
        ? connections.recordSyncSuccess(connectionId, data)
        : connections.recordSyncFailure(connectionId, data);
      changed("connection", result === "SUCCESS" ? "sync-succeeded" : "sync-failed", connection.id);
      changed("connection", "health-updated", connection.id);
      return connection;
    },
    connections_diagnostics({ id }) {
      return {
        connection: connections.getRequired(id),
        syncCursors: connections.listSyncCursors(id),
      };
    },
    tracking_sites_list(input) {
      return trackingSites.list(input);
    },
    tracking_sites_get({ id }) {
      return trackingSites.getRequired(id);
    },
    tracking_sites_create(input) {
      const site = trackingSites.create(input);
      changed("tracking-site", "created", site.id);
      return site;
    },
    tracking_sites_verify({ id, ...input }) {
      const site = trackingSites.verify(id, input);
      changed("tracking-site", "verified", site.id);
      return site;
    },
    tracking_sites_pause({ id, paused, at }) {
      const site = trackingSites.pause(id, paused, at);
      changed("tracking-site", paused ? "paused" : "resumed", site.id);
      return site;
    },
    tracking_sites_rotate({ id, at }) {
      const provisioned = trackingSites.rotate(id, at);
      changed("tracking-site", "rotated", provisioned.id);
      changed("tracking-token", "rotated", provisioned.tokenId);
      return provisioned;
    },
    tracking_tokens_list(input) {
      return trackingSites.listTokens(input.siteId, input.scope);
    },
    tracking_tokens_provision({ scope, siteId, at }) {
      const token = scope === "INTAKE"
        ? trackingSites.createIntakeToken(at)
        : trackingSites.createTrackingToken(siteId!, at);
      changed("tracking-token", "provisioned", token.id);
      return token;
    },
    tracking_tokens_rotate({ siteId, at }) {
      const token = trackingSites.rotateTrackingToken(siteId, at);
      changed("tracking-token", "rotated", token.id);
      return token;
    },
    tracking_tokens_revoke({ id, at }) {
      const token = trackingSites.revokeToken(id, at);
      changed("tracking-token", "revoked", token.id);
      return token;
    },
    tracking_events_get({ id }) {
      const event = tracking.get(id);
      if (!event) throw new Error(`No tracking event with id ${id}.`);
      return event;
    },
    tracking_events_list(input) {
      return tracking.list(input);
    },
    tracking_events_ingest(input) {
      const event = tracking.ingest(input);
      changed("tracking-event", "ingested", event.id);
      return event;
    },
    tracking_events_ingestBatch({ events }) {
      const rows = tracking.ingestBatch(events);
      for (const event of rows) changed("tracking-event", "ingested", event.id);
      return rows;
    },
    tracking_aggregates_list(input) {
      return tracking.listAggregates(input);
    },
    tracking_aggregates_rollup(input) {
      const result = tracking.rollup(input);
      changed("tracking-aggregate", "rolled-up", input.siteId ?? "*");
      return result;
    },
    tracking_aggregates_prune(input) {
      const result = tracking.prune(input);
      changed("tracking-aggregate", "pruned", input.siteId ?? "*");
      changed("tracking-event", "pruned", input.siteId ?? "*");
      return result;
    },
    agents_list(input) {
      return agents.list(input);
    },
    agents_get({ id }) {
      return agents.detail(id) ?? (() => {
        throw new Error(`No agent found for id ${id}.`);
      })();
    },
    agents_create(input) {
      const agent = agents.create(input, LOCAL_OWNER_ID);
      changed("agent", "created", agent.id);
      return agent;
    },
    agents_update({ id, data }) {
      const agent = agents.update(id, data, LOCAL_OWNER_ID);
      changed("agent", "updated", agent.id);
      return agent;
    },
    agents_versions_list({ agentId, status, limit, offset }) {
      return agents.listVersions(agentId, { status, limit, offset });
    },
    agents_versions_get({ id }) {
      const version = agents.getVersionRequired(id);
      return version;
    },
    agents_versions_create({ agentId, data }) {
      const version = agents.createVersion(agentId, data, LOCAL_OWNER_ID);
      changed("agent-version", "created", version.id);
      changed("agent", "version-created", agentId);
      return version;
    },
    agents_versions_validate({ id, actorId }) {
      const version = agents.validateVersion(id, undefined, actorId ?? LOCAL_OWNER_ID);
      changed("agent-version", "validated", version.id);
      changed("agent", "version-validated", version.agentId);
      return version;
    },
    agents_deploy({ agentId, versionId, actorId, requestId, clientRequestId }) {
      const deployment = agents.deploy({
        agentId,
        versionId,
        actorId: actorId ?? LOCAL_OWNER_ID,
        requestId: requestId ?? clientRequestId,
      });
      changed("agent", "deployed", deployment.id);
      changed("agent-version", "deployed", deployment.versionId);
      return deployment;
    },
    agents_pause({ id, actorId }) {
      const agent = agents.pause(id, actorId ?? LOCAL_OWNER_ID);
      changed("agent", "paused", agent.id);
      return agent;
    },
    agents_resume({ id, actorId }) {
      const agent = agents.resume(id, actorId ?? LOCAL_OWNER_ID);
      changed("agent", "resumed", agent.id);
      return agent;
    },
    agents_archive({ id, actorId }) {
      const agent = agents.archive(id, actorId ?? LOCAL_OWNER_ID);
      changed("agent", "archived", agent.id);
      return agent;
    },
    agents_restore({ id, actorId }) {
      const agent = agents.restore(id, actorId ?? LOCAL_OWNER_ID);
      changed("agent", "restored", agent.id);
      return agent;
    },
    agents_triggers_list({ agentId, type, enabled, limit, offset }) {
      return agents.listTriggers(agentId, { type, enabled, limit, offset });
    },
    agents_triggers_get({ id }) {
      return agents.getTriggerRequired(id);
    },
    agents_triggers_create({ agentId, data }) {
      const trigger = agents.createTrigger(agentId, data, LOCAL_OWNER_ID);
      changed("agent-trigger", "created", trigger.id);
      changed("agent", "trigger-created", trigger.agentId);
      return trigger;
    },
    agents_triggers_update({ id, data }) {
      const trigger = agents.updateTrigger(id, data, LOCAL_OWNER_ID);
      changed("agent-trigger", "updated", trigger.id);
      changed("agent", "trigger-updated", trigger.agentId);
      return trigger;
    },
    agents_triggers_delete({ id, actorId }) {
      const trigger = agents.getTriggerRequired(id);
      const result = agents.deleteTrigger(id, actorId ?? LOCAL_OWNER_ID);
      changed("agent-trigger", "deleted", result.id);
      changed("agent", "trigger-deleted", trigger.agentId);
      return result;
    },
    agents_triggers_enable({ id, enabled, actorId }) {
      const trigger = agents.enableTrigger(id, enabled, actorId ?? LOCAL_OWNER_ID);
      changed("agent-trigger", enabled ? "enabled" : "disabled", trigger.id);
      changed("agent", "trigger-updated", trigger.agentId);
      return trigger;
    },
    agents_runs_list(input) {
      return agents.listRuns(input);
    },
    agents_runs_get({ id }) {
      return agents.getRunRequired(id);
    },
    agents_runs_queue(input) {
      const { agentId, ...queueInput } = input;
      // Queue durably first; the bounded background service claims it and
      // starts the linked BB thread when an eligible project is available.
      const run = agents.queueRun(
        agentId,
        {
          ...queueInput,
          triggerId: null,
          triggerType: "MANUAL",
          initiatedById: input.initiatedById ?? LOCAL_OWNER_ID,
        },
        LOCAL_OWNER_ID,
      );
      changed("agent-run", "queued", run.id);
      changed("agent", "run-queued", run.agentId);
      return run;
    },
    agents_runs_start({ id, actorId }) {
      const run = agents.startRun(id, actorId ?? LOCAL_OWNER_ID);
      changed("agent-run", "started", run.id);
      changed("agent", "run-updated", run.agentId);
      return run;
    },
    agents_runs_requestApproval({ id, reason, actorId }) {
      const run = agents.requestApproval(id, { reason }, actorId ?? LOCAL_OWNER_ID);
      changed("agent-run", "approval-requested", run.id);
      changed("agent", "run-updated", run.agentId);
      return run;
    },
    agents_runs_approve({ id, approvedById, actorId }) {
      const approver = approvedById ?? actorId ?? LOCAL_OWNER_ID;
      const run = agents.approveRun(id, { approvedById: approver }, actorId ?? LOCAL_OWNER_ID);
      changed("agent-run", "approved", run.id);
      changed("agent", "run-updated", run.agentId);
      return run;
    },
    agents_runs_success({ id, actorId, ...data }) {
      const run = agents.succeedRun(id, data, actorId ?? LOCAL_OWNER_ID);
      changed("agent-run", "succeeded", run.id);
      changed("agent", "run-updated", run.agentId);
      return run;
    },
    agents_runs_fail({ id, actorId, ...data }) {
      const run = agents.failRun(id, data, actorId ?? LOCAL_OWNER_ID);
      changed("agent-run", "failed", run.id);
      changed("agent", "run-updated", run.agentId);
      return run;
    },
    agents_runs_cancel({ id, reason, actorId }) {
      const run = agents.cancelRun(id, reason ?? "Cancelled by user.", actorId ?? LOCAL_OWNER_ID);
      changed("agent-run", run.cancelled ? "cancelled" : "cancel-ignored", run.id);
      changed("agent", "run-updated", run.agentId);
      return run;
    },
    agents_actions_list({ runId, limit, offset }) {
      return agents.listActions(runId, limit, offset);
    },
    agents_actions_get({ id }) {
      return agents.getActionRequired(id);
    },
    agents_audit_list(input) {
      return agents.listAudit(input);
    },
    agents_threads_list({ agentId, ...options }) {
      return agents.listThreads(agentId, options);
    },
    agents_threads_get({ id }) {
      return agents.getThreadRequired(id);
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
        rows: contacts.list(options).map((contact) => contactOutput(contact)),
        total: contacts.count(options),
        facetCounts: contactFacetCounts(),
      };
    },
    contacts_get({ id }) {
      return contactOutput(contacts.getRequired(id), true);
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
    contacts_facts_list(input) {
      return evidenceStore.facts.list(input.contactId, {
        field: input.field,
        statuses: input.statuses,
        includeSuperseded: input.includeSuperseded,
        limit: input.limit,
      });
    },
    contacts_facts_get({ id }) {
      return evidenceStore.facts.getRequired(id);
    },
    contacts_facts_create(input) {
      const fact = evidenceStore.facts.create(input);
      changedContactEvidence("contact-fact", "created", fact.id, fact.contactId);
      return fact;
    },
    contacts_facts_decide({ id, decision, decidedById }) {
      const fact = evidenceStore.facts.decide(
        id,
        decision,
        decidedById ?? LOCAL_OWNER_ID,
      );
      changedContactEvidence("contact-fact", "decided", fact.id, fact.contactId);
      return fact;
    },
    contacts_facts_supersede({ id, replacementId }) {
      const fact = evidenceStore.facts.supersede(id, replacementId);
      changedContactEvidence("contact-fact", "superseded", fact.id, fact.contactId);
      return fact;
    },
    contacts_briefs_current({ contactId }) {
      return evidenceStore.briefs.latest(contactId);
    },
    contacts_briefs_get({ id }) {
      return evidenceStore.briefs.getRequired(id);
    },
    contacts_briefs_getVersion({ contactId, version }) {
      return evidenceStore.briefs.getVersion(contactId, version);
    },
    contacts_briefs_list({ contactId, limit }) {
      return evidenceStore.briefs.list(contactId, limit);
    },
    contacts_briefs_create(input) {
      const brief = evidenceStore.briefs.create(input);
      changedContactEvidence("contact-brief", "created", brief.id, brief.contactId);
      return brief;
    },
    contacts_workHistory_list(input) {
      return evidenceStore.workHistory.list(input.contactId, {
        statuses: input.statuses,
        includeSuperseded: input.includeSuperseded,
        limit: input.limit,
      });
    },
    contacts_workHistory_get({ id }) {
      return evidenceStore.workHistory.getRequired(id);
    },
    contacts_workHistory_create(input) {
      const role = evidenceStore.workHistory.create(input);
      changedContactEvidence("contact-work-history", "created", role.id, role.contactId);
      return role;
    },
    contacts_workHistory_decide({ id, decision, decidedById }) {
      const role = evidenceStore.workHistory.decide(
        id,
        decision,
        decidedById ?? LOCAL_OWNER_ID,
      );
      changedContactEvidence("contact-work-history", "decided", role.id, role.contactId);
      return role;
    },
    contacts_workHistory_supersede({ id, replacementId }) {
      const role = evidenceStore.workHistory.supersede(id, replacementId);
      changedContactEvidence("contact-work-history", "superseded", role.id, role.contactId);
      return role;
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
          ? contactOutput(contacts.getRequired(id), true)
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

  const CRM_ROOT_HELP = [
    "Usage: bb crm <command> [options]",
    "",
    "Commands:",
    "  help                              Show this help",
    "  status [--json]                   Show extension status",
    "  doctor [--json]                   Check SQLite and schema health",
    "  list <company|contact|deal>       List records",
    "  show <company|contact|deal> <id>  Show one record",
    "  create <entity> <json>            Create a record",
    "  update <entity> <id> <json>       Update a record",
    "  archive <entity> <id>             Archive a record",
    "  restore <entity> <id>             Restore a record",
    "  add-activity <json>               Add a note, touchpoint, or task",
    "  tasks [overdue|upcoming|all]      List incomplete tasks",
    "  import <entity> <payload>         Import inline JSON or CSV",
    "  export <entity>                   Export JSON or CSV to stdout",
    "",
    "Use --data <json> instead of a positional JSON payload. Add --json for machine-readable results.",
  ].join("\n");

  const CRM_COMMANDS = [
    { name: "help", summary: "Show CRM command help", usage: "bb crm help [command]" },
    { name: "status", summary: "Show CRM extension status", usage: "bb crm status [--json]" },
    { name: "doctor", summary: "Check CRM SQLite and schema health", usage: "bb crm doctor [--json]" },
    { name: "list", summary: "List companies, contacts, or deals", usage: "bb crm list <company|contact|deal> [options] [--json]" },
    { name: "show", summary: "Show one company, contact, or deal", usage: "bb crm show <company|contact|deal> <id> [--json]" },
    { name: "create", summary: "Create a company, contact, or deal from JSON", usage: "bb crm create <entity> <json> [--json]" },
    { name: "update", summary: "Update one record from validated JSON", usage: "bb crm update <entity> <id> <json> [--json]" },
    { name: "archive", summary: "Archive one company, contact, or deal", usage: "bb crm archive <entity> <id> [--json]" },
    { name: "restore", summary: "Restore one company, contact, or deal", usage: "bb crm restore <entity> <id> [--json]" },
    { name: "add-activity", summary: "Add a note, touchpoint, meeting, or task", usage: "bb crm add-activity <json> [--json]" },
    { name: "tasks", summary: "List incomplete CRM tasks", usage: "bb crm tasks [overdue|upcoming|all] [--limit N] [--json]" },
    { name: "import", summary: "Import inline versioned JSON or CSV records", usage: "bb crm import <entity> <payload> [--format json|csv] [--json]" },
    { name: "export", summary: "Export records as JSON or CSV to stdout", usage: "bb crm export <entity> [--format json|csv] [--json]" },
  ];

  function cliPretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  function cliErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    return "CRM command failed.";
  }

  function cliFailure(argv: readonly string[], error: unknown): PluginCliResult {
    const message = cliErrorMessage(error);
    const exitCode = error instanceof CrmCliUsageError ? error.exitCode : 1;
    const wantsJson = argv.some((token) => token === "--json" || token.startsWith("--json="));
    return {
      exitCode,
      stderr: wantsJson ? JSON.stringify({ error: message }) : `CRM error: ${message}`,
    };
  }

  function cliRecordText(entity: CrmRecordEntity, row: Record<string, unknown>): string {
    if (entity === "company") return `${String(row.id)}\t${String(row.name)}\t${row.domain ?? "-"}`;
    if (entity === "contact") {
      const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
      return `${String(row.id)}\t${name}\t${row.email ?? "-"}`;
    }
    const amount = row.amountCents === null || row.amountCents === undefined
      ? "-"
      : `${String(row.amountCents)} ${String(row.currency)}`;
    return `${String(row.id)}\t${String(row.name)}\t${String(row.stage)}\t${amount}`;
  }

  function cliListText(entity: CrmRecordEntity, result: { rows: readonly Record<string, unknown>[]; total: number }): string {
    const lines = [`Total: ${result.total}`];
    for (const row of result.rows) lines.push(cliRecordText(entity, row));
    return lines.join("\n");
  }

  function cliListQuery(args: ParsedCliArgs): {
    q: string | undefined;
    page: number | undefined;
    pageSize: number | undefined;
    sort: string | undefined;
    dir: string | undefined;
  } {
    return {
      q: aliasedCliOption(args, "q", "search"),
      page: cliInteger(oneCliOption(args, "page"), "page", { min: 1, max: 1_000_000 }),
      pageSize: cliInteger(aliasedCliOption(args, "page-size", "limit"), "page size", { min: 1, max: 100 }),
      sort: oneCliOption(args, "sort"),
      dir: oneCliOption(args, "dir"),
    };
  }

  async function cliList(argv: readonly string[]): Promise<PluginCliResult> {
    const args = parseCliArgs(argv);
    assertCliArgs(args, [
      "q", "search", "page", "page-size", "limit", "sort", "dir",
      "owner", "industry", "enrichment", "source", "company", "title",
      "seniority", "persona", "status", "stage", "closing",
    ], ["json", "archived"]);
    if (args.positionals.length !== 1) {
      throw new CrmCliUsageError("Usage: bb crm list <company|contact|deal> [options] [--json]");
    }
    const entity = recordEntity(args.positionals[0]);
    const query = cliListQuery(args);
    if (entity === "company") {
      const input = parseCliSchema(companyListInputSchema, {
        q: query.q,
        page: query.page,
        pageSize: query.pageSize,
        sort: query.sort,
        dir: query.dir,
        owner: cliOptionValues(args, "owner"),
        industry: cliOptionValues(args, "industry"),
        enrichment: cliOptionValues(args, "enrichment"),
        source: cliOptionValues(args, "source"),
        archived: args.flags.has("archived"),
      }, "List filters");
      const options = companyListOptions(input);
      const result = {
        rows: companies.list(options).map((row) => companyOutput(row)),
        total: companies.count(options),
        facetCounts: facetCounts(),
      };
      return {
        exitCode: 0,
        stdout: args.flags.has("json") ? JSON.stringify(result) : cliListText(entity, result),
      };
    }
    if (entity === "contact") {
      const input = parseCliSchema(contactListInputSchema, {
        q: query.q,
        page: query.page,
        pageSize: query.pageSize,
        sort: query.sort,
        dir: query.dir,
        owner: cliOptionValues(args, "owner"),
        company: cliOptionValues(args, "company"),
        source: cliOptionValues(args, "source"),
        title: cliOptionValues(args, "title"),
        seniority: cliOptionValues(args, "seniority"),
        persona: cliOptionValues(args, "persona"),
        archived: args.flags.has("archived"),
      }, "List filters");
      const options = contactListOptions(input);
      const result = {
        rows: contacts.list(options).map((row) => contactOutput(row)),
        total: contacts.count(options),
        facetCounts: contactFacetCounts(),
      };
      return {
        exitCode: 0,
        stdout: args.flags.has("json") ? JSON.stringify(result) : cliListText(entity, result),
      };
    }
    const input = parseCliSchema(dealListInputSchema, {
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      dir: query.dir,
      status: oneCliOption(args, "status"),
      owner: cliOptionValues(args, "owner"),
      stage: cliOptionValues(args, "stage"),
      closing: cliOptionValues(args, "closing"),
      archived: args.flags.has("archived"),
    }, "List filters");
    const options = dealListOptions(input);
    const { reportingCurrency: configuredCurrency } = await settings.get();
    const reportingCurrency = currencyCodeSchema.parse(configuredCurrency);
    const result = {
      rows: deals.list(options).map((row) => dealOutput(row)),
      total: deals.count(options),
      facetCounts: dealFacetCounts(),
      openValueCents: (db.prepare(`
        SELECT COALESCE(SUM(base_amount_cents), 0) AS value
        FROM deals
        WHERE archived_at IS NULL
          AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
          AND base_currency = @reportingCurrency
      `).get({ reportingCurrency }) as { value: number }).value,
      reportingCurrency,
      unconverted: (() => {
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
          count: missing.reduce((total, item) => total + Number(item.count), 0),
          currencies: missing.map((item) => item.currency),
        };
      })(),
    };
    return {
      exitCode: 0,
      stdout: args.flags.has("json") ? JSON.stringify(result) : cliListText(entity, result),
    };
  }

  function unwrapCliUpdatePayload(payload: Record<string, unknown>, id: string): Record<string, unknown> {
    if (!("data" in payload)) return payload;
    if (!isCliRecord(payload.data)) throw new CrmCliUsageError("Payload.data must be a JSON object.");
    if (payload.id !== undefined && payload.id !== id) {
      throw new CrmCliUsageError("Payload id does not match the positional record id.");
    }
    return payload.data;
  }

  function cliRawPayload(
    args: ParsedCliArgs,
    positionals: readonly string[],
    usage: string,
  ): string {
    const option = oneCliOption(args, "data");
    if (option !== undefined && positionals.length > 0) throw new CrmCliUsageError(`Usage: ${usage}`);
    if (positionals.length > (option === undefined ? 1 : 0)) throw new CrmCliUsageError(`Usage: ${usage}`);
    const raw = option ?? positionals[0];
    if (raw === undefined) throw new CrmCliUsageError(`Usage: ${usage}`);
    return raw;
  }

  async function cliShow(argv: readonly string[]): Promise<PluginCliResult> {
    const args = parseCliArgs(argv);
    assertCliArgs(args, [], ["json"]);
    const [entityValue, id] = requiredCliPositionals(args, 2, "bb crm show <company|contact|deal> <id> [--json]");
    const entity = recordEntity(entityValue);
    const record = entity === "company"
      ? companyOutput(companies.getRequired(id), true)
      : entity === "contact"
        ? contactOutput(contacts.getRequired(id), true)
        : dealOutput(deals.getRequired(id));
    return { exitCode: 0, stdout: args.flags.has("json") ? JSON.stringify(record) : cliPretty(record) };
  }

  async function cliCreate(argv: readonly string[]): Promise<PluginCliResult> {
    const args = parseCliArgs(argv);
    assertCliArgs(args, ["data"], ["json"]);
    if (args.positionals.length < 1 || args.positionals.length > 2) {
      throw new CrmCliUsageError("Usage: bb crm create <company|contact|deal> <json> [--json]");
    }
    const entity = recordEntity(args.positionals[0]);
    const payload = cliPayload(args, args.positionals.slice(1), "bb crm create <company|contact|deal> <json> [--json]");
    let record: CompanyOutput | ContactOutput | DealOutput;
    if (entity === "company") {
      const input = parseCliSchema(companyCreateInputSchema, payload, "Company payload");
      const stored = companies.create(input);
      changed("company", "created", stored.id);
      record = companyOutput(stored, true);
    } else if (entity === "contact") {
      const input = parseCliSchema(contactCreateInputSchema, payload, "Contact payload");
      const stored = contacts.create(input);
      changed("contact", "created", stored.id);
      record = contactOutput(stored);
    } else {
      const input = parseCliSchema(dealCreateInputSchema, payload, "Deal payload");
      const configured = currencyCodeSchema.parse((await settings.get()).reportingCurrency);
      const sourceCurrency = input.currency ?? configured;
      const conversion = input.amountCents == null
        ? null
        : currency.convert(input.amountCents, sourceCurrency, configured);
      const stored = deals.create({
        ...input,
        currency: sourceCurrency,
        baseAmountCents: conversion?.baseAmountCents ?? null,
        baseCurrency: conversion?.baseCurrency ?? null,
        fxRate: conversion?.fxRate ?? null,
        fxRateAt: conversion?.fxRateAt ?? null,
      });
      changed("deal", "created", stored.id);
      record = dealOutput(stored);
    }
    return { exitCode: 0, stdout: args.flags.has("json") ? JSON.stringify(record) : cliPretty(record) };
  }

  function cliUpdate(argv: readonly string[]): Promise<PluginCliResult> {
    return (async () => {
      const args = parseCliArgs(argv);
      assertCliArgs(args, ["data"], ["json"]);
      if (args.positionals.length < 2 || args.positionals.length > 3) {
        throw new CrmCliUsageError("Usage: bb crm update <company|contact|deal> <id> <json> [--json]");
      }
      const entity = recordEntity(args.positionals[0]);
      const id = args.positionals[1]!;
      const payload = unwrapCliUpdatePayload(
        cliPayload(args, args.positionals.slice(2), "bb crm update <company|contact|deal> <id> <json> [--json]"),
        id,
      );
      let record: CompanyOutput | ContactOutput | DealOutput;
      if (entity === "company") {
        const input = parseCliSchema(companyUpdateDataSchema, payload, "Company update payload");
        const { fields, ...data } = input;
        const stored = db.transaction(() => {
          const updated = companies.update(id, data);
          if (fields) writeRecordFieldValues("COMPANY", id, fields);
          return updated;
        })();
        changed("company", "updated", stored.id);
        record = companyOutput(stored, true);
      } else if (entity === "contact") {
        const input = parseCliSchema(contactUpdateDataSchema, payload, "Contact update payload");
        const { fields, ...data } = input;
        const stored = db.transaction(() => {
          const updated = contacts.update(id, data);
          if (fields) writeRecordFieldValues("CONTACT", id, fields);
          return updated;
        })();
        changed("contact", "updated", stored.id);
        record = contactOutput(stored, true);
      } else {
        const input = parseCliSchema(dealUpdateDataSchema, payload, "Deal update payload");
        const { fields, ...data } = input;
        const stored = db.transaction(() => {
          const updated = deals.update(id, data);
          if (fields) writeRecordFieldValues("DEAL", id, fields);
          return updated;
        })();
        changed("deal", "updated", stored.id);
        record = dealOutput(stored);
      }
      return { exitCode: 0, stdout: args.flags.has("json") ? JSON.stringify(record) : cliPretty(record) };
    })();
  }

  function cliArchiveRestore(argv: readonly string[], action: "archive" | "restore"): PluginCliResult {
    const args = parseCliArgs(argv);
    assertCliArgs(args, [], ["json"]);
    const [entityValue, id] = requiredCliPositionals(args, 2, `bb crm ${action} <company|contact|deal> <id> [--json]`);
    const entity = recordEntity(entityValue);
    let record: CompanyOutput | ContactOutput | DealOutput;
    if (entity === "company") {
      const stored = action === "archive" ? companies.archive(id) : companies.restore(id);
      changed("company", action === "archive" ? "archived" : "restored", stored.id);
      record = companyOutput(stored, true);
    } else if (entity === "contact") {
      const stored = action === "archive" ? contacts.archive(id) : contacts.restore(id);
      changed("contact", action === "archive" ? "archived" : "restored", stored.id);
      record = contactOutput(stored, true);
    } else {
      const stored = action === "archive" ? deals.archive(id) : deals.restore(id);
      changed("deal", action === "archive" ? "archived" : "restored", stored.id);
      record = dealOutput(stored);
    }
    return { exitCode: 0, stdout: args.flags.has("json") ? JSON.stringify(record) : cliPretty(record) };
  }

  function cliActivity(argv: readonly string[]): PluginCliResult {
    const args = parseCliArgs(argv);
    assertCliArgs(args, ["data"], ["json"]);
    let linkEntity: CrmRecordEntity | undefined;
    let linkId: string | undefined;
    let raw: string;
    if (args.options.has("data")) {
      if (args.positionals.length !== 0 && args.positionals.length !== 2) {
        throw new CrmCliUsageError("Usage: bb crm add-activity <json> [--json]");
      }
      if (args.positionals.length === 2) {
        linkEntity = recordEntity(args.positionals[0]);
        linkId = args.positionals[1];
      }
      raw = cliRawPayload(args, [], "bb crm add-activity <json> [--json]");
    } else if (args.positionals.length === 1) {
      raw = args.positionals[0]!;
    } else if (args.positionals.length === 3) {
      linkEntity = recordEntity(args.positionals[0]);
      linkId = args.positionals[1];
      raw = args.positionals[2]!;
    } else {
      throw new CrmCliUsageError("Usage: bb crm add-activity <json> [--json]");
    }
    const payload = parseCliJsonObject(raw, "Activity payload");
    if (linkEntity && linkId) {
      const key = `${linkEntity}Id`;
      if (payload[key] !== undefined && payload[key] !== linkId) {
        throw new CrmCliUsageError(`Activity payload ${key} does not match the positional record id.`);
      }
      payload[key] = linkId;
    }
    const input = parseCliSchema(activityCreateInputSchema, {
      ...payload,
      // CLI writes are installation-owned; callers cannot impersonate another user.
      createdById: LOCAL_OWNER_ID,
    }, "Activity payload");
    const stored = activities.create(input, LOCAL_OWNER_ID);
    stampActivity(stored);
    changed("activity", "created", stored.id);
    const record = activityOutput(stored);
    return { exitCode: 0, stdout: args.flags.has("json") ? JSON.stringify(record) : cliPretty(record) };
  }

  function cliTasks(argv: readonly string[]): PluginCliResult {
    const args = parseCliArgs(argv);
    assertCliArgs(args, ["window", "limit"], ["json"]);
    if (args.positionals.length > 2 || (args.positionals.length === 2 && args.positionals[0] !== "list") ||
      (args.positionals.length === 1 && args.positionals[0] !== "list" &&
        args.positionals[0] !== "overdue" && args.positionals[0] !== "upcoming" && args.positionals[0] !== "all")) {
      throw new CrmCliUsageError("Usage: bb crm tasks [overdue|upcoming|all] [--limit N] [--json]");
    }
    const positionalWindow = args.positionals[0] === "list"
      ? args.positionals[1]
      : args.positionals[0];
    const optionWindow = oneCliOption(args, "window");
    if (positionalWindow !== undefined && optionWindow !== undefined) {
      throw new CrmCliUsageError("Use either a task window positional or --window.");
    }
    const window = optionWindow ?? positionalWindow ?? "all";
    if (window !== "overdue" && window !== "upcoming" && window !== "all") {
      throw new CrmCliUsageError("Task window must be overdue, upcoming, or all.");
    }
    const limit = cliInteger(oneCliOption(args, "limit"), "limit", { min: 1, max: 100 }) ?? 25;
    const records = activities.myTasks({ actorId: LOCAL_OWNER_ID, window, limit }).map(activityOutput);
    if (args.flags.has("json")) return { exitCode: 0, stdout: JSON.stringify(records) };
    const lines = [`Tasks: ${records.length}`];
    for (const record of records) lines.push(`${record.id}\t${record.dueAt ?? "-"}\t${record.subject ?? "(untitled)"}`);
    return { exitCode: 0, stdout: lines.join("\n") };
  }

  function cliDoctor(argv: readonly string[]): PluginCliResult {
    const args = parseCliArgs(argv);
    assertCliArgs(args, [], ["json"]);
    if (args.positionals.length !== 0) throw new CrmCliUsageError("Usage: bb crm doctor [--json]");
    const metadata = db.prepare("SELECT value FROM crm_metadata WHERE key = 'schema_version'").get() as { value?: unknown } | undefined;
    const actualSchema = typeof metadata?.value === "string" ? Number(metadata.value) : null;
    const integrityRow = db.prepare("PRAGMA integrity_check").get() as Record<string, unknown> | undefined;
    const integrity = String(integrityRow?.integrity_check ?? "unknown");
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all() as unknown[];
    const records = {
      companies: Number((db.prepare("SELECT COUNT(*) AS count FROM companies").get() as { count: number }).count),
      contacts: Number((db.prepare("SELECT COUNT(*) AS count FROM contacts").get() as { count: number }).count),
      deals: Number((db.prepare("SELECT COUNT(*) AS count FROM deals").get() as { count: number }).count),
      activities: Number((db.prepare("SELECT COUNT(*) AS count FROM activities").get() as { count: number }).count),
    };
    const integrations = {
      connections: {
        total: Number((db.prepare("SELECT COUNT(*) AS count FROM connections").get() as { count: number }).count),
        enabled: Number((db.prepare("SELECT COUNT(*) AS count FROM connections WHERE enabled = 1").get() as { count: number }).count),
        connected: Number((db.prepare("SELECT COUNT(*) AS count FROM connection_health WHERE status = 'CONNECTED'").get() as { count: number }).count),
        errors: Number((db.prepare("SELECT COUNT(*) AS count FROM connection_health WHERE status = 'ERROR'").get() as { count: number }).count),
      },
      tracking: {
        sites: Number((db.prepare("SELECT COUNT(*) AS count FROM tracking_sites").get() as { count: number }).count),
        activeSites: Number((db.prepare("SELECT COUNT(*) AS count FROM tracking_sites WHERE status = 'ACTIVE'").get() as { count: number }).count),
        verifiedSites: Number((db.prepare("SELECT COUNT(*) AS count FROM tracking_sites WHERE verification_status = 'VERIFIED'").get() as { count: number }).count),
        activeTokens: Number((db.prepare("SELECT COUNT(*) AS count FROM tracking_tokens WHERE revoked_at IS NULL").get() as { count: number }).count),
        events: Number((db.prepare("SELECT COUNT(*) AS count FROM tracking_events").get() as { count: number }).count),
        aggregates: Number((db.prepare("SELECT COUNT(*) AS count FROM tracking_daily_aggregates").get() as { count: number }).count),
      },
    };
    const report = {
      ok: actualSchema === CRM_SCHEMA_VERSION && integrity === "ok" && foreignKeys.length === 0,
      version: CRM_PLUGIN_VERSION,
      schemaVersion: { expected: CRM_SCHEMA_VERSION, actual: actualSchema },
      sqlite: { integrity, foreignKeyViolations: foreignKeys.length },
      records,
      integrations,
    };
    if (args.flags.has("json")) {
      return { exitCode: report.ok ? 0 : 1, stdout: JSON.stringify(report) };
    }
    return {
      exitCode: report.ok ? 0 : 1,
      stdout: [
        `CRM doctor: ${report.ok ? "OK" : "FAILED"}`,
        `Schema: ${String(report.schemaVersion.actual ?? "missing")}/${CRM_SCHEMA_VERSION}`,
        `SQLite integrity: ${report.sqlite.integrity}`,
        `Foreign keys: ${report.sqlite.foreignKeyViolations} violations`,
        `Records: companies=${records.companies} contacts=${records.contacts} deals=${records.deals} activities=${records.activities}`,
        `Integrations: connections=${integrations.connections.total} enabled=${integrations.connections.enabled} trackingSites=${integrations.tracking.sites} events=${integrations.tracking.events}`,
      ].join("\n"),
    };
  }

  function exportRows(entity: CrmRecordEntity, args: ParsedCliArgs): Record<string, unknown>[] {
    const search = aliasedCliOption(args, "q", "search");
    const limit = cliInteger(oneCliOption(args, "limit"), "limit", { min: 1, max: 1_000 }) ?? 1_000;
    if (args.flags.has("all") && args.flags.has("archived")) {
      throw new CrmCliUsageError("Use either --all or --archived, not both.");
    }
    const listOptions = {
      search,
      limit,
      offset: 0,
      archivedOnly: args.flags.has("archived"),
      includeArchived: args.flags.has("all"),
    };
    if (entity === "company") {
      return companies.list({ ...listOptions, sortBy: "name", sortDirection: "asc" }).map((row) => exportRecord(entity, row as unknown as Record<string, unknown>));
    }
    if (entity === "contact") {
      return contacts.list({ ...listOptions, sortBy: "name", sortDirection: "asc" }).map((row) => exportRecord(entity, row as unknown as Record<string, unknown>));
    }
    return deals.list({ ...listOptions, sortBy: "createdAt", sortDirection: "desc" }).map((row) => exportRecord(entity, row as unknown as Record<string, unknown>));
  }

  function cliExport(argv: readonly string[]): PluginCliResult {
    const args = parseCliArgs(argv);
    assertCliArgs(args, ["format", "q", "search", "limit"], ["json", "archived", "all"]);
    if (args.positionals.length !== 1) throw new CrmCliUsageError("Usage: bb crm export <company|contact|deal> [--format json|csv]");
    const entity = recordEntity(args.positionals[0]);
    const format = cliFormat(oneCliOption(args, "format"));
    const records = exportRows(entity, args);
    if (format === "csv") return { exitCode: 0, stdout: serializeCsv(entity, records) };
    return {
      exitCode: 0,
      stdout: JSON.stringify({ version: 1, entity, records }),
    };
  }

  function importRecords(entity: CrmRecordEntity, value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.map((row) => {
      if (!isCliRecord(row)) throw new CrmCliUsageError("Each import record must be a JSON object.");
      return row;
    });
    if (!isCliRecord(value)) throw new CrmCliUsageError("Import JSON must be an array or a versioned object.");
    if (value.version !== 1) throw new CrmCliUsageError("Import JSON version must be 1.");
    if (value.entity !== undefined && value.entity !== entity) {
      throw new CrmCliUsageError("Import entity does not match the command entity.");
    }
    if (!Array.isArray(value.records)) throw new CrmCliUsageError("Import JSON records must be an array.");
    return value.records.map((row) => {
      if (!isCliRecord(row)) throw new CrmCliUsageError("Each import record must be a JSON object.");
      return row;
    });
  }

  function importInput(entity: CrmRecordEntity, row: Record<string, unknown>, rowNumber: number): {
    id?: string;
    data: Record<string, unknown>;
  } {
    const allowed = new Set(CRM_EXPORT_COLUMNS[entity]);
    for (const key of Object.keys(row)) {
      if (!allowed.has(key)) throw new CrmCliUsageError(`Import row ${rowNumber} has unsupported field: ${key}.`);
    }
    let id: string | undefined;
    if (row.id !== null && row.id !== undefined) id = parseCliSchema(idSchema, row.id, `Import row ${rowNumber} id`);
    if (entity === "company") {
      const input = parseCliSchema(companyCreateInputSchema, {
        name: row.name,
        domain: row.domain === null ? undefined : row.domain,
        ownerId: row.ownerId === null ? null : row.ownerId,
      }, `Import row ${rowNumber}`);
      return { id, data: { ...input, source: "IMPORT" } };
    }
    if (entity === "contact") {
      const input = parseCliSchema(contactCreateInputSchema, {
        firstName: row.firstName,
        lastName: row.lastName === null ? undefined : row.lastName,
        email: row.email === null ? undefined : row.email,
        phone: row.phone === null ? undefined : row.phone,
        title: row.title === null ? undefined : row.title,
        companyId: row.companyId === null ? null : row.companyId,
        ownerId: row.ownerId === null ? null : row.ownerId,
      }, `Import row ${rowNumber}`);
      return { id, data: { ...input, source: "IMPORT" } };
    }
    const amountCents = csvOrJsonValue(row.amountCents, "amountCents");
    const input = parseCliSchema(dealCreateInputSchema, {
      name: row.name,
      companyId: row.companyId,
      ownerId: row.ownerId,
      stage: row.stage === null ? undefined : row.stage,
      amountCents,
      currency: row.currency === null ? undefined : row.currency,
      expectedCloseDate: row.expectedCloseDate === null ? undefined : row.expectedCloseDate,
    }, `Import row ${rowNumber}`);
    return { id, data: input };
  }

  async function cliImport(argv: readonly string[]): Promise<PluginCliResult> {
    const args = parseCliArgs(argv);
    assertCliArgs(args, ["data", "format"], ["json"]);
    if (args.positionals.length < 1 || args.positionals.length > 2) {
      throw new CrmCliUsageError("Usage: bb crm import <company|contact|deal> <payload> [--format json|csv] [--json]");
    }
    const entity = recordEntity(args.positionals[0]);
    const raw = cliRawPayload(args, args.positionals.slice(1), "bb crm import <company|contact|deal> <payload> [--format json|csv] [--json]");
    const explicitFormat = oneCliOption(args, "format");
    const format = explicitFormat === undefined
      ? (/^[\s]*[\[{]/u.test(raw) ? "json" : "csv")
      : cliFormat(explicitFormat);
    const records = format === "json"
      ? importRecords(entity, parseCliJson(raw, "Import payload"))
      : parseCsvRecords(entity, raw);
    const configured = currencyCodeSchema.parse((await settings.get()).reportingCurrency);
    const created: Array<{ id: string; record: CrmRecordEntity }> = [];
    db.transaction(() => {
      records.forEach((row, index) => {
        const rowNumber = index + 1;
        try {
          const input = importInput(entity, row, rowNumber);
          if (entity === "company") {
            const stored = companies.create({ ...input.data, ...(input.id ? { id: input.id } : {}) } as Parameters<typeof companies.create>[0]);
            created.push({ id: stored.id, record: entity });
          } else if (entity === "contact") {
            const stored = contacts.create({ ...input.data, ...(input.id ? { id: input.id } : {}) } as Parameters<typeof contacts.create>[0]);
            created.push({ id: stored.id, record: entity });
          } else {
            const data = input.data as unknown as z.infer<typeof dealCreateInputSchema>;
            const sourceCurrency = data.currency ?? configured;
            const conversion = data.amountCents == null
              ? null
              : currency.convert(data.amountCents, sourceCurrency, configured);
            const stored = deals.create({
              ...data,
              ...(input.id ? { id: input.id } : {}),
              currency: sourceCurrency,
              baseAmountCents: conversion?.baseAmountCents ?? null,
              baseCurrency: conversion?.baseCurrency ?? null,
              fxRate: conversion?.fxRate ?? null,
              fxRateAt: conversion?.fxRateAt ?? null,
            });
            created.push({ id: stored.id, record: entity });
          }
        } catch (error) {
          throw new CrmCliUsageError(`Import row ${rowNumber} failed: ${cliErrorMessage(error)}`);
        }
      });
    })();
    for (const item of created) changed(item.record, "created", item.id);
    const summary = { entity, imported: created.length, ids: created.map((item) => item.id) };
    return {
      exitCode: 0,
      stdout: args.flags.has("json") ? JSON.stringify(summary) : `Imported ${created.length} ${entity}${created.length === 1 ? "" : "s"}.`,
    };
  }

  bb.cli.register({
    name: "crm",
    summary: "Manage CRM records, activities, agents, and integrations",
    commands: CRM_COMMANDS,
    async run(argv, _ctx: PluginCliContext): Promise<PluginCliResult> {
      const command = argv[0] ?? "status";
      if (!["help", "status", "doctor", "list", "show", "create", "update", "archive", "restore", "add-activity", "tasks", "import", "export"].includes(command)) {
        const message = `Unknown CRM command: ${command}`;
        const wantsJson = argv.some((token) => token === "--json" || token.startsWith("--json="));
        return {
          exitCode: 2,
          stderr: wantsJson
            ? JSON.stringify({ error: message })
            : `${message}\nRun: bb crm status`,
        };
      }
      try {
        if (command === "help") {
          const args = parseCliArgs(argv.slice(1));
          assertCliArgs(args, [], ["json"]);
          if (args.positionals.length > 1) throw new CrmCliUsageError("Usage: bb crm help [command]");
          const topic = args.positionals[0];
          if (!topic) return { exitCode: 0, stdout: args.flags.has("json") ? JSON.stringify(CRM_COMMANDS) : CRM_ROOT_HELP };
          const item = CRM_COMMANDS.find((entry) => entry.name === topic);
          if (!item) throw new CrmCliUsageError(`Unknown CRM command: ${topic}`);
          return { exitCode: 0, stdout: args.flags.has("json") ? JSON.stringify(item) : `${item.summary}\nUsage: ${item.usage}` };
        }
        if (command === "status") {
          const args = parseCliArgs(argv.slice(1));
          assertCliArgs(args, [], ["json"]);
          if (args.positionals.length !== 0) throw new CrmCliUsageError("Usage: bb crm status [--json]");
          const { workspaceName, reportingCurrency } = await settings.get();
          const status = {
            version: CRM_PLUGIN_VERSION,
            schemaVersion: CRM_SCHEMA_VERSION,
            workspaceName,
            reportingCurrency,
          };
          return {
            exitCode: 0,
            stdout: args.flags.has("json")
              ? JSON.stringify(status)
              : [
                  `CRM ${CRM_PLUGIN_VERSION}`,
                  `Workspace: ${workspaceName}`,
                  `Reporting currency: ${reportingCurrency}`,
                  `Schema: ${CRM_SCHEMA_VERSION}`,
                ].join("\n"),
          };
        }
        if (command === "doctor") return cliDoctor(argv.slice(1));
        if (command === "list") return await cliList(argv.slice(1));
        if (command === "show") return await cliShow(argv.slice(1));
        if (command === "create") return await cliCreate(argv.slice(1));
        if (command === "update") return await cliUpdate(argv.slice(1));
        if (command === "archive" || command === "restore") return cliArchiveRestore(argv.slice(1), command);
        if (command === "add-activity") return cliActivity(argv.slice(1));
        if (command === "tasks") return cliTasks(argv.slice(1));
        if (command === "import") return await cliImport(argv.slice(1));
        return cliExport(argv.slice(1));
      } catch (error) {
        return cliFailure(argv, error);
      }
    },
  });

  bb.log.info(`CRM ${CRM_PLUGIN_VERSION} loaded`);
}
