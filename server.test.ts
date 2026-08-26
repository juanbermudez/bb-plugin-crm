import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
import { createCurrencyStore } from "./db/currency.js";

describe("CRM plugin foundation", () => {
  it("registers status RPC and CLI over migrated storage", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: {
        workspaceName: "Revenue",
        reportingCurrency: "EUR",
      },
    });

    await plugin(bb);

    await expect(harness.behavior.callRpc("status", null)).resolves.toEqual({
      version: "0.1.0",
      schemaVersion: 4,
      workspaceName: "Revenue",
      reportingCurrency: "EUR",
    });

    const result = await harness.behavior.runCli(["status"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Workspace: Revenue");
    expect(result.stdout).toContain("Reporting currency: EUR");

    await harness.lifecycle.dispose();
  });

  it("rejects unknown CLI commands", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const result = await harness.behavior.runCli(["unknown"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown CRM command");

    await harness.lifecycle.dispose();
  });

  it("persists the typed company RPC lifecycle and publishes changes", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const acme = await harness.behavior.callRpc("companies_create", {
      name: "Acme",
      domain: "https://www.acme.example/pricing",
      ownerId: "owner_1",
    });
    expect(acme).toMatchObject({
      name: "Acme",
      domain: "acme.example",
      ownerId: "owner_1",
      contactCount: 0,
      openDealCount: 0,
      fields: {},
    });

    const listed = await harness.behavior.callRpc("companies_list", {
      q: "acme.example",
    });
    expect(listed).toMatchObject({ total: 1 });
    expect((listed as { rows: Array<{ id: string }> }).rows).toHaveLength(1);

    const id = (acme as { id: string }).id;
    const archived = await harness.behavior.callRpc("companies_archive", { id });
    expect(archived).toMatchObject({ id, archivedAt: expect.any(String) });
    await expect(
      harness.behavior.callRpc("companies_list", { archived: true }),
    ).resolves.toMatchObject({ total: 1 });

    await expect(
      harness.behavior.callRpc("companies_bulkRestore", { ids: [id, "missing"] }),
    ).resolves.toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(harness.realtimeSignals).toEqual(
      expect.arrayContaining([
        { channel: "changed", payload: { entity: "company", action: "created", id } },
        { channel: "changed", payload: { entity: "company", action: "restored", id } },
      ]),
    );

    await harness.lifecycle.dispose();
  });

  it("persists contact relationships and supports contact bulk operations", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Analytical Engines",
      domain: "engines.example",
    })) as { id: string };
    const contact = await harness.behavior.callRpc("contacts_create", {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ADA@EXAMPLE.COM",
      title: "Founder",
      companyId: company.id,
      ownerId: null,
    });
    expect(contact).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      company: { id: company.id, name: "Analytical Engines" },
      fields: {},
      deals: [],
    });

    const listed = await harness.behavior.callRpc("contacts_list", {
      q: "ada@example.com",
      company: [company.id],
    });
    expect(listed).toMatchObject({ total: 1 });

    const id = (contact as { id: string }).id;
    await expect(
      harness.behavior.callRpc("contacts_bulkAssignOwner", {
        ids: [id],
        ownerId: "owner_2",
      }),
    ).resolves.toMatchObject({ requested: 1, succeeded: 1, failed: 0 });
    await expect(harness.behavior.callRpc("contacts_get", { id })).resolves.toMatchObject({
      ownerId: "owner_2",
    });

    await harness.lifecycle.dispose();
  });

  it("persists deals with frozen reporting money and guarded stage changes", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: { reportingCurrency: "USD" },
    });
    await plugin(bb);

    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Pipeline Co",
    })) as { id: string };
    const deal = await harness.behavior.callRpc("deals_create", {
      name: "Expansion",
      companyId: company.id,
      ownerId: "owner_1",
      amountCents: 25_000,
      currency: "USD",
      expectedCloseDate: "2026-09-30",
    });
    expect(deal).toMatchObject({
      name: "Expansion",
      amountCents: 25_000,
      currency: "USD",
      baseAmountCents: 25_000,
      baseCurrency: "USD",
      fxRate: 1,
      company: { id: company.id, name: "Pipeline Co" },
      contacts: [],
    });

    const listed = await harness.behavior.callRpc("deals_list", { status: "open" });
    expect(listed).toMatchObject({
      total: 1,
      openValueCents: 25_000,
      reportingCurrency: "USD",
      unconverted: { count: 0, currencies: [] },
    });

    const id = (deal as { id: string }).id;
    await expect(
      harness.behavior.callRpc("deals_setStage", { id, stage: "CLOSED_LOST" }),
    ).rejects.toThrow(/close reason/i);
    await expect(
      harness.behavior.callRpc("deals_setStage", {
        id,
        stage: "CLOSED_LOST",
        closedReason: "Budget moved",
      }),
    ).resolves.toMatchObject({
      stage: "CLOSED_LOST",
      closedReason: "Budget moved",
      closedAt: expect.any(String),
    });

    await harness.lifecycle.dispose();
  });

  it("freezes a configured exchange rate when a foreign-currency deal is created", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: { reportingCurrency: "USD" },
    });
    await plugin(bb);
    createCurrencyStore(bb.storage.database()).upsertManual({
      baseCurrency: "USD",
      quoteCurrency: "EUR",
      rate: 1.2,
      asOf: "2026-08-25T12:00:00.000Z",
      actorId: "owner_1",
    });
    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Global Pipeline",
    })) as { id: string };

    await expect(
      harness.behavior.callRpc("deals_create", {
        name: "European expansion",
        companyId: company.id,
        ownerId: "owner_1",
        amountCents: 10_000,
        currency: "EUR",
      }),
    ).resolves.toMatchObject({
      amountCents: 10_000,
      currency: "EUR",
      baseAmountCents: 12_000,
      baseCurrency: "USD",
      fxRate: 1.2,
      fxRateAt: "2026-08-25T12:00:00.000Z",
    });

    await harness.lifecycle.dispose();
  });

  it("administers manual rates and explicitly re-rates deals through typed RPC", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: { reportingCurrency: "USD" },
    });
    await plugin(bb);
    await harness.behavior.callRpc("currency_rates_upsertManual", {
      baseCurrency: "USD",
      quoteCurrency: "EUR",
      rate: 1.1,
      asOf: "2026-08-24T00:00:00.000Z",
      actorId: "owner_1",
    });
    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Rate Admin Co",
    })) as { id: string };
    const deal = (await harness.behavior.callRpc("deals_create", {
      name: "Rate Admin Deal",
      companyId: company.id,
      ownerId: "owner_1",
      amountCents: 10_000,
      currency: "EUR",
    })) as { id: string };

    await expect(
      harness.behavior.callRpc("currency_rates_listEffective", {}),
    ).resolves.toEqual([
      expect.objectContaining({
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        source: "MANUAL",
        rate: 1.1,
      }),
    ]);
    await harness.behavior.callRpc("currency_rates_upsertManual", {
      baseCurrency: "USD",
      quoteCurrency: "EUR",
      rate: 1.2,
      asOf: "2026-08-25T00:00:00.000Z",
    });
    await expect(
      harness.behavior.callRpc("currency_deals_rerate", { id: deal.id }),
    ).resolves.toMatchObject({
      baseAmountCents: 12_000,
      baseCurrency: "USD",
      fxRate: 1.2,
      fxRateAt: "2026-08-25T00:00:00.000Z",
    });
    await expect(
      harness.behavior.callRpc("currency_rates_listAudit", {
        baseCurrency: "USD",
        quoteCurrency: "EUR",
      }),
    ).resolves.toHaveLength(2);
    await expect(
      harness.behavior.callRpc("currency_rates_removeManual", {
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        actorId: "owner_1",
      }),
    ).resolves.toMatchObject({ rate: 1.2, source: "MANUAL" });
    await expect(
      harness.behavior.callRpc("currency_deals_rerateAll", {}),
    ).resolves.toMatchObject({
      baseCurrency: "USD",
      converted: 0,
      cleared: 1,
      missing: ["EUR"],
      processed: 1,
    });

    await harness.lifecycle.dispose();
  });

  it("composes a source-shaped timeline and completes assigned tasks", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);
    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Timeline Co",
    })) as { id: string };
    await harness.behavior.callRpc("activity_create", {
      type: "NOTE",
      companyId: company.id,
      createdById: "local_user",
      body: "Discovery call captured",
      occurredAt: "2026-08-25T13:00:00.000Z",
    });
    const task = (await harness.behavior.callRpc("activity_create", {
      type: "TASK",
      companyId: company.id,
      createdById: "local_user",
      subject: "Send proposal",
      dueAt: "2026-08-26T13:00:00.000Z",
      occurredAt: "2026-08-25T14:00:00.000Z",
    })) as { id: string };

    await expect(
      harness.behavior.callRpc("activity_timeline", {
        companyId: company.id,
        filter: "all",
      }),
    ).resolves.toMatchObject({
      entries: [
        expect.objectContaining({ id: task.id, type: "TASK" }),
        expect.objectContaining({ type: "NOTE", body: "Discovery call captured" }),
      ],
      nextCursor: null,
    });
    await expect(
      harness.behavior.callRpc("activity_timelineCounts", { companyId: company.id }),
    ).resolves.toMatchObject({ all: 2, notes: 1, upcoming: 1, done: 0 });
    await expect(
      harness.behavior.callRpc("activity_myTasks", {
        actorId: "local_user",
        window: "all",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: task.id })]);
    await expect(
      harness.behavior.callRpc("activity_complete", { id: task.id }),
    ).resolves.toMatchObject({ id: task.id, completedAt: expect.any(String) });
    await expect(
      harness.behavior.callRpc("activity_myTasks", {
        actorId: "local_user",
        window: "all",
      }),
    ).resolves.toEqual([]);
    await expect(
      harness.behavior.callRpc("companies_get", { id: company.id }),
    ).resolves.toMatchObject({ lastActivityAt: expect.any(String) });

    await harness.lifecycle.dispose();
  });
});
