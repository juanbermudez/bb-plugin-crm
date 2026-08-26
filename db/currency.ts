import {
  newRecordId,
  nullableText,
  nowIso,
  RecordNotFoundError,
  requiredText,
  type Db,
} from "./types.js";
import { getDeal, type Deal } from "./deals.js";

/** The currencies supported by the source CRM, in picker order. */
export const CURRENCIES = [
  { code: "USD", name: "US Dollar", minorUnits: 2 },
  { code: "EUR", name: "Euro", minorUnits: 2 },
  { code: "JPY", name: "Japanese Yen", minorUnits: 0 },
  { code: "GBP", name: "Pound Sterling", minorUnits: 2 },
  { code: "CNY", name: "Chinese Yuan", minorUnits: 2 },
  { code: "AUD", name: "Australian Dollar", minorUnits: 2 },
  { code: "CAD", name: "Canadian Dollar", minorUnits: 2 },
  { code: "CHF", name: "Swiss Franc", minorUnits: 2 },
  { code: "HKD", name: "Hong Kong Dollar", minorUnits: 2 },
  { code: "SGD", name: "Singapore Dollar", minorUnits: 2 },
  { code: "ZAR", name: "South African Rand", minorUnits: 2 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES: readonly CurrencyCode[] = CURRENCIES.map(
  (entry) => entry.code,
);

export const DEFAULT_REPORTING_CURRENCY: CurrencyCode = "USD";

const CURRENCY_BY_CODE = new Map<string, (typeof CURRENCIES)[number]>(
  CURRENCIES.map((entry) => [entry.code, entry]),
);

export function normalizeCurrency(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return CURRENCY_BY_CODE.has(normalizeCurrency(value));
}

export function currencyMeta(value: string | null | undefined): (typeof CURRENCIES)[number] | null {
  return CURRENCY_BY_CODE.get(normalizeCurrency(value)) ?? null;
}

export function currencyName(value: string | null | undefined): string | null {
  return currencyMeta(value)?.name ?? null;
}

export function minorUnitsOf(value: string | null | undefined): number {
  return currencyMeta(value)?.minorUnits ?? 2;
}

function assertCurrencyCode(value: string, label: string): CurrencyCode {
  const normalized = normalizeCurrency(value);
  if (!isCurrencyCode(normalized)) {
    throw new Error(`${label} must be one of ${CURRENCY_CODES.join(", ")}.`);
  }
  return normalized;
}

export const RATE_SOURCES = ["FETCHED", "MANUAL"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
export type RateOrigin = RateSource | "IDENTITY";

export interface ExchangeRate {
  id: string;
  /** Units of base currency per one unit of quote currency. */
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rate: number;
  asOf: string;
  source: RateSource;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RateWriteOptions {
  id?: string;
  asOf?: string | Date;
  provider?: string | null;
  actorId?: string | null;
}

export interface ExchangeRateUpsertInput extends RateWriteOptions {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: RateSource;
}

export type ManualRateInput = Omit<ExchangeRateUpsertInput, "source"> & {
  source?: "MANUAL";
};

export type FetchedRateInput = Omit<ExchangeRateUpsertInput, "source"> & {
  source?: "FETCHED";
};

export interface RateListOptions {
  baseCurrency?: string;
  quoteCurrency?: string;
  sources?: readonly RateSource[];
  limit?: number;
}

export const RATE_AUDIT_ACTIONS = ["UPSERT", "DELETE"] as const;
export type RateAuditAction = (typeof RATE_AUDIT_ACTIONS)[number];

export interface ExchangeRateAudit {
  id: string;
  exchangeRateId: string | null;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  source: RateSource;
  action: RateAuditAction;
  rate: number | null;
  asOf: string | null;
  provider: string | null;
  previousRate: number | null;
  previousAsOf: string | null;
  previousProvider: string | null;
  actorId: string | null;
  recordedAt: string;
}

export interface RateAuditListOptions {
  baseCurrency?: string;
  quoteCurrency?: string;
  source?: RateSource;
  limit?: number;
}

export interface ResolvedRate {
  rate: number;
  asOf: string;
  origin: RateOrigin;
  provider: string | null;
  source: RateOrigin;
}

export type RoundingMode = "HALF_UP" | "DOWN" | "UP";

export interface Conversion {
  /** Converted integer amount in the target/reporting currency's minor units. */
  amountMinorUnits: number;
  /** Alias used by the deal wire model. */
  baseAmountCents: number;
  /** Alias for callers that use the generic conversion vocabulary. */
  convertedAmountMinorUnits: number;
  fromCurrency: CurrencyCode;
  baseCurrency: CurrencyCode;
  rate: number;
  fxRate: number;
  asOf: string;
  fxRateAt: string;
  origin: RateOrigin;
  source: RateOrigin;
  provider: string | null;
}

export interface ConvertOptions {
  rounding?: RoundingMode;
  now?: string | Date;
}

export interface RerateDealOptions extends ConvertOptions {
  /** Skip deals that already have a conversion for the requested base. */
  onlyMissing?: boolean;
}

export interface RerateSummary {
  baseCurrency: CurrencyCode;
  converted: number;
  cleared: number;
  missing: string[];
  processed: number;
}

function timestamp(value: string | Date | undefined, label: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid date.`);
    return value.toISOString();
  }
  return requiredText(value ?? nowIso(), label);
}

function positiveRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Exchange rate must be a finite number greater than zero.");
  }
  return value;
}

function assertRateSource(value: string): RateSource {
  if ((RATE_SOURCES as readonly string[]).includes(value)) return value as RateSource;
  throw new Error(`Invalid exchange-rate source: ${value}.`);
}

function assertAuditAction(value: string): RateAuditAction {
  if ((RATE_AUDIT_ACTIONS as readonly string[]).includes(value)) {
    return value as RateAuditAction;
  }
  throw new Error(`Invalid exchange-rate audit action: ${value}.`);
}

function normalizeRateInput(input: ExchangeRateUpsertInput): {
  id: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rate: number;
  asOf: string;
  source: RateSource;
  provider: string | null;
  actorId: string | null;
  createdAt: string;
} {
  const baseCurrency = assertCurrencyCode(input.baseCurrency, "Base currency");
  const quoteCurrency = assertCurrencyCode(input.quoteCurrency, "Quote currency");
  if (baseCurrency === quoteCurrency) {
    throw new Error("An exchange-rate pair must contain two different currencies.");
  }
  return {
    id: input.id?.trim() || newRecordId("rate"),
    baseCurrency,
    quoteCurrency,
    rate: positiveRate(input.rate),
    asOf: timestamp(input.asOf, "Exchange-rate as-of timestamp"),
    source: assertRateSource(input.source),
    provider: nullableText(input.provider),
    actorId: nullableText(input.actorId),
    createdAt: nowIso(),
  };
}

function nullableRowString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function rowNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  return positiveRate(parsed) || (() => {
    throw new Error(`${label} must be a positive number.`);
  })();
}

function parseRate(value: unknown): ExchangeRate {
  if (!value || typeof value !== "object") throw new Error("Missing exchange-rate row.");
  const row = value as Record<string, unknown>;
  const baseCurrency = assertCurrencyCode(String(row.baseCurrency), "Base currency");
  const quoteCurrency = assertCurrencyCode(String(row.quoteCurrency), "Quote currency");
  if (baseCurrency === quoteCurrency) throw new Error("An exchange-rate pair cannot be identical.");
  return {
    id: requiredText(String(row.id), "Exchange-rate id"),
    baseCurrency,
    quoteCurrency,
    rate: rowNumber(row.rate, "Exchange rate"),
    asOf: requiredText(String(row.asOf), "Exchange-rate as-of timestamp"),
    source: assertRateSource(String(row.source)),
    provider: nullableRowString(row.provider),
    createdAt: requiredText(String(row.createdAt), "Exchange-rate created timestamp"),
    updatedAt: requiredText(String(row.updatedAt), "Exchange-rate updated timestamp"),
  };
}

function nullablePositiveRowNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return rowNumber(value, label);
}

function parseAudit(value: unknown): ExchangeRateAudit {
  if (!value || typeof value !== "object") throw new Error("Missing exchange-rate audit row.");
  const row = value as Record<string, unknown>;
  return {
    id: requiredText(String(row.id), "Exchange-rate audit id"),
    exchangeRateId: nullableRowString(row.exchangeRateId),
    baseCurrency: assertCurrencyCode(String(row.baseCurrency), "Base currency"),
    quoteCurrency: assertCurrencyCode(String(row.quoteCurrency), "Quote currency"),
    source: assertRateSource(String(row.source)),
    action: assertAuditAction(String(row.action)),
    rate: nullablePositiveRowNumber(row.rate, "Exchange-rate audit rate"),
    asOf: nullableRowString(row.asOf),
    provider: nullableRowString(row.provider),
    previousRate: nullablePositiveRowNumber(row.previousRate, "Previous exchange rate"),
    previousAsOf: nullableRowString(row.previousAsOf),
    previousProvider: nullableRowString(row.previousProvider),
    actorId: nullableRowString(row.actorId),
    recordedAt: requiredText(String(row.recordedAt), "Exchange-rate audit timestamp"),
  };
}

const RATE_SELECT = `
  SELECT
    id,
    base_currency AS baseCurrency,
    quote_currency AS quoteCurrency,
    rate,
    as_of AS asOf,
    source,
    provider,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM exchange_rates`;

const AUDIT_SELECT = `
  SELECT
    id,
    exchange_rate_id AS exchangeRateId,
    base_currency AS baseCurrency,
    quote_currency AS quoteCurrency,
    source,
    action,
    rate,
    as_of AS asOf,
    provider,
    previous_rate AS previousRate,
    previous_as_of AS previousAsOf,
    previous_provider AS previousProvider,
    actor_id AS actorId,
    recorded_at AS recordedAt
  FROM exchange_rate_audit`;

function listLimit(value: number | undefined, label: string): number {
  const limit = value ?? 500;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1_000) {
    throw new Error(`${label} must be an integer between 0 and 1000.`);
  }
  return limit;
}

export class ExchangeRateStore {
  constructor(private readonly db: Db) {}

  get(id: string): ExchangeRate | null {
    const raw = this.db.prepare(`${RATE_SELECT} WHERE id = ?`).get(requiredText(id, "Exchange-rate id"));
    return raw === undefined ? null : parseRate(raw);
  }

  getRequired(id: string): ExchangeRate {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("exchange rate", id);
    return value;
  }

  getByPair(baseCurrency: string, quoteCurrency: string, source: RateSource): ExchangeRate | null {
    const base = assertCurrencyCode(baseCurrency, "Base currency");
    const quote = assertCurrencyCode(quoteCurrency, "Quote currency");
    const normalizedSource = assertRateSource(source);
    const raw = this.db
      .prepare(`${RATE_SELECT} WHERE base_currency = ? AND quote_currency = ? AND source = ?`)
      .get(base, quote, normalizedSource);
    return raw === undefined ? null : parseRate(raw);
  }

  list(options: RateListOptions = {}): ExchangeRate[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.baseCurrency !== undefined) {
      clauses.push("base_currency = ?");
      params.push(assertCurrencyCode(options.baseCurrency, "Base currency"));
    }
    if (options.quoteCurrency !== undefined) {
      clauses.push("quote_currency = ?");
      params.push(assertCurrencyCode(options.quoteCurrency, "Quote currency"));
    }
    if (options.sources !== undefined) {
      const sources = options.sources.map((source) => assertRateSource(source));
      if (sources.length === 0) return [];
      clauses.push(`source IN (${sources.map(() => "?").join(", ")})`);
      params.push(...sources);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    params.push(listLimit(options.limit, "Exchange-rate list limit"));
    return this.db
      .prepare(
        `${RATE_SELECT}${where}
         ORDER BY base_currency ASC, quote_currency ASC,
           CASE source WHEN 'MANUAL' THEN 0 ELSE 1 END,
           updated_at DESC, id DESC LIMIT ?`,
      )
      .all(...params)
      .map(parseRate);
  }

  /** Returns the effective rate for each quote, hiding a fetched row overridden by manual input. */
  listEffective(baseCurrency: string, limit?: number): ExchangeRate[] {
    const base = assertCurrencyCode(baseCurrency, "Base currency");
    const effective = new Map<CurrencyCode, ExchangeRate>();
    for (const rate of this.list({ baseCurrency: base, limit: 1_000 })) {
      const current = effective.get(rate.quoteCurrency);
      if (!current || (current.source === "FETCHED" && rate.source === "MANUAL")) {
        effective.set(rate.quoteCurrency, rate);
      }
    }
    return [...effective.values()]
      .sort((left, right) => left.quoteCurrency.localeCompare(right.quoteCurrency))
      .slice(0, listLimit(limit, "Effective exchange-rate list limit"));
  }

  listAudit(options: RateAuditListOptions = {}): ExchangeRateAudit[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.baseCurrency !== undefined) {
      clauses.push("base_currency = ?");
      params.push(assertCurrencyCode(options.baseCurrency, "Base currency"));
    }
    if (options.quoteCurrency !== undefined) {
      clauses.push("quote_currency = ?");
      params.push(assertCurrencyCode(options.quoteCurrency, "Quote currency"));
    }
    if (options.source !== undefined) {
      clauses.push("source = ?");
      params.push(assertRateSource(options.source));
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    params.push(listLimit(options.limit, "Exchange-rate audit list limit"));
    return this.db
      // Several writes can share the same millisecond. SQLite rowid preserves
      // insertion order, while the random audit id does not.
      .prepare(`${AUDIT_SELECT}${where} ORDER BY recorded_at DESC, rowid DESC LIMIT ?`)
      .all(...params)
      .map(parseAudit);
  }

  upsert(input: ExchangeRateUpsertInput): ExchangeRate {
    const value = normalizeRateInput(input);
    return this.db.transaction(() => {
      const existing = this.getByPair(value.baseCurrency, value.quoteCurrency, value.source);
      const id = existing?.id ?? value.id;
      const now = nowIso();
      if (existing) {
        this.db
          .prepare(`
            UPDATE exchange_rates
            SET rate = @rate,
                as_of = @asOf,
                provider = @provider,
                updated_at = @updatedAt
            WHERE id = @id`)
          .run({
            id,
            rate: value.rate,
            asOf: value.asOf,
            provider: value.provider,
            updatedAt: now,
          });
      } else {
        this.db
          .prepare(`
            INSERT INTO exchange_rates (
              id, base_currency, quote_currency, rate, as_of, source,
              provider, created_at, updated_at
            ) VALUES (
              @id, @baseCurrency, @quoteCurrency, @rate, @asOf, @source,
              @provider, @createdAt, @updatedAt
            )`)
          .run({
            id,
            baseCurrency: value.baseCurrency,
            quoteCurrency: value.quoteCurrency,
            rate: value.rate,
            asOf: value.asOf,
            source: value.source,
            provider: value.provider,
            createdAt: value.createdAt,
            updatedAt: now,
          });
      }
      this.writeAudit({
        exchangeRateId: id,
        baseCurrency: value.baseCurrency,
        quoteCurrency: value.quoteCurrency,
        source: value.source,
        action: "UPSERT",
        rate: value.rate,
        asOf: value.asOf,
        provider: value.provider,
        previousRate: existing?.rate ?? null,
        previousAsOf: existing?.asOf ?? null,
        previousProvider: existing?.provider ?? null,
        actorId: value.actorId,
      });
      return this.getRequired(id);
    })();
  }

  upsertManual(input: ManualRateInput): ExchangeRate;
  upsertManual(
    baseCurrency: string,
    quoteCurrency: string,
    rate: number,
    options?: RateWriteOptions,
  ): ExchangeRate;
  upsertManual(
    inputOrBase: ManualRateInput | string,
    quoteCurrency?: string,
    rate?: number,
    options: RateWriteOptions = {},
  ): ExchangeRate {
    const input: ExchangeRateUpsertInput = typeof inputOrBase === "string"
      ? {
          ...options,
          baseCurrency: inputOrBase,
          quoteCurrency: requiredText(quoteCurrency ?? "", "Quote currency"),
          rate: rate as number,
          source: "MANUAL",
        }
      : { ...inputOrBase, source: "MANUAL" };
    return this.upsert(input);
  }

  upsertFetched(input: FetchedRateInput): ExchangeRate;
  upsertFetched(
    baseCurrency: string,
    quoteCurrency: string,
    rate: number,
    options?: RateWriteOptions,
  ): ExchangeRate;
  upsertFetched(
    inputOrBase: FetchedRateInput | string,
    quoteCurrency?: string,
    rate?: number,
    options: RateWriteOptions = {},
  ): ExchangeRate {
    const input: ExchangeRateUpsertInput = typeof inputOrBase === "string"
      ? {
          ...options,
          baseCurrency: inputOrBase,
          quoteCurrency: requiredText(quoteCurrency ?? "", "Quote currency"),
          rate: rate as number,
          source: "FETCHED",
        }
      : { ...inputOrBase, source: "FETCHED" };
    return this.upsert(input);
  }

  remove(baseCurrency: string, quoteCurrency: string, source: RateSource, actorId?: string | null): ExchangeRate | null {
    const base = assertCurrencyCode(baseCurrency, "Base currency");
    const quote = assertCurrencyCode(quoteCurrency, "Quote currency");
    const normalizedSource = assertRateSource(source);
    return this.db.transaction(() => {
      const existing = this.getByPair(base, quote, normalizedSource);
      if (!existing) return null;
      this.writeAudit({
        exchangeRateId: existing.id,
        baseCurrency: existing.baseCurrency,
        quoteCurrency: existing.quoteCurrency,
        source: existing.source,
        action: "DELETE",
        rate: null,
        asOf: null,
        provider: null,
        previousRate: existing.rate,
        previousAsOf: existing.asOf,
        previousProvider: existing.provider,
        actorId: nullableText(actorId),
      });
      this.db.prepare("DELETE FROM exchange_rates WHERE id = ?").run(existing.id);
      return existing;
    })();
  }

  removeManual(baseCurrency: string, quoteCurrency: string, actorId?: string | null): ExchangeRate | null {
    return this.remove(baseCurrency, quoteCurrency, "MANUAL", actorId);
  }

  resolve(baseCurrency: string, quoteCurrency: string, now: string | Date = new Date()): ResolvedRate | null {
    const base = normalizeCurrency(baseCurrency);
    const quote = normalizeCurrency(quoteCurrency);
    if (!isCurrencyCode(base) || !isCurrencyCode(quote)) return null;
    const asOf = timestamp(now, "Rate resolution timestamp");
    if (base === quote) {
      return { rate: 1, asOf, origin: "IDENTITY", source: "IDENTITY", provider: null };
    }
    const rows = this.list({ baseCurrency: base, quoteCurrency: quote, limit: 100 });
    const chosen = rows.find((row) => row.source === "MANUAL") ?? rows.find((row) => row.source === "FETCHED");
    if (!chosen || chosen.rate <= 0) return null;
    return {
      rate: chosen.rate,
      asOf: chosen.asOf,
      origin: chosen.source,
      source: chosen.source,
      provider: chosen.provider,
    };
  }

  private writeAudit(input: {
    exchangeRateId: string;
    baseCurrency: CurrencyCode;
    quoteCurrency: CurrencyCode;
    source: RateSource;
    action: RateAuditAction;
    rate: number | null;
    asOf: string | null;
    provider: string | null;
    previousRate: number | null;
    previousAsOf: string | null;
    previousProvider: string | null;
    actorId: string | null;
  }): void {
    this.db
      .prepare(`
        INSERT INTO exchange_rate_audit (
          id, exchange_rate_id, base_currency, quote_currency, source, action,
          rate, as_of, provider, previous_rate, previous_as_of,
          previous_provider, actor_id, recorded_at
        ) VALUES (
          @id, @exchangeRateId, @baseCurrency, @quoteCurrency, @source, @action,
          @rate, @asOf, @provider, @previousRate, @previousAsOf,
          @previousProvider, @actorId, @recordedAt
        )`)
      .run({
        id: newRecordId("rate_audit"),
        exchangeRateId: input.exchangeRateId,
        baseCurrency: input.baseCurrency,
        quoteCurrency: input.quoteCurrency,
        source: input.source,
        action: input.action,
        rate: input.rate,
        asOf: input.asOf,
        provider: input.provider,
        previousRate: input.previousRate,
        previousAsOf: input.previousAsOf,
        previousProvider: input.previousProvider,
        actorId: input.actorId,
        recordedAt: nowIso(),
      });
  }
}

function decimalFraction(value: number): { numerator: bigint; denominator: bigint } {
  const text = value.toString().toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalPlaces = fraction.length;
  const numerator = BigInt(digits);
  if (exponent >= decimalPlaces) {
    return { numerator: numerator * 10n ** BigInt(exponent - decimalPlaces), denominator: 1n };
  }
  return {
    numerator,
    denominator: 10n ** BigInt(decimalPlaces - exponent),
  };
}

function assertRoundingMode(value: RoundingMode): RoundingMode {
  if (value === "HALF_UP" || value === "DOWN" || value === "UP") return value;
  throw new Error(`Invalid rounding mode: ${value}.`);
}

function roundFraction(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || mode === "DOWN") return quotient;
  if (mode === "UP") return quotient + 1n;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

/**
 * Convert a non-negative integer minor-unit amount using an explicit rounding
 * rule. Rates are represented as base-major-units per quote-major-unit, so the
 * currency scales are included before rounding to the target minor unit.
 */
export function convertMinorUnits(
  amountMinorUnits: number,
  fromCurrency: string,
  baseCurrency: string,
  rate: number,
  rounding: RoundingMode = "HALF_UP",
): number {
  if (!Number.isSafeInteger(amountMinorUnits) || amountMinorUnits < 0) {
    throw new Error("Amount must be a non-negative safe integer in minor units.");
  }
  const from = assertCurrencyCode(fromCurrency, "Source currency");
  const base = assertCurrencyCode(baseCurrency, "Base currency");
  const normalizedRounding = assertRoundingMode(rounding);
  const positive = positiveRate(rate);
  const sourceScale = 10n ** BigInt(minorUnitsOf(from));
  const baseScale = 10n ** BigInt(minorUnitsOf(base));
  const fraction = decimalFraction(positive);
  const numerator = BigInt(amountMinorUnits) * fraction.numerator * baseScale;
  const denominator = sourceScale * fraction.denominator;
  const rounded = roundFraction(numerator, denominator, normalizedRounding);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Converted amount exceeds the safe integer range.");
  }
  return Number(rounded);
}

export class CurrencyService {
  private readonly db: Db;
  readonly rates: ExchangeRateStore;
  readonly exchangeRates: ExchangeRateStore;
  readonly defaultReportingCurrency: CurrencyCode;

  constructor(db: Db, reportingCurrency: string = DEFAULT_REPORTING_CURRENCY) {
    this.db = db;
    this.rates = new ExchangeRateStore(db);
    this.exchangeRates = this.rates;
    this.defaultReportingCurrency = assertCurrencyCode(reportingCurrency, "Reporting currency");
  }

  upsert(input: ExchangeRateUpsertInput): ExchangeRate {
    return this.rates.upsert(input);
  }

  upsertManual(input: ManualRateInput): ExchangeRate;
  upsertManual(baseCurrency: string, quoteCurrency: string, rate: number, options?: RateWriteOptions): ExchangeRate;
  upsertManual(
    inputOrBase: ManualRateInput | string,
    quoteCurrency?: string,
    rate?: number,
    options?: RateWriteOptions,
  ): ExchangeRate {
    if (typeof inputOrBase === "string") {
      return this.rates.upsertManual(inputOrBase, quoteCurrency ?? "", rate as number, options);
    }
    return this.rates.upsertManual(inputOrBase);
  }

  upsertFetched(input: FetchedRateInput): ExchangeRate;
  upsertFetched(baseCurrency: string, quoteCurrency: string, rate: number, options?: RateWriteOptions): ExchangeRate;
  upsertFetched(
    inputOrBase: FetchedRateInput | string,
    quoteCurrency?: string,
    rate?: number,
    options?: RateWriteOptions,
  ): ExchangeRate {
    if (typeof inputOrBase === "string") {
      return this.rates.upsertFetched(inputOrBase, quoteCurrency ?? "", rate as number, options);
    }
    return this.rates.upsertFetched(inputOrBase);
  }

  list(options: RateListOptions = {}): ExchangeRate[] {
    return this.rates.list(options);
  }

  listEffective(baseCurrency: string = this.defaultReportingCurrency, limit?: number): ExchangeRate[] {
    return this.rates.listEffective(baseCurrency, limit);
  }

  listAudit(options: RateAuditListOptions = {}): ExchangeRateAudit[] {
    return this.rates.listAudit(options);
  }

  resolveRate(
    baseCurrency: string,
    quoteCurrency: string,
    now: string | Date = new Date(),
  ): ResolvedRate | null {
    return this.rates.resolve(baseCurrency, quoteCurrency, now);
  }

  convert(
    amountMinorUnits: number,
    fromCurrency: string,
    baseCurrency: string = this.defaultReportingCurrency,
    options: ConvertOptions = {},
  ): Conversion | null {
    if (!Number.isSafeInteger(amountMinorUnits) || amountMinorUnits < 0) {
      throw new Error("Amount must be a non-negative safe integer in minor units.");
    }
    const from = normalizeCurrency(fromCurrency);
    const base = normalizeCurrency(baseCurrency);
    if (!isCurrencyCode(from) || !isCurrencyCode(base)) return null;
    const resolved = this.rates.resolve(base, from, options.now ?? new Date());
    if (!resolved) return null;
    const amount = convertMinorUnits(
      amountMinorUnits,
      from,
      base,
      resolved.rate,
      options.rounding ?? "HALF_UP",
    );
    return {
      amountMinorUnits: amount,
      baseAmountCents: amount,
      convertedAmountMinorUnits: amount,
      fromCurrency: from,
      baseCurrency: base,
      rate: resolved.rate,
      fxRate: resolved.rate,
      asOf: resolved.asOf,
      fxRateAt: resolved.asOf,
      origin: resolved.origin,
      source: resolved.source,
      provider: resolved.provider,
    };
  }

  convertAmount(
    amountMinorUnits: number,
    fromCurrency: string,
    baseCurrency: string = this.defaultReportingCurrency,
    options: ConvertOptions = {},
  ): number | null {
    return this.convert(amountMinorUnits, fromCurrency, baseCurrency, options)?.amountMinorUnits ?? null;
  }

  /** Explicitly refreshes only a deal's frozen base-money columns. */
  rerateDeal(dealId: string, baseCurrency: string = this.defaultReportingCurrency, options: RerateDealOptions = {}): Deal {
    const id = requiredText(dealId, "Deal id");
    const base = assertCurrencyCode(baseCurrency, "Base currency");
    const rounding = options.rounding ?? "HALF_UP";
    const now = options.now ?? new Date();
    return this.ratesDbTransaction((db) => {
      const deal = getDeal(db, id, { includeArchived: true });
      if (!deal) throw new RecordNotFoundError("deal", id);
      if (
        options.onlyMissing &&
        deal.baseAmountCents !== null &&
        deal.baseCurrency === base
      ) {
        return deal;
      }
      const conversion = deal.amountCents === null
        ? null
        : this.convert(deal.amountCents, deal.currency, base, { rounding, now });
      db.prepare(`
        UPDATE deals
        SET base_amount_cents = @baseAmountCents,
            base_currency = @baseCurrency,
            fx_rate = @fxRate,
            fx_rate_at = @fxRateAt
        WHERE id = @id
      `).run({
        id,
        baseAmountCents: conversion?.amountMinorUnits ?? null,
        baseCurrency: conversion?.baseCurrency ?? null,
        fxRate: conversion?.fxRate ?? null,
        fxRateAt: conversion?.fxRateAt ?? null,
      });
      const refreshed = getDeal(db, id, { includeArchived: true });
      if (!refreshed) throw new RecordNotFoundError("deal", id);
      return refreshed;
    });
  }

  rerate(dealId: string, baseCurrency: string = this.defaultReportingCurrency, options: RerateDealOptions = {}): Deal {
    return this.rerateDeal(dealId, baseCurrency, options);
  }

  rerateAll(baseCurrency: string = this.defaultReportingCurrency, options: RerateDealOptions = {}): RerateSummary {
    const base = assertCurrencyCode(baseCurrency, "Base currency");
    const db = this.db;
    const ids = db
      .prepare(
        `SELECT id FROM deals
         WHERE amount_cents IS NOT NULL OR base_amount_cents IS NOT NULL
         ORDER BY id`,
      )
      .all() as Array<{ id: string }>;
    let converted = 0;
    let cleared = 0;
    const missing = new Set<string>();
    let processed = 0;
    for (const { id } of ids) {
      const current = getDeal(db, id, { includeArchived: true });
      if (!current) continue;
      if (
        options.onlyMissing &&
        current.baseAmountCents !== null &&
        current.baseCurrency === base
      ) {
        continue;
      }
      processed += 1;
      if (current.amountCents !== null) {
        const conversion = this.convert(current.amountCents, current.currency, base, options);
        if (conversion) converted += 1;
        else missing.add(normalizeCurrency(current.currency));
      }
      const previousFrozen = current.baseAmountCents !== null || current.baseCurrency !== null || current.fxRate !== null || current.fxRateAt !== null;
      const next = this.rerateDeal(id, base, options);
      if (next.baseAmountCents === null && previousFrozen) cleared += 1;
    }
    return {
      baseCurrency: base,
      converted,
      cleared,
      missing: [...missing].filter(Boolean).sort(),
      processed,
    };
  }

  rerateDeals(baseCurrency: string = this.defaultReportingCurrency, options: RerateDealOptions = {}): RerateSummary {
    return this.rerateAll(baseCurrency, options);
  }

  private ratesDbTransaction<T>(operation: (db: Db) => T): T {
    return this.db.transaction(() => operation(this.db))();
  }
}

export class CurrencyStore extends CurrencyService {}

export function createExchangeRateStore(db: Db): ExchangeRateStore {
  return new ExchangeRateStore(db);
}

export function createCurrencyService(
  db: Db,
  reportingCurrency: string = DEFAULT_REPORTING_CURRENCY,
): CurrencyService {
  return new CurrencyService(db, reportingCurrency);
}

export function createCurrencyStore(
  db: Db,
  reportingCurrency: string = DEFAULT_REPORTING_CURRENCY,
): CurrencyStore {
  return new CurrencyStore(db, reportingCurrency);
}

export function upsertManualRate(
  db: Db,
  input: ManualRateInput,
): ExchangeRate {
  return new ExchangeRateStore(db).upsertManual(input);
}

export function upsertFetchedRate(
  db: Db,
  input: FetchedRateInput,
): ExchangeRate {
  return new ExchangeRateStore(db).upsertFetched(input);
}

export function resolveRate(
  db: Db,
  baseCurrency: string,
  quoteCurrency: string,
  now: string | Date = new Date(),
): ResolvedRate | null {
  return new ExchangeRateStore(db).resolve(baseCurrency, quoteCurrency, now);
}

export function convertAmount(
  db: Db,
  amountMinorUnits: number,
  fromCurrency: string,
  baseCurrency: string,
  options: ConvertOptions = {},
): number | null {
  return new CurrencyService(db).convertAmount(amountMinorUnits, fromCurrency, baseCurrency, options);
}

export function rerateDeal(
  db: Db,
  dealId: string,
  baseCurrency: string = DEFAULT_REPORTING_CURRENCY,
  options: RerateDealOptions = {},
): Deal {
  return new CurrencyService(db, baseCurrency).rerateDeal(dealId, baseCurrency, options);
}

export function rerateDeals(
  db: Db,
  baseCurrency: string = DEFAULT_REPORTING_CURRENCY,
  options: RerateDealOptions = {},
): RerateSummary {
  return new CurrencyService(db, baseCurrency).rerateAll(baseCurrency, options);
}
