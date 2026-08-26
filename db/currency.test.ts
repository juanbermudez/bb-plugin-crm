import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createCompany } from "./companies.js";
import { createDeal, getDeal, updateDeal } from "./deals.js";
import {
  CURRENCIES,
  CurrencyService,
  ExchangeRateStore,
  createCurrencyStore,
  convertMinorUnits,
  initializeSchema,
} from "./index.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-currency-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("CRM currency persistence", () => {
  it("stores manual and fetched rates with manual precedence and audit history", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      expect(CURRENCIES).toHaveLength(11);
      const rates = createCurrencyStore(db).rates;
      const fetched = rates.upsertFetched({
        baseCurrency: "usd",
        quoteCurrency: "eur",
        rate: 1.1,
        asOf: "2026-08-01T00:00:00.000Z",
        provider: "feed.example",
      });
      const manual = rates.upsertManual({
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        rate: 1.2,
        asOf: "2026-08-02T00:00:00.000Z",
        actorId: "user_1",
      });

      expect(fetched.source).toBe("FETCHED");
      expect(manual.source).toBe("MANUAL");
      expect(rates.resolve("USD", "EUR")).toMatchObject({
        rate: 1.2,
        origin: "MANUAL",
      });
      expect(rates.list({ baseCurrency: "USD", quoteCurrency: "EUR" })).toHaveLength(2);
      expect(rates.listEffective("USD")).toEqual([expect.objectContaining({
        quoteCurrency: "EUR",
        source: "MANUAL",
        rate: 1.2,
      })]);

      const updated = rates.upsertManual({
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        rate: 1.25,
        asOf: "2026-08-03T00:00:00.000Z",
      });
      expect(updated.id).toBe(manual.id);
      expect(rates.listAudit({ baseCurrency: "USD", quoteCurrency: "EUR" })).toHaveLength(3);
      expect(rates.listAudit({ source: "MANUAL", limit: 1 })[0]).toMatchObject({
        action: "UPSERT",
        rate: 1.25,
        previousRate: 1.2,
      });

      rates.removeManual("USD", "EUR", "user_2");
      expect(rates.resolve("USD", "EUR")).toMatchObject({
        rate: 1.1,
        origin: "FETCHED",
      });
      expect(rates.listAudit({ source: "MANUAL" })[0]).toMatchObject({
        action: "DELETE",
        previousRate: 1.25,
        actorId: "user_2",
      });
    } finally {
      await lifecycle.dispose();
    }
  });

  it("converts integer minor units with currency scales and explicit rounding", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const rates = new ExchangeRateStore(db);
      rates.upsertFetched({
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        rate: 1.2,
        asOf: "2026-08-01T00:00:00.000Z",
      });
      rates.upsertFetched({
        baseCurrency: "USD",
        quoteCurrency: "JPY",
        rate: 0.0067,
        asOf: "2026-08-01T00:00:00.000Z",
      });
      rates.upsertFetched({
        baseCurrency: "JPY",
        quoteCurrency: "USD",
        rate: 150.555,
        asOf: "2026-08-01T00:00:00.000Z",
      });

      expect(convertMinorUnits(10_00, "EUR", "USD", 1.2)).toBe(12_00);
      expect(convertMinorUnits(100, "JPY", "USD", 0.0067)).toBe(67);
      expect(convertMinorUnits(10_000, "USD", "JPY", 150.555)).toBe(15_056);
      expect(convertMinorUnits(1, "JPY", "USD", 0.005, "HALF_UP")).toBe(1);
      expect(convertMinorUnits(1, "JPY", "USD", 0.005, "DOWN")).toBe(0);
      expect(convertMinorUnits(1, "JPY", "USD", 0.005, "UP")).toBe(1);

      const service = new CurrencyService(db);
      expect(service.convert(10_00, "EUR", "USD")).toMatchObject({
        amountMinorUnits: 12_00,
        baseAmountCents: 12_00,
        fxRate: 1.2,
        origin: "FETCHED",
      });
      expect(service.convert(100, "JPY", "USD")?.amountMinorUnits).toBe(67);
      expect(service.convert(500, "USD", "USD")?.origin).toBe("IDENTITY");
      expect(service.convert(100, "USD", "CHF")).toBeNull();
    } finally {
      await lifecycle.dispose();
    }
  });

  it("re-rates only frozen deal money and leaves ordinary updates frozen", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompany(db, { name: "Acme" });
      const deal = createDeal(db, {
        id: "deal_currency",
        name: "Expansion",
        companyId: company.id,
        ownerId: "user_1",
        amountCents: 10_000,
        currency: "EUR",
        baseAmountCents: 11_000,
        baseCurrency: "USD",
        fxRate: 1.1,
        fxRateAt: "2026-07-01T00:00:00.000Z",
      });
      const createdUpdatedAt = deal.updatedAt;
      const rates = new ExchangeRateStore(db);
      rates.upsertFetched({
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        rate: 1.2,
        asOf: "2026-08-01T00:00:00.000Z",
      });

      const rerated = new CurrencyService(db).rerateDeal(deal.id, "USD");
      expect(rerated).toMatchObject({
        id: deal.id,
        name: "Expansion",
        amountCents: 10_000,
        currency: "EUR",
        baseAmountCents: 12_000,
        baseCurrency: "USD",
        fxRate: 1.2,
        fxRateAt: "2026-08-01T00:00:00.000Z",
      });
      expect(rerated.updatedAt).toBe(createdUpdatedAt);

      const ordinaryUpdate = updateDeal(db, deal.id, {
        amountCents: 20_000,
        currency: "GBP",
        description: "Source amount changed",
      });
      expect(ordinaryUpdate.amountCents).toBe(20_000);
      expect(ordinaryUpdate.currency).toBe("GBP");
      expect(ordinaryUpdate.baseAmountCents).toBe(12_000);
      expect(ordinaryUpdate.baseCurrency).toBe("USD");
      expect(ordinaryUpdate.fxRate).toBe(1.2);
      expect(ordinaryUpdate.fxRateAt).toBe("2026-08-01T00:00:00.000Z");

      const missing = new CurrencyService(db).rerateAll("USD");
      expect(missing.missing).toEqual(["GBP"]);
      expect(missing.cleared).toBe(1);
      expect(getDeal(db, deal.id)).toMatchObject({
        amountCents: 20_000,
        currency: "GBP",
        baseAmountCents: null,
        baseCurrency: null,
        fxRate: null,
        fxRateAt: null,
      });
    } finally {
      await lifecycle.dispose();
    }
  });
});
