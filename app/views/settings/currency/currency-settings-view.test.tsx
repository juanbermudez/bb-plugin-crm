// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrencyMeta } from "../../../../contracts/core.js";
import {
  CurrencySettingsView,
  type CurrencyAuditEntry,
  type CurrencyListOutput,
  type CurrencyRate,
  type CurrencyRpcClient,
} from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const currencies: readonly CurrencyMeta[] = [
  { code: "USD", name: "US Dollar", minorUnits: 2 },
  { code: "EUR", name: "Euro", minorUnits: 2 },
  { code: "GBP", name: "Pound Sterling", minorUnits: 2 },
];

const fetchedRate: CurrencyRate = {
  id: "rate_fetched",
  baseCurrency: "USD",
  quoteCurrency: "EUR",
  rate: 0.91,
  asOf: "2026-08-20T00:00:00.000Z",
  source: "FETCHED",
  provider: "ECB",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const manualRate: CurrencyRate = {
  ...fetchedRate,
  id: "rate_manual",
  rate: 0.95,
  source: "MANUAL",
  provider: "Treasury desk",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

const auditEntry: CurrencyAuditEntry = {
  id: "audit_1",
  exchangeRateId: manualRate.id,
  baseCurrency: "USD",
  quoteCurrency: "EUR",
  source: "MANUAL",
  action: "UPSERT",
  rate: manualRate.rate,
  asOf: manualRate.asOf,
  provider: manualRate.provider,
  previousRate: fetchedRate.rate,
  previousAsOf: fetchedRate.asOf,
  previousProvider: fetchedRate.provider,
  actorId: null,
  recordedAt: "2026-08-25T00:00:00.000Z",
};

function listResult(rates: readonly CurrencyRate[] = [manualRate]): CurrencyListOutput {
  return {
    reportingCurrency: "USD",
    currencies,
    rates,
  };
}

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "status") return { reportingCurrency: "USD" };
      if (method === "currency_rates_listEffective") return listResult().rates;
      if (method === "currency_rates_listAudit") return [auditEntry];
      if (method === "currency_rates_upsertManual") return manualRate;
      if (method === "currency_deals_rerateAll") {
        return {
          baseCurrency: "USD",
          converted: 1,
          cleared: 0,
          missing: [],
          processed: 1,
        };
      }
      return manualRate;
    }),
  );
  return { call } as unknown as CurrencyRpcClient & { call: typeof call };
}

describe("CurrencySettingsView", () => {
  it("shows reporting currency, effective rates, and disclosed audit history", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "status") return { reportingCurrency: "USD" };
      if (method === "currency_rates_listEffective") return listResult([fetchedRate, manualRate]).rates;
      if (method === "currency_rates_listAudit") return { rows: [auditEntry] };
      return manualRate;
    });
    render(<CurrencySettingsView rpcClient={rpc} />);

    expect(await screen.findByText("Reporting currency")).toBeDefined();
    expect(screen.getByText("USD")).toBeDefined();
    expect(screen.getByText("US Dollar")).toBeDefined();
    expect(screen.getAllByRole("columnheader", { name: "Pair" }).length).toBe(2);
    expect(screen.getAllByRole("columnheader", { name: "Rate" }).length).toBe(2);
    expect(screen.getAllByText("USD → EUR").length).toBe(2);
    expect(screen.getByText("Manual override")).toBeDefined();
    expect(screen.getAllByText(/0\.95/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("View rate history")).toBeDefined();
    expect(screen.getByText("UPSERT")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("status");
    expect(rpc.call).toHaveBeenCalledWith("currency_rates_listEffective", {});
    expect(rpc.call).toHaveBeenCalledWith("currency_rates_listAudit", { limit: 100 });
  });

  it("upserts and removes a manual rate from the editor", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "status") return { reportingCurrency: "USD" };
      if (method === "currency_rates_listEffective") return listResult([manualRate]).rates;
      if (method === "currency_rates_listAudit") return [auditEntry];
      if (method === "currency_rates_upsertManual") return manualRate;
      if (method === "currency_rates_removeManual") return manualRate;
      return manualRate;
    });
    render(<CurrencySettingsView rpcClient={rpc} />);
    await screen.findAllByText("USD → EUR");

    fireEvent.click(screen.getAllByRole("button", { name: "Add manual rate" })[0]!);
    const editor = screen.getByRole("dialog", { name: "Add manual rate" });
    fireEvent.change(within(editor).getByLabelText("Base currency"), {
      target: { value: "USD" },
    });
    fireEvent.change(within(editor).getByLabelText("Quote currency"), {
      target: { value: "GBP" },
    });
    fireEvent.change(within(editor).getByLabelText("Exchange rate"), {
      target: { value: "0.79" },
    });
    fireEvent.change(within(editor).getByLabelText("As of (optional)"), {
      target: { value: "2026-08-25" },
    });
    fireEvent.change(within(editor).getByLabelText("Provider (optional)"), {
      target: { value: "Treasury desk" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Add manual rate" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("currency_rates_upsertManual", {
        baseCurrency: "USD",
        quoteCurrency: "GBP",
        rate: 0.79,
        asOf: "2026-08-25T00:00:00.000Z",
        provider: "Treasury desk",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add manual rate" })).toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove USD → EUR manual rate" }));
    const removal = await screen.findByRole("dialog", {
      name: /Remove the manual USD → EUR override/,
    });
    fireEvent.click(within(removal).getByRole("button", { name: "Remove rate" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("currency_rates_removeManual", {
        baseCurrency: "USD",
        quoteCurrency: "EUR",
      }),
    );
  });

  it("runs an explicit rerate-all action and reports its summary", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "status") return { reportingCurrency: "USD" };
      if (method === "currency_rates_listEffective") return listResult().rates;
      if (method === "currency_rates_listAudit") return [];
      if (method === "currency_deals_rerateAll") {
        return {
          baseCurrency: "USD",
          converted: 2,
          cleared: 1,
          missing: ["GBP"],
          processed: 3,
        };
      }
      return manualRate;
    });
    render(<CurrencySettingsView rpcClient={rpc} />);
    await screen.findByText("USD → EUR");

    fireEvent.click(screen.getByRole("button", { name: "Rerate all deals" }));
    const rerate = await screen.findByRole("dialog", { name: "Rerate all deals?" });
    fireEvent.click(within(rerate).getByRole("button", { name: "Rerate deals" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("currency_deals_rerateAll", {
        onlyMissing: false,
      }),
    );
    expect(await screen.findByText(/Re-rated 3 deals in USD/)).toBeDefined();
    expect(screen.getByText(/Missing rates remain for GBP/)).toBeDefined();
  });
});
