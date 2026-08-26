import { createHash, randomBytes } from "node:crypto";
import {
  newRecordId,
  nowIso,
  requiredText,
  RecordNotFoundError,
  type Db,
} from "./types.js";

/** Providers supported by the Phase 7 persistence foundation. */
export const CONNECTION_PROVIDERS = ["GOOGLE", "MICROSOFT", "SLACK"] as const;
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

export const CONNECTION_STATUSES = [
  "DISCONNECTED",
  "CONNECTING",
  "CONNECTED",
  "DEGRADED",
  "ERROR",
  "DISABLED",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const TOKEN_SCOPES = ["INTAKE", "TRACKING"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const TRACKING_EVENT_TYPES = [
  "PAGE_VIEW",
  "FORM_SUBMIT",
  "IDENTIFY",
  "CUSTOM",
] as const;
export type TrackingEventType = (typeof TRACKING_EVENT_TYPES)[number];

export const TRACKING_SITE_STATUSES = ["ACTIVE", "PAUSED"] as const;
export type TrackingSiteStatus = (typeof TRACKING_SITE_STATUSES)[number];

export const TRACKING_VERIFICATION_STATUSES = ["PENDING", "VERIFIED"] as const;
export type TrackingVerificationStatus = (typeof TRACKING_VERIFICATION_STATUSES)[number];

export const TRACKING_LIMITS = {
  maxBatchSize: 100,
  maxEventBytes: 16_384,
  maxPathLength: 2_048,
  maxPropertyCount: 32,
  maxPropertyKeyLength: 64,
  maxPropertyValueLength: 256,
  maxPropertiesBytes: 8_192,
  maxSourceLength: 128,
  maxTokenLength: 512,
} as const;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export interface ConnectionHealth {
  status: ConnectionStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  consecutiveFailures: number;
  updatedAt: string;
}

export interface Connection {
  id: string;
  provider: ConnectionProvider;
  externalAccountId: string | null;
  displayName: string | null;
  /** Non-secret provider metadata only. OAuth credentials never belong here. */
  configuration: JsonObject;
  scopes: string[];
  enabled: boolean;
  health: ConnectionHealth;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionUpsertInput {
  id?: string;
  provider: ConnectionProvider | string;
  externalAccountId?: string | null;
  displayName?: string | null;
  configuration?: Record<string, unknown> | null;
  scopes?: readonly string[];
  enabled?: boolean;
  status?: ConnectionStatus | string;
  checkedAt?: string | Date | null;
}

export interface ConnectionStatusInput {
  status: ConnectionStatus | string;
  checkedAt?: string | Date | null;
}

export interface SyncCursor {
  id: string;
  connectionId: string;
  stream: string;
  cursor: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncSuccessInput {
  stream: string;
  /** Omit to preserve the previous cursor; pass null to clear it. */
  cursor?: string | null;
  at?: string | Date | null;
}

export interface SyncFailureInput {
  stream: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  at?: string | Date | null;
}

export interface TrackingRetention {
  siteId: string;
  eventRetentionDays: number;
  aggregateRetentionDays: number;
  lastRollupAt: string | null;
  lastPrunedAt: string | null;
  updatedAt: string;
}

export interface TrackingSite {
  id: string;
  /** Public identifier used by the tracker. It can be rotated independently of the row id. */
  siteKey: string;
  name: string;
  allowedDomains: string[];
  status: TrackingSiteStatus;
  verificationStatus: TrackingVerificationStatus;
  verifiedAt: string | null;
  pausedAt: string | null;
  rotatedAt: string | null;
  retention: TrackingRetention;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingSiteCreateInput {
  id?: string;
  siteKey?: string;
  name: string;
  allowedDomains?: readonly string[];
  /** Alias accepted by callers that use the shorter settings field name. */
  domains?: readonly string[];
  eventRetentionDays?: number;
  aggregateRetentionDays?: number;
}

export interface TrackingSiteVerifyInput {
  domain?: string;
  verifiedAt?: string | Date | null;
}

export interface TrackingSiteListOptions {
  status?: TrackingSiteStatus | string;
  verificationStatus?: TrackingVerificationStatus | string;
  limit?: number;
  offset?: number;
}

export interface TrackingToken {
  id: string;
  siteId: string | null;
  scope: TokenScope;
  /** A hash-derived hint; the raw token is intentionally never persisted. */
  tokenHint: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ProvisionedTrackingToken extends TrackingToken {
  /** One-time secret. This value is not returned by get/list APIs and is not stored. */
  token: string;
  /** Alias for integrations that call the one-time value a secret. */
  secret: string;
}

export interface ProvisionedTrackingSite extends TrackingSite {
  site: TrackingSite;
  token: string;
  secret: string;
  tokenId: string;
}

export interface TrackingEventInput {
  id?: string;
  siteId?: string;
  siteKey?: string;
  token: string;
  eventType?: TrackingEventType | string;
  /** Alias used by browser collectors. */
  type?: TrackingEventType | string;
  origin: string;
  /** A path or an absolute URL. Query strings and fragments are rejected. */
  path?: string;
  pageUrl?: string;
  url?: string;
  referrer?: string | null;
  referrerUrl?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  source?: string | null;
  properties?: Record<string, unknown> | null;
  eventKey?: string | null;
  occurredAt?: string | Date | null;
  /** Useful for deterministic maintenance tests; collector callers can omit it. */
  receivedAt?: string | Date | null;
}

export interface SanitizedTrackingEvent {
  id: string;
  eventType: TrackingEventType;
  /** Alias retained in the normalized result for browser-shaped callers. */
  type: TrackingEventType;
  occurredAt: string;
  origin: string;
  path: string;
  referrerPath: string | null;
  visitorHash: string | null;
  sessionHash: string | null;
  source: string | null;
  properties: JsonObject;
  eventKey: string | null;
  receivedAt: string;
}

export interface TrackingEvent extends Omit<SanitizedTrackingEvent, "receivedAt"> {
  siteId: string;
  tokenId: string;
  receivedAt: string;
  createdAt: string;
}

export interface TrackingEventListOptions {
  siteId?: string;
  eventType?: TrackingEventType | string;
  from?: string | Date;
  to?: string | Date;
  limit?: number;
  offset?: number;
}

export interface TrackingAggregate {
  siteId: string;
  day: string;
  eventType: TrackingEventType;
  path: string;
  source: string | null;
  eventCount: number;
  uniqueVisitors: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  rolledUpAt: string;
}

export interface TrackingAggregateListOptions {
  siteId?: string;
  eventType?: TrackingEventType | string;
  path?: string;
  source?: string | null;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface TrackingRollupOptions {
  siteId?: string;
  before?: string | Date;
  now?: string | Date;
}

export interface TrackingRollupResult {
  aggregateCount: number;
  eventCount: number;
}

export interface TrackingRetentionInput {
  eventRetentionDays?: number;
  aggregateRetentionDays?: number;
}

export interface TrackingPruneOptions extends TrackingRetentionInput {
  siteId?: string;
  now?: string | Date;
  /** Maximum number of event rows removed in one bounded call. */
  batchSize?: number;
}

export interface TrackingPruneResult {
  eventsDeleted: number;
  aggregatesDeleted: number;
  sitesProcessed: number;
}

interface RawConnection extends Record<string, unknown> {
  id: string;
  provider: string;
  externalAccountId: string | null;
  displayName: string | null;
  configuration: string;
  scopes: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
  status: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  consecutiveFailures: number;
  healthUpdatedAt: string;
}

interface RawSyncCursor extends Record<string, unknown> {
  id: string;
  connectionId: string;
  stream: string;
  cursor: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawSite extends Record<string, unknown> {
  id: string;
  siteKey: string;
  name: string;
  allowedDomains: string;
  status: string;
  verificationStatus: string;
  verifiedAt: string | null;
  pausedAt: string | null;
  rotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  eventRetentionDays: number;
  aggregateRetentionDays: number;
  lastRollupAt: string | null;
  lastPrunedAt: string | null;
  retentionUpdatedAt: string;
}

interface RawToken extends Record<string, unknown> {
  id: string;
  siteId: string | null;
  scope: string;
  tokenHint: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface RawEvent extends Record<string, unknown> {
  id: string;
  siteId: string;
  tokenId: string;
  eventType: string;
  occurredAt: string;
  receivedAt: string;
  origin: string;
  path: string;
  referrerPath: string | null;
  visitorHash: string | null;
  sessionHash: string | null;
  source: string | null;
  properties: string;
  eventKey: string | null;
  createdAt: string;
}

interface RawAggregate extends Record<string, unknown> {
  siteId: string;
  day: string;
  eventType: string;
  path: string;
  source: string;
  eventCount: number;
  uniqueVisitors: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  rolledUpAt: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonValue(value: unknown, label: string, depth = 0): asserts value is JsonValue {
  if (depth > 5) throw new Error(`${label} is too deeply nested.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${label} contains a non-finite number.`);
  }
  if (Array.isArray(value)) {
    if (value.length > 64) throw new Error(`${label} contains too many items.`);
    value.forEach((item, index) => assertJsonValue(item, `${label}[${index}]`, depth + 1));
    return;
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length > 64) throw new Error(`${label} contains too many keys.`);
    for (const [key, item] of Object.entries(value)) {
      if (key.length > 128) throw new Error(`${label} contains an oversized key.`);
      assertJsonValue(item, `${label}.${key}`, depth + 1);
    }
    return;
  }
  throw new Error(`${label} must contain JSON values only.`);
}

function parseJsonObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "string") throw new Error(`${label} is not JSON text.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!isPlainObject(parsed)) throw new Error(`${label} must be a JSON object.`);
  assertJsonValue(parsed, label);
  return parsed as JsonObject;
}

function parseJsonArray(value: unknown, label: string): string[] {
  if (typeof value !== "string") throw new Error(`${label} is not JSON text.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON string array.`);
  }
  return parsed.map((item) => item);
}

function encodeJson(value: unknown, label: string): string {
  assertJsonValue(value, label);
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error(`${label} must be JSON serializable.`);
  return encoded;
}

function normalizeEnum<T extends string>(value: string, values: readonly T[], label: string): T {
  const normalized = value.trim().toUpperCase();
  if ((values as readonly string[]).includes(normalized)) return normalized as T;
  throw new Error(`Invalid ${label}: ${value}.`);
}

function normalizeOptionalText(value: string | null | undefined, label: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${label} contains control characters.`);
  return normalized;
}

function normalizeRequiredText(value: string, label: string, maxLength: number): string {
  const normalized = normalizeOptionalText(value, label, maxLength);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function normalizeTimestamp(value: string | Date | null | undefined, label: string, fallback: string | null): string | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date.toISOString();
}

function normalizeDateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid date.`);
  }
  return value;
}

function boundedInteger(value: number | undefined, label: string, min: number, max: number, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return result;
}

function normalizeProvider(value: string): ConnectionProvider {
  return normalizeEnum(value, CONNECTION_PROVIDERS, "connection provider");
}

function normalizeStatus(value: string): ConnectionStatus {
  return normalizeEnum(value, CONNECTION_STATUSES, "connection status");
}

function normalizeEventType(value: string): TrackingEventType {
  const normalized = value.trim().toUpperCase().replace(/[- ]/g, "_");
  const aliases: Record<string, TrackingEventType> = {
    PAGEVIEW: "PAGE_VIEW",
    PAGE_VIEW: "PAGE_VIEW",
    FORMSUBMIT: "FORM_SUBMIT",
    FORM_SUBMIT: "FORM_SUBMIT",
    IDENTIFY: "IDENTIFY",
    CUSTOM: "CUSTOM",
  };
  const result = aliases[normalized];
  if (result) return result;
  throw new Error(`Invalid tracking event type: ${value}.`);
}

function safeFailureCode(value: string | null | undefined): string | null {
  return normalizeOptionalText(value, "Sync failure code", 128);
}

function safeFailureMessage(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value, "Sync failure message", 1_024);
  if (!normalized) return null;
  return normalized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:access_?token|refresh_?token|token|key|secret)=)[^&\s]+/gi, "$1[redacted]");
}

function normalizeScopes(values: readonly string[] | undefined): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 128) throw new Error("Connection scopes are invalid.");
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeRequiredText(value, "Connection scope", 256);
    if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Connection scope contains control characters.");
    seen.add(normalized);
  }
  return [...seen].sort();
}

const SENSITIVE_CONFIG_KEY = /(?:access[_\-.]?token|refresh[_\-.]?token|token|secret|password|passcode|authorization|cookie|api[_\-.]?key|client[_\-.]?secret|private[_\-.]?key)/i;

function normalizeConfiguration(value: Record<string, unknown> | null | undefined): JsonObject {
  if (value === null || value === undefined) return {};
  if (!isPlainObject(value)) throw new Error("Connection configuration must be a JSON object.");
  const output: JsonObject = {};
  if (Object.keys(value).length > 64) throw new Error("Connection configuration has too many keys.");
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeRequiredText(key, "Connection configuration key", 128);
    const keyForSecretCheck = normalizedKey.toLowerCase();
    if (SENSITIVE_CONFIG_KEY.test(normalizedKey) ||
        /(?:access|refresh)[a-z0-9_.-]*token|(?:client|api|private)[a-z0-9_.-]*key/.test(keyForSecretCheck)) {
      throw new Error(`Connection configuration key ${normalizedKey} cannot contain secrets.`);
    }
    assertJsonValue(item, `Connection configuration ${normalizedKey}`);
    output[normalizedKey] = item;
  }
  const encoded = encodeJson(output, "Connection configuration");
  if (Buffer.byteLength(encoded, "utf8") > 8_192) throw new Error("Connection configuration is too large.");
  return output;
}

function rawConnectionSelect(): string {
  return `
    SELECT
      c.id,
      c.provider,
      c.external_account_id AS externalAccountId,
      c.display_name AS displayName,
      c.configuration,
      c.scopes,
      c.enabled,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      h.status,
      h.last_checked_at AS lastCheckedAt,
      h.last_success_at AS lastSuccessAt,
      h.last_failure_at AS lastFailureAt,
      h.failure_code AS failureCode,
      h.failure_message AS failureMessage,
      h.consecutive_failures AS consecutiveFailures,
      h.updated_at AS healthUpdatedAt
    FROM connections AS c
    LEFT JOIN connection_health AS h ON h.connection_id = c.id`;
}

function parseConnection(row: RawConnection): Connection {
  return {
    id: requiredText(row.id, "Connection id"),
    provider: normalizeProvider(row.provider),
    externalAccountId: row.externalAccountId ?? null,
    displayName: row.displayName ?? null,
    configuration: parseJsonObject(row.configuration, "Connection configuration"),
    scopes: parseJsonArray(row.scopes, "Connection scopes"),
    enabled: Number(row.enabled) === 1,
    health: {
      status: normalizeStatus(row.status || (Number(row.enabled) === 1 ? "DISCONNECTED" : "DISABLED")),
      lastCheckedAt: row.lastCheckedAt ?? null,
      lastSuccessAt: row.lastSuccessAt ?? null,
      lastFailureAt: row.lastFailureAt ?? null,
      failureCode: row.failureCode ?? null,
      failureMessage: row.failureMessage ?? null,
      consecutiveFailures: Number(row.consecutiveFailures ?? 0),
      updatedAt: requiredText(row.healthUpdatedAt ?? row.updatedAt, "Connection health timestamp"),
    },
    createdAt: requiredText(row.createdAt, "Connection created timestamp"),
    updatedAt: requiredText(row.updatedAt, "Connection updated timestamp"),
  };
}

function rawSyncCursorSelect(): string {
  return `
    SELECT
      id,
      connection_id AS connectionId,
      stream,
      cursor,
      last_success_at AS lastSuccessAt,
      last_failure_at AS lastFailureAt,
      failure_code AS failureCode,
      failure_message AS failureMessage,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM connection_sync_cursors`;
}

function parseSyncCursor(row: RawSyncCursor): SyncCursor {
  return {
    id: requiredText(row.id, "Sync cursor id"),
    connectionId: requiredText(row.connectionId, "Sync cursor connection"),
    stream: requiredText(row.stream, "Sync cursor stream"),
    cursor: row.cursor ?? null,
    lastSuccessAt: row.lastSuccessAt ?? null,
    lastFailureAt: row.lastFailureAt ?? null,
    failureCode: row.failureCode ?? null,
    failureMessage: row.failureMessage ?? null,
    createdAt: requiredText(row.createdAt, "Sync cursor created timestamp"),
    updatedAt: requiredText(row.updatedAt, "Sync cursor updated timestamp"),
  };
}

function normalizeHost(value: string, label: string): string {
  const input = normalizeRequiredText(value, label, 512).replace(/\.$/, "");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label} must be a valid hostname.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${label} must use HTTP or HTTPS.`);
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${label} must contain only a hostname.`);
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || host.includes("/") || host.includes("?")) {
    throw new Error(`${label} must be a valid hostname.`);
  }
  if (host !== "localhost" && !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(host) &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error(`${label} must be a valid hostname.`);
  }
  return host;
}

function normalizeAllowedDomain(value: string): string {
  const normalized = normalizeRequiredText(value, "Allowed domain", 253);
  if (normalized.startsWith("*.")) {
    const suffix = normalizeHost(normalized.slice(2), "Allowed domain");
    return `*.${suffix}`;
  }
  if (normalized.includes("*")) throw new Error("Allowed domain wildcard must use the *.example.com form.");
  return normalizeHost(normalized, "Allowed domain");
}

function normalizeAllowedDomains(values: readonly string[] | undefined): string[] {
  if (!values || !Array.isArray(values) || values.length === 0 || values.length > 32) {
    throw new Error("At least one allowed domain is required.");
  }
  const domains = [...new Set(values.map(normalizeAllowedDomain))].sort();
  if (domains.length === 0) throw new Error("At least one allowed domain is required.");
  return domains;
}

function hostMatchesAllowed(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => {
    if (domain.startsWith("*.")) {
      const suffix = domain.slice(2);
      return host !== suffix && host.endsWith(`.${suffix}`);
    }
    return host === domain;
  });
}

function normalizeOrigin(value: string): { origin: string; host: string } {
  const input = normalizeRequiredText(value, "Tracking origin", 512);
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Tracking origin must be an absolute URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Tracking origin must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("Tracking origin must not contain a path, query string, or fragment.");
  }
  return { origin: parsed.origin, host: parsed.hostname.toLowerCase().replace(/\.$/, "") };
}

function normalizePath(value: string, label: string): string {
  const path = normalizeRequiredText(value, label, TRACKING_LIMITS.maxPathLength);
  if (!path.startsWith("/")) throw new Error(`${label} must be a path beginning with '/'.`);
  if (path.includes("?") || path.includes("#")) {
    throw new Error(`${label} must not contain a query string or fragment.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(path)) throw new Error(`${label} contains control characters.`);
  return path;
}

function pathFromUrl(value: string, label: string, expectedOrigin?: string): string {
  let parsed: URL;
  try {
    parsed = new URL(normalizeRequiredText(value, label, 4_096));
  } catch {
    throw new Error(`${label} must be a path or absolute URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`${label} must use HTTP or HTTPS.`);
  if (parsed.search || parsed.hash) throw new Error(`${label} must not contain a query string or fragment.`);
  if (expectedOrigin && parsed.origin !== expectedOrigin) throw new Error(`${label} origin does not match the tracking origin.`);
  return normalizePath(parsed.pathname || "/", label);
}

function normalizeReferrer(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const input = normalizeRequiredText(value, "Tracking referrer", 4_096);
  if (input.startsWith("/")) return normalizePath(input, "Tracking referrer");
  return pathFromUrl(input, "Tracking referrer");
}

function hashIdentifier(value: string | null | undefined, label: string): string | null {
  const normalized = normalizeOptionalText(value, label, 256);
  if (!normalized) return null;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Hashes a browser identifier before it is persisted. Raw identifiers are never stored. */
export function hashTrackingIdentifier(value: string): string {
  const normalized = normalizeRequiredText(value, "Tracking identifier", 256);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

const SENSITIVE_PROPERTY_KEY = /(?:password|passcode|secret|token|authorization|cookie|credit[_\-.]?card|card[_\-.]?(?:number|cvc|cvv)|cvv|cvc|ssn|social[_\-.]?security|api[_\-.]?key|access[_\-.]?key|refresh[_\-.]?token|email|phone|name|address)/i;

function normalizeTrackingProperties(value: Record<string, unknown> | null | undefined): JsonObject {
  if (value === null || value === undefined) return {};
  if (!isPlainObject(value)) throw new Error("Tracking properties must be a JSON object.");
  const keys = Object.keys(value);
  if (keys.length > TRACKING_LIMITS.maxPropertyCount) throw new Error("Tracking properties contain too many keys.");
  const output: JsonObject = {};
  for (const key of keys) {
    const normalizedKey = normalizeRequiredText(key, "Tracking property key", TRACKING_LIMITS.maxPropertyKeyLength).toLowerCase();
    if (!/^[a-z][a-z0-9_.-]*$/.test(normalizedKey)) throw new Error(`Invalid tracking property key: ${key}.`);
    if (SENSITIVE_PROPERTY_KEY.test(normalizedKey) ||
        /(?:access|refresh)[a-z0-9_.-]*token/.test(normalizedKey)) {
      throw new Error(`Sensitive tracking property is not allowed: ${key}.`);
    }
    const item = value[key];
    if (typeof item === "string") {
      if (item.length > TRACKING_LIMITS.maxPropertyValueLength) throw new Error(`Tracking property ${key} is too long.`);
      if (/[\u0000-\u001f\u007f]/.test(item)) throw new Error(`Tracking property ${key} contains control characters.`);
      if ((/(?:url|uri|path|href|referrer|location)/i.test(normalizedKey)) && (item.includes("?") || item.includes("#"))) {
        throw new Error(`Tracking property ${key} must not contain a query string or fragment.`);
      }
      output[normalizedKey] = item;
    } else if (item === null || typeof item === "boolean") {
      output[normalizedKey] = item;
    } else if (typeof item === "number" && Number.isFinite(item)) {
      output[normalizedKey] = item;
    } else {
      throw new Error(`Tracking property ${key} must be a scalar JSON value.`);
    }
  }
  const encoded = encodeJson(output, "Tracking properties");
  if (Buffer.byteLength(encoded, "utf8") > TRACKING_LIMITS.maxPropertiesBytes) {
    throw new Error("Tracking properties are too large.");
  }
  return output;
}

/**
 * Enforces the collector privacy contract without touching the database. In
 * particular, URLs with query strings/fragments and sensitive properties are
 * rejected rather than silently recorded.
 */
export function sanitizeTrackingEvent(input: TrackingEventInput): SanitizedTrackingEvent {
  if (!input || typeof input !== "object") throw new Error("Tracking event is required.");
  const eventType = normalizeEventType(String(input.eventType ?? input.type ?? ""));
  const { origin } = normalizeOrigin(input.origin);
  const receivedAt = normalizeTimestamp(input.receivedAt, "Tracking receivedAt", nowIso());
  const occurredAt = normalizeTimestamp(input.occurredAt, "Tracking occurredAt", receivedAt);
  if (!occurredAt || !receivedAt) throw new Error("Tracking timestamps are required.");
  const pageValue = input.path ?? input.pageUrl ?? input.url;
  const path = pageValue === undefined
    ? "/"
    : pageValue.startsWith("/")
      ? normalizePath(pageValue, "Tracking page path")
      : pathFromUrl(pageValue, "Tracking page URL", origin);
  const referrerPath = normalizeReferrer(input.referrer ?? input.referrerUrl);
  const source = normalizeOptionalText(input.source, "Tracking source", TRACKING_LIMITS.maxSourceLength);
  if (source && (source.includes("?") || source.includes("#"))) {
    throw new Error("Tracking source must not contain a query string or fragment.");
  }
  const properties = normalizeTrackingProperties(input.properties);
  const id = input.id === undefined ? newRecordId("tev") : normalizeRequiredText(input.id, "Tracking event id", 128);
  const eventKey = normalizeOptionalText(input.eventKey, "Tracking event key", 128);
  const encoded = encodeJson(properties, "Tracking properties");
  const eventBytes = Buffer.byteLength(`${origin}${path}${encoded}`, "utf8");
  if (eventBytes > TRACKING_LIMITS.maxEventBytes) throw new Error("Tracking event is too large.");
  return {
    id,
    eventType,
    type: eventType,
    occurredAt,
    origin,
    path,
    referrerPath,
    visitorHash: hashIdentifier(input.visitorId, "Tracking visitor id"),
    sessionHash: hashIdentifier(input.sessionId, "Tracking session id"),
    source,
    properties,
    eventKey,
    receivedAt,
  };
}

function rawSiteSelect(): string {
  return `
    SELECT
      s.id,
      s.site_key AS siteKey,
      s.name,
      s.allowed_domains AS allowedDomains,
      s.status,
      s.verification_status AS verificationStatus,
      s.verified_at AS verifiedAt,
      s.paused_at AS pausedAt,
      s.rotated_at AS rotatedAt,
      s.created_at AS createdAt,
      s.updated_at AS updatedAt,
      r.event_retention_days AS eventRetentionDays,
      r.aggregate_retention_days AS aggregateRetentionDays,
      r.last_rollup_at AS lastRollupAt,
      r.last_pruned_at AS lastPrunedAt,
      r.updated_at AS retentionUpdatedAt
    FROM tracking_sites AS s
    JOIN tracking_retention AS r ON r.site_id = s.id`;
}

function parseSite(row: RawSite): TrackingSite {
  const allowedDomains = parseJsonArray(row.allowedDomains, "Tracking allowed domains");
  if (allowedDomains.length === 0) throw new Error("Tracking site has no allowed domains.");
  return {
    id: requiredText(row.id, "Tracking site id"),
    siteKey: requiredText(row.siteKey, "Tracking site key"),
    name: requiredText(row.name, "Tracking site name"),
    allowedDomains,
    status: normalizeEnum(row.status, TRACKING_SITE_STATUSES, "tracking site status"),
    verificationStatus: normalizeEnum(row.verificationStatus, TRACKING_VERIFICATION_STATUSES, "tracking verification status"),
    verifiedAt: row.verifiedAt ?? null,
    pausedAt: row.pausedAt ?? null,
    rotatedAt: row.rotatedAt ?? null,
    retention: {
      siteId: requiredText(row.id, "Tracking retention site"),
      eventRetentionDays: Number(row.eventRetentionDays),
      aggregateRetentionDays: Number(row.aggregateRetentionDays),
      lastRollupAt: row.lastRollupAt ?? null,
      lastPrunedAt: row.lastPrunedAt ?? null,
      updatedAt: requiredText(row.retentionUpdatedAt, "Tracking retention timestamp"),
    },
    createdAt: requiredText(row.createdAt, "Tracking site created timestamp"),
    updatedAt: requiredText(row.updatedAt, "Tracking site updated timestamp"),
  };
}

function parseToken(row: RawToken): TrackingToken {
  return {
    id: requiredText(row.id, "Tracking token id"),
    siteId: row.siteId ?? null,
    scope: normalizeEnum(row.scope, TOKEN_SCOPES, "token scope"),
    tokenHint: requiredText(row.tokenHint, "Tracking token hint"),
    createdAt: requiredText(row.createdAt, "Tracking token created timestamp"),
    lastUsedAt: row.lastUsedAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

function rawEventSelect(): string {
  return `
    SELECT
      id,
      site_id AS siteId,
      token_id AS tokenId,
      event_type AS eventType,
      occurred_at AS occurredAt,
      received_at AS receivedAt,
      origin,
      path,
      referrer_path AS referrerPath,
      visitor_hash AS visitorHash,
      session_hash AS sessionHash,
      source,
      properties,
      event_key AS eventKey,
      created_at AS createdAt
    FROM tracking_events`;
}

function parseEvent(row: RawEvent): TrackingEvent {
  return {
    id: requiredText(row.id, "Tracking event id"),
    siteId: requiredText(row.siteId, "Tracking event site"),
    tokenId: requiredText(row.tokenId, "Tracking event token"),
    eventType: normalizeEventType(row.eventType),
    type: normalizeEventType(row.eventType),
    occurredAt: requiredText(row.occurredAt, "Tracking event occurred timestamp"),
    receivedAt: requiredText(row.receivedAt, "Tracking event received timestamp"),
    origin: requiredText(row.origin, "Tracking event origin"),
    path: requiredText(row.path, "Tracking event path"),
    referrerPath: row.referrerPath ?? null,
    visitorHash: row.visitorHash ?? null,
    sessionHash: row.sessionHash ?? null,
    source: row.source ?? null,
    properties: parseJsonObject(row.properties, "Tracking event properties"),
    eventKey: row.eventKey ?? null,
    createdAt: requiredText(row.createdAt, "Tracking event created timestamp"),
  };
}

function parseAggregate(row: RawAggregate): TrackingAggregate {
  return {
    siteId: requiredText(row.siteId, "Tracking aggregate site"),
    day: normalizeDateOnly(row.day, "Tracking aggregate day"),
    eventType: normalizeEventType(row.eventType),
    path: requiredText(row.path, "Tracking aggregate path"),
    source: row.source || null,
    eventCount: Number(row.eventCount),
    uniqueVisitors: Number(row.uniqueVisitors),
    firstSeenAt: row.firstSeenAt ?? null,
    lastSeenAt: row.lastSeenAt ?? null,
    rolledUpAt: requiredText(row.rolledUpAt, "Tracking aggregate rollup timestamp"),
  };
}

function tokenSecret(scope: TokenScope): string {
  const prefix = scope === "TRACKING" ? "crm_trk_" : "crm_intake_";
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

/** SHA-256 is sufficient for high-entropy generated tokens and keeps lookups indexable. */
export function hashTrackingToken(token: string): string {
  const normalized = normalizeRequiredText(token, "Tracking token", TRACKING_LIMITS.maxTokenLength);
  if (normalized.length < 16) throw new Error("Tracking token is too short.");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function tokenHint(hash: string): string {
  return hash.slice(0, 12);
}

function requireId(value: string, label: string): string {
  return normalizeRequiredText(value, label, 256);
}

function siteSelector(id: string | undefined, siteKey: string | undefined): { id?: string; siteKey?: string } {
  if (!id && !siteKey) throw new Error("A tracking site id or site key is required.");
  return {
    id: id ? requireId(id, "Tracking site id") : undefined,
    siteKey: siteKey ? normalizeRequiredText(siteKey, "Tracking site key", 128) : undefined,
  };
}

function retentionDays(value: number | undefined, label: string, fallback: number): number {
  return boundedInteger(value, label, 1, 3_650, fallback);
}

function normalizeBatchSize(value: number | undefined): number {
  return boundedInteger(value, "Tracking batch size", 1, TRACKING_LIMITS.maxBatchSize, TRACKING_LIMITS.maxBatchSize);
}

function normalizeLimit(value: number | undefined, fallback = 100): number {
  return boundedInteger(value, "Tracking list limit", 1, 1_000, fallback);
}

function normalizeOffset(value: number | undefined): number {
  return boundedInteger(value, "Tracking list offset", 0, 1_000_000, 0);
}

export class TrackingAuthorizationError extends Error {
  readonly code = "UNAUTHORIZED" as const;

  constructor(message = "Tracking token or site is not authorized.") {
    super(message);
    this.name = "TrackingAuthorizationError";
  }
}

export class TrackingPrivacyError extends Error {
  readonly code = "INVALID_TRACKING_EVENT" as const;

  constructor(message: string) {
    super(message);
    this.name = "TrackingPrivacyError";
  }
}

function wrapPrivacyError(error: unknown): never {
  if (error instanceof TrackingPrivacyError) throw error;
  throw new TrackingPrivacyError(error instanceof Error ? error.message : "Invalid tracking event.");
}

export class ConnectionStore {
  constructor(private readonly db: Db) {}

  private rawById(id: string): RawConnection | undefined {
    return this.db.prepare(`${rawConnectionSelect()} WHERE c.id = ?`).get(id) as RawConnection | undefined;
  }

  private rawByProviderAccount(provider: ConnectionProvider, externalAccountId: string | null): RawConnection | undefined {
    const query = externalAccountId === null
      ? `${rawConnectionSelect()} WHERE c.provider = ? AND c.external_account_id IS NULL ORDER BY c.created_at LIMIT 1`
      : `${rawConnectionSelect()} WHERE c.provider = ? AND c.external_account_id = ? LIMIT 1`;
    return (externalAccountId === null
      ? this.db.prepare(query).get(provider)
      : this.db.prepare(query).get(provider, externalAccountId)) as RawConnection | undefined;
  }

  get(id: string): Connection | null {
    const row = this.rawById(requireId(id, "Connection id"));
    return row ? parseConnection(row) : null;
  }

  getRequired(id: string): Connection {
    const normalizedId = requireId(id, "Connection id");
    const value = this.get(normalizedId);
    if (!value) throw new RecordNotFoundError("connection", normalizedId);
    return value;
  }

  list(options: { provider?: ConnectionProvider | string; enabled?: boolean; status?: ConnectionStatus | string } = {}): Connection[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.provider !== undefined) {
      clauses.push("c.provider = ?");
      params.push(normalizeProvider(options.provider));
    }
    if (options.enabled !== undefined) {
      clauses.push("c.enabled = ?");
      params.push(options.enabled ? 1 : 0);
    }
    if (options.status !== undefined) {
      clauses.push("COALESCE(h.status, CASE WHEN c.enabled = 1 THEN 'DISCONNECTED' ELSE 'DISABLED' END) = ?");
      params.push(normalizeStatus(options.status));
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`${rawConnectionSelect()}${where} ORDER BY c.provider, c.created_at DESC, c.id`).all(...params).map((row) => parseConnection(row as RawConnection));
  }

  upsert(input: ConnectionUpsertInput): Connection {
    const provider = normalizeProvider(input.provider);
    const id = input.id === undefined ? undefined : requireId(input.id, "Connection id");
    const externalAccountId = input.externalAccountId === undefined
      ? undefined
      : normalizeOptionalText(input.externalAccountId, "External account id", 512);
    const displayName = normalizeOptionalText(input.displayName, "Connection display name", 256);
    const configuration = input.configuration === undefined ? undefined : normalizeConfiguration(input.configuration);
    const scopes = input.scopes === undefined ? undefined : normalizeScopes(input.scopes);
    const checkedAt = normalizeTimestamp(input.checkedAt, "Connection checkedAt", null);
    const requestedStatus = input.status === undefined ? undefined : normalizeStatus(input.status);
    return this.db.transaction(() => {
      const existing = id ? this.rawById(id) : this.rawByProviderAccount(provider, externalAccountId ?? null);
      if (id && existing && existing.provider !== provider) {
        throw new Error(`Connection id ${id} belongs to another provider.`);
      }
      const connectionId = existing?.id ?? id ?? newRecordId("conn");
      const nextExternalAccountId = input.externalAccountId === undefined
        ? existing?.externalAccountId ?? null
        : externalAccountId ?? null;
      const oldHealth = existing
        ? this.db.prepare("SELECT status FROM connection_health WHERE connection_id = ?").get(connectionId) as { status?: string } | undefined
        : undefined;
      let enabled = input.enabled ?? (existing ? Number(existing.enabled) === 1 : true);
      let status = requestedStatus ?? (oldHealth?.status ? normalizeStatus(oldHealth.status) : enabled ? "DISCONNECTED" : "DISABLED");
      if (requestedStatus && requestedStatus !== "DISABLED" && input.enabled === undefined) enabled = true;
      if (!enabled || status === "DISABLED") {
        enabled = false;
        status = "DISABLED";
      }
      const currentConfiguration = existing ? parseJsonObject(existing.configuration, "Connection configuration") : {};
      const currentScopes = existing ? parseJsonArray(existing.scopes, "Connection scopes") : [];
      const createdAt = existing?.createdAt ?? nowIso();
      const updatedAt = nowIso();
      if (existing) {
        this.db.prepare(`
          UPDATE connections
          SET provider = @provider,
              external_account_id = @externalAccountId,
              display_name = @displayName,
              configuration = @configuration,
              scopes = @scopes,
              enabled = @enabled,
              updated_at = @updatedAt
          WHERE id = @id`).run({
          id: connectionId,
          provider,
          externalAccountId: nextExternalAccountId,
          displayName: input.displayName === undefined ? existing.displayName : displayName,
          configuration: encodeJson(configuration ?? currentConfiguration, "Connection configuration"),
          scopes: encodeJson(scopes ?? currentScopes, "Connection scopes"),
          enabled: enabled ? 1 : 0,
          updatedAt,
        });
      } else {
        this.db.prepare(`
          INSERT INTO connections (
            id, provider, external_account_id, display_name, configuration,
            scopes, enabled, created_at, updated_at
          ) VALUES (
            @id, @provider, @externalAccountId, @displayName, @configuration,
            @scopes, @enabled, @createdAt, @updatedAt
          )`).run({
          id: connectionId,
          provider,
          externalAccountId: nextExternalAccountId,
          displayName,
          configuration: encodeJson(configuration ?? {}, "Connection configuration"),
          scopes: encodeJson(scopes ?? [], "Connection scopes"),
          enabled: enabled ? 1 : 0,
          createdAt,
          updatedAt,
        });
      }
      this.db.prepare(`
        INSERT INTO connection_health (
          connection_id, status, last_checked_at, updated_at
        ) VALUES (@connectionId, @status, @checkedAt, @updatedAt)
        ON CONFLICT(connection_id) DO UPDATE SET
          status = excluded.status,
          last_checked_at = CASE WHEN @checkedAt IS NULL THEN connection_health.last_checked_at ELSE excluded.last_checked_at END,
          updated_at = excluded.updated_at`).run({
        connectionId,
        status,
        checkedAt,
        updatedAt,
      });
      return this.getRequired(connectionId);
    })();
  }

  setStatus(id: string, input: ConnectionStatusInput | ConnectionStatus | string): Connection {
    const connectionId = requireId(id, "Connection id");
    const status = typeof input === "string" ? normalizeStatus(input) : normalizeStatus(input.status);
    const checkedAt = typeof input === "string" ? nowIso() : normalizeTimestamp(input.checkedAt, "Connection checkedAt", nowIso()) as string;
    return this.db.transaction(() => {
      this.getRequired(connectionId);
      const enabled = status === "DISABLED" ? 0 : 1;
      this.db.prepare("UPDATE connections SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled, checkedAt, connectionId);
      this.db.prepare(`
        INSERT INTO connection_health (connection_id, status, last_checked_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(connection_id) DO UPDATE SET
          status = excluded.status,
          last_checked_at = excluded.last_checked_at,
          updated_at = excluded.updated_at`).run(connectionId, status, checkedAt, checkedAt);
      return this.getRequired(connectionId);
    })();
  }

  disable(id: string, at = nowIso()): Connection {
    return this.setStatus(id, { status: "DISABLED", checkedAt: at });
  }

  enable(id: string, at = nowIso()): Connection {
    return this.setStatus(id, { status: "DISCONNECTED", checkedAt: at });
  }

  private normalizeSyncSuccess(input: SyncSuccessInput | string, cursor?: string | null, at?: string | Date | null): SyncSuccessInput & { cursorProvided: boolean } {
    if (typeof input !== "string") {
      return {
        stream: normalizeRequiredText(input.stream, "Sync stream", 256),
        cursor: input.cursor === undefined ? undefined : normalizeOptionalText(input.cursor, "Sync cursor", 4_096),
        at: input.at,
        cursorProvided: input.cursor !== undefined,
      };
    }
    return {
      stream: normalizeRequiredText(input, "Sync stream", 256),
      cursor: cursor === undefined ? undefined : normalizeOptionalText(cursor, "Sync cursor", 4_096),
      at,
      cursorProvided: cursor !== undefined,
    };
  }

  recordSyncSuccess(id: string, input: SyncSuccessInput | string, cursor?: string | null, at?: string | Date | null): Connection {
    const connectionId = requireId(id, "Connection id");
    const normalized = this.normalizeSyncSuccess(input, cursor, at);
    const timestamp = normalizeTimestamp(normalized.at, "Sync success timestamp", nowIso()) as string;
    return this.db.transaction(() => {
      const current = this.getRequired(connectionId);
      if (!current.enabled) throw new Error("Cannot sync a disabled connection.");
      const existingCursor = this.db.prepare(`${rawSyncCursorSelect()} WHERE connection_id = ? AND stream = ?`).get(connectionId, normalized.stream) as RawSyncCursor | undefined;
      const nextCursor = normalized.cursorProvided ? normalized.cursor ?? null : existingCursor?.cursor ?? null;
      this.db.prepare(`
        INSERT INTO connection_sync_cursors (
          id, connection_id, stream, cursor, last_success_at,
          last_failure_at, failure_code, failure_message, created_at, updated_at
        ) VALUES (
          @id, @connectionId, @stream, @cursor, @timestamp,
          NULL, NULL, NULL, @timestamp, @timestamp
        )
        ON CONFLICT(connection_id, stream) DO UPDATE SET
          cursor = excluded.cursor,
          last_success_at = excluded.last_success_at,
          last_failure_at = NULL,
          failure_code = NULL,
          failure_message = NULL,
          updated_at = excluded.updated_at`).run({
        id: existingCursor?.id ?? newRecordId("cur"),
        connectionId,
        stream: normalized.stream,
        cursor: nextCursor,
        timestamp,
      });
      this.db.prepare(`
        UPDATE connection_health
        SET status = 'CONNECTED',
            last_checked_at = @timestamp,
            last_success_at = @timestamp,
            last_failure_at = NULL,
            failure_code = NULL,
            failure_message = NULL,
            consecutive_failures = 0,
            updated_at = @timestamp
        WHERE connection_id = @connectionId`).run({ connectionId, timestamp });
      return this.getRequired(connectionId);
    })();
  }

  recordSyncFailure(id: string, input: SyncFailureInput | string, errorMessage?: string | null, at?: string | Date | null): Connection {
    const connectionId = requireId(id, "Connection id");
    const normalized: SyncFailureInput = typeof input === "string"
      ? { stream: input, errorMessage, at }
      : input;
    const stream = normalizeRequiredText(normalized.stream, "Sync stream", 256);
    const timestamp = normalizeTimestamp(normalized.at, "Sync failure timestamp", nowIso()) as string;
    const failureCode = safeFailureCode(typeof input === "string" ? undefined : normalized.errorCode);
    const failureMessage = safeFailureMessage(typeof input === "string" ? errorMessage : normalized.errorMessage);
    return this.db.transaction(() => {
      const current = this.getRequired(connectionId);
      if (!current.enabled) throw new Error("Cannot sync a disabled connection.");
      const existingCursor = this.db.prepare(`${rawSyncCursorSelect()} WHERE connection_id = ? AND stream = ?`).get(connectionId, stream) as RawSyncCursor | undefined;
      this.db.prepare(`
        INSERT INTO connection_sync_cursors (
          id, connection_id, stream, cursor, last_failure_at,
          failure_code, failure_message, created_at, updated_at
        ) VALUES (
          @id, @connectionId, @stream, @cursor, @timestamp,
          @failureCode, @failureMessage, @timestamp, @timestamp
        )
        ON CONFLICT(connection_id, stream) DO UPDATE SET
          last_failure_at = excluded.last_failure_at,
          failure_code = excluded.failure_code,
          failure_message = excluded.failure_message,
          updated_at = excluded.updated_at`).run({
        id: existingCursor?.id ?? newRecordId("cur"),
        connectionId,
        stream,
        cursor: existingCursor?.cursor ?? null,
        timestamp,
        failureCode,
        failureMessage,
      });
      this.db.prepare(`
        UPDATE connection_health
        SET status = 'ERROR',
            last_checked_at = @timestamp,
            last_failure_at = @timestamp,
            failure_code = @failureCode,
            failure_message = @failureMessage,
            consecutive_failures = consecutive_failures + 1,
            updated_at = @timestamp
        WHERE connection_id = @connectionId`).run({ connectionId, timestamp, failureCode, failureMessage });
      return this.getRequired(connectionId);
    })();
  }

  getSyncCursor(connectionId: string, stream: string): SyncCursor | null {
    const row = this.db.prepare(`${rawSyncCursorSelect()} WHERE connection_id = ? AND stream = ?`).get(
      requireId(connectionId, "Connection id"),
      normalizeRequiredText(stream, "Sync stream", 256),
    ) as RawSyncCursor | undefined;
    return row ? parseSyncCursor(row) : null;
  }

  listSyncCursors(connectionId: string): SyncCursor[] {
    return this.db.prepare(`${rawSyncCursorSelect()} WHERE connection_id = ? ORDER BY stream`).all(requireId(connectionId, "Connection id")).map((row) => parseSyncCursor(row as RawSyncCursor));
  }
}

export class TrackingSiteStore {
  constructor(private readonly db: Db) {}

  private rawBySelector(selector: { id?: string; siteKey?: string }): RawSite | undefined {
    if (selector.id && selector.siteKey) {
      return this.db.prepare(`${rawSiteSelect()} WHERE s.id = ? AND s.site_key = ?`).get(selector.id, selector.siteKey) as RawSite | undefined;
    }
    if (selector.id) return this.db.prepare(`${rawSiteSelect()} WHERE s.id = ?`).get(selector.id) as RawSite | undefined;
    return this.db.prepare(`${rawSiteSelect()} WHERE s.site_key = ?`).get(selector.siteKey) as RawSite | undefined;
  }

  get(id: string): TrackingSite | null {
    const row = this.rawBySelector(siteSelector(id, undefined));
    return row ? parseSite(row) : null;
  }

  getByKey(siteKey: string): TrackingSite | null {
    const row = this.rawBySelector(siteSelector(undefined, siteKey));
    return row ? parseSite(row) : null;
  }

  getRequired(id: string): TrackingSite {
    const selector = siteSelector(id, undefined);
    const value = this.rawBySelector(selector);
    if (!value) throw new RecordNotFoundError("tracking site", id);
    return parseSite(value);
  }

  private getRequiredBySelector(selector: { id?: string; siteKey?: string }): TrackingSite {
    const value = this.rawBySelector(selector);
    if (!value) throw new RecordNotFoundError("tracking site", selector.id ?? selector.siteKey ?? "unknown");
    return parseSite(value);
  }

  create(input: TrackingSiteCreateInput): TrackingSite {
    const name = normalizeRequiredText(input.name, "Tracking site name", 200);
    const domains = normalizeAllowedDomains(input.allowedDomains ?? input.domains);
    const eventRetentionDays = retentionDays(input.eventRetentionDays, "Event retention days", 30);
    const aggregateRetentionDays = retentionDays(input.aggregateRetentionDays, "Aggregate retention days", 730);
    const id = input.id === undefined ? newRecordId("site") : requireId(input.id, "Tracking site id");
    const siteKey = input.siteKey === undefined
      ? `trk_${randomBytes(18).toString("base64url")}`
      : normalizeRequiredText(input.siteKey, "Tracking site key", 128);
    const timestamp = nowIso();
    return this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO tracking_sites (
          id, site_key, name, allowed_domains, status, verification_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', 'PENDING', ?, ?)
      `).run(id, siteKey, name, encodeJson(domains, "Tracking allowed domains"), timestamp, timestamp);
      this.db.prepare(`
        INSERT INTO tracking_retention (
          site_id, event_retention_days, aggregate_retention_days, updated_at
        ) VALUES (?, ?, ?, ?)
      `).run(id, eventRetentionDays, aggregateRetentionDays, timestamp);
      return this.getRequired(id);
    })();
  }

  createWithToken(input: TrackingSiteCreateInput): ProvisionedTrackingSite {
    const site = this.create(input);
    const provisioned = this.createToken("TRACKING", site.id);
    return { ...site, site, token: provisioned.token, secret: provisioned.secret, tokenId: provisioned.id };
  }

  verify(id: string, input: TrackingSiteVerifyInput | string = {}): TrackingSite {
    const siteId = requireId(id, "Tracking site id");
    const normalized: TrackingSiteVerifyInput = typeof input === "string" ? { domain: input } : input;
    const domain = normalized.domain === undefined ? undefined : normalizeAllowedDomain(normalized.domain);
    const verifiedAt = normalizeTimestamp(normalized.verifiedAt, "Tracking verification timestamp", nowIso()) as string;
    return this.db.transaction(() => {
      const site = this.getRequired(siteId);
      if (domain && (domain.startsWith("*.")
        ? !site.allowedDomains.includes(domain)
        : !hostMatchesAllowed(domain, site.allowedDomains))) {
        throw new Error("Verification domain is not allowed for this site.");
      }
      this.db.prepare(`
        UPDATE tracking_sites
        SET verification_status = 'VERIFIED', verified_at = ?, updated_at = ?
        WHERE id = ?`).run(verifiedAt, verifiedAt, siteId);
      return this.getRequired(siteId);
    })();
  }

  pause(id: string, paused = true, at = nowIso()): TrackingSite {
    const siteId = requireId(id, "Tracking site id");
    const timestamp = normalizeTimestamp(at, "Tracking pause timestamp", nowIso()) as string;
    return this.db.transaction(() => {
      this.getRequired(siteId);
      this.db.prepare(`
        UPDATE tracking_sites
        SET status = ?, paused_at = ?, updated_at = ?
        WHERE id = ?`).run(paused ? "PAUSED" : "ACTIVE", paused ? timestamp : null, timestamp, siteId);
      return this.getRequired(siteId);
    })();
  }

  rotate(id: string, at = nowIso()): ProvisionedTrackingSite {
    const siteId = requireId(id, "Tracking site id");
    const timestamp = normalizeTimestamp(at, "Tracking rotation timestamp", nowIso()) as string;
    return this.db.transaction(() => {
      const current = this.getRequired(siteId);
      let nextKey = `trk_${randomBytes(18).toString("base64url")}`;
      while (this.getByKey(nextKey)) nextKey = `trk_${randomBytes(18).toString("base64url")}`;
      this.db.prepare("UPDATE tracking_tokens SET revoked_at = ? WHERE site_id = ? AND scope = 'TRACKING' AND revoked_at IS NULL").run(timestamp, siteId);
      this.db.prepare("UPDATE tracking_sites SET site_key = ?, rotated_at = ?, updated_at = ? WHERE id = ?").run(nextKey, timestamp, timestamp, siteId);
      const provisioned = this.createToken("TRACKING", siteId, timestamp);
      const site = this.getRequired(siteId);
      // Keep the site row shape directly available while also exposing an
      // explicit nested row for callers that model provisioning as a result.
      return { ...site, site, token: provisioned.token, secret: provisioned.secret, tokenId: provisioned.id };
    })();
  }

  list(options: TrackingSiteListOptions = {}): TrackingSite[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.status !== undefined) {
      clauses.push("s.status = ?");
      params.push(normalizeEnum(options.status, TRACKING_SITE_STATUSES, "tracking site status"));
    }
    if (options.verificationStatus !== undefined) {
      clauses.push("s.verification_status = ?");
      params.push(normalizeEnum(options.verificationStatus, TRACKING_VERIFICATION_STATUSES, "tracking verification status"));
    }
    const limit = normalizeLimit(options.limit, 100);
    const offset = normalizeOffset(options.offset);
    params.push(limit, offset);
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`${rawSiteSelect()}${where} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`).all(...params).map((row) => parseSite(row as RawSite));
  }

  createToken(scope: TokenScope | string, siteId?: string, at = nowIso()): ProvisionedTrackingToken {
    const normalizedScope = normalizeEnum(scope, TOKEN_SCOPES, "token scope");
    const normalizedSiteId = normalizedScope === "TRACKING" ? requireId(siteId ?? "", "Tracking site id") : null;
    const secret = tokenSecret(normalizedScope);
    const hash = hashTrackingToken(secret);
    const id = newRecordId(normalizedScope === "TRACKING" ? "trk_token" : "intake_token");
    const timestamp = normalizeTimestamp(at, "Token created timestamp", nowIso()) as string;
    return this.db.transaction(() => {
      if (normalizedSiteId) this.getRequired(normalizedSiteId);
      this.db.prepare(`
        INSERT INTO tracking_tokens (
          id, site_id, scope, token_hash, token_hint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, normalizedSiteId, normalizedScope, hash, tokenHint(hash), timestamp);
      const row = this.db.prepare(`
        SELECT id, site_id AS siteId, scope, token_hint AS tokenHint,
          created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt
        FROM tracking_tokens WHERE id = ?`).get(id) as RawToken;
      const parsed = parseToken(row);
      return { ...parsed, token: secret, secret };
    })();
  }

  createTrackingToken(siteId: string, at = nowIso()): ProvisionedTrackingToken {
    return this.createToken("TRACKING", siteId, at);
  }

  createIntakeToken(at = nowIso()): ProvisionedTrackingToken {
    return this.createToken("INTAKE", undefined, at);
  }

  rotateTrackingToken(siteId: string, at = nowIso()): ProvisionedTrackingToken {
    const normalizedSiteId = requireId(siteId, "Tracking site id");
    const timestamp = normalizeTimestamp(at, "Token rotation timestamp", nowIso()) as string;
    return this.db.transaction(() => {
      this.getRequired(normalizedSiteId);
      this.db.prepare("UPDATE tracking_tokens SET revoked_at = ? WHERE site_id = ? AND scope = 'TRACKING' AND revoked_at IS NULL").run(timestamp, normalizedSiteId);
      return this.createTrackingToken(normalizedSiteId, timestamp);
    })();
  }

  listTokens(siteId?: string, scope?: TokenScope | string): TrackingToken[] {
    const clauses: string[] = [];
    const params: Array<string | null> = [];
    if (siteId !== undefined) {
      clauses.push("site_id = ?");
      params.push(requireId(siteId, "Tracking site id"));
    }
    if (scope !== undefined) {
      clauses.push("scope = ?");
      params.push(normalizeEnum(scope, TOKEN_SCOPES, "token scope"));
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`
      SELECT id, site_id AS siteId, scope, token_hint AS tokenHint,
        created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt
      FROM tracking_tokens${where} ORDER BY created_at DESC, id DESC`).all(...params).map((row) => parseToken(row as RawToken));
  }

  revokeToken(tokenId: string, at = nowIso()): TrackingToken {
    const id = requireId(tokenId, "Tracking token id");
    const timestamp = normalizeTimestamp(at, "Token revocation timestamp", nowIso()) as string;
    const result = this.db.prepare("UPDATE tracking_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").run(timestamp, id);
    if (result.changes === 0) throw new RecordNotFoundError("tracking token", id);
    const row = this.db.prepare(`
      SELECT id, site_id AS siteId, scope, token_hint AS tokenHint,
        created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt
      FROM tracking_tokens WHERE id = ?`).get(id) as RawToken;
    return parseToken(row);
  }

  getRetention(siteId: string): TrackingRetention {
    return this.getRequired(siteId).retention;
  }

  setRetention(siteId: string, input: TrackingRetentionInput): TrackingRetention {
    const normalizedSiteId = requireId(siteId, "Tracking site id");
    return this.db.transaction(() => {
      const current = this.getRequired(normalizedSiteId).retention;
      const eventRetentionDays = retentionDays(input.eventRetentionDays, "Event retention days", current.eventRetentionDays);
      const aggregateRetentionDays = retentionDays(input.aggregateRetentionDays, "Aggregate retention days", current.aggregateRetentionDays);
      const timestamp = nowIso();
      this.db.prepare(`
        UPDATE tracking_retention
        SET event_retention_days = ?, aggregate_retention_days = ?, updated_at = ?
        WHERE site_id = ?`).run(eventRetentionDays, aggregateRetentionDays, timestamp, normalizedSiteId);
      return this.getRequired(normalizedSiteId).retention;
    })();
  }
}

export class TrackingStore {
  private readonly sites: TrackingSiteStore;

  constructor(private readonly db: Db) {
    this.sites = new TrackingSiteStore(db);
  }

  private authorize(input: TrackingEventInput): { site: TrackingSite; tokenId: string; normalized: SanitizedTrackingEvent } {
    let normalized: SanitizedTrackingEvent;
    try {
      normalized = sanitizeTrackingEvent(input);
    } catch (error) {
      return wrapPrivacyError(error);
    }
    const selector = siteSelector(input.siteId, input.siteKey);
    const site = (selector.id ? this.sites.get(selector.id) : this.sites.getByKey(selector.siteKey as string));
    if (!site || (selector.siteKey && site.siteKey !== selector.siteKey)) throw new TrackingAuthorizationError();
    if (site.status !== "ACTIVE") throw new TrackingAuthorizationError("Tracking site is paused.");
    let tokenHash: string;
    try {
      tokenHash = hashTrackingToken(input.token);
    } catch {
      throw new TrackingAuthorizationError();
    }
    const token = this.db.prepare(`
      SELECT id, site_id AS siteId, scope, token_hint AS tokenHint,
        created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt
      FROM tracking_tokens
      WHERE site_id = ? AND scope = 'TRACKING' AND token_hash = ? AND revoked_at IS NULL`).get(site.id, tokenHash) as RawToken | undefined;
    if (!token) throw new TrackingAuthorizationError();
    const { host } = normalizeOrigin(normalized.origin);
    if (!hostMatchesAllowed(host, site.allowedDomains)) {
      throw new TrackingAuthorizationError("Tracking origin is not allowed for this site.");
    }
    return { site, tokenId: token.id, normalized };
  }

  ingest(input: TrackingEventInput): TrackingEvent {
    const authorization = this.authorize(input);
    return this.db.transaction(() => this.persist(authorization))();
  }

  ingestBatch(inputs: readonly TrackingEventInput[]): TrackingEvent[] {
    if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > TRACKING_LIMITS.maxBatchSize) {
      throw new Error(`Tracking batch must contain 1-${TRACKING_LIMITS.maxBatchSize} events.`);
    }
    const authorizations = inputs.map((input) => this.authorize(input));
    return this.db.transaction(() => authorizations.map((authorization) => this.persist(authorization)))();
  }

  private persist(authorization: { site: TrackingSite; tokenId: string; normalized: SanitizedTrackingEvent }): TrackingEvent {
    const existingByKey = authorization.normalized.eventKey
      ? this.db.prepare(`${rawEventSelect()} WHERE site_id = ? AND event_key = ?`).get(authorization.site.id, authorization.normalized.eventKey) as RawEvent | undefined
      : undefined;
    if (existingByKey) return parseEvent(existingByKey);
    const timestamp = authorization.normalized.receivedAt;
    this.db.prepare(`
      INSERT INTO tracking_events (
        id, site_id, token_id, event_type, occurred_at, received_at,
        origin, path, referrer_path, visitor_hash, session_hash,
        source, properties, event_key, created_at
      ) VALUES (
        @id, @siteId, @tokenId, @eventType, @occurredAt, @receivedAt,
        @origin, @path, @referrerPath, @visitorHash, @sessionHash,
        @source, @properties, @eventKey, @createdAt
      )`).run({
      id: authorization.normalized.id,
      siteId: authorization.site.id,
      tokenId: authorization.tokenId,
      eventType: authorization.normalized.eventType,
      occurredAt: authorization.normalized.occurredAt,
      receivedAt: timestamp,
      origin: authorization.normalized.origin,
      path: authorization.normalized.path,
      referrerPath: authorization.normalized.referrerPath,
      visitorHash: authorization.normalized.visitorHash,
      sessionHash: authorization.normalized.sessionHash,
      source: authorization.normalized.source,
      properties: encodeJson(authorization.normalized.properties, "Tracking properties"),
      eventKey: authorization.normalized.eventKey,
      createdAt: timestamp,
    });
    this.db.prepare("UPDATE tracking_tokens SET last_used_at = ? WHERE id = ?").run(timestamp, authorization.tokenId);
    const row = this.db.prepare(`${rawEventSelect()} WHERE id = ?`).get(authorization.normalized.id) as RawEvent;
    return parseEvent(row);
  }

  get(id: string): TrackingEvent | null {
    const row = this.db.prepare(`${rawEventSelect()} WHERE id = ?`).get(requireId(id, "Tracking event id")) as RawEvent | undefined;
    return row ? parseEvent(row) : null;
  }

  list(options: TrackingEventListOptions = {}): TrackingEvent[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.siteId !== undefined) {
      clauses.push("site_id = ?");
      params.push(requireId(options.siteId, "Tracking site id"));
    }
    if (options.eventType !== undefined) {
      clauses.push("event_type = ?");
      params.push(normalizeEventType(options.eventType));
    }
    if (options.from !== undefined) {
      clauses.push("occurred_at >= ?");
      params.push(normalizeTimestamp(options.from, "Tracking event from", null) as string);
    }
    if (options.to !== undefined) {
      clauses.push("occurred_at < ?");
      params.push(normalizeTimestamp(options.to, "Tracking event to", null) as string);
    }
    const limit = normalizeLimit(options.limit, 100);
    const offset = normalizeOffset(options.offset);
    params.push(limit, offset);
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`${rawEventSelect()}${where} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params).map((row) => parseEvent(row as RawEvent));
  }

  listAggregates(options: TrackingAggregateListOptions = {}): TrackingAggregate[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.siteId !== undefined) {
      clauses.push("site_id = ?");
      params.push(requireId(options.siteId, "Tracking site id"));
    }
    if (options.eventType !== undefined) {
      clauses.push("event_type = ?");
      params.push(normalizeEventType(options.eventType));
    }
    if (options.path !== undefined) {
      clauses.push("path = ?");
      params.push(normalizePath(options.path, "Tracking aggregate path"));
    }
    if (options.source !== undefined) {
      clauses.push("source = ?");
      params.push(normalizeOptionalText(options.source, "Tracking source", TRACKING_LIMITS.maxSourceLength) ?? "");
    }
    if (options.from !== undefined) clauses.push("day >= ?"), params.push(normalizeDateOnly(options.from, "Tracking aggregate from"));
    if (options.to !== undefined) clauses.push("day <= ?"), params.push(normalizeDateOnly(options.to, "Tracking aggregate to"));
    const limit = normalizeLimit(options.limit, 100);
    const offset = normalizeOffset(options.offset);
    params.push(limit, offset);
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`
      SELECT site_id AS siteId, day, event_type AS eventType, path, source,
        event_count AS eventCount, unique_visitors AS uniqueVisitors,
        first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt,
        rolled_up_at AS rolledUpAt
      FROM tracking_daily_aggregates${where}
      ORDER BY day DESC, event_type, path, source LIMIT ? OFFSET ?`).all(...params).map((row) => parseAggregate(row as RawAggregate));
  }

  rollup(options: TrackingRollupOptions = {}): TrackingRollupResult {
    const timestamp = normalizeTimestamp(options.now, "Tracking rollup timestamp", nowIso()) as string;
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.siteId !== undefined) {
      clauses.push("site_id = ?");
      params.push(requireId(options.siteId, "Tracking site id"));
    }
    if (options.before !== undefined) {
      clauses.push("occurred_at < ?");
      params.push(normalizeTimestamp(options.before, "Tracking rollup cutoff", null) as string);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.transaction(() => {
      const rows = this.db.prepare(`${rawEventSelect()}${where} ORDER BY occurred_at, id`).all(...params) as RawEvent[];
      const groups = new Map<string, {
        siteId: string;
        day: string;
        eventType: TrackingEventType;
        path: string;
        source: string;
        eventCount: number;
        visitors: Set<string>;
        firstSeenAt: string | null;
        lastSeenAt: string | null;
      }>();
      for (const row of rows) {
        const eventType = normalizeEventType(row.eventType);
        const source = row.source ?? "";
        const day = row.occurredAt.slice(0, 10);
        normalizeDateOnly(day, "Tracking event day");
        const key = `${row.siteId}\u0000${day}\u0000${eventType}\u0000${row.path}\u0000${source}`;
        const current = groups.get(key) ?? {
          siteId: row.siteId,
          day,
          eventType,
          path: row.path,
          source,
          eventCount: 0,
          visitors: new Set<string>(),
          firstSeenAt: null,
          lastSeenAt: null,
        };
        current.eventCount += 1;
        if (row.visitorHash) current.visitors.add(row.visitorHash);
        current.firstSeenAt = current.firstSeenAt === null || row.occurredAt < current.firstSeenAt ? row.occurredAt : current.firstSeenAt;
        current.lastSeenAt = current.lastSeenAt === null || row.occurredAt > current.lastSeenAt ? row.occurredAt : current.lastSeenAt;
        groups.set(key, current);
      }
      const upsert = this.db.prepare(`
        INSERT INTO tracking_daily_aggregates (
          site_id, day, event_type, path, source, event_count,
          unique_visitors, first_seen_at, last_seen_at, rolled_up_at
        ) VALUES (
          @siteId, @day, @eventType, @path, @source, @eventCount,
          @uniqueVisitors, @firstSeenAt, @lastSeenAt, @rolledUpAt
        )
        ON CONFLICT(site_id, day, event_type, path, source) DO UPDATE SET
          event_count = excluded.event_count,
          unique_visitors = excluded.unique_visitors,
          first_seen_at = excluded.first_seen_at,
          last_seen_at = excluded.last_seen_at,
          rolled_up_at = excluded.rolled_up_at`);
      for (const group of groups.values()) {
        upsert.run({
          siteId: group.siteId,
          day: group.day,
          eventType: group.eventType,
          path: group.path,
          source: group.source,
          eventCount: group.eventCount,
          uniqueVisitors: group.visitors.size,
          firstSeenAt: group.firstSeenAt,
          lastSeenAt: group.lastSeenAt,
          rolledUpAt: timestamp,
        });
      }
      const siteIds = options.siteId
        ? [requireId(options.siteId, "Tracking site id")]
        : (this.db.prepare("SELECT site_id AS siteId FROM tracking_retention").all() as Array<{ siteId: string }>).map((row) => row.siteId);
      if (siteIds.length > 0) {
        const updateRetention = this.db.prepare("UPDATE tracking_retention SET last_rollup_at = ?, updated_at = ? WHERE site_id = ?");
        for (const siteId of siteIds) updateRetention.run(timestamp, timestamp, siteId);
      }
      return { aggregateCount: groups.size, eventCount: rows.length };
    })();
  }

  prune(options: TrackingPruneOptions = {}): TrackingPruneResult {
    const timestamp = normalizeTimestamp(options.now, "Tracking prune timestamp", nowIso()) as string;
    const batchSize = boundedInteger(options.batchSize, "Tracking prune batch size", 1, 10_000, 1_000);
    const siteIds = options.siteId
      ? [requireId(options.siteId, "Tracking site id")]
      : (this.db.prepare("SELECT site_id AS siteId FROM tracking_retention ORDER BY site_id").all() as Array<{ siteId: string }>).map((row) => row.siteId);
    let eventsDeleted = 0;
    let aggregatesDeleted = 0;
    this.db.transaction(() => {
      for (const siteId of siteIds) {
        const retention = this.sites.getRetention(siteId);
        const eventDays = retentionDays(options.eventRetentionDays, "Event retention days", retention.eventRetentionDays);
        const aggregateDays = retentionDays(options.aggregateRetentionDays, "Aggregate retention days", retention.aggregateRetentionDays);
        // Roll up before deleting raw rows so page-view totals survive the
        // bounded event retention window.
        this.rollup({ siteId, now: timestamp });
        const cutoff = new Date(new Date(timestamp).getTime() - eventDays * 86_400_000).toISOString();
        const deleteEvents = this.db.prepare(`
          DELETE FROM tracking_events
          WHERE id IN (
            SELECT id FROM tracking_events
            WHERE site_id = ? AND occurred_at < ?
            ORDER BY occurred_at, id LIMIT ?
          )`);
        let deleted: number;
        do {
          deleted = Number(deleteEvents.run(siteId, cutoff, batchSize).changes);
          eventsDeleted += deleted;
        } while (deleted === batchSize);
        const aggregateCutoff = new Date(Date.UTC(
          new Date(timestamp).getUTCFullYear(),
          new Date(timestamp).getUTCMonth(),
          new Date(timestamp).getUTCDate(),
        ) - aggregateDays * 86_400_000).toISOString().slice(0, 10);
        const aggregateDeleteResult = this.db.prepare("DELETE FROM tracking_daily_aggregates WHERE site_id = ? AND day < ?").run(siteId, aggregateCutoff);
        aggregatesDeleted += Number(aggregateDeleteResult.changes);
        this.db.prepare("UPDATE tracking_retention SET last_pruned_at = ?, updated_at = ? WHERE site_id = ?").run(timestamp, timestamp, siteId);
      }
    })();
    return { eventsDeleted, aggregatesDeleted, sitesProcessed: siteIds.length };
  }
}

// Function helpers keep the store convenient for the rest of the plugin and
// mirror the existing db module API while preserving a single implementation.
export function createConnectionStore(db: Db): ConnectionStore {
  return new ConnectionStore(db);
}

export const createConnectionsStore = createConnectionStore;

export function upsertConnection(db: Db, input: ConnectionUpsertInput): Connection {
  return new ConnectionStore(db).upsert(input);
}

export function getConnection(db: Db, id: string): Connection | null {
  return new ConnectionStore(db).get(id);
}

export function listConnections(db: Db, options?: { provider?: ConnectionProvider | string; enabled?: boolean; status?: ConnectionStatus | string }): Connection[] {
  return new ConnectionStore(db).list(options);
}

export function setConnectionStatus(db: Db, id: string, input: ConnectionStatusInput | ConnectionStatus | string): Connection {
  return new ConnectionStore(db).setStatus(id, input);
}

export const updateConnectionStatus = setConnectionStatus;

export function disableConnection(db: Db, id: string, at?: string): Connection {
  return new ConnectionStore(db).disable(id, at);
}

export function enableConnection(db: Db, id: string, at?: string): Connection {
  return new ConnectionStore(db).enable(id, at);
}

export function recordConnectionSyncSuccess(db: Db, id: string, input: SyncSuccessInput | string, cursor?: string | null, at?: string | Date | null): Connection {
  return new ConnectionStore(db).recordSyncSuccess(id, input, cursor, at);
}

export const markConnectionSyncSuccess = recordConnectionSyncSuccess;
export const syncConnectionSuccess = recordConnectionSyncSuccess;
export const markSyncSuccess = recordConnectionSyncSuccess;

export function recordConnectionSyncFailure(db: Db, id: string, input: SyncFailureInput | string, errorMessage?: string | null, at?: string | Date | null): Connection {
  return new ConnectionStore(db).recordSyncFailure(id, input, errorMessage, at);
}

export const markConnectionSyncFailure = recordConnectionSyncFailure;
export const syncConnectionFailure = recordConnectionSyncFailure;
export const markSyncFailure = recordConnectionSyncFailure;

export function getConnectionSyncCursor(db: Db, connectionId: string, stream: string): SyncCursor | null {
  return new ConnectionStore(db).getSyncCursor(connectionId, stream);
}

export function listConnectionSyncCursors(db: Db, connectionId: string): SyncCursor[] {
  return new ConnectionStore(db).listSyncCursors(connectionId);
}

export function createTrackingSite(db: Db, input: TrackingSiteCreateInput): ProvisionedTrackingSite {
  return new TrackingSiteStore(db).createWithToken(input);
}

export const provisionTrackingSite = createTrackingSite;

export function createSite(db: Db, input: TrackingSiteCreateInput): TrackingSite {
  return new TrackingSiteStore(db).create(input);
}

export function getTrackingSite(db: Db, id: string): TrackingSite | null {
  return new TrackingSiteStore(db).get(id);
}

export function getTrackingSiteByKey(db: Db, siteKey: string): TrackingSite | null {
  return new TrackingSiteStore(db).getByKey(siteKey);
}

export function verifyTrackingSite(db: Db, id: string, input?: TrackingSiteVerifyInput | string): TrackingSite {
  return new TrackingSiteStore(db).verify(id, input);
}

export function pauseTrackingSite(db: Db, id: string, paused = true, at?: string): TrackingSite {
  return new TrackingSiteStore(db).pause(id, paused, at);
}

export function rotateTrackingSite(db: Db, id: string, at?: string): ProvisionedTrackingSite {
  return new TrackingSiteStore(db).rotate(id, at);
}

export function listTrackingSites(db: Db, options?: TrackingSiteListOptions): TrackingSite[] {
  return new TrackingSiteStore(db).list(options);
}

export const verifySite = verifyTrackingSite;
export const pauseSite = pauseTrackingSite;
export const rotateSite = rotateTrackingSite;
export const listSites = listTrackingSites;

export function createTrackingToken(db: Db, siteId: string, at?: string): ProvisionedTrackingToken {
  return new TrackingSiteStore(db).createTrackingToken(siteId, at);
}

export function createIntakeToken(db: Db, at?: string): ProvisionedTrackingToken {
  return new TrackingSiteStore(db).createIntakeToken(at);
}

export function rotateTrackingToken(db: Db, siteId: string, at?: string): ProvisionedTrackingToken {
  return new TrackingSiteStore(db).rotateTrackingToken(siteId, at);
}

export function listTrackingTokens(db: Db, siteId?: string, scope?: TokenScope | string): TrackingToken[] {
  return new TrackingSiteStore(db).listTokens(siteId, scope);
}

export function revokeTrackingToken(db: Db, tokenId: string, at?: string): TrackingToken {
  return new TrackingSiteStore(db).revokeToken(tokenId, at);
}

export function setTrackingRetention(db: Db, siteId: string, input: TrackingRetentionInput): TrackingRetention {
  return new TrackingSiteStore(db).setRetention(siteId, input);
}

export function getTrackingRetention(db: Db, siteId: string): TrackingRetention {
  return new TrackingSiteStore(db).getRetention(siteId);
}

export function ingestTrackingEvent(db: Db, input: TrackingEventInput): TrackingEvent {
  return new TrackingStore(db).ingest(input);
}

export const ingestEvent = ingestTrackingEvent;

export function ingestTrackingEvents(db: Db, inputs: readonly TrackingEventInput[]): TrackingEvent[] {
  return new TrackingStore(db).ingestBatch(inputs);
}

export const ingestEvents = ingestTrackingEvents;

export function getTrackingEvent(db: Db, id: string): TrackingEvent | null {
  return new TrackingStore(db).get(id);
}

export function listTrackingEvents(db: Db, options?: TrackingEventListOptions): TrackingEvent[] {
  return new TrackingStore(db).list(options);
}

export const listEvents = listTrackingEvents;

export function rollupTrackingEvents(db: Db, options?: TrackingRollupOptions): TrackingRollupResult {
  return new TrackingStore(db).rollup(options);
}

export const rollupTracking = rollupTrackingEvents;
export const rollupEvents = rollupTrackingEvents;

export function listTrackingAggregates(db: Db, options?: TrackingAggregateListOptions): TrackingAggregate[] {
  return new TrackingStore(db).listAggregates(options);
}

export const readTrackingAggregates = listTrackingAggregates;
export const getTrackingAggregates = listTrackingAggregates;

export function pruneTrackingData(db: Db, options?: TrackingPruneOptions): TrackingPruneResult {
  return new TrackingStore(db).prune(options);
}

export const pruneTracking = pruneTrackingData;
export const pruneEvents = pruneTrackingData;

// Compatibility aliases for callers that use the shorter site/token nouns.
export const createTrackingSiteStore = (db: Db): TrackingSiteStore => new TrackingSiteStore(db);
export const createTrackingStore = (db: Db): TrackingStore => new TrackingStore(db);
