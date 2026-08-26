import { z } from "zod";
import { idSchema, rpcJsonObjectSchema, rpcJsonValueSchema } from "./core.js";
import { isSensitiveTrackingValue } from "../lib/tracking-privacy.js";

/** Providers that have persistence support. Authorization is host-owned. */
export const connectionProviders = ["GOOGLE", "MICROSOFT", "SLACK"] as const;
export const CONNECTION_PROVIDERS = connectionProviders;
export const connectionProviderSchema = z.enum(connectionProviders);
export type ConnectionProvider = z.infer<typeof connectionProviderSchema>;

export const connectionStatuses = [
  "DISCONNECTED",
  "CONNECTING",
  "CONNECTED",
  "DEGRADED",
  "ERROR",
  "DISABLED",
] as const;
export const CONNECTION_STATUSES = connectionStatuses;
export const connectionStatusSchema = z.enum(connectionStatuses);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const tokenScopes = ["INTAKE", "TRACKING"] as const;
export const TOKEN_SCOPES = tokenScopes;
export const tokenScopeSchema = z.enum(tokenScopes);
export type TokenScope = z.infer<typeof tokenScopeSchema>;

export const trackingEventTypes = [
  "PAGE_VIEW",
  "FORM_SUBMIT",
  "IDENTIFY",
  "CUSTOM",
] as const;
export const TRACKING_EVENT_TYPES = trackingEventTypes;
export const trackingEventTypeSchema = z.enum(trackingEventTypes);
export type TrackingEventType = z.infer<typeof trackingEventTypeSchema>;

export const trackingSiteStatuses = ["ACTIVE", "PAUSED"] as const;
export const TRACKING_SITE_STATUSES = trackingSiteStatuses;
export const trackingSiteStatusSchema = z.enum(trackingSiteStatuses);
export type TrackingSiteStatus = z.infer<typeof trackingSiteStatusSchema>;

export const trackingVerificationStatuses = ["PENDING", "VERIFIED"] as const;
export const TRACKING_VERIFICATION_STATUSES = trackingVerificationStatuses;
export const trackingVerificationStatusSchema = z.enum(trackingVerificationStatuses);
export type TrackingVerificationStatus = z.infer<typeof trackingVerificationStatusSchema>;

export const trackingLimits = {
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
export const TRACKING_LIMITS = trackingLimits;

const boundedId = idSchema.max(256);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const optionalNullableText = (max: number) => nullableText(max).optional();

/** RPC timestamps are serialized strings; class instances and invalid dates are rejected. */
export const connectionTimestampSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), "Use a valid ISO timestamp.");
export type ConnectionTimestamp = z.infer<typeof connectionTimestampSchema>;

const nullableTimestamp = connectionTimestampSchema.nullable();
const optionalNullableTimestamp = nullableTimestamp.optional();

const finiteNonNegativeInteger = z.number().finite().int().min(0);
const boundedLimit = z.number().finite().int().min(1).max(1_000).default(100);
const boundedOffset = z.number().finite().int().min(0).max(1_000_000).default(0);
const boundedRetentionDays = z.number().finite().int().min(1).max(3_650);

const sensitiveKey = /(?:access[_\-.]?token|refresh[_\-.]?token|token|secret|password|passcode|authorization|cookie|api[_\-.]?key|client[_\-.]?secret|private[_\-.]?key)/i;

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: "custom", path, message });
}

function walkJson(
  value: unknown,
  onKey: (key: string, path: (string | number)[]) => string | undefined,
  path: (string | number)[] = [],
  depth = 0,
): string | undefined {
  if (depth > 5) return "JSON is too deeply nested.";
  if (Array.isArray(value)) {
    if (value.length > 64) return "JSON arrays may contain at most 64 items.";
    for (let index = 0; index < value.length; index += 1) {
      const issue = walkJson(value[index], onKey, [...path, index], depth + 1);
      if (issue) return issue;
    }
    return undefined;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      const keyIssue = onKey(key, [...path, key]);
      if (keyIssue) return keyIssue;
      const issue = walkJson(item, onKey, [...path, key], depth + 1);
      if (issue) return issue;
    }
  }
  return undefined;
}

/** Non-secret provider metadata. OAuth credentials belong in BB secret settings. */
export const connectionConfigurationSchema = rpcJsonObjectSchema
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > 64) {
      addIssue(ctx, [], "Connection configuration has too many keys.");
    }
    const issue = walkJson(value, (key) => {
      if (key.length > 128) return "Connection configuration keys are too long.";
      if (sensitiveKey.test(key)) return "Connection configuration cannot contain secrets.";
      return undefined;
    });
    if (issue) addIssue(ctx, [], issue);
    const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (bytes > 8_192) addIssue(ctx, [], "Connection configuration is too large.");
  });
export type ConnectionConfiguration = z.infer<typeof connectionConfigurationSchema>;

export const connectionHealthSchema = z
  .object({
    status: connectionStatusSchema,
    lastCheckedAt: nullableTimestamp,
    lastSuccessAt: nullableTimestamp,
    lastFailureAt: nullableTimestamp,
    failureCode: nullableText(128),
    failureMessage: nullableText(1_024),
    consecutiveFailures: finiteNonNegativeInteger,
    updatedAt: connectionTimestampSchema,
  })
  .strict();
export type ConnectionHealth = z.infer<typeof connectionHealthSchema>;

export const connectionSchema = z
  .object({
    id: boundedId,
    provider: connectionProviderSchema,
    externalAccountId: optionalNullableText(512),
    displayName: optionalNullableText(256),
    configuration: connectionConfigurationSchema,
    scopes: z.array(text(256)).max(128),
    enabled: z.boolean(),
    health: connectionHealthSchema,
    createdAt: connectionTimestampSchema,
    updatedAt: connectionTimestampSchema,
  })
  .strict()
  .transform((value) => ({
    ...value,
    externalAccountId: value.externalAccountId ?? null,
    displayName: value.displayName ?? null,
  }));
export type Connection = z.infer<typeof connectionSchema>;

export const connectionListInputSchema = z
  .object({
    provider: connectionProviderSchema.optional(),
    enabled: z.boolean().optional(),
    status: connectionStatusSchema.optional(),
  })
  .strict();

export const connectionIdInputSchema = z.object({ id: boundedId }).strict();

export const connectionUpsertInputSchema = z
  .object({
    id: boundedId.optional(),
    provider: connectionProviderSchema,
    externalAccountId: optionalNullableText(512),
    displayName: optionalNullableText(256),
    configuration: connectionConfigurationSchema.nullable().optional(),
    scopes: z.array(text(256)).max(128).optional(),
    enabled: z.boolean().optional(),
    status: connectionStatusSchema.optional(),
    checkedAt: optionalNullableTimestamp,
  })
  .strict();
export type ConnectionUpsertInput = z.infer<typeof connectionUpsertInputSchema>;

export const connectionStatusInputSchema = z
  .object({
    id: boundedId,
    status: connectionStatusSchema,
    checkedAt: optionalNullableTimestamp,
  })
  .strict();

export const connectionDisableInputSchema = z
  .object({
    id: boundedId,
    at: connectionTimestampSchema.optional(),
  })
  .strict();

export const syncCursorSchema = z
  .object({
    id: boundedId,
    connectionId: boundedId,
    stream: text(256),
    cursor: nullableText(4_096),
    lastSuccessAt: nullableTimestamp,
    lastFailureAt: nullableTimestamp,
    failureCode: nullableText(128),
    failureMessage: nullableText(1_024),
    createdAt: connectionTimestampSchema,
    updatedAt: connectionTimestampSchema,
  })
  .strict();
export type SyncCursor = z.infer<typeof syncCursorSchema>;

const syncBaseShape = {
  connectionId: boundedId,
  stream: text(256),
  at: connectionTimestampSchema.nullable().optional(),
};

export const syncSuccessInputSchema = z
  .object({
    ...syncBaseShape,
    cursor: nullableText(4_096).optional(),
  })
  .strict();
export type SyncSuccessInput = z.infer<typeof syncSuccessInputSchema>;

export const syncFailureInputSchema = z
  .object({
    ...syncBaseShape,
    errorCode: nullableText(128).optional(),
    errorMessage: nullableText(1_024).optional(),
  })
  .strict();
export type SyncFailureInput = z.infer<typeof syncFailureInputSchema>;

/** A single result form is useful to sync workers that do not split success/failure calls. */
export const connectionSyncResultInputSchema = z.discriminatedUnion("result", [
  z
    .object({
      ...syncBaseShape,
      result: z.literal("SUCCESS"),
      cursor: nullableText(4_096).optional(),
    })
    .strict(),
  z
    .object({
      ...syncBaseShape,
      result: z.literal("FAILURE"),
      errorCode: nullableText(128).optional(),
      errorMessage: nullableText(1_024).optional(),
    })
    .strict(),
]);

export const connectionDiagnosticsSchema = z
  .object({
    connection: connectionSchema,
    syncCursors: z.array(syncCursorSchema).max(10_000),
  })
  .strict();

const hostnamePattern = /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$|^localhost$|^\d{1,3}(?:\.\d{1,3}){3}$/i;

function validHostname(value: string): boolean {
  const input = value.trim().replace(/\.$/u, "");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//iu.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(candidate);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      url.hostname.length <= 253 &&
      hostnamePattern.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export const allowedDomainSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine(
    (value) => value.startsWith("*.")
      ? validHostname(value.slice(2))
      : !value.includes("*") && validHostname(value),
    "Use a hostname, URL without a path, or *.example.com.",
  );

export const siteKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Site keys may contain letters, numbers, underscores, and hyphens.");

export const trackingRetentionSchema = z
  .object({
    siteId: boundedId,
    eventRetentionDays: boundedRetentionDays,
    aggregateRetentionDays: boundedRetentionDays,
    lastRollupAt: nullableTimestamp,
    lastPrunedAt: nullableTimestamp,
    updatedAt: connectionTimestampSchema,
  })
  .strict();
export type TrackingRetention = z.infer<typeof trackingRetentionSchema>;

export const trackingSiteSchema = z
  .object({
    id: boundedId,
    siteKey: siteKeySchema,
    name: text(200),
    allowedDomains: z.array(allowedDomainSchema).min(1).max(32),
    status: trackingSiteStatusSchema,
    verificationStatus: trackingVerificationStatusSchema,
    verifiedAt: nullableTimestamp,
    pausedAt: nullableTimestamp,
    rotatedAt: nullableTimestamp,
    retention: trackingRetentionSchema,
    createdAt: connectionTimestampSchema,
    updatedAt: connectionTimestampSchema,
  })
  .strict();
export type TrackingSite = z.infer<typeof trackingSiteSchema>;

export const trackingSiteCreateInputSchema = z
  .object({
    id: boundedId.optional(),
    siteKey: siteKeySchema.optional(),
    name: text(200),
    allowedDomains: z.array(allowedDomainSchema).min(1).max(32).optional(),
    domains: z.array(allowedDomainSchema).min(1).max(32).optional(),
    eventRetentionDays: boundedRetentionDays.optional(),
    aggregateRetentionDays: boundedRetentionDays.optional(),
  })
  .strict()
  .refine(
    (value) => value.allowedDomains !== undefined || value.domains !== undefined,
    "At least one allowed domain is required.",
  )
  .refine(
    (value) => value.allowedDomains === undefined || value.domains === undefined ||
      JSON.stringify(value.allowedDomains) === JSON.stringify(value.domains),
    "Use either allowedDomains or domains, or provide the same values in both.",
  );
export type TrackingSiteCreateInput = z.infer<typeof trackingSiteCreateInputSchema>;

export const trackingSiteListInputSchema = z
  .object({
    status: trackingSiteStatusSchema.optional(),
    verificationStatus: trackingVerificationStatusSchema.optional(),
    limit: boundedLimit,
    offset: boundedOffset,
  })
  .strict();

export const trackingSiteVerifyInputSchema = z
  .object({
    id: boundedId,
    domain: allowedDomainSchema.optional(),
    verifiedAt: optionalNullableTimestamp,
  })
  .strict();

export const trackingSitePauseInputSchema = z
  .object({
    id: boundedId,
    paused: z.boolean().default(true),
    at: connectionTimestampSchema.optional(),
  })
  .strict();

export const trackingSiteRotateInputSchema = z
  .object({
    id: boundedId,
    at: connectionTimestampSchema.optional(),
  })
  .strict();

export const trackingTokenSchema = z
  .object({
    id: boundedId,
    siteId: boundedId.nullable(),
    scope: tokenScopeSchema,
    /** This is a non-secret prefix of a hash, never the hash itself. */
    tokenHint: z.string().regex(/^[a-f0-9]{12}$/i),
    createdAt: connectionTimestampSchema,
    lastUsedAt: nullableTimestamp,
    revokedAt: nullableTimestamp,
  })
  .strict();
export type TrackingToken = z.infer<typeof trackingTokenSchema>;

const trackingSecretSchema = z
  .string()
  .trim()
  .min(16)
  .max(trackingLimits.maxTokenLength)
  .regex(/^crm_(?:trk|intake)_[A-Za-z0-9_-]+$/, "Invalid one-time token format.");

export const provisionedTrackingTokenSchema = z
  .object({
    ...trackingTokenSchema.shape,
    token: trackingSecretSchema,
    secret: trackingSecretSchema,
  })
  .strict()
  .refine((value) => value.token === value.secret, "Token aliases must match.");
export type ProvisionedTrackingToken = z.infer<typeof provisionedTrackingTokenSchema>;

export const provisionedTrackingSiteSchema = z
  .object({
    ...trackingSiteSchema.shape,
    site: trackingSiteSchema,
    token: trackingSecretSchema,
    secret: trackingSecretSchema,
    tokenId: boundedId,
  })
  .strict()
  .refine((value) => value.token === value.secret, "Token aliases must match.");
export type ProvisionedTrackingSite = z.infer<typeof provisionedTrackingSiteSchema>;

const eventTypeInputValues = [
  "PAGE_VIEW",
  "FORM_SUBMIT",
  "IDENTIFY",
  "CUSTOM",
  "PAGEVIEW",
  "FORMSUBMIT",
  "page_view",
  "form_submit",
  "identify",
  "custom",
  "pageview",
  "formsubmit",
  "page-view",
  "form-submit",
  "PAGE VIEW",
  "FORM SUBMIT",
] as const;
const trackingEventTypeInputSchema = z.enum(eventTypeInputValues);

function canonicalEventType(value: string): TrackingEventType | null {
  const normalized = value.trim().toUpperCase().replace(/[ -]/gu, "_");
  if (normalized === "PAGEVIEW") return "PAGE_VIEW";
  if (normalized === "FORMSUBMIT") return "FORM_SUBMIT";
  return trackingEventTypes.includes(normalized as TrackingEventType)
    ? normalized as TrackingEventType
    : null;
}

const sensitiveTrackingProperty = /(?:password|passcode|secret|token|authorization|cookie|credit[_\-.]?card|card[_\-.]?(?:number|cvc|cvv)|cvv|cvc|ssn|social[_\-.]?security|api[_\-.]?key|access[_\-.]?key|refresh[_\-.]?token|email|phone|name|address)/i;

export const trackingPropertiesSchema = z
  // Keep the inferred output compatible with the database's JSON object type;
  // the refinement below narrows accepted collector values to privacy-safe
  // scalar values.
  .record(z.string(), rpcJsonValueSchema)
  .superRefine((value, ctx) => {
    const keys = Object.keys(value);
    if (keys.length > trackingLimits.maxPropertyCount) {
      addIssue(ctx, [], "Tracking properties contain too many keys.");
    }
    for (const key of keys) {
      const normalized = key.trim().toLowerCase();
      if (normalized.length < 1 || normalized.length > trackingLimits.maxPropertyKeyLength) {
        addIssue(ctx, [key], "Tracking property key is too long or empty.");
      } else if (!/^[a-z][a-z0-9_.-]*$/u.test(normalized)) {
        addIssue(ctx, [key], "Tracking property key has invalid characters.");
      } else if (sensitiveTrackingProperty.test(normalized)) {
        addIssue(ctx, [key], "Sensitive tracking properties are not allowed.");
      } else if (isSensitiveTrackingValue(value[key])) {
        addIssue(ctx, [key], "Sensitive tracking property values are not allowed.");
      } else if (
        value[key] !== null &&
        typeof value[key] !== "string" &&
        typeof value[key] !== "boolean" &&
        !(typeof value[key] === "number" && Number.isFinite(value[key]))
      ) {
        addIssue(ctx, [key], "Tracking property values must be scalar JSON values.");
      } else if (/(?:url|uri|path|href|referrer|location)/iu.test(normalized) &&
        typeof value[key] === "string" && /[?#]/u.test(value[key])) {
        addIssue(ctx, [key], "Tracking URL properties must not contain a query string or fragment.");
      }
    }
    const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (bytes > trackingLimits.maxPropertiesBytes) {
      addIssue(ctx, [], "Tracking properties are too large.");
    }
  });
export type TrackingProperties = z.infer<typeof trackingPropertiesSchema>;

export const trackingOriginSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password &&
        (url.pathname === "" || url.pathname === "/") &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "Tracking origin must be an HTTP(S) origin without a path, query, or fragment.");

const pathOrUrlSchema = z.string().trim().min(1).max(4_096).refine((value) => {
  if (/[?#]/u.test(value)) return false;
  if (value.startsWith("/")) return value.length <= trackingLimits.maxPathLength;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.search &&
      !url.hash &&
      url.pathname.length <= trackingLimits.maxPathLength
    );
  } catch {
    return false;
  }
}, "Use a path or absolute HTTP(S) URL without a query string or fragment.");

const referrerSchema = z.string().trim().max(4_096).nullable().optional().refine((value) => {
  if (value === undefined || value === null || value === "") return true;
  if (/[?#]/u.test(value)) return false;
  if (value.startsWith("/")) return value.length <= trackingLimits.maxPathLength;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.pathname.length <= trackingLimits.maxPathLength;
  } catch {
    return false;
  }
}, "Referrer must be a path or URL without a query string or fragment.");

export const trackingEventInputSchema = z
  .object({
    id: boundedId.optional(),
    siteId: boundedId.optional(),
    siteKey: siteKeySchema.optional(),
    token: z
      .string()
      .trim()
      .min(16)
      .max(trackingLimits.maxTokenLength)
      .regex(/^crm_trk_[A-Za-z0-9_-]+$/, "A tracking token is required."),
    eventType: trackingEventTypeInputSchema.optional(),
    type: trackingEventTypeInputSchema.optional(),
    origin: trackingOriginSchema,
    path: pathOrUrlSchema.optional(),
    pageUrl: pathOrUrlSchema.optional(),
    url: pathOrUrlSchema.optional(),
    referrer: referrerSchema,
    referrerUrl: referrerSchema,
    visitorId: optionalNullableText(256),
    sessionId: optionalNullableText(256),
    source: optionalNullableText(trackingLimits.maxSourceLength),
    properties: trackingPropertiesSchema.nullable().optional(),
    eventKey: optionalNullableText(128),
    occurredAt: optionalNullableTimestamp,
    receivedAt: optionalNullableTimestamp,
  })
  .strict()
  .refine((value) => value.siteId !== undefined || value.siteKey !== undefined, "A site id or site key is required.")
  .refine((value) => value.eventType !== undefined || value.type !== undefined, "An event type is required.")
  .refine((value) => {
    if (value.eventType === undefined || value.type === undefined) return true;
    return canonicalEventType(value.eventType) === canonicalEventType(value.type);
  }, "eventType and type must identify the same event.")
  .refine((value) => {
    const supplied = [value.path, value.pageUrl, value.url].filter((item) => item !== undefined);
    return supplied.length <= 1;
  }, "Provide only one of path, pageUrl, or url.")
  .refine((value) => {
    const source = value.source;
    return source === undefined || source === null || !/[?#]/u.test(source);
  }, "Tracking source must not contain a query string or fragment.");
export type TrackingEventInput = z.infer<typeof trackingEventInputSchema>;

export const sanitizedTrackingEventSchema = z
  .object({
    id: boundedId,
    eventType: trackingEventTypeSchema,
    type: trackingEventTypeSchema,
    occurredAt: connectionTimestampSchema,
    origin: trackingOriginSchema,
    path: z.string().trim().min(1).max(trackingLimits.maxPathLength).regex(/^\//u),
    referrerPath: z.string().trim().min(1).max(trackingLimits.maxPathLength).regex(/^\//u).nullable(),
    visitorHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
    sessionHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
    source: optionalNullableText(trackingLimits.maxSourceLength),
    properties: trackingPropertiesSchema,
    eventKey: nullableText(128),
    receivedAt: connectionTimestampSchema,
  })
  .strict();

export const trackingEventSchema = z
  .object({
    ...sanitizedTrackingEventSchema.shape,
    siteId: boundedId,
    tokenId: boundedId,
    createdAt: connectionTimestampSchema,
  })
  .strict();
export type TrackingEvent = z.infer<typeof trackingEventSchema>;

export const trackingEventBatchInputSchema = z
  .object({
    events: z.array(trackingEventInputSchema).min(1).max(trackingLimits.maxBatchSize),
  })
  .strict();

export const trackingEventIdInputSchema = z.object({ id: boundedId }).strict();

export const trackingEventListInputSchema = z
  .object({
    siteId: boundedId.optional(),
    eventType: trackingEventTypeSchema.optional(),
    from: connectionTimestampSchema.optional(),
    to: connectionTimestampSchema.optional(),
    limit: boundedLimit,
    offset: boundedOffset,
  })
  .strict()
  .refine((value) => value.from === undefined || value.to === undefined || Date.parse(value.from) < Date.parse(value.to), "from must be before to.");

export const trackingAggregateSchema = z
  .object({
    siteId: boundedId,
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    eventType: trackingEventTypeSchema,
    path: z.string().trim().min(1).max(trackingLimits.maxPathLength).regex(/^\//u),
    source: nullableText(trackingLimits.maxSourceLength),
    eventCount: finiteNonNegativeInteger,
    uniqueVisitors: finiteNonNegativeInteger,
    firstSeenAt: nullableTimestamp,
    lastSeenAt: nullableTimestamp,
    rolledUpAt: connectionTimestampSchema,
  })
  .strict();
export type TrackingAggregate = z.infer<typeof trackingAggregateSchema>;

export const trackingAggregateListInputSchema = z
  .object({
    siteId: boundedId.optional(),
    eventType: trackingEventTypeSchema.optional(),
    path: z.string().trim().min(1).max(trackingLimits.maxPathLength).regex(/^\//u).optional(),
    source: optionalNullableText(trackingLimits.maxSourceLength),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    limit: boundedLimit,
    offset: boundedOffset,
  })
  .strict()
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, "from must be on or before to.");

export const trackingRollupInputSchema = z
  .object({
    siteId: boundedId.optional(),
    before: connectionTimestampSchema.optional(),
    now: connectionTimestampSchema.optional(),
  })
  .strict();

export const trackingRollupResultSchema = z
  .object({
    aggregateCount: finiteNonNegativeInteger,
    eventCount: finiteNonNegativeInteger,
  })
  .strict();

export const trackingPruneInputSchema = z
  .object({
    siteId: boundedId.optional(),
    eventRetentionDays: boundedRetentionDays.optional(),
    aggregateRetentionDays: boundedRetentionDays.optional(),
    now: connectionTimestampSchema.optional(),
    batchSize: z.number().finite().int().min(1).max(10_000).default(1_000),
  })
  .strict();

export const trackingPruneResultSchema = z
  .object({
    eventsDeleted: finiteNonNegativeInteger,
    aggregatesDeleted: finiteNonNegativeInteger,
    sitesProcessed: finiteNonNegativeInteger,
  })
  .strict();

export const trackingTokenProvisionInputSchema = z
  .object({
    scope: z.literal("TRACKING").default("TRACKING"),
    siteId: boundedId,
    at: connectionTimestampSchema.optional(),
  })
  .strict();

export const trackingTokenRotateInputSchema = z
  .object({
    siteId: boundedId,
    at: connectionTimestampSchema.optional(),
  })
  .strict();

export const trackingTokenRevokeInputSchema = z
  .object({
    id: boundedId,
    at: connectionTimestampSchema.optional(),
  })
  .strict();

export const trackingTokenListInputSchema = z
  .object({
    siteId: boundedId.optional(),
    scope: tokenScopeSchema.optional(),
  })
  .strict();

// Friendly aliases make the contract discoverable to callers that use nouns
// rather than the RPC method prefixes.
export const connectionListSchema = z.array(connectionSchema);
export const trackingSiteListSchema = z.array(trackingSiteSchema);
export const trackingTokenListSchema = z.array(trackingTokenSchema);
export const trackingEventListSchema = z.array(trackingEventSchema);
export const trackingAggregateListSchema = z.array(trackingAggregateSchema);

// Output/input aliases follow the naming used by the other CRM contracts.
export const connectionListOutputSchema = connectionListSchema;
export const connectionSyncSuccessInputSchema = syncSuccessInputSchema;
export const connectionSyncFailureInputSchema = syncFailureInputSchema;
export const connectionSyncCursorSchema = syncCursorSchema;
export const connectionDiagnosticsOutputSchema = connectionDiagnosticsSchema;
export const trackingSiteListOutputSchema = trackingSiteListSchema;
export const trackingTokenListOutputSchema = trackingTokenListSchema;
export const trackingEventListOutputSchema = trackingEventListSchema;
export const trackingAggregateListOutputSchema = trackingAggregateListSchema;
export const trackingEventsBatchInputSchema = trackingEventBatchInputSchema;
