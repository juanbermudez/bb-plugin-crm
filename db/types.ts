import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type Db = Database.Database;

export const DEAL_STAGES = [
  "DEMO_BOOKED",
  "QUALIFIED_TO_BUY",
  "UNQUALIFIED_TO_BUY",
  "DECISION_MAKER_BOUGHT_IN",
  "CONTRACT_SENT",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const RECORD_SOURCES = [
  "MANUAL",
  "IMPORT",
  "EMAIL",
  "CALENDAR",
  "TRACKING",
] as const;

export type RecordSource = (typeof RECORD_SOURCES)[number];

/** Recency windows used by the source list facets. */
export const ACTIVITY_WINDOWS = ["7", "30", "90"] as const;

export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number];

export const ENRICHMENT_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETE",
  "FAILED",
  "SKIPPED",
] as const;

export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "NOTE",
  "CALL",
  "EMAIL",
  "MEETING",
  "TASK",
  "STAGE_CHANGE",
  "ENRICHMENT",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const FIELD_ENTITIES = ["COMPANY", "CONTACT", "DEAL"] as const;

export type FieldEntity = (typeof FIELD_ENTITIES)[number];

export const FIELD_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "DATE",
  "CHECKBOX",
  "SELECT",
  "URL",
  "EMAIL",
  "PHONE",
  "USER",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface ListOptions {
  /** Include both active and archived rows. Defaults to active rows only. */
  includeArchived?: boolean;
  /** Return only archived rows. Takes precedence over includeArchived. */
  archivedOnly?: boolean;
  search?: string;
  /** Keep records with activity in at least one of these recent windows. */
  activity?: readonly ActivityWindow[];
  /** Optional pre-filtered record IDs, including an empty set for no matches. */
  recordIds?: readonly string[];
  limit?: number;
  offset?: number;
}

const ACTIVITY_WINDOW_DAYS = new Set<string>(ACTIVITY_WINDOWS);

/**
 * Add the source-compatible recency predicate to a list query.
 * Selecting more than one window uses the widest selected window, matching
 * the upstream `activityFilter` behavior (`7` + `30` means the last 30 days).
 */
export function activityFilterClause(
  values: readonly string[] | undefined,
  column: string,
  params: Record<string, string | number>,
  parameter = "activityCutoff",
): string | null {
  if (!values || values.length === 0) return null;
  let days = 0;
  for (const value of values) {
    if (!ACTIVITY_WINDOW_DAYS.has(value)) {
      throw new Error(`Invalid activity window: ${value}.`);
    }
    days = Math.max(days, Number(value));
  }
  params[parameter] = new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString();
  return `${column} >= @${parameter}`;
}

export class RecordNotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;

  constructor(readonly recordType: string, readonly id: string) {
    super(`No ${recordType} with id ${id}.`);
    this.name = "RecordNotFoundError";
  }
}

export class RecordConflictError extends Error {
  readonly code = "CONFLICT" as const;

  constructor(
    readonly recordType: string,
    readonly field: string,
    readonly value: string,
    message: string,
  ) {
    super(message);
    this.name = "RecordConflictError";
  }
}

/** Return true only for a unique constraint on the requested SQLite column. */
export function isSqliteUniqueConstraint(
  error: unknown,
  table: string,
  column: string,
): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== "SQLITE_CONSTRAINT_UNIQUE" && typeof candidate.message !== "string") {
    return false;
  }
  return typeof candidate.message === "string" &&
    candidate.message.toLowerCase().includes(`${table}.${column}`.toLowerCase());
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newRecordId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function nullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = nullableText(value);
  return normalized?.toLowerCase() ?? null;
}

export function normalizeDomain(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname;
  } catch {
    return null;
  }
  const bare = hostname.replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "yandex.ru",
  "qq.com",
  "163.com",
]);

const MACHINE_EMAIL_DOMAINS = new Set([
  "calendar.google.com",
  "googlegroups.com",
  "docs.google.com",
  "drive.google.com",
  "appspotmail.com",
  "amazonses.com",
  "sendgrid.net",
  "zoomcrc.com",
]);

const MACHINE_EMAIL_SUFFIXES = [
  ".calendar.google.com",
  ".bounces.google.com",
  ".appspotmail.com",
  ".amazonses.com",
  ".sendgrid.net",
  ".invalid",
  ".local",
  ".localhost",
];

export function isMachineDomain(value: string | null | undefined): boolean {
  const domain = normalizeDomain(value);
  return domain !== null && (
    MACHINE_EMAIL_DOMAINS.has(domain) ||
    MACHINE_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix))
  );
}

/** Resolve a work domain suitable for automatic company association. */
export function domainFromEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized?.lastIndexOf("@") ?? -1;
  if (at < 1) return null;
  const domain = normalizeDomain(normalized?.slice(at + 1));
  if (!domain || FREE_EMAIL_DOMAINS.has(domain) || isMachineDomain(domain)) return null;
  return domain;
}

export function normalizeCurrency(value: string | null | undefined): string {
  const normalized = (value ?? "USD").trim().toUpperCase();
  if (!normalized) throw new Error("Currency is required.");
  return normalized;
}

export function normalizeLimit(value: number | undefined, fallback = 100): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000) {
    throw new Error("limit must be an integer between 0 and 1000.");
  }
  return value;
}

export function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("offset must be a non-negative integer.");
  }
  return value;
}

export function isClosedStage(stage: DealStage): boolean {
  return stage === "CLOSED_WON" || stage === "CLOSED_LOST";
}
