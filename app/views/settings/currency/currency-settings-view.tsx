import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "../../../../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card.js";
import { Icon } from "../../../../components/ui/icon.js";
import { Input } from "../../../../components/ui/input.js";
import {
  CURRENCY_CODES,
  type CurrencyCode,
  type CurrencyMeta,
} from "../../../../contracts/core.js";
import {
  AlertDialog,
  EmptyState,
  PageHeader,
  RecordDrawer,
  TableShell,
} from "../../../components/index.js";
import {
  useCurrencyRpc,
  type CurrencyAuditEntry,
  type CurrencyAuditOutput,
  type CurrencyListOutput,
  type CurrencyManualRateInput,
  type CurrencyRate,
  type CurrencyRerateSummary,
  type CurrencyRpcClient,
} from "./rpc.js";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  JPY: "Japanese Yen",
  GBP: "Pound Sterling",
  CNY: "Chinese Yuan",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  HKD: "Hong Kong Dollar",
  SGD: "Singapore Dollar",
  ZAR: "South African Rand",
};

const DEFAULT_CURRENCIES: readonly CurrencyMeta[] = CURRENCY_CODES.map((code) => ({
  code,
  name: CURRENCY_NAMES[code],
  minorUnits: code === "JPY" ? 0 : 2,
}));

const RATE_COLUMNS = [
  { id: "pair", label: "Pair", className: "min-w-36" },
  { id: "rate", label: "Rate", className: "min-w-44" },
  { id: "source", label: "Source", className: "min-w-32" },
  { id: "as-of", label: "As of", className: "min-w-32" },
  { id: "provider", label: "Provider", className: "min-w-32" },
  { id: "actions", label: "Actions", className: "min-w-40" },
] as const;

const AUDIT_COLUMNS = [
  { id: "audit-pair", label: "Pair", className: "min-w-32" },
  { id: "audit-action", label: "Action", className: "min-w-24" },
  { id: "audit-rate", label: "Rate", className: "min-w-36" },
  { id: "audit-source", label: "Source", className: "min-w-28" },
  { id: "audit-recorded", label: "Recorded", className: "min-w-36" },
] as const;

const EMPTY_LIST: CurrencyListOutput = {
  reportingCurrency: "USD",
  currencies: DEFAULT_CURRENCIES,
  rates: [],
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 8,
  });
}

function currencyName(code: CurrencyCode, currencies: readonly CurrencyMeta[]): string {
  return currencies.find((currency) => currency.code === code)?.name ?? CURRENCY_NAMES[code];
}

function pairLabel(rate: Pick<CurrencyRate, "baseCurrency" | "quoteCurrency">): string {
  return `${rate.baseCurrency} → ${rate.quoteCurrency}`;
}

function auditRows(value: CurrencyAuditOutput): readonly CurrencyAuditEntry[] {
  return "rows" in value ? value.rows : value;
}

function effectiveRates(rates: readonly CurrencyRate[]): CurrencyRate[] {
  const byPair = new Map<string, CurrencyRate>();
  for (const rate of rates) {
    const key = `${rate.baseCurrency}:${rate.quoteCurrency}`;
    const current = byPair.get(key);
    if (
      current === undefined ||
      (current.source === "FETCHED" && rate.source === "MANUAL") ||
      (current.source === rate.source &&
        (rate.updatedAt ?? rate.asOf) > (current.updatedAt ?? current.asOf))
    ) {
      byPair.set(key, rate);
    }
  }
  return [...byPair.values()].sort((left, right) =>
    pairLabel(left).localeCompare(pairLabel(right)),
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface ManualRateFormValue {
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rate: string;
  asOf: string;
  provider: string;
}

type CurrencyConfirmAction =
  | { kind: "remove-rate"; rate: CurrencyRate }
  | { kind: "rerate-all" };

function emptyManualRate(baseCurrency: CurrencyCode): ManualRateFormValue {
  const quoteCurrency =
    CURRENCY_CODES.find((currency) => currency !== baseCurrency) ?? "EUR";
  return {
    baseCurrency,
    quoteCurrency,
    rate: "",
    asOf: "",
    provider: "",
  };
}

interface ManualRateFormProps {
  formId: string;
  value: ManualRateFormValue;
  currencies: readonly CurrencyMeta[];
  editing: boolean;
  saving: boolean;
  error: string | null;
  onChange: (value: ManualRateFormValue) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function ManualRateForm({
  formId,
  value,
  currencies,
  editing,
  saving,
  error,
  onChange,
  onSubmit,
}: ManualRateFormProps) {
  return (
    <form id={formId} className="space-y-5" onSubmit={onSubmit}>
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Manual rates take precedence over fetched rates for the same currency pair. The rate means one unit of the quote currency equals this many units of the base currency.
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-base`}>
            Base currency
          </label>
          <select
            id={`${formId}-base`}
            className={SELECT_CLASS}
            value={value.baseCurrency}
            onChange={(event) =>
              onChange({ ...value, baseCurrency: event.target.value as CurrencyCode })
            }
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} · {currency.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-quote`}>
            Quote currency
          </label>
          <select
            id={`${formId}-quote`}
            className={SELECT_CLASS}
            value={value.quoteCurrency}
            onChange={(event) =>
              onChange({ ...value, quoteCurrency: event.target.value as CurrencyCode })
            }
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} · {currency.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-rate`}>
          Exchange rate
        </label>
        <Input
          id={`${formId}-rate`}
          type="number"
          min="0"
          step="any"
          required
          value={value.rate}
          onChange={(event) => onChange({ ...value, rate: event.target.value })}
          placeholder="1.08"
          inputMode="decimal"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-as-of`}>
            As of <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${formId}-as-of`}
            type="date"
            value={value.asOf}
            onChange={(event) => onChange({ ...value, asOf: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-provider`}>
            Provider <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${formId}-provider`}
            value={value.provider}
            onChange={(event) => onChange({ ...value, provider: event.target.value })}
            placeholder="Treasury desk"
          />
        </div>
      </div>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saving ? (
        <p className="text-sm text-muted-foreground" role="status">
          {editing ? "Saving manual rate…" : "Adding manual rate…"}
        </p>
      ) : null}
    </form>
  );
}

export interface CurrencySettingsViewProps {
  /** Optional client injection keeps settings tests and host previews small. */
  rpcClient?: CurrencyRpcClient;
}

export function CurrencySettingsView({ rpcClient }: CurrencySettingsViewProps) {
  const contextRpc = useCurrencyRpc();
  const rpc = rpcClient ?? contextRpc;
  const [list, setList] = useState<CurrencyListOutput>(EMPTY_LIST);
  const [audit, setAudit] = useState<readonly CurrencyAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<CurrencyRate | null>(null);
  const [editorValue, setEditorValue] = useState<ManualRateFormValue>(
    emptyManualRate("USD"),
  );
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [rerateBusy, setRerateBusy] = useState(false);
  const [rerateError, setRerateError] = useState<string | null>(null);
  const [rerateResult, setRerateResult] = useState<CurrencyRerateSummary | null>(null);
  const [confirmAction, setConfirmAction] = useState<CurrencyConfirmAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, rates, auditResult] = await Promise.all([
        rpc.call("status"),
        rpc.call("currency_rates_listEffective", {}),
        rpc.call("currency_rates_listAudit", { limit: 100 }),
      ]);
      setList({
        reportingCurrency: status.reportingCurrency,
        currencies: DEFAULT_CURRENCIES,
        rates,
      });
      setAudit(auditRows(auditResult));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const currencies = list.currencies ?? DEFAULT_CURRENCIES;
  const rates = useMemo(() => effectiveRates(list.rates), [list.rates]);

  const openCreateEditor = useCallback(() => {
    setEditingRate(null);
    setEditorValue(emptyManualRate(list.reportingCurrency));
    setEditorError(null);
    setEditorOpen(true);
  }, [list.reportingCurrency]);

  const openEditEditor = useCallback((rate: CurrencyRate) => {
    setEditingRate(rate);
    setEditorValue({
      baseCurrency: rate.baseCurrency,
      quoteCurrency: rate.quoteCurrency,
      rate: String(rate.rate),
      asOf: rate.asOf.includes("T") ? rate.asOf.slice(0, 10) : rate.asOf,
      provider: rate.provider ?? "",
    });
    setEditorError(null);
    setEditorOpen(true);
  }, []);

  const submitEditor = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (editorValue.baseCurrency === editorValue.quoteCurrency) {
        setEditorError("Base and quote currencies must be different.");
        return;
      }
      const rate = Number(editorValue.rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        setEditorError("Exchange rate must be greater than zero.");
        return;
      }
      setEditorSaving(true);
      setEditorError(null);
      const input: CurrencyManualRateInput = {
        baseCurrency: editorValue.baseCurrency,
        quoteCurrency: editorValue.quoteCurrency,
        rate,
        ...(editorValue.asOf.trim()
          ? { asOf: `${editorValue.asOf.trim()}T00:00:00.000Z` }
          : {}),
        ...(editorValue.provider.trim()
          ? { provider: editorValue.provider.trim() }
          : {}),
      };
      try {
        await rpc.call("currency_rates_upsertManual", input);
        setEditorOpen(false);
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setEditorError(errorMessage(cause));
      } finally {
        setEditorSaving(false);
      }
    },
    [editorValue, rpc],
  );

  const removeManualRate = useCallback(
    async (rate: CurrencyRate) => {
      if (rate.source !== "MANUAL") return;
      setError(null);
      try {
        await rpc.call("currency_rates_removeManual", {
          baseCurrency: rate.baseCurrency,
          quoteCurrency: rate.quoteCurrency,
        });
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setError(errorMessage(cause));
        throw cause;
      }
    },
    [rpc],
  );

  const rerateAll = useCallback(async () => {
    setRerateBusy(true);
    setRerateError(null);
    setRerateResult(null);
    try {
      const result = await rpc.call("currency_deals_rerateAll", { onlyMissing: false });
      setRerateResult(result);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setRerateError(errorMessage(cause));
      throw cause;
    } finally {
      setRerateBusy(false);
    }
  }, [list.reportingCurrency, rpc]);

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-background text-foreground">
      <PageHeader
        title="Currency"
        description="Manage the reporting basis and explicit exchange-rate overrides for your pipeline."
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={openCreateEditor}>
              <Icon name="Plus" aria-hidden="true" />
              Add manual rate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rerateBusy}
              onClick={() => setConfirmAction({ kind: "rerate-all" })}
            >
              <Icon name="RotateCcw" aria-hidden="true" />
              {rerateBusy ? "Re-rating…" : "Rerate all deals"}
            </Button>
          </>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 sm:p-5">
        {error === null ? null : (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}
        {rerateError === null ? null : (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {rerateError}
          </div>
        )}
        {rerateResult === null ? null : (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm" role="status">
            Re-rated {rerateResult.processed} {rerateResult.processed === 1 ? "deal" : "deals"} in {rerateResult.baseCurrency}: {rerateResult.converted} converted, {rerateResult.cleared} cleared.
            {rerateResult.missing.length > 0
              ? ` Missing rates remain for ${rerateResult.missing.join(", ")}.`
              : ""}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-sm">Reporting currency</CardTitle>
              <CardDescription className="mt-1">
                The workspace basis used for compatible pipeline totals.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-semibold tracking-tight">{list.reportingCurrency}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {currencyName(list.reportingCurrency, currencies)}
              </p>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Reporting currency is configured in BB settings. This view exposes the active value and the rates used to convert source deal amounts.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-sm">Conversion policy</CardTitle>
              <CardDescription className="mt-1">
                Manual overrides and base-money snapshots remain auditable.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Configured rates</p>
                <p className="mt-1 font-medium">{rates.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Manual overrides</p>
                <p className="mt-1 font-medium">{rates.filter((rate) => rate.source === "MANUAL").length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Audit entries</p>
                <p className="mt-1 font-medium">{audit.length}</p>
              </div>
              <p className="border-t border-border pt-3 text-xs text-muted-foreground sm:col-span-3">
                Deal source values are never silently rewritten. Only an explicit rerate action updates frozen reporting amounts.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-3">
            <div>
              <CardTitle className="text-sm">Exchange rates</CardTitle>
              <CardDescription className="mt-1">
                Effective rates for the reporting and source-currency pairs.
              </CardDescription>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={openCreateEditor}>
              <Icon name="Plus" aria-hidden="true" />
              Add rate
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <TableShell
              caption="Exchange rates"
              columns={RATE_COLUMNS}
              loading={loading}
              empty={
                <EmptyState
                  icon="ArrowUpDown"
                  title="No exchange rates configured"
                  description="Add a manual rate or connect a fetched rate source before rerating deals."
                  action={
                    <Button type="button" size="sm" onClick={openCreateEditor}>
                      <Icon name="Plus" aria-hidden="true" />
                      Add manual rate
                    </Button>
                  }
                  className="min-h-40 rounded-none border-0 bg-transparent"
                />
              }
            >
              {rates.map((rate) => (
                <tr key={rate.id}>
                  <td className="px-3 py-3 font-medium">{pairLabel(rate)}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    1 {rate.quoteCurrency} = {formatRate(rate.rate)} {rate.baseCurrency}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {rate.source === "MANUAL" ? "Manual override" : "Fetched"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {formatDate(rate.asOf)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {rate.provider?.trim() || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${rate.source === "MANUAL" ? "Edit" : "Override"} ${pairLabel(rate)} rate`}
                        onClick={() => openEditEditor(rate)}
                      >
                        <Icon name={rate.source === "MANUAL" ? "Edit" : "Plus"} aria-hidden="true" />
                        {rate.source === "MANUAL" ? "Edit" : "Override"}
                      </Button>
                      {rate.source === "MANUAL" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${pairLabel(rate)} manual rate`}
                          onClick={() => setConfirmAction({ kind: "remove-rate", rate })}
                        >
                          <Icon name="Trash2" aria-hidden="true" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </TableShell>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Rates are expressed as base currency units per one quote currency unit. A manual rate wins over a fetched rate for the same pair.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-sm">Audit history</CardTitle>
            <CardDescription className="mt-1">
              Every manual upsert and removal is retained with the prior value when available.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <details open className="group">
              <summary className="cursor-pointer border-y border-border px-4 py-3 text-sm font-medium marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                View rate history
              </summary>
              <TableShell
                caption="Exchange-rate audit history"
                columns={AUDIT_COLUMNS}
                loading={loading}
                empty={
                  <EmptyState
                    icon="Clock"
                    title="No rate history yet"
                    description="Manual changes will appear here with their source and recorded timestamp."
                    className="min-h-32 rounded-none border-0 bg-transparent"
                  />
                }
                className="rounded-none border-0"
              >
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-3 font-medium">
                      {entry.baseCurrency} → {entry.quoteCurrency}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{entry.action}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {entry.rate === null
                        ? "—"
                        : `1 ${entry.quoteCurrency} = ${formatRate(entry.rate)} ${entry.baseCurrency}`}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{entry.source}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {formatDate(entry.recordedAt)}
                    </td>
                  </tr>
                ))}
              </TableShell>
            </details>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction?.kind === "remove-rate"
            ? `Remove the manual ${pairLabel(confirmAction.rate)} override?`
            : "Rerate all deals?"
        }
        description={
          confirmAction?.kind === "remove-rate"
            ? "The fetched rate, if available, will become effective for this pair."
            : `Re-rate all deals using ${list.reportingCurrency}. Existing frozen base amounts will be replaced by the selected rates.`
        }
        confirmLabel={confirmAction?.kind === "remove-rate" ? "Remove rate" : "Rerate deals"}
        destructive={confirmAction?.kind === "remove-rate"}
        disabled={rerateBusy}
        onConfirm={async () => {
          if (confirmAction?.kind === "remove-rate") {
            await removeManualRate(confirmAction.rate);
          } else if (confirmAction?.kind === "rerate-all") {
            await rerateAll();
          }
        }}
      />

      <RecordDrawer
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditorError(null);
        }}
        title={editingRate === null ? "Add manual rate" : "Edit manual rate"}
        description={
          editingRate === null
            ? "Create an auditable override for a currency pair."
            : `Update the manual ${pairLabel(editingRate)} override.`
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={editorSaving}
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="manual-rate-form" disabled={editorSaving}>
              {editorSaving ? "Saving…" : editingRate === null ? "Add manual rate" : "Save rate"}
            </Button>
          </>
        }
      >
        <ManualRateForm
          formId="manual-rate-form"
          value={editorValue}
          currencies={currencies}
          editing={editingRate !== null}
          saving={editorSaving}
          error={editorError}
          onChange={setEditorValue}
          onSubmit={submitEditor}
        />
      </RecordDrawer>
    </div>
  );
}
