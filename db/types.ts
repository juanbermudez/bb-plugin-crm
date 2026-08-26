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
  limit?: number;
  offset?: number;
}

export class RecordNotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;

  constructor(readonly recordType: string, readonly id: string) {
    super(`No ${recordType} with id ${id}.`);
    this.name = "RecordNotFoundError";
  }
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
