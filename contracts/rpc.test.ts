import { describe, expect, it } from "vitest";
import { rpcContract } from "./rpc.js";

describe("CRM RPC contract", () => {
  it("uses deterministic flat method names for all implemented surfaces", () => {
    expect(Object.keys(rpcContract)).toEqual([
      "status",
      "companies_list",
      "companies_get",
      "companies_create",
      "companies_update",
      "companies_archive",
      "companies_restore",
      "companies_purge",
      "companies_bulkAssignOwner",
      "companies_bulkArchive",
      "companies_bulkRestore",
      "companies_bulkPurge",
      "contacts_list",
      "contacts_get",
      "contacts_create",
      "contacts_update",
      "contacts_archive",
      "contacts_restore",
      "contacts_purge",
      "contacts_bulkAssignOwner",
      "contacts_bulkAssignCompany",
      "contacts_bulkArchive",
      "contacts_bulkRestore",
      "contacts_bulkPurge",
      "deals_list",
      "deals_get",
      "deals_create",
      "deals_update",
      "deals_setStage",
      "deals_archive",
      "deals_restore",
      "deals_purge",
      "deals_bulkAssignOwner",
      "deals_bulkSetStage",
      "deals_bulkArchive",
      "deals_bulkRestore",
      "deals_bulkPurge",
      "currency_rates_list",
      "currency_rates_listEffective",
      "currency_rates_listAudit",
      "currency_rates_upsertManual",
      "currency_rates_removeManual",
      "currency_deals_rerate",
      "currency_deals_rerateAll",
    ]);
  });

  it("keeps company RPC inputs and outputs strict", () => {
    expect(
      rpcContract.companies_create.input.safeParse({
        name: "Acme",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.companies_list.input.safeParse({
        page: 1,
        pageSize: 25,
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("keeps contact RPC inputs strict", () => {
    expect(
      rpcContract.contacts_create.input.safeParse({
        firstName: "Ada",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.contacts_list.input.safeParse({
        page: 1,
        pageSize: 25,
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("keeps deal RPC inputs strict", () => {
    expect(
      rpcContract.deals_create.input.safeParse({
        name: "Expansion",
        companyId: "company-1",
        ownerId: "owner-1",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.deals_setStage.input.safeParse({
        id: "deal-1",
        stage: "CLOSED_WON",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.deals_list.input.safeParse({
        page: 1,
        pageSize: 25,
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("validates currency pairs, rate filters, and rerate options at the boundary", () => {
    expect(
      rpcContract.currency_rates_upsertManual.input.safeParse({
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        rate: 1.1,
        asOf: "2026-08-25T00:00:00.000Z",
        provider: "manual",
        actorId: "user-1",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.currency_rates_upsertManual.input.safeParse({
        baseCurrency: "USD",
        quoteCurrency: "USD",
        rate: 1.1,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.currency_rates_upsertManual.input.safeParse({
        baseCurrency: "usd",
        quoteCurrency: "EUR",
        rate: 1.1,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.currency_rates_list.input.safeParse({
        baseCurrency: "USD",
        sources: ["MANUAL"],
        limit: 100,
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.currency_deals_rerate.input.safeParse({
        id: "deal-1",
        baseCurrency: "USD",
        rounding: "HALF_UP",
        onlyMissing: true,
        now: "2026-08-25T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.currency_deals_rerateAll.input.safeParse({
        now: new Date(),
      }).success,
    ).toBe(false);
  });
});
