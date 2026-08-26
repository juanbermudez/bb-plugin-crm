import { z } from "zod";

/**
 * Values that can cross the BB RPC boundary.  In particular, this schema does
 * not accept class instances, Date objects, bigint values, or non-finite
 * numbers.
 */
export type RpcJsonValue =
  | string
  | number
  | boolean
  | null
  | RpcJsonValue[]
  | { [key: string]: RpcJsonValue };

export const rpcJsonValueSchema: z.ZodType<RpcJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(rpcJsonValueSchema),
    z.record(z.string(), rpcJsonValueSchema),
  ]),
);

export const rpcJsonObjectSchema = z.record(
  z.string(),
  rpcJsonValueSchema,
);

export type RpcJsonObject = z.infer<typeof rpcJsonObjectSchema>;

const idValue = z.string().trim().min(1, "An id is required.");
const nonEmptyText = z.string().trim().min(1);
const optionalText = z.string().trim().optional();
const nullableText = z.string().trim().nullable();
const optionalNullableText = nullableText.optional();
const sourceUrl = z.string().trim().url("Use an absolute source URL.");
const optionalNullableSourceUrl = sourceUrl.nullable().optional();
const contactImageUrl = z.string().trim().refine(
  (value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  },
  "Use an HTTPS portrait URL.",
);
const optionalNullableContactImageUrl = contactImageUrl.nullable().optional();

/** Serialized timestamps are strings at the RPC boundary, never Date values. */
export const timestampSchema = z.string().trim().min(1);
export type Timestamp = z.infer<typeof timestampSchema>;

/** Date-only and date-time values are both used by the CRM. */
export const dateValueSchema = z
  .string()
  .trim()
  .min(1, "A date is required.")
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) ||
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(
        value,
      ),
    "Use an ISO date or date-time.",
  );
export type DateValue = z.infer<typeof dateValueSchema>;

export const idSchema = idValue;
export type Id = z.infer<typeof idSchema>;

export const DEAL_STAGES = [
  "DEMO_BOOKED",
  "QUALIFIED_TO_BUY",
  "UNQUALIFIED_TO_BUY",
  "DECISION_MAKER_BOUGHT_IN",
  "CONTRACT_SENT",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;

export const ACTIVITY_TYPES = [
  "NOTE",
  "CALL",
  "EMAIL",
  "MEETING",
  "TASK",
  "STAGE_CHANGE",
  "ENRICHMENT",
] as const;

export const COMPOSABLE_ACTIVITY_TYPES = [
  "NOTE",
  "CALL",
  "EMAIL",
  "MEETING",
  "TASK",
] as const;

export const ENRICHMENT_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETE",
  "FAILED",
  "SKIPPED",
] as const;

export const RECORD_SOURCES = [
  "MANUAL",
  "IMPORT",
  "EMAIL",
  "CALENDAR",
  "TRACKING",
] as const;

export const FACT_BANDS = ["VERIFIED", "PROBABLE", "POSSIBLE"] as const;
export const FACT_STATUSES = [
  "APPLIED",
  "PROPOSED",
  "DISMISSED",
  "SUPERSEDED",
] as const;
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

export const FIELD_ENTITIES = ["COMPANY", "CONTACT", "DEAL"] as const;
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

export const RATE_SOURCES = ["FETCHED", "MANUAL"] as const;
export const RATE_AUDIT_ACTIONS = ["UPSERT", "DELETE"] as const;
export const ROUNDING_MODES = ["HALF_UP", "DOWN", "UP"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const ACTIVITY_WINDOWS = ["7", "30", "90"] as const;
export const CLOSING_WINDOWS = [
  "overdue",
  "this-month",
  "next-month",
  "later",
  "none",
] as const;
export const DEAL_LIST_STATUSES = ["all", "open", "closed"] as const;
export const RECORD_KINDS = ["company", "contact", "deal"] as const;
export const TIMELINE_FILTERS = [
  "all",
  "history",
  "notes",
  "upcoming",
  "done",
  "email",
  "meetings",
] as const;
export const TASK_WINDOWS = ["overdue", "upcoming", "all"] as const;
export const FACT_DECISIONS = ["accept", "dismiss"] as const;
export const DASHBOARD_SCOPES = ["me", "everyone"] as const;

/** The supported CRM currency catalog from the source application. */
export const CURRENCY_CODES = [
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
] as const;

export const dealStageSchema = z.enum(DEAL_STAGES);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const composableActivityTypeSchema = z.enum(COMPOSABLE_ACTIVITY_TYPES);
export const enrichmentStatusSchema = z.enum(ENRICHMENT_STATUSES);
export const recordSourceSchema = z.enum(RECORD_SOURCES);
export const factBandSchema = z.enum(FACT_BANDS);
export const factStatusSchema = z.enum(FACT_STATUSES);
export const factFieldSchema = z.enum(FACT_FIELDS);
export const evidenceKindSchema = z.enum(EVIDENCE_KINDS);
export const fieldEntitySchema = z.enum(FIELD_ENTITIES);
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export const rateSourceSchema = z.enum(RATE_SOURCES);
export const rateAuditActionSchema = z.enum(RATE_AUDIT_ACTIONS);
export const roundingModeSchema = z.enum(ROUNDING_MODES);
export const sortDirectionSchema = z.enum(SORT_DIRECTIONS);
export const activityWindowSchema = z.enum(ACTIVITY_WINDOWS);
export const closingWindowSchema = z.enum(CLOSING_WINDOWS);
export const dealListStatusSchema = z.enum(DEAL_LIST_STATUSES);
export const recordKindSchema = z.enum(RECORD_KINDS);
export const timelineFilterSchema = z.enum(TIMELINE_FILTERS);
export const taskWindowSchema = z.enum(TASK_WINDOWS);
export const factDecisionSchema = z.enum(FACT_DECISIONS);
export const dashboardScopeSchema = z.enum(DASHBOARD_SCOPES);
export const currencyCodeSchema = z.enum(CURRENCY_CODES);

export type DealStage = z.infer<typeof dealStageSchema>;
export type ActivityType = z.infer<typeof activityTypeSchema>;
export type ComposableActivityType = z.infer<
  typeof composableActivityTypeSchema
>;
export type EnrichmentStatus = z.infer<typeof enrichmentStatusSchema>;
export type RecordSource = z.infer<typeof recordSourceSchema>;
export type FactBand = z.infer<typeof factBandSchema>;
export type FactStatus = z.infer<typeof factStatusSchema>;
export type FactField = z.infer<typeof factFieldSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type FieldEntity = z.infer<typeof fieldEntitySchema>;
export type FieldType = z.infer<typeof fieldTypeSchema>;
export type RateSource = z.infer<typeof rateSourceSchema>;
export type RateAuditAction = z.infer<typeof rateAuditActionSchema>;
export type RoundingMode = z.infer<typeof roundingModeSchema>;
export type SortDirection = z.infer<typeof sortDirectionSchema>;
export type ActivityWindow = z.infer<typeof activityWindowSchema>;
export type ClosingWindow = z.infer<typeof closingWindowSchema>;
export type DealListStatus = z.infer<typeof dealListStatusSchema>;
export type RecordKind = z.infer<typeof recordKindSchema>;
export type TimelineFilter = z.infer<typeof timelineFilterSchema>;
export type TaskWindow = z.infer<typeof taskWindowSchema>;
export type FactDecision = z.infer<typeof factDecisionSchema>;
export type DashboardScope = z.infer<typeof dashboardScopeSchema>;
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

/* Upper-case aliases make the canonical enum schemas discoverable to callers
 * that mirror the Prisma names while the lower-case names remain idiomatic. */
export const DealStageSchema = dealStageSchema;
export const ActivityTypeSchema = activityTypeSchema;
export const EnrichmentStatusSchema = enrichmentStatusSchema;
export const RecordSourceSchema = recordSourceSchema;
export const FactBandSchema = factBandSchema;
export const FactStatusSchema = factStatusSchema;
export const FieldEntitySchema = fieldEntitySchema;
export const FieldTypeSchema = fieldTypeSchema;
export const CurrencyCodeSchema = currencyCodeSchema;

export const userSummarySchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    email: z.email(),
    image: optionalNullableText,
  })
  .strict();
export type UserSummary = z.infer<typeof userSummarySchema>;

export const currencyMetaSchema = z
  .object({
    code: currencyCodeSchema,
    name: nonEmptyText,
    minorUnits: z.number().int().finite().min(0).max(4),
  })
  .strict();
export type CurrencyMeta = z.infer<typeof currencyMetaSchema>;

const minorAmount = z
  .number()
  .int("Money must be an integer minor-unit amount.")
  .finite()
  .min(0);

/** A source amount represented with an integer minor-unit value. */
export const moneySchema = z
  .object({
    amountCents: minorAmount,
    currency: currencyCodeSchema,
  })
  .strict();
export type Money = z.infer<typeof moneySchema>;

/** A deal's source amount plus the frozen reporting-currency conversion. */
export const frozenMoneySchema = z
  .object({
    amountCents: minorAmount.nullable(),
    currency: currencyCodeSchema,
    baseAmountCents: minorAmount.nullable(),
    baseCurrency: currencyCodeSchema.nullable(),
    fxRate: z.number().finite().positive().nullable(),
    fxRateAt: timestampSchema.nullable(),
  })
  .strict();
export type FrozenMoney = z.infer<typeof frozenMoneySchema>;

export const rateSchema = z
  .object({
    baseCurrency: currencyCodeSchema,
    quoteCurrency: currencyCodeSchema,
    rate: z.number().finite().positive(),
    asOf: timestampSchema,
    source: rateSourceSchema,
    provider: nullableText,
  })
  .strict();
export type Rate = z.infer<typeof rateSchema>;

/** Persisted exchange-rate row returned by the currency store. */
export const exchangeRateSchema = rateSchema
  .extend({
    id: idSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;

/** Append-only audit row for a fetched/manual exchange-rate change. */
export const exchangeRateAuditSchema = z
  .object({
    id: idSchema,
    exchangeRateId: idSchema.nullable(),
    baseCurrency: currencyCodeSchema,
    quoteCurrency: currencyCodeSchema,
    source: rateSourceSchema,
    action: rateAuditActionSchema,
    rate: z.number().finite().positive().nullable(),
    asOf: timestampSchema.nullable(),
    provider: nullableText,
    previousRate: z.number().finite().positive().nullable(),
    previousAsOf: timestampSchema.nullable(),
    previousProvider: nullableText,
    actorId: idSchema.nullable(),
    recordedAt: timestampSchema,
  })
  .strict();
export type ExchangeRateAudit = z.infer<typeof exchangeRateAuditSchema>;

const rateListLimitSchema = z
  .number()
  .int()
  .finite()
  .min(0)
  .max(1_000);

/** Filters for the complete set of fetched and manual exchange-rate rows. */
export const currencyRateListInputSchema = z
  .object({
    baseCurrency: currencyCodeSchema.optional(),
    quoteCurrency: currencyCodeSchema.optional(),
    sources: z.array(rateSourceSchema).optional(),
    limit: rateListLimitSchema.optional(),
  })
  .strict();
export type CurrencyRateListInput = z.infer<
  typeof currencyRateListInputSchema
>;

/** Filters for the effective rate per quote currency (manual overrides fetched). */
export const currencyRateEffectiveListInputSchema = z
  .object({
    baseCurrency: currencyCodeSchema.optional(),
    limit: rateListLimitSchema.optional(),
  })
  .strict();
export type CurrencyRateEffectiveListInput = z.infer<
  typeof currencyRateEffectiveListInputSchema
>;

/** Filters for the append-only exchange-rate audit history. */
export const currencyRateAuditListInputSchema = z
  .object({
    baseCurrency: currencyCodeSchema.optional(),
    quoteCurrency: currencyCodeSchema.optional(),
    source: rateSourceSchema.optional(),
    limit: rateListLimitSchema.optional(),
  })
  .strict();
export type CurrencyRateAuditListInput = z.infer<
  typeof currencyRateAuditListInputSchema
>;

/** Input for an explicit manual rate write. The method supplies MANUAL as source. */
export const currencyRateUpsertManualInputSchema = z
  .object({
    id: idSchema.optional(),
    baseCurrency: currencyCodeSchema,
    quoteCurrency: currencyCodeSchema,
    rate: z.number().finite().positive(),
    asOf: timestampSchema.optional(),
    provider: nullableText.optional(),
    actorId: idSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.baseCurrency !== value.quoteCurrency, {
    message: "An exchange-rate pair must contain two different currencies.",
    path: ["quoteCurrency"],
  });
export type CurrencyRateUpsertManualInput = z.infer<
  typeof currencyRateUpsertManualInputSchema
>;

/**
 * Input for a fetched rate supplied by a configured integration boundary.
 *
 * The CRM intentionally does not perform arbitrary outbound HTTP from the
 * plugin.  A provider integration (or a trusted host-side job) must supply a
 * non-empty provider name with the observed rate, so a fetched row can never
 * be mistaken for a locally invented default.
 */
export const currencyRateUpsertFetchedInputSchema = z
  .object({
    id: idSchema.optional(),
    baseCurrency: currencyCodeSchema,
    quoteCurrency: currencyCodeSchema,
    rate: z.number().finite().positive(),
    asOf: timestampSchema.optional(),
    provider: nonEmptyText,
    actorId: idSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.baseCurrency !== value.quoteCurrency, {
    message: "An exchange-rate pair must contain two different currencies.",
    path: ["quoteCurrency"],
  });
export type CurrencyRateUpsertFetchedInput = z.infer<
  typeof currencyRateUpsertFetchedInputSchema
>;

/** Input for removing only the manual row for a currency pair. */
export const currencyRateRemoveManualInputSchema = z
  .object({
    baseCurrency: currencyCodeSchema,
    quoteCurrency: currencyCodeSchema,
    actorId: idSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.baseCurrency !== value.quoteCurrency, {
    message: "An exchange-rate pair must contain two different currencies.",
    path: ["quoteCurrency"],
  });
export type CurrencyRateRemoveManualInput = z.infer<
  typeof currencyRateRemoveManualInputSchema
>;

const rerateOptionsShape = {
  baseCurrency: currencyCodeSchema.optional(),
  rounding: roundingModeSchema.optional(),
  onlyMissing: z.boolean().optional(),
  now: timestampSchema.optional(),
};

/** Explicitly refreshes one deal's frozen reporting-currency conversion. */
export const currencyDealRerateInputSchema = z
  .object({ id: idSchema, ...rerateOptionsShape })
  .strict();
export type CurrencyDealRerateInput = z.infer<
  typeof currencyDealRerateInputSchema
>;

/** Explicitly refreshes frozen conversions for all eligible deals. */
export const currencyDealRerateAllInputSchema = z
  .object(rerateOptionsShape)
  .strict();
export type CurrencyDealRerateAllInput = z.infer<
  typeof currencyDealRerateAllInputSchema
>;

export const exchangeRateListOutputSchema = z.array(exchangeRateSchema);
export type ExchangeRateListOutput = z.infer<
  typeof exchangeRateListOutputSchema
>;

export const exchangeRateAuditListOutputSchema = z.array(exchangeRateAuditSchema);
export type ExchangeRateAuditListOutput = z.infer<
  typeof exchangeRateAuditListOutputSchema
>;

export const rerateSummarySchema = z
  .object({
    baseCurrency: currencyCodeSchema,
    converted: z.number().int().finite().min(0),
    cleared: z.number().int().finite().min(0),
    missing: z.array(currencyCodeSchema),
    processed: z.number().int().finite().min(0),
  })
  .strict();
export type RerateSummary = z.infer<typeof rerateSummarySchema>;

/* Descriptive aliases keep the currency vocabulary available to callers that
 * use either rate or exchange-rate terminology. */
export const currencyRateSchema = exchangeRateSchema;
export const currencyRateAuditSchema = exchangeRateAuditSchema;
export const currencyRateListOutputSchema = exchangeRateListOutputSchema;
export const currencyRateAuditListOutputSchema = exchangeRateAuditListOutputSchema;
export type CurrencyRate = ExchangeRate;
export type CurrencyRateAudit = ExchangeRateAudit;

/** Generic scalar value used by a typed custom field at the wire boundary. */
export const fieldValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type FieldValue = z.infer<typeof fieldValueSchema>;

export const fieldValuesSchema = z.record(z.string().trim().min(1), fieldValueSchema);
export type FieldValues = z.infer<typeof fieldValuesSchema>;

export const fieldOptionInputSchema = z
  .object({
    id: idSchema.optional(),
    label: nonEmptyText.max(120),
    position: z.number().int().finite().min(0).optional(),
  })
  .strict();
export type FieldOptionInput = z.infer<typeof fieldOptionInputSchema>;

export const fieldOptionSchema = z
  .object({
    id: idSchema,
    fieldId: idSchema.optional(),
    label: nonEmptyText,
    position: z.number().int().finite().min(0),
    archived: z.boolean().optional(),
    archivedAt: timestampSchema.nullable().optional(),
  })
  .strict();
export type FieldOption = z.infer<typeof fieldOptionSchema>;

export const fieldDefinitionSchema = z
  .object({
    id: idSchema,
    entity: fieldEntitySchema,
    key: nonEmptyText,
    label: nonEmptyText,
    type: fieldTypeSchema,
    agentFilled: z.boolean(),
    agentBrief: nullableText,
    required: z.boolean(),
    showOnSheet: z.boolean(),
    showOnTable: z.boolean(),
    showOnFilter: z.boolean(),
    position: z.number().int().finite().min(0),
    archived: z.boolean().optional(),
    archivedAt: timestampSchema.nullable().optional(),
    options: z.array(fieldOptionSchema),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
  })
  .strict();
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export const fieldDefinitionOutputSchema = fieldDefinitionSchema;

/** A normalized value row, useful when a store returns one value at a time. */
export const fieldValueDtoSchema = z
  .object({
    id: idSchema,
    fieldId: idSchema,
    entity: fieldEntitySchema,
    recordId: idSchema,
    value: fieldValueSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type FieldValueDto = z.infer<typeof fieldValueDtoSchema>;
export const fieldValueOutputSchema = fieldValueDtoSchema;

export const fieldDefinitionCreateInputSchema = z
  .object({
    entity: fieldEntitySchema,
    label: nonEmptyText.max(120),
    type: fieldTypeSchema,
    options: z.array(fieldOptionInputSchema).default([]),
    agentFilled: z.boolean().default(true),
    agentBrief: nullableText.default(null),
    required: z.boolean().default(false),
    showOnSheet: z.boolean().default(true),
    showOnTable: z.boolean().default(false),
    showOnFilter: z.boolean().default(false),
  })
  .strict();
export type FieldDefinitionCreateInput = z.infer<
  typeof fieldDefinitionCreateInputSchema
>;

export const fieldDefinitionUpdateDataSchema = z
  .object({
    label: nonEmptyText.max(120).optional(),
    type: fieldTypeSchema.optional(),
    options: z.array(fieldOptionInputSchema).optional(),
    agentFilled: z.boolean().optional(),
    agentBrief: nullableText.optional(),
    required: z.boolean().optional(),
    showOnSheet: z.boolean().optional(),
    showOnTable: z.boolean().optional(),
    showOnFilter: z.boolean().optional(),
  })
  .strict();
export type FieldDefinitionUpdateData = z.infer<
  typeof fieldDefinitionUpdateDataSchema
>;

export const fieldDefinitionUpdateInputSchema = z
  .object({
    id: idSchema,
    data: fieldDefinitionUpdateDataSchema,
  })
  .strict();
export type FieldDefinitionUpdateInput = z.infer<
  typeof fieldDefinitionUpdateInputSchema
>;

export const fieldDefinitionReorderInputSchema = z
  .object({
    entity: fieldEntitySchema,
    ids: z.array(idSchema).min(1),
  })
  .strict();
export type FieldDefinitionReorderInput = z.infer<
  typeof fieldDefinitionReorderInputSchema
>;

export const listPageInputSchema = z
  .object({
    page: z.number().int().finite().min(1).default(1),
    pageSize: z.number().int().finite().min(1).max(100).default(25),
  })
  .strict();
export type ListPageInput = z.infer<typeof listPageInputSchema>;

export const listSortInputSchema = z
  .object({
    sort: z.string().trim().default(""),
    dir: sortDirectionSchema.default("asc"),
  })
  .strict();
export type ListSortInput = z.infer<typeof listSortInputSchema>;

/** Shared flattened list query used by all three record tables. */
export const listInputSchema = z
  .object({
    q: z.string().default(""),
    sort: z.string().trim().default(""),
    dir: sortDirectionSchema.default("asc"),
    page: z.number().int().finite().min(1).default(1),
    pageSize: z.number().int().finite().min(1).max(100).default(25),
  })
  .strict();
export type ListInput = z.infer<typeof listInputSchema>;

export const listFilterInputSchema = z
  .object({
    q: z.string().default(""),
    archived: z.boolean().default(false),
    filters: z.record(z.string(), z.array(z.string())).default({}),
  })
  .strict();
export type ListFilterInput = z.infer<typeof listFilterInputSchema>;

const ownerFacet = z.array(z.string().trim().min(1)).default([]);
const fieldFacets = z
  .record(z.string().trim().min(1), z.array(z.string()))
  .default({});
const activityFacet = z.array(activityWindowSchema).default([]);

export const companyListInputSchema = z
  .object({
    q: z.string().default(""),
    sort: z.string().trim().default(""),
    dir: sortDirectionSchema.default("asc"),
    page: z.number().int().finite().min(1).default(1),
    pageSize: z.number().int().finite().min(1).max(100).default(25),
    owner: ownerFacet,
    industry: z.array(z.string()).default([]),
    enrichment: z.array(enrichmentStatusSchema).default([]),
    source: z.array(recordSourceSchema).default([]),
    activity: activityFacet,
    fields: fieldFacets,
    archived: z.boolean().default(false),
  })
  .strict();
export type CompanyListInput = z.infer<typeof companyListInputSchema>;

export const contactListInputSchema = z
  .object({
    q: z.string().default(""),
    sort: z.string().trim().default(""),
    dir: sortDirectionSchema.default("asc"),
    page: z.number().int().finite().min(1).default(1),
    pageSize: z.number().int().finite().min(1).max(100).default(25),
    owner: ownerFacet,
    company: z.array(z.string()).default([]),
    source: z.array(recordSourceSchema).default([]),
    title: z.array(z.string()).default([]),
    seniority: z.array(z.string()).default([]),
    persona: z.array(z.string()).default([]),
    activity: activityFacet,
    fields: fieldFacets,
    archived: z.boolean().default(false),
  })
  .strict();
export type ContactListInput = z.infer<typeof contactListInputSchema>;

export const dealListInputSchema = z
  .object({
    q: z.string().default(""),
    sort: z.string().trim().default(""),
    dir: sortDirectionSchema.default("asc"),
    page: z.number().int().finite().min(1).default(1),
    pageSize: z.number().int().finite().min(1).max(100).default(25),
    status: dealListStatusSchema.default("all"),
    owner: ownerFacet,
    stage: z.array(dealStageSchema).default([]),
    closing: z.array(closingWindowSchema).default([]),
    fields: fieldFacets,
    archived: z.boolean().default(false),
  })
  .strict();
export type DealListInput = z.infer<typeof dealListInputSchema>;

export const facetCountsSchema = z.record(
  z.string(),
  z.record(z.string(), z.number().int().finite().min(0)),
);
export type FacetCounts = z.infer<typeof facetCountsSchema>;

export function listOutputSchema<T extends z.ZodTypeAny>(row: T) {
  return z
    .object({
      rows: z.array(row),
      total: z.number().int().finite().min(0),
      facetCounts: facetCountsSchema,
    })
    .strict();
}

export type ListOutput<TRow> = {
  rows: TRow[];
  total: number;
  facetCounts: FacetCounts;
};

const companyCreateShape = {
  name: nonEmptyText,
  domain: optionalText,
  ownerId: idSchema.nullable().optional(),
};

export const companyCreateInputSchema = z.object(companyCreateShape).strict();
export type CompanyCreateInput = z.infer<typeof companyCreateInputSchema>;

const companyUpdateDataShape = {
  name: nonEmptyText.optional(),
  domain: optionalNullableText,
  website: optionalNullableText,
  description: optionalNullableText,
  industry: optionalNullableText,
  city: optionalNullableText,
  stateCode: optionalNullableText,
  country: optionalNullableText,
  phone: optionalNullableText,
  email: z.email().nullable().optional(),
  linkedinUrl: optionalNullableText,
  twitterUrl: optionalNullableText,
  githubUrl: optionalNullableText,
  pricingUrl: optionalNullableText,
  careersUrl: optionalNullableText,
  ownerId: idSchema.nullable().optional(),
  primaryContactId: idSchema.nullable().optional(),
  fields: fieldValuesSchema.optional(),
};

export const companyUpdateDataSchema = z
  .object(companyUpdateDataShape)
  .strict();
export type CompanyUpdateData = z.infer<typeof companyUpdateDataSchema>;

export const companyUpdateInputSchema = z
  .object({ id: idSchema, data: companyUpdateDataSchema })
  .strict();
export type CompanyUpdateInput = z.infer<typeof companyUpdateInputSchema>;

const contactCreateShape = {
  firstName: nonEmptyText,
  lastName: optionalText,
  email: z.email().or(z.literal("")).optional(),
  phone: optionalText,
  title: optionalText,
  companyId: idSchema.nullable().optional(),
  ownerId: idSchema.nullable().optional(),
};

export const contactCreateInputSchema = z.object(contactCreateShape).strict();
export type ContactCreateInput = z.infer<typeof contactCreateInputSchema>;

const contactUpdateDataShape = {
  firstName: nonEmptyText.optional(),
  lastName: optionalNullableText,
  email: z.email().or(z.literal("")).nullable().optional(),
  phone: optionalNullableText,
  title: optionalNullableText,
  linkedinUrl: optionalNullableText,
  twitterUrl: optionalNullableText,
  githubUrl: optionalNullableText,
  imageUrl: optionalNullableContactImageUrl,
  companyId: idSchema.nullable().optional(),
  ownerId: idSchema.nullable().optional(),
  fields: fieldValuesSchema.optional(),
};

export const contactUpdateDataSchema = z
  .object(contactUpdateDataShape)
  .strict();
export type ContactUpdateData = z.infer<typeof contactUpdateDataSchema>;

export const contactUpdateInputSchema = z
  .object({ id: idSchema, data: contactUpdateDataSchema })
  .strict();
export type ContactUpdateInput = z.infer<typeof contactUpdateInputSchema>;

const dealAmount = minorAmount.nullable().optional();

const dealCreateShape = {
  name: nonEmptyText,
  companyId: idSchema,
  ownerId: idSchema,
  stage: dealStageSchema.optional(),
  amountCents: dealAmount,
  currency: currencyCodeSchema.optional(),
  expectedCloseDate: dateValueSchema.nullable().optional(),
};

export const dealCreateInputSchema = z.object(dealCreateShape).strict();
export type DealCreateInput = z.infer<typeof dealCreateInputSchema>;

const dealUpdateDataShape = {
  name: nonEmptyText.optional(),
  description: optionalNullableText,
  companyId: idSchema.optional(),
  ownerId: idSchema.optional(),
  amountCents: dealAmount,
  currency: currencyCodeSchema.optional(),
  expectedCloseDate: dateValueSchema.nullable().optional(),
  fields: fieldValuesSchema.optional(),
};

export const dealUpdateDataSchema = z.object(dealUpdateDataShape).strict();
export type DealUpdateData = z.infer<typeof dealUpdateDataSchema>;

export const dealUpdateInputSchema = z
  .object({ id: idSchema, data: dealUpdateDataSchema })
  .strict();
export type DealUpdateInput = z.infer<typeof dealUpdateInputSchema>;

const dealContactRoleSchema = z.string().trim().max(80).nullable().optional();

/** Add or update a contact on a deal without introducing a second relation model. */
export const dealContactAttachInputSchema = z
  .object({
    dealId: idSchema,
    contactId: idSchema,
    role: dealContactRoleSchema,
  })
  .strict();
export type DealContactAttachInput = z.infer<typeof dealContactAttachInputSchema>;

export const dealContactDetachInputSchema = z
  .object({ dealId: idSchema, contactId: idSchema })
  .strict();
export type DealContactDetachInput = z.infer<typeof dealContactDetachInputSchema>;

export const dealContactRoleUpdateInputSchema = z
  .object({
    dealId: idSchema,
    contactId: idSchema,
    role: z.string().trim().max(80).nullable(),
  })
  .strict();
export type DealContactRoleUpdateInput = z.infer<
  typeof dealContactRoleUpdateInputSchema
>;

export const setDealStageInputSchema = z
  .object({
    id: idSchema,
    stage: dealStageSchema,
    closedReason: optionalText,
  })
  .strict();
export type SetDealStageInput = z.infer<typeof setDealStageInputSchema>;

export const archiveInputSchema = z.object({ id: idSchema }).strict();
export const restoreInputSchema = z.object({ id: idSchema }).strict();
export const purgeInputSchema = z.object({ id: idSchema }).strict();
export type ArchiveInput = z.infer<typeof archiveInputSchema>;
export type RestoreInput = z.infer<typeof restoreInputSchema>;
export type PurgeInput = z.infer<typeof purgeInputSchema>;

export const recordIdInputSchema = archiveInputSchema;
export const archiveIdInputSchema = archiveInputSchema;
export const restoreIdInputSchema = restoreInputSchema;
export const purgeIdInputSchema = purgeInputSchema;

export const MAX_BULK_IDS = 100;
export const bulkIdsInputSchema = z
  .object({
    ids: z
      .array(idSchema)
      .min(1, "Nothing was selected.")
      .max(MAX_BULK_IDS, "Too many records at once."),
  })
  .strict();
export type BulkIdsInput = z.infer<typeof bulkIdsInputSchema>;

export const bulkOwnerInputSchema = bulkIdsInputSchema
  .extend({ ownerId: idSchema.nullable() })
  .strict();
export type BulkOwnerInput = z.infer<typeof bulkOwnerInputSchema>;

export const bulkCompanyInputSchema = bulkIdsInputSchema
  .extend({ companyId: idSchema.nullable() })
  .strict();
export type BulkCompanyInput = z.infer<typeof bulkCompanyInputSchema>;

export const bulkStageInputSchema = bulkIdsInputSchema
  .extend({ stage: dealStageSchema, closedReason: optionalText })
  .strict();
export type BulkStageInput = z.infer<typeof bulkStageInputSchema>;

export const bulkResultSchema = z
  .object({
    requested: z.number().int().finite().min(0),
    succeeded: z.number().int().finite().min(0),
    skipped: z.number().int().finite().min(0).optional(),
    failed: z.number().int().finite().min(0),
    message: nullableText,
  })
  .strict();
export type BulkResult = z.infer<typeof bulkResultSchema>;

/** A single enrichment request reports queue state, never fabricated data. */
export const enrichmentRequestInputSchema = z
  .object({
    id: idSchema,
    /** Optional override for the configured research agent. */
    agentId: idSchema.optional(),
  })
  .strict();
export type EnrichmentRequestInput = z.infer<typeof enrichmentRequestInputSchema>;

export const enrichmentFocusSchema = z.enum(["socials", "work-history", "brief"]);
export type EnrichmentFocus = z.infer<typeof enrichmentFocusSchema>;

/** Contact research has separate provider-backed focus areas. */
export const contactResearchInputSchema = z
  .object({
    id: idSchema,
    focus: enrichmentFocusSchema.default("brief"),
    agentId: idSchema.optional(),
  })
  .strict();
export type ContactResearchInput = z.infer<typeof contactResearchInputSchema>;

/**
 * Extra fields are optional to keep this compatible with the source API's
 * `{ id, queued }` response while exposing explicit external blockers to BB.
 */
export const enrichmentRequestOutputSchema = z
  .object({
    id: idSchema,
    queued: z.boolean(),
    status: enrichmentStatusSchema.optional(),
    runId: idSchema.nullable().optional(),
    reason: nullableText.optional(),
  })
  .strict();
export type EnrichmentRequestOutput = z.infer<typeof enrichmentRequestOutputSchema>;

export const ownerRefSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    email: z.email(),
    image: nullableText,
  })
  .strict();
export type OwnerRef = z.infer<typeof ownerRefSchema>;

const companyRefSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    domain: nullableText,
    iconUrl: nullableText,
    iconDarkUrl: optionalNullableText,
    iconTone: optionalNullableText,
    logoUrl: optionalNullableText,
  })
  .strict();

const contactRefSchema = z
  .object({
    id: idSchema,
    firstName: nonEmptyText,
    lastName: nullableText,
    email: nullableText,
    title: nullableText,
    imageUrl: nullableText,
  })
  .strict();

const dealRefSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    /** Detail fields are populated for contact-related deals. */
    stage: dealStageSchema.optional(),
    currency: currencyCodeSchema.optional(),
    amountCents: minorAmount.nullable().optional(),
    expectedCloseDate: dateValueSchema.nullable().optional(),
    ownerId: idSchema.nullable().optional(),
    role: nullableText.optional(),
  })
  .strict();

export const companySchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    domain: optionalNullableText,
    website: optionalNullableText,
    description: optionalNullableText,
    logoUrl: optionalNullableText,
    logoDarkUrl: optionalNullableText,
    iconUrl: optionalNullableText,
    iconDarkUrl: optionalNullableText,
    iconTone: optionalNullableText,
    brandColor: optionalNullableText,
    industry: optionalNullableText,
    subIndustry: optionalNullableText,
    city: optionalNullableText,
    stateCode: optionalNullableText,
    country: optionalNullableText,
    countryCode: optionalNullableText,
    phone: optionalNullableText,
    email: z.email().nullable().optional(),
    linkedinUrl: optionalNullableText,
    twitterUrl: optionalNullableText,
    githubUrl: optionalNullableText,
    pricingUrl: optionalNullableText,
    careersUrl: optionalNullableText,
    ownerId: idSchema.nullable().optional(),
    owner: ownerRefSchema.nullable().optional(),
    primaryContactId: idSchema.nullable().optional(),
    source: recordSourceSchema.optional(),
    enrichmentStatus: enrichmentStatusSchema.optional(),
    enrichmentError: optionalNullableText,
    queued: z.boolean().optional(),
    contactCount: z.number().int().finite().min(0).optional(),
    openDealCount: z.number().int().finite().min(0).optional(),
    lastActivityAt: timestampSchema.nullable().optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
    archivedAt: timestampSchema.nullable().optional(),
    enrichedAt: timestampSchema.nullable().optional(),
    reportingCurrency: currencyCodeSchema.optional(),
    fields: fieldValuesSchema.default({}),
    contacts: z.array(contactRefSchema).optional(),
    deals: z.array(dealRefSchema).optional(),
  })
  .strict();
export type Company = z.infer<typeof companySchema>;
export const companyDtoSchema = companySchema;
export const companyRowSchema = companySchema;
export const companyDetailSchema = companySchema;
export type CompanyDto = Company;

export const companyListOutputSchema = listOutputSchema(companyRowSchema);
export type CompanyListOutput = z.infer<typeof companyListOutputSchema>;
export const companyOutputSchema = companySchema;

export const contactFactEvidenceSchema = z
  .object({
    kind: evidenceKindSchema,
    detail: nonEmptyText,
    sourceUrl: optionalNullableSourceUrl,
  })
  .strict();
export type ContactFactEvidence = z.infer<typeof contactFactEvidenceSchema>;

export const contactFactEvidenceInputSchema = z
  .object({
    kind: evidenceKindSchema,
    detail: nonEmptyText,
    sourceUrl: optionalNullableSourceUrl,
  })
  .strict();
export type ContactFactEvidenceInput = z.infer<
  typeof contactFactEvidenceInputSchema
>;

const factScore = z.number().finite().min(0).max(1);
const evidenceListLimit = z.number().int().finite().min(0).max(1_000);

/** Complete persisted fact row used by evidence RPCs. */
export const contactFactRecordSchema = z
  .object({
    id: idSchema,
    contactId: idSchema,
    field: factFieldSchema,
    value: nonEmptyText,
    score: factScore,
    band: factBandSchema,
    evidence: z.array(contactFactEvidenceSchema).min(1),
    method: nonEmptyText,
    sourceUrl: sourceUrl.nullable(),
    sessionId: nullableText,
    status: factStatusSchema,
    decidedById: idSchema.nullable(),
    decidedAt: timestampSchema.nullable(),
    observedAt: timestampSchema,
    supersededAt: timestampSchema.nullable(),
    supersedesId: idSchema.nullable(),
    supersededById: idSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict();
export type ContactFactRecord = z.infer<typeof contactFactRecordSchema>;

export const contactFactCreateInputSchema = z
  .object({
    id: idSchema.optional(),
    contactId: idSchema,
    field: factFieldSchema,
    value: nonEmptyText,
    score: factScore,
    band: factBandSchema,
    evidence: z.array(contactFactEvidenceInputSchema).min(1),
    method: nonEmptyText,
    sourceUrl: optionalNullableSourceUrl,
    sessionId: optionalNullableText,
    status: factStatusSchema.optional(),
    decidedById: idSchema.nullable().optional(),
    decidedAt: timestampSchema.nullable().optional(),
    observedAt: timestampSchema.optional(),
    supersededAt: timestampSchema.nullable().optional(),
    supersedesId: idSchema.nullable().optional(),
  })
  .strict();
export type ContactFactCreateInput = z.infer<typeof contactFactCreateInputSchema>;

export const contactFactListInputSchema = z
  .object({
    contactId: idSchema,
    field: factFieldSchema.optional(),
    statuses: z.array(factStatusSchema).optional(),
    includeSuperseded: z.boolean().optional(),
    limit: evidenceListLimit.optional(),
  })
  .strict();
export type ContactFactListInput = z.infer<typeof contactFactListInputSchema>;

export const contactFactDecisionInputSchema = z
  .object({
    id: idSchema,
    decision: factDecisionSchema,
    decidedById: idSchema.optional(),
  })
  .strict();
export type ContactFactDecisionInput = z.infer<
  typeof contactFactDecisionInputSchema
>;

export const contactFactSupersedeInputSchema = z
  .object({
    id: idSchema,
    replacementId: idSchema.optional(),
  })
  .strict();
export type ContactFactSupersedeInput = z.infer<
  typeof contactFactSupersedeInputSchema
>;

export const contactFactSchema = z
  .object({
    id: idSchema,
    field: factFieldSchema,
    value: nonEmptyText,
    score: factScore,
    band: factBandSchema,
    evidence: z.array(contactFactEvidenceSchema),
    method: nonEmptyText,
    sourceUrl: nullableText,
    status: factStatusSchema,
    observedAt: timestampSchema,
  })
  .strict();
export type ContactFact = z.infer<typeof contactFactSchema>;

export const contactBriefSchema = z
  .object({
    narrative: nonEmptyText,
    sections: z
      .object({
        currentRole: optionalText,
        tenure: optionalText,
        previousRoles: z.array(nonEmptyText).optional(),
        seniority: optionalText,
        function: optionalText,
        location: optionalText,
      })
      .strict(),
    score: factScore,
    sourceUrl: sourceUrl.nullable(),
    refreshedAt: timestampSchema,
  })
  .strict();
export type ContactBrief = z.infer<typeof contactBriefSchema>;

export const contactBriefSectionsSchema = z
  .object({
    currentRole: optionalText,
    tenure: optionalText,
    previousRoles: z.array(nonEmptyText).optional(),
    seniority: optionalText,
    function: optionalText,
    location: optionalText,
  })
  .strict();
export type ContactBriefSections = z.infer<typeof contactBriefSectionsSchema>;

/** Complete immutable brief version used by brief RPCs. */
export const contactBriefRecordSchema = z
  .object({
    id: idSchema,
    contactId: idSchema,
    version: z.number().int().finite().min(1),
    narrative: nonEmptyText,
    sections: contactBriefSectionsSchema,
    score: factScore,
    sourceUrl: sourceUrl.nullable(),
    sessionId: nullableText,
    refreshedAt: timestampSchema,
    createdAt: timestampSchema,
  })
  .strict();
export type ContactBriefRecord = z.infer<typeof contactBriefRecordSchema>;

export const contactBriefCreateInputSchema = z
  .object({
    id: idSchema.optional(),
    contactId: idSchema,
    version: z.number().int().finite().min(1).optional(),
    narrative: nonEmptyText,
    sections: contactBriefSectionsSchema,
    score: factScore,
    sourceUrl: optionalNullableSourceUrl,
    sessionId: optionalNullableText,
    refreshedAt: timestampSchema.optional(),
  })
  .strict();
export type ContactBriefCreateInput = z.infer<typeof contactBriefCreateInputSchema>;

export const contactBriefCurrentInputSchema = z
  .object({ contactId: idSchema })
  .strict();
export type ContactBriefCurrentInput = z.infer<
  typeof contactBriefCurrentInputSchema
>;

export const contactBriefVersionInputSchema = z
  .object({
    contactId: idSchema,
    version: z.number().int().finite().min(1),
  })
  .strict();
export type ContactBriefVersionInput = z.infer<
  typeof contactBriefVersionInputSchema
>;

export const contactBriefListInputSchema = z
  .object({
    contactId: idSchema,
    limit: evidenceListLimit.optional(),
  })
  .strict();
export type ContactBriefListInput = z.infer<typeof contactBriefListInputSchema>;

export const contactWorkHistorySchema = z
  .object({
    id: idSchema,
    contactId: idSchema,
    title: nullableText,
    organizationName: nullableText,
    organizationDomain: nullableText,
    startDate: dateValueSchema.nullable(),
    endDate: dateValueSchema.nullable(),
    location: nullableText,
    description: nullableText,
    isCurrent: z.boolean(),
    score: factScore,
    band: factBandSchema,
    evidence: z.array(contactFactEvidenceSchema).min(1),
    method: nonEmptyText,
    sourceUrl: sourceUrl.nullable(),
    sessionId: nullableText,
    status: factStatusSchema,
    decidedById: idSchema.nullable(),
    decidedAt: timestampSchema.nullable(),
    observedAt: timestampSchema,
    supersededAt: timestampSchema.nullable(),
    supersedesId: idSchema.nullable(),
    supersededById: idSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict();
export type ContactWorkHistory = z.infer<typeof contactWorkHistorySchema>;

export const contactWorkHistoryCreateInputSchema = z
  .object({
    id: idSchema.optional(),
    contactId: idSchema,
    title: optionalNullableText,
    organizationName: optionalNullableText,
    organizationDomain: optionalNullableText,
    startDate: dateValueSchema.nullable().optional(),
    endDate: dateValueSchema.nullable().optional(),
    location: optionalNullableText,
    description: optionalNullableText,
    isCurrent: z.boolean().optional(),
    score: factScore,
    band: factBandSchema,
    evidence: z.array(contactFactEvidenceInputSchema).min(1),
    method: nonEmptyText,
    sourceUrl: optionalNullableSourceUrl,
    sessionId: optionalNullableText,
    status: factStatusSchema.optional(),
    decidedById: idSchema.nullable().optional(),
    decidedAt: timestampSchema.nullable().optional(),
    observedAt: timestampSchema.optional(),
    supersededAt: timestampSchema.nullable().optional(),
    supersedesId: idSchema.nullable().optional(),
  })
  .strict();
export type ContactWorkHistoryCreateInput = z.infer<
  typeof contactWorkHistoryCreateInputSchema
>;

export const contactWorkHistoryListInputSchema = z
  .object({
    contactId: idSchema,
    statuses: z.array(factStatusSchema).optional(),
    includeSuperseded: z.boolean().optional(),
    limit: evidenceListLimit.optional(),
  })
  .strict();
export type ContactWorkHistoryListInput = z.infer<
  typeof contactWorkHistoryListInputSchema
>;

export const contactWorkHistoryDecisionInputSchema = z
  .object({
    id: idSchema,
    decision: factDecisionSchema,
    decidedById: idSchema.optional(),
  })
  .strict();
export type ContactWorkHistoryDecisionInput = z.infer<
  typeof contactWorkHistoryDecisionInputSchema
>;

export const contactWorkHistorySupersedeInputSchema = z
  .object({
    id: idSchema,
    replacementId: idSchema.optional(),
  })
  .strict();
export type ContactWorkHistorySupersedeInput = z.infer<
  typeof contactWorkHistorySupersedeInputSchema
>;

export const contactRelationshipSchema = z
  .object({
    emails: z.number().int().finite().min(0),
    threads: z.number().int().finite().min(0),
    lastReplyAt: timestampSchema.nullable(),
    meetings: z.number().int().finite().min(0),
    nextMeeting: z
      .object({ title: nonEmptyText, startsAt: timestampSchema })
      .strict()
      .nullable(),
    colleagues: z
      .array(
        z
          .object({
            id: idSchema,
            name: nonEmptyText,
            title: nullableText,
          })
          .strict(),
      ),
  })
  .strict();
export type ContactRelationship = z.infer<typeof contactRelationshipSchema>;

export const contactSchema = z
  .object({
    id: idSchema,
    firstName: nonEmptyText,
    lastName: optionalNullableText,
    email: z.email().nullable().optional(),
    phone: optionalNullableText,
    title: optionalNullableText,
    seniority: optionalNullableText,
    function: optionalNullableText,
    linkedinUrl: optionalNullableText,
    twitterUrl: optionalNullableText,
    githubUrl: optionalNullableText,
    imageUrl: optionalNullableText,
    companyId: idSchema.nullable().optional(),
    company: companyRefSchema.nullable().optional(),
    ownerId: idSchema.nullable().optional(),
    owner: ownerRefSchema.nullable().optional(),
    source: recordSourceSchema.optional(),
    enrichmentStatus: enrichmentStatusSchema.optional(),
    enrichmentError: optionalNullableText,
    enrichedAt: timestampSchema.nullable().optional(),
    socialsCheckedAt: timestampSchema.nullable().optional(),
    queued: z.boolean().optional(),
    isPrimaryContact: z.boolean().optional(),
    facts: z.array(contactFactSchema).optional(),
    brief: contactBriefSchema.nullable().optional(),
    workHistory: z.array(contactWorkHistorySchema).optional(),
    relationship: contactRelationshipSchema.optional(),
    lastActivityAt: timestampSchema.nullable().optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
    archivedAt: timestampSchema.nullable().optional(),
    fields: fieldValuesSchema.default({}),
    deals: z.array(dealRefSchema).optional(),
  })
  .strict();
export type Contact = z.infer<typeof contactSchema>;
export const contactDtoSchema = contactSchema;
export const contactRowSchema = contactSchema;
export const contactDetailSchema = contactSchema;
export type ContactDto = Contact;

export const contactListOutputSchema = listOutputSchema(contactRowSchema);
export type ContactListOutput = z.infer<typeof contactListOutputSchema>;
export const contactOutputSchema = contactSchema;

export const dealContactSchema = z
  .object({
    id: idSchema,
    firstName: nonEmptyText,
    lastName: nullableText,
    email: nullableText,
    title: nullableText,
    imageUrl: nullableText,
    role: nullableText,
  })
  .strict();
export type DealContact = z.infer<typeof dealContactSchema>;

export const dealSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    description: optionalNullableText,
    companyId: idSchema.optional(),
    company: companyRefSchema.optional(),
    ownerId: idSchema.optional(),
    owner: ownerRefSchema.optional(),
    stage: dealStageSchema,
    currency: currencyCodeSchema,
    amountCents: minorAmount.nullable(),
    baseAmountCents: minorAmount.nullable(),
    baseCurrency: currencyCodeSchema.nullable().optional(),
    reportingCurrency: currencyCodeSchema.optional(),
    fxRate: z.number().finite().positive().nullable().optional(),
    fxRateAt: timestampSchema.nullable().optional(),
    closedReason: optionalNullableText,
    stageChangedAt: timestampSchema.optional(),
    expectedCloseDate: dateValueSchema.nullable(),
    closedAt: timestampSchema.nullable(),
    lastActivityAt: timestampSchema.nullable().optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
    archivedAt: timestampSchema.nullable().optional(),
    fields: fieldValuesSchema.default({}),
    contacts: z.array(dealContactSchema).optional(),
  })
  .strict();
export type Deal = z.infer<typeof dealSchema>;
export const dealDtoSchema = dealSchema;
export const dealRowSchema = dealSchema;
export const dealDetailSchema = dealSchema;
export type DealDto = Deal;

export const dealListOutputSchema = z
  .object({
    rows: z.array(dealRowSchema),
    total: z.number().int().finite().min(0),
    facetCounts: facetCountsSchema,
    openValueCents: minorAmount.nullable(),
    reportingCurrency: currencyCodeSchema,
    unconverted: z
      .object({
        count: z.number().int().finite().min(0),
        currencies: z.array(currencyCodeSchema),
      })
      .strict(),
  })
  .strict();
export type DealListOutput = z.infer<typeof dealListOutputSchema>;
export const dealOutputSchema = dealSchema;

export const activityMetaSchema = rpcJsonObjectSchema;

export const activityCreateInputSchema = z
  .object({
    type: composableActivityTypeSchema,
    subject: optionalText,
    body: optionalText,
    occurredAt: timestampSchema.optional(),
    dueAt: timestampSchema.nullable().optional(),
    companyId: idSchema.optional(),
    contactId: idSchema.optional(),
    dealId: idSchema.optional(),
    createdById: idSchema,
    meta: activityMetaSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.companyId || value.contactId || value.dealId,
    "An activity has to be about a company, a contact, or a deal.",
  )
  .refine(
    (value) => value.type !== "TASK" || Boolean(value.subject),
    "A task needs a subject.",
  );
export type ActivityCreateInput = z.infer<typeof activityCreateInputSchema>;

export const activityUpdateDataSchema = z
  .object({
    subject: optionalNullableText,
    body: optionalNullableText,
    occurredAt: timestampSchema.optional(),
    dueAt: timestampSchema.nullable().optional(),
    completed: z.boolean().optional(),
    meta: activityMetaSchema.optional(),
  })
  .strict();
export type ActivityUpdateData = z.infer<typeof activityUpdateDataSchema>;

export const activityUpdateInputSchema = z
  .object({ id: idSchema, data: activityUpdateDataSchema })
  .strict();
export type ActivityUpdateInput = z.infer<typeof activityUpdateInputSchema>;

export const activityAuthorSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    email: z.email(),
    image: nullableText,
  })
  .strict();
export type ActivityAuthor = z.infer<typeof activityAuthorSchema>;

export const activityEntrySchema = z
  .object({
    id: idSchema,
    type: activityTypeSchema,
    subject: nullableText,
    body: nullableText,
    occurredAt: timestampSchema.nullable(),
    dueAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    meta: activityMetaSchema,
    createdAt: timestampSchema,
    createdBy: activityAuthorSchema,
    company: z
      .object({ id: idSchema, name: nonEmptyText })
      .strict()
      .nullable(),
    contact: z
      .object({
        id: idSchema,
        firstName: nonEmptyText,
        lastName: nullableText,
      })
      .strict()
      .nullable(),
    deal: z.object({ id: idSchema, name: nonEmptyText }).strict().nullable(),
    emailThread: z
      .object({
        id: idSchema,
        messageCount: z.number().int().finite().min(0),
        lastMessageAt: timestampSchema,
      })
      .strict()
      .nullable(),
    calendarEvent: z
      .object({
        id: idSchema,
        startsAt: timestampSchema,
        endsAt: timestampSchema,
        isAllDay: z.boolean(),
        location: nullableText,
        conferenceUrl: nullableText,
        attendeeCount: z.number().int().finite().min(0),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ActivityEntry = z.infer<typeof activityEntrySchema>;
export const activitySchema = activityEntrySchema;
export const activityDtoSchema = activityEntrySchema;
export type Activity = ActivityEntry;
export type ActivityDto = ActivityEntry;

export const timelineInputSchema = z
  .object({
    companyId: idSchema.optional(),
    contactId: idSchema.optional(),
    dealId: idSchema.optional(),
    filter: timelineFilterSchema.default("all"),
    cursor: z.string().trim().min(1).optional(),
    limit: z.number().int().finite().min(1).max(100).default(30),
  })
  .strict()
  .refine(
    (value) => Boolean(value.companyId || value.contactId || value.dealId),
    "A timeline needs a company, contact, or deal.",
  );
export type TimelineInput = z.infer<typeof timelineInputSchema>;

export const timelineOutputSchema = z
  .object({
    entries: z.array(activityEntrySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type TimelineOutput = z.infer<typeof timelineOutputSchema>;

export const timelineCountsInputSchema = z
  .object({
    companyId: idSchema.optional(),
    contactId: idSchema.optional(),
    dealId: idSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.companyId || value.contactId || value.dealId),
    "A timeline needs a company, contact, or deal.",
  );
export const timelineCountsOutputSchema = z
  .object({
    all: z.number().int().finite().min(0),
    notes: z.number().int().finite().min(0),
    upcoming: z.number().int().finite().min(0),
    done: z.number().int().finite().min(0),
    email: z.number().int().finite().min(0),
    meetings: z.number().int().finite().min(0),
  })
  .strict();
export type TimelineCountsInput = z.infer<typeof timelineCountsInputSchema>;
export type TimelineCountsOutput = z.infer<typeof timelineCountsOutputSchema>;

export const myTasksInputSchema = z
  .object({
    window: taskWindowSchema.default("all"),
    limit: z.number().int().finite().min(1).max(100).default(25),
    actorId: idSchema,
  })
  .strict();
export const myTasksOutputSchema = z.array(activityEntrySchema);
export type MyTasksInput = z.infer<typeof myTasksInputSchema>;
export type MyTasksOutput = z.infer<typeof myTasksOutputSchema>;

export const completeActivityInputSchema = z
  .object({ id: idSchema, completed: z.boolean().default(true) })
  .strict();
export type CompleteActivityInput = z.infer<
  typeof completeActivityInputSchema
>;

/* Activity lifecycle aliases keep each flat RPC operation explicit while
 * sharing the same strict serialized id shape. */
export const activityGetInputSchema = recordIdInputSchema;
export const activityCompleteInputSchema = completeActivityInputSchema;
export const activityReopenInputSchema = z
  .object({ id: idSchema })
  .strict();
export const activityArchiveInputSchema = archiveInputSchema;
export const activityRestoreInputSchema = restoreInputSchema;
export const activityPurgeInputSchema = purgeInputSchema;
export type ActivityGetInput = z.infer<typeof activityGetInputSchema>;
export type ActivityCompleteInput = z.infer<
  typeof activityCompleteInputSchema
>;
export type ActivityReopenInput = z.infer<typeof activityReopenInputSchema>;
export type ActivityArchiveInput = z.infer<typeof activityArchiveInputSchema>;
export type ActivityRestoreInput = z.infer<typeof activityRestoreInputSchema>;
export type ActivityPurgeInput = z.infer<typeof activityPurgeInputSchema>;

export const activityListInputSchema = timelineInputSchema;
export const activityListOutputSchema = timelineOutputSchema;
export const activityOutputSchema = activityEntrySchema;
export type ActivityListInput = TimelineInput;
export type ActivityListOutput = TimelineOutput;

/**
 * The source dashboard uses the authenticated user for the `me` scope. BB
 * does not expose that identity to every plugin surface, so callers may pass
 * an explicit ownerId; the server may otherwise resolve its local fallback.
 */
export const dashboardSummaryInputSchema = z
  .object({
    scope: dashboardScopeSchema.default("me"),
    ownerId: idSchema.nullable().optional(),
  })
  .strict();
export type DashboardSummaryInput = z.infer<
  typeof dashboardSummaryInputSchema
>;

const dashboardCountSchema = z
  .number()
  .int()
  .finite()
  .min(0);
const dashboardAmountSchema = dashboardCountSchema;

export const dashboardOwnerSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    email: z.email(),
    image: nullableText,
  })
  .strict();
export type DashboardOwner = z.infer<typeof dashboardOwnerSchema>;

export const dashboardCompanyBriefSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    iconUrl: nullableText,
    iconDarkUrl: nullableText,
    iconTone: nullableText,
  })
  .strict();
export type DashboardCompanyBrief = z.infer<typeof dashboardCompanyBriefSchema>;

export const dashboardLinkedRecordSchema = z
  .object({ id: idSchema, name: nonEmptyText })
  .strict();
export type DashboardLinkedRecord = z.infer<typeof dashboardLinkedRecordSchema>;

export const dashboardMonthlyTotalSchema = z
  .object({
    count: dashboardCountSchema,
    valueCents: dashboardAmountSchema,
  })
  .strict();
export type DashboardMonthlyTotal = z.infer<typeof dashboardMonthlyTotalSchema>;

export const dashboardStageBucketSchema = z
  .object({
    stage: dealStageSchema,
    count: dashboardCountSchema,
    valueCents: dashboardAmountSchema,
  })
  .strict();
export type DashboardStageBucket = z.infer<typeof dashboardStageBucketSchema>;

export const dashboardTrendPointSchema = z
  .object({
    month: nonEmptyText,
    won: dashboardAmountSchema,
    created: dashboardAmountSchema,
  })
  .strict();
export type DashboardTrendPoint = z.infer<typeof dashboardTrendPointSchema>;

export const dashboardUnconvertedSchema = z
  .object({
    count: dashboardCountSchema,
    currencies: z.array(currencyCodeSchema),
  })
  .strict();
export type DashboardUnconverted = z.infer<typeof dashboardUnconvertedSchema>;

export const dashboardBiggestOpenDealSchema = z
  .object({
    id: idSchema,
    name: nonEmptyText,
    stage: dealStageSchema,
    currency: currencyCodeSchema,
    company: dashboardCompanyBriefSchema,
    owner: dashboardOwnerSchema,
    amountCents: dashboardAmountSchema.nullable(),
    baseAmountCents: dashboardAmountSchema.nullable(),
    expectedCloseDate: timestampSchema.nullable(),
    stageChangedAt: timestampSchema,
  })
  .strict();
export type DashboardBiggestOpenDeal = z.infer<typeof dashboardBiggestOpenDealSchema>;

export const dashboardOverdueTaskSchema = z
  .object({
    id: idSchema,
    subject: nullableText,
    company: dashboardLinkedRecordSchema.nullable(),
    deal: dashboardLinkedRecordSchema.nullable(),
    dueAt: timestampSchema.nullable(),
  })
  .strict();
export type DashboardOverdueTask = z.infer<typeof dashboardOverdueTaskSchema>;

export const dashboardRecentActivitySchema = z
  .object({
    id: idSchema,
    type: activityTypeSchema,
    subject: nullableText,
    body: nullableText,
    createdBy: dashboardOwnerSchema,
    company: dashboardLinkedRecordSchema.nullable(),
    deal: dashboardLinkedRecordSchema.nullable(),
    createdAt: timestampSchema,
    meta: activityMetaSchema,
  })
  .strict();
export type DashboardRecentActivity = z.infer<typeof dashboardRecentActivitySchema>;

export const dashboardPipelineSchema = z
  .object({
    stages: z.array(dashboardStageBucketSchema),
    totalCents: dashboardAmountSchema,
    totalDeals: dashboardCountSchema,
  })
  .strict();
export type DashboardPipeline = z.infer<typeof dashboardPipelineSchema>;

export const dashboardPerformanceSchema = z
  .object({
    windowDays: dashboardCountSchema,
    wins: dashboardCountSchema,
    losses: dashboardCountSchema,
    winRate: z.number().finite().min(0).max(1).nullable(),
    avgDealCents: dashboardAmountSchema.nullable(),
    avgCycleDays: z.number().finite().min(0).nullable(),
  })
  .strict();
export type DashboardPerformance = z.infer<typeof dashboardPerformanceSchema>;

/** The source service always returns the six most recent calendar months. */
export const DASHBOARD_TREND_MONTHS = 6;

export const dashboardSummaryOutputSchema = z
  .object({
    scope: dashboardScopeSchema,
    reportingCurrency: currencyCodeSchema,
    unconverted: dashboardUnconvertedSchema,
    pipeline: dashboardPipelineSchema,
    wonThisMonth: dashboardMonthlyTotalSchema,
    wonPrevMonth: dashboardMonthlyTotalSchema,
    performance: dashboardPerformanceSchema,
    trend: z
      .array(dashboardTrendPointSchema)
      .length(DASHBOARD_TREND_MONTHS),
    closingThisMonthTotal: dashboardMonthlyTotalSchema,
    biggestOpen: z.array(dashboardBiggestOpenDealSchema).max(6),
    overdueTasks: z.array(dashboardOverdueTaskSchema).max(10),
    recentActivity: z.array(dashboardRecentActivitySchema).max(12),
  })
  .strict();
export type DashboardSummaryOutput = z.infer<typeof dashboardSummaryOutputSchema>;
export const dashboardSummarySchema = dashboardSummaryOutputSchema;

export const savedViewFiltersSchema = z
  .object({
    q: z.string().default(""),
    sort: z.string().trim().default(""),
    dir: sortDirectionSchema.default("asc"),
    archived: z.boolean().default(false),
    filters: z.record(z.string(), z.array(z.string())).default({}),
    columns: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();
export type SavedViewFilters = z.infer<typeof savedViewFiltersSchema>;

export const savedViewSchema = z
  .object({
    id: idSchema,
    entity: fieldEntitySchema,
    name: nonEmptyText.max(120),
    shared: z.boolean(),
    filters: savedViewFiltersSchema,
    ownerId: idSchema.nullable().optional(),
    mine: z.boolean().optional(),
    /** The active default is stored as a BB preference, not in saved_views. */
    isDefault: z.boolean().optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
  })
  .strict();
export type SavedView = z.infer<typeof savedViewSchema>;
export const savedViewDtoSchema = savedViewSchema;

export const savedViewListInputSchema = z
  .object({ entity: fieldEntitySchema })
  .strict();
export type SavedViewListInput = z.infer<typeof savedViewListInputSchema>;

export const savedViewCreateInputSchema = z
  .object({
    entity: fieldEntitySchema,
    name: nonEmptyText.max(120),
    shared: z.boolean().default(false),
    filters: savedViewFiltersSchema,
  })
  .strict();
export type SavedViewCreateInput = z.infer<
  typeof savedViewCreateInputSchema
>;

export const savedViewUpdateDataSchema = z
  .object({
    name: nonEmptyText.max(120).optional(),
    shared: z.boolean().optional(),
    filters: savedViewFiltersSchema.optional(),
  })
  .strict();
export type SavedViewUpdateData = z.infer<typeof savedViewUpdateDataSchema>;

export const savedViewUpdateInputSchema = z
  .object({ id: idSchema, data: savedViewUpdateDataSchema })
  .strict();
export type SavedViewUpdateInput = z.infer<
  typeof savedViewUpdateInputSchema
>;

export const savedViewListOutputSchema = z.array(savedViewSchema);
export type SavedViewListOutput = z.infer<typeof savedViewListOutputSchema>;

export const savedViewDeleteInputSchema = z
  .object({ id: idSchema })
  .strict();
export type SavedViewDeleteInput = z.infer<
  typeof savedViewDeleteInputSchema
>;

export const savedViewDeleteOutputSchema = z
  .object({ id: idSchema })
  .strict();
export type SavedViewDeleteOutput = z.infer<
  typeof savedViewDeleteOutputSchema
>;

export const savedViewSetDefaultInputSchema = z
  .object({ id: idSchema })
  .strict();
export type SavedViewSetDefaultInput = z.infer<
  typeof savedViewSetDefaultInputSchema
>;

/** The selected view is returned so clients can update their active state. */
export const savedViewSetDefaultOutputSchema = savedViewSchema;
export type SavedViewSetDefaultOutput = z.infer<
  typeof savedViewSetDefaultOutputSchema
>;

export const fieldDefinitionListOutputSchema = z.array(fieldDefinitionSchema);
export type FieldDefinitionListOutput = z.infer<
  typeof fieldDefinitionListOutputSchema
>;

export const archiveResultSchema = z
  .object({ id: idSchema, name: nonEmptyText })
  .strict();
export type ArchiveResult = z.infer<typeof archiveResultSchema>;

export const idInputSchema = recordIdInputSchema;
export const companyIdInputSchema = recordIdInputSchema;
export const contactIdInputSchema = recordIdInputSchema;
export const dealIdInputSchema = recordIdInputSchema;
export const fieldIdInputSchema = recordIdInputSchema;
export const savedViewIdInputSchema = recordIdInputSchema;
export const activityIdInputSchema = recordIdInputSchema;

/*
 * Custom-field subresources are kept explicit at the BB RPC boundary even
 * though the source API embeds options in a field definition and values in a
 * record update. This lets the extension expose the same editor surfaces
 * without leaking SQLite's typed value columns over the wire.
 */
export const fieldDefinitionArchiveInputSchema = fieldIdInputSchema;
export const fieldDefinitionRestoreInputSchema = fieldIdInputSchema;
export const fieldDefinitionDeleteInputSchema = fieldIdInputSchema;

const fieldOptionPositionSchema = z
  .number()
  .int()
  .finite()
  .min(0);

export const fieldOptionListInputSchema = z
  .object({
    fieldId: idSchema,
    includeArchived: z.boolean().default(false),
  })
  .strict();
export type FieldOptionListInput = z.infer<typeof fieldOptionListInputSchema>;

export const fieldOptionCreateInputSchema = z
  .object({
    fieldId: idSchema,
    label: nonEmptyText.max(120),
    position: fieldOptionPositionSchema.optional(),
  })
  .strict();
export type FieldOptionCreateInput = z.infer<
  typeof fieldOptionCreateInputSchema
>;

export const fieldOptionUpdateDataSchema = z
  .object({
    label: nonEmptyText.max(120).optional(),
    position: fieldOptionPositionSchema.optional(),
  })
  .strict();
export type FieldOptionUpdateData = z.infer<
  typeof fieldOptionUpdateDataSchema
>;

export const fieldOptionUpdateInputSchema = z
  .object({ id: idSchema, data: fieldOptionUpdateDataSchema })
  .strict();
export type FieldOptionUpdateInput = z.infer<
  typeof fieldOptionUpdateInputSchema
>;

export const fieldOptionArchiveInputSchema = fieldIdInputSchema;
export const fieldOptionRestoreInputSchema = fieldIdInputSchema;
export const fieldOptionDeleteInputSchema = fieldIdInputSchema;
export type FieldOptionArchiveInput = z.infer<
  typeof fieldOptionArchiveInputSchema
>;
export type FieldOptionRestoreInput = z.infer<
  typeof fieldOptionRestoreInputSchema
>;
export type FieldOptionDeleteInput = z.infer<
  typeof fieldOptionDeleteInputSchema
>;

export const fieldOptionOutputSchema = fieldOptionSchema;
export const fieldOptionListOutputSchema = z.array(fieldOptionOutputSchema);
export type FieldOptionListOutput = z.infer<
  typeof fieldOptionListOutputSchema
>;
export const fieldOptionDeleteOutputSchema = z
  .object({ id: idSchema })
  .strict();
export type FieldOptionDeleteOutput = z.infer<
  typeof fieldOptionDeleteOutputSchema
>;

const fieldValueTargetShape = {
  entity: fieldEntitySchema,
  recordId: idSchema,
  fieldId: idSchema,
};

export const fieldValueListInputSchema = z
  .object({
    entity: fieldEntitySchema,
    recordId: idSchema,
    includeArchived: z.boolean().default(false),
  })
  .strict();
export type FieldValueListInput = z.infer<typeof fieldValueListInputSchema>;

export const fieldValueCreateInputSchema = z
  .object({ ...fieldValueTargetShape, value: fieldValueSchema })
  .strict();
export type FieldValueCreateInput = z.infer<
  typeof fieldValueCreateInputSchema
>;

export const fieldValueUpdateInputSchema = z
  .object({ id: idSchema, ...fieldValueTargetShape, value: fieldValueSchema })
  .strict();
export type FieldValueUpdateInput = z.infer<
  typeof fieldValueUpdateInputSchema
>;

export const fieldValueDeleteInputSchema = z
  .object({ id: idSchema, ...fieldValueTargetShape })
  .strict();
export type FieldValueDeleteInput = z.infer<
  typeof fieldValueDeleteInputSchema
>;

export const fieldValueListOutputSchema = z.array(fieldValueOutputSchema);
export type FieldValueListOutput = z.infer<
  typeof fieldValueListOutputSchema
>;
export const fieldValueDeleteOutputSchema = z
  .object({ id: idSchema })
  .strict();
export type FieldValueDeleteOutput = z.infer<
  typeof fieldValueDeleteOutputSchema
>;

export const fieldListInputSchema = z
  .object({ entity: fieldEntitySchema, includeArchived: z.boolean().default(false) })
  .strict();
export type FieldListInput = z.infer<typeof fieldListInputSchema>;

export const fieldByKeyInputSchema = z
  .object({ entity: fieldEntitySchema, key: nonEmptyText })
  .strict();
export type FieldByKeyInput = z.infer<typeof fieldByKeyInputSchema>;

export const fieldEntityInputSchema = z
  .object({ entity: fieldEntitySchema })
  .strict();
export type FieldEntityInput = z.infer<typeof fieldEntityInputSchema>;

export const fieldCoverageOutputSchema = z
  .object({
    filled: z.number().int().finite().min(0),
    total: z.number().int().finite().min(0),
  })
  .strict();
export type FieldCoverageOutput = z.infer<typeof fieldCoverageOutputSchema>;

/** Queue research only for the selected field's currently missing values. */
export const fieldBackfillInputSchema = fieldIdInputSchema;
export type FieldBackfillInput = z.infer<typeof fieldBackfillInputSchema>;

export const fieldDeleteOutputSchema = z
  .object({ id: idSchema })
  .strict();
export const fieldBackfillOutputSchema = z
  .object({ queued: z.boolean() })
  .strict();
export type FieldBackfillOutput = z.infer<typeof fieldBackfillOutputSchema>;

/* Source-compatible aliases used by the first API slices. */
export const companyListInput = companyListInputSchema;
export const contactListInput = contactListInputSchema;
export const dealListInput = dealListInputSchema;
export const companyCreateInput = companyCreateInputSchema;
export const companyUpdateInput = companyUpdateInputSchema;
export const contactCreateInput = contactCreateInputSchema;
export const contactUpdateInput = contactUpdateInputSchema;
export const dealCreateInput = dealCreateInputSchema;
export const dealUpdateInput = dealUpdateInputSchema;
export const bulkIdsInput = bulkIdsInputSchema;
export const savedViewFilters = savedViewFiltersSchema;
export const companyListOutput = companyListOutputSchema;
export const contactListOutput = contactListOutputSchema;
export const dealListOutput = dealListOutputSchema;
export const fieldListInput = fieldListInputSchema;
export const fieldByKeyInput = fieldByKeyInputSchema;
export const fieldEntityInput = fieldEntityInputSchema;
export const fieldCreateInput = fieldDefinitionCreateInputSchema;
export const fieldUpdateInput = fieldDefinitionUpdateInputSchema;
export const fieldReorderInput = fieldDefinitionReorderInputSchema;
export const savedViewListInput = savedViewListInputSchema;
export const savedViewCreateInput = savedViewCreateInputSchema;
export const savedViewUpdateInput = savedViewUpdateInputSchema;
export const dashboardSummaryInput = dashboardSummaryInputSchema;
export const dashboardSummaryOutput = dashboardSummaryOutputSchema;
export const archiveInput = archiveInputSchema;
export const restoreInput = restoreInputSchema;
export const purgeInput = purgeInputSchema;

/* Evidence-backed contact surfaces. */
export const contactFactCreateInput = contactFactCreateInputSchema;
export const contactFactListInput = contactFactListInputSchema;
export const contactFactDecisionInput = contactFactDecisionInputSchema;
export const contactFactSupersedeInput = contactFactSupersedeInputSchema;
export const contactFactOutput = contactFactRecordSchema;
export const contactBriefCreateInput = contactBriefCreateInputSchema;
export const contactBriefCurrentInput = contactBriefCurrentInputSchema;
export const contactBriefVersionInput = contactBriefVersionInputSchema;
export const contactBriefListInput = contactBriefListInputSchema;
export const contactBriefOutput = contactBriefRecordSchema;
export const contactWorkHistoryCreateInput = contactWorkHistoryCreateInputSchema;
export const contactWorkHistoryListInput = contactWorkHistoryListInputSchema;
export const contactWorkHistoryDecisionInput = contactWorkHistoryDecisionInputSchema;
export const contactWorkHistorySupersedeInput = contactWorkHistorySupersedeInputSchema;
export const contactWorkHistoryOutput = contactWorkHistorySchema;
