import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  CurrencyCode,
  CurrencyMeta,
  RateSource,
} from "../../../../contracts/core.js";
import { rpcContract } from "../../../../contracts/rpc.js";

/**
 * Currency RPC shapes stay local until the shared contract exposes the
 * settings surface. The root can replace these with contract aliases without
 * changing the view's rendering or mutation behavior.
 */
export interface CurrencyRate {
  id: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  /** Units of base currency per one unit of quote currency. */
  rate: number;
  asOf: string;
  source: RateSource;
  provider: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CurrencyAuditEntry {
  id: string;
  exchangeRateId: string | null;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  source: RateSource;
  action: "UPSERT" | "DELETE";
  rate: number | null;
  asOf: string | null;
  provider: string | null;
  previousRate: number | null;
  previousAsOf: string | null;
  previousProvider: string | null;
  actorId: string | null;
  recordedAt: string;
}

export interface CurrencyListOutput {
  reportingCurrency: CurrencyCode;
  currencies?: readonly CurrencyMeta[];
  rates: readonly CurrencyRate[];
}

export interface CurrencyAuditInput {
  baseCurrency?: CurrencyCode;
  quoteCurrency?: CurrencyCode;
  source?: RateSource;
  limit?: number;
}

export type CurrencyAuditOutput =
  | readonly CurrencyAuditEntry[]
  | { rows: readonly CurrencyAuditEntry[] };

export interface CurrencyManualRateInput {
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rate: number;
  asOf?: string;
  provider?: string | null;
}

export interface CurrencyRerateAllInput {
  onlyMissing: boolean;
}

export interface CurrencyRerateSummary {
  baseCurrency: CurrencyCode;
  converted: number;
  cleared: number;
  missing: readonly string[];
  processed: number;
}

export interface CurrencyRpcClient {
  call(method: "status"): Promise<{ reportingCurrency: CurrencyCode }>;
  call(
    method: "currency_rates_listEffective",
    input: { baseCurrency?: CurrencyCode; limit?: number },
  ): Promise<readonly CurrencyRate[]>;
  call(
    method: "currency_rates_listAudit",
    input: CurrencyAuditInput,
  ): Promise<CurrencyAuditOutput>;
  call(
    method: "currency_rates_upsertManual",
    input: CurrencyManualRateInput,
  ): Promise<CurrencyRate>;
  call(
    method: "currency_rates_removeManual",
    input: { baseCurrency: CurrencyCode; quoteCurrency: CurrencyCode },
  ): Promise<CurrencyRate | null>;
  call(
    method: "currency_deals_rerateAll",
    input: CurrencyRerateAllInput,
  ): Promise<CurrencyRerateSummary>;
}

/** Use BB's host RPC client while keeping the view easy to preview and test. */
export function useCurrencyRpc(): CurrencyRpcClient {
  return useRpc<typeof rpcContract>() as unknown as CurrencyRpcClient;
}
