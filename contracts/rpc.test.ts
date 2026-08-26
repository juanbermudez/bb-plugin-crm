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
      "activity_timeline",
      "activity_timelineCounts",
      "activity_myTasks",
      "activity_get",
      "activity_create",
      "activity_complete",
      "dashboard_summary",
      "savedViews_list",
      "savedViews_create",
      "savedViews_update",
      "savedViews_delete",
      "savedViews_setDefault",
      "fields_list",
      "fields_byKey",
      "fields_filters",
      "fields_coverage",
      "fields_create",
      "fields_update",
      "fields_reorder",
      "fields_archive",
      "fields_restore",
      "fields_delete",
      "fields_options_list",
      "fields_options_create",
      "fields_options_update",
      "fields_options_archive",
      "fields_options_restore",
      "fields_options_delete",
      "fields_values_list",
      "fields_values_create",
      "fields_values_update",
      "fields_values_delete",
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

  it("keeps activity timeline, composer, and task lifecycle inputs strict", () => {
    expect(
      rpcContract.activity_timeline.input.safeParse({
        companyId: "company-1",
        filter: "notes",
        cursor: "cursor-1",
        limit: 30,
      }).success,
    ).toBe(true);
    expect(
      rpcContract.activity_timeline.input.safeParse({
        filter: "notes",
      }).success,
    ).toBe(false);
    expect(
      rpcContract.activity_create.input.safeParse({
        type: "NOTE",
        companyId: "company-1",
        createdById: "local-user",
        body: "Follow up",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.activity_create.input.safeParse({
        type: "TASK",
        contactId: "contact-1",
        createdById: "local-user",
      }).success,
    ).toBe(false);
    expect(
      rpcContract.activity_timelineCounts.input.safeParse({
        dealId: "deal-1",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.activity_complete.input.safeParse({
        id: "activity-1",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.activity_myTasks.input.safeParse({
        actorId: "local-user",
        window: "overdue",
        limit: 25,
      }).success,
    ).toBe(true);
  });

  it("keeps saved views and custom-field subresources strict and JSON-safe", () => {
    expect(
      rpcContract.savedViews_list.input.safeParse({ entity: "COMPANY" })
        .success,
    ).toBe(true);
    expect(
      rpcContract.savedViews_list.input.safeParse({ entity: "company" })
        .success,
    ).toBe(false);
    expect(
      rpcContract.savedViews_create.input.safeParse({
        entity: "DEAL",
        name: "Open renewals",
        filters: {},
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.savedViews_setDefault.input.safeParse({ id: "view-1" })
        .success,
    ).toBe(true);
    expect(
      rpcContract.savedViews_delete.input.safeParse({ id: "view-1", extra: 1 })
        .success,
    ).toBe(false);

    expect(
      rpcContract.fields_list.input.safeParse({
        entity: "CONTACT",
        includeArchived: true,
      }).success,
    ).toBe(true);
    expect(
      rpcContract.fields_create.input.safeParse({
        entity: "COMPANY",
        label: "Segment",
        type: "SELECT",
        options: [{ label: "Enterprise", position: 0 }],
      }).success,
    ).toBe(true);
    expect(
      rpcContract.fields_create.input.safeParse({
        entity: "ORG",
        label: "Segment",
        type: "SELECT",
      }).success,
    ).toBe(false);
    expect(
      rpcContract.fields_options_update.input.safeParse({
        id: "option-1",
        data: { label: "Mid-market", position: 1 },
      }).success,
    ).toBe(true);
    expect(
      rpcContract.fields_options_list.input.safeParse({
        fieldId: "field-1",
        includeArchived: false,
        extra: true,
      }).success,
    ).toBe(false);

    expect(
      rpcContract.fields_values_list.input.safeParse({
        entity: "DEAL",
        recordId: "deal-1",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.fields_values_create.input.safeParse({
        entity: "CONTACT",
        recordId: "contact-1",
        fieldId: "field-1",
        value: "champion",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.fields_values_create.input.safeParse({
        entity: "CONTACT",
        recordId: "contact-1",
        fieldId: "field-1",
        value: new Date(),
      }).success,
    ).toBe(false);
    expect(
      rpcContract.fields_values_update.input.safeParse({
        id: "value-1",
        entity: "COMPANY",
        recordId: "company-1",
        fieldId: "field-1",
        value: 42,
      }).success,
    ).toBe(true);
    expect(
      rpcContract.fields_values_delete.input.safeParse({
        id: "value-1",
        entity: "COMPANY",
        recordId: "company-1",
        fieldId: "field-1",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("supports dashboard scope fallback and validates the source-shaped summary", () => {
    expect(rpcContract.dashboard_summary.input.safeParse({}).success).toBe(
      true,
    );
    expect(
      rpcContract.dashboard_summary.input.parse({ ownerId: "user-1" }),
    ).toEqual({ scope: "me", ownerId: "user-1" });
    expect(
      rpcContract.dashboard_summary.input.safeParse({
        scope: "everyone",
        ownerId: null,
      }).success,
    ).toBe(true);
    expect(
      rpcContract.dashboard_summary.input.safeParse({
        scope: "me",
        ownerId: new Date(),
      }).success,
    ).toBe(false);
    expect(
      rpcContract.dashboard_summary.input.safeParse({
        scope: "all",
      }).success,
    ).toBe(false);

    const summary = {
      scope: "me" as const,
      reportingCurrency: "USD" as const,
      unconverted: { count: 1, currencies: ["EUR" as const] },
      pipeline: {
        stages: [
          { stage: "QUALIFIED_TO_BUY" as const, count: 2, valueCents: 125_000 },
        ],
        totalCents: 125_000,
        totalDeals: 2,
      },
      wonThisMonth: { count: 1, valueCents: 50_000 },
      wonPrevMonth: { count: 0, valueCents: 0 },
      performance: {
        windowDays: 90,
        wins: 1,
        losses: 1,
        winRate: 0.5,
        avgDealCents: 50_000,
        avgCycleDays: 12,
      },
      trend: Array.from({ length: 6 }, (_, index) => ({
        month: `M${index + 1}`,
        won: index * 100,
        created: index * 200,
      })),
      closingThisMonthTotal: { count: 1, valueCents: 50_000 },
      biggestOpen: [],
      overdueTasks: [],
      recentActivity: [],
    };
    expect(
      rpcContract.dashboard_summary.output.safeParse(summary).success,
    ).toBe(true);
    expect(
      rpcContract.dashboard_summary.output.safeParse({
        ...summary,
        pipeline: { ...summary.pipeline, unexpected: true },
      }).success,
    ).toBe(false);
  });
});
