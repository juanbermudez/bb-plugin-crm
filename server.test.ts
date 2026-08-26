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
      schemaVersion: 5,
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

  it("registers native CRM agent tools for search, records, fields, and activity", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);
    expect(harness.registrations.agentTools.map((tool) => tool.name)).toEqual([
      "crm_search",
      "crm_get_record",
      "crm_create_record",
      "crm_update_record",
      "crm_add_activity",
      "crm_list_tasks",
      "crm_set_field",
    ]);

    const created = JSON.parse(String(await harness.callAgentTool(
      "crm_create_record",
      { entity: "company", data: { name: "Agent Tool Co", domain: "agent.example" } },
    ))) as { id: string };
    const search = JSON.parse(String(await harness.callAgentTool(
      "crm_search",
      { query: "agent.example" },
    ))) as { companies: Array<{ id: string }> };
    expect(search.companies).toEqual([expect.objectContaining({ id: created.id })]);
    await expect(harness.callAgentTool("crm_update_record", {
      entity: "company",
      id: created.id,
      data: { industry: "Software" },
    })).resolves.toContain("Software");

    const field = (await harness.behavior.callRpc("fields_create", {
      entity: "COMPANY",
      label: "Account note",
      type: "TEXT",
    })) as { key: string };
    await expect(harness.callAgentTool("crm_set_field", {
      entity: "COMPANY",
      recordId: created.id,
      key: field.key,
      value: "Agent maintained",
    })).resolves.toContain("Agent maintained");
    await expect(harness.callAgentTool("crm_get_record", {
      entity: "company",
      id: created.id,
    })).resolves.toContain("Agent maintained");

    await harness.callAgentTool("crm_add_activity", {
      type: "TASK",
      companyId: created.id,
      subject: "Agent follow-up",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await expect(harness.callAgentTool("crm_list_tasks", {
      window: "all",
    })).resolves.toContain("Agent follow-up");

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
    await expect(
      harness.behavior.callRpc("companies_get", { id: company.id }),
    ).resolves.toMatchObject({
      contacts: [expect.objectContaining({ email: "ada@example.com" })],
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

  it("serves the contact evidence, brief, and work-history lifecycles", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Evidence Systems",
    })) as { id: string };
    const contact = (await harness.behavior.callRpc("contacts_create", {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@evidence.example",
      companyId: company.id,
    })) as { id: string };
    await harness.behavior.callRpc("contacts_create", {
      firstName: "Grace",
      lastName: "Hopper",
      title: "Compiler Engineer",
      companyId: company.id,
    });
    const evidence = [{
      kind: "linkedin.employer-and-name",
      detail: "The profile names Ada and her current employer.",
      sourceUrl: "https://www.linkedin.com/in/ada",
    }] as const;

    const proposed = (await harness.behavior.callRpc("contacts_facts_create", {
      id: "fact_title_server_1",
      contactId: contact.id,
      field: "title",
      value: "Principal Engineer",
      score: 0.85,
      band: "VERIFIED",
      evidence,
      method: "linkedin",
      sourceUrl: evidence[0].sourceUrl,
      observedAt: "2026-08-20T12:00:00.000Z",
    })) as { id: string; status: string };
    expect(proposed).toMatchObject({ id: "fact_title_server_1", status: "PROPOSED" });
    await expect(
      harness.behavior.callRpc("contacts_facts_list", {
        contactId: contact.id,
        field: "title",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: proposed.id, contactId: contact.id })]);
    await expect(
      harness.behavior.callRpc("contacts_facts_get", { id: proposed.id }),
    ).resolves.toMatchObject({ id: proposed.id, evidence });
    await expect(
      harness.behavior.callRpc("contacts_facts_decide", {
        id: proposed.id,
        decision: "accept",
        decidedById: "reviewer-1",
      }),
    ).resolves.toMatchObject({ status: "APPLIED", decidedById: "reviewer-1" });

    const replacement = (await harness.behavior.callRpc("contacts_facts_create", {
      id: "fact_title_server_2",
      contactId: contact.id,
      field: "title",
      value: "VP Engineering",
      score: 0.95,
      band: "VERIFIED",
      evidence,
      method: "linkedin-refresh",
    })) as { id: string };
    await expect(
      harness.behavior.callRpc("contacts_facts_supersede", {
        id: proposed.id,
        replacementId: replacement.id,
      }),
    ).resolves.toMatchObject({ status: "SUPERSEDED", supersededById: replacement.id });
    const dismissed = (await harness.behavior.callRpc("contacts_facts_create", {
      contactId: contact.id,
      field: "location",
      value: "London",
      score: 0.4,
      band: "POSSIBLE",
      evidence,
      method: "profile",
    })) as { id: string };
    await expect(
      harness.behavior.callRpc("contacts_facts_decide", {
        id: dismissed.id,
        decision: "dismiss",
      }),
    ).resolves.toMatchObject({ status: "DISMISSED" });

    const firstBrief = (await harness.behavior.callRpc("contacts_briefs_create", {
      id: "brief_server_1",
      contactId: contact.id,
      narrative: "Ada leads engineering at Evidence Systems.",
      sections: {
        currentRole: "Principal Engineer",
        previousRoles: ["Software Engineer · Analytical Engines"],
      },
      score: 0.85,
      sourceUrl: "https://example.com/ada-brief-1",
      sessionId: "research-1",
    })) as { id: string; version: number };
    const secondBrief = (await harness.behavior.callRpc("contacts_briefs_create", {
      id: "brief_server_2",
      contactId: contact.id,
      narrative: "Ada now serves as VP Engineering at Evidence Systems.",
      sections: { currentRole: "VP Engineering" },
      score: 0.95,
      sourceUrl: "https://example.com/ada-brief-2",
    })) as { id: string; version: number };
    expect(firstBrief.version).toBe(1);
    expect(secondBrief.version).toBe(2);
    await expect(
      harness.behavior.callRpc("contacts_briefs_current", { contactId: contact.id }),
    ).resolves.toMatchObject({ id: secondBrief.id, version: 2 });
    await expect(
      harness.behavior.callRpc("contacts_briefs_getVersion", {
        contactId: contact.id,
        version: 1,
      }),
    ).resolves.toMatchObject({ id: firstBrief.id, version: 1 });
    await expect(
      harness.behavior.callRpc("contacts_briefs_list", { contactId: contact.id }),
    ).resolves.toEqual([
      expect.objectContaining({ id: secondBrief.id, version: 2 }),
      expect.objectContaining({ id: firstBrief.id, version: 1 }),
    ]);
    await expect(
      harness.behavior.callRpc("contacts_briefs_get", { id: firstBrief.id }),
    ).resolves.toMatchObject({ contactId: contact.id, sessionId: "research-1" });

    const oldRole = (await harness.behavior.callRpc("contacts_workHistory_create", {
      id: "work_server_1",
      contactId: contact.id,
      title: "Software Engineer",
      organizationName: "Analytical Engines",
      organizationDomain: "https://engines.example",
      startDate: "2020-01-01",
      endDate: "2024-01-01",
      isCurrent: false,
      score: 0.7,
      band: "PROBABLE",
      evidence,
      method: "profile",
    })) as { id: string };
    await expect(
      harness.behavior.callRpc("contacts_workHistory_get", { id: oldRole.id }),
    ).resolves.toMatchObject({ organizationDomain: "engines.example" });
    await expect(
      harness.behavior.callRpc("contacts_workHistory_decide", {
        id: oldRole.id,
        decision: "accept",
      }),
    ).resolves.toMatchObject({ status: "APPLIED" });
    const currentRole = (await harness.behavior.callRpc("contacts_workHistory_create", {
      id: "work_server_2",
      contactId: contact.id,
      title: "VP Engineering",
      organizationName: "Evidence Systems",
      startDate: "2024-01-01",
      isCurrent: true,
      score: 0.95,
      band: "VERIFIED",
      evidence,
      method: "profile-refresh",
    })) as { id: string };
    await expect(
      harness.behavior.callRpc("contacts_workHistory_supersede", {
        id: oldRole.id,
        replacementId: currentRole.id,
      }),
    ).resolves.toMatchObject({ status: "SUPERSEDED", supersededById: currentRole.id });
    await expect(
      harness.behavior.callRpc("contacts_workHistory_list", {
        contactId: contact.id,
        includeSuperseded: false,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: currentRole.id })]);

    await harness.behavior.callRpc("activity_create", {
      type: "EMAIL",
      contactId: contact.id,
      createdById: "local_user",
      meta: { messageCount: 3, direction: "INBOUND" },
      occurredAt: "2026-08-20T12:00:00.000Z",
    });
    await harness.behavior.callRpc("activity_create", {
      type: "MEETING",
      contactId: contact.id,
      createdById: "local_user",
      subject: "Planning session",
      occurredAt: "2099-01-01T12:00:00.000Z",
    });
    const hydrated = await harness.behavior.callRpc("contacts_get", { id: contact.id });
    expect(hydrated).toMatchObject({
      facts: [expect.objectContaining({ id: replacement.id, status: "PROPOSED" })],
      brief: expect.objectContaining({ narrative: expect.stringContaining("now serves") }),
      workHistory: [expect.objectContaining({ id: currentRole.id, status: "PROPOSED" })],
      relationship: {
        emails: 3,
        threads: 1,
        lastReplyAt: "2026-08-20T12:00:00.000Z",
        meetings: 1,
        nextMeeting: { title: "Planning session", startsAt: "2099-01-01T12:00:00.000Z" },
        colleagues: [expect.objectContaining({ name: "Grace Hopper" })],
      },
    });
    expect(harness.realtimeSignals).toEqual(
      expect.arrayContaining([
        { channel: "changed", payload: { entity: "contact-fact", action: "created", id: proposed.id } },
        { channel: "changed", payload: { entity: "contact-brief", action: "created", id: firstBrief.id } },
        { channel: "changed", payload: { entity: "contact-work-history", action: "created", id: oldRole.id } },
      ]),
    );

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
    await expect(
      harness.behavior.callRpc("companies_get", { id: company.id }),
    ).resolves.toMatchObject({
      deals: [expect.objectContaining({ id: (deal as { id: string }).id, name: "Expansion" })],
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

  it("summarizes pipeline, performance, tasks, and recent activity for the dashboard", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: { reportingCurrency: "USD" },
    });
    await plugin(bb);
    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Dashboard Co",
    })) as { id: string };
    const now = new Date();
    const expectedCloseDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      Math.min(now.getUTCDate() + 1, 28),
    )).toISOString().slice(0, 10);
    const openDeal = (await harness.behavior.callRpc("deals_create", {
      name: "Open expansion",
      companyId: company.id,
      ownerId: "local_user",
      amountCents: 40_000,
      currency: "USD",
      expectedCloseDate,
    })) as { id: string };
    const wonDeal = (await harness.behavior.callRpc("deals_create", {
      name: "Won expansion",
      companyId: company.id,
      ownerId: "local_user",
      amountCents: 15_000,
      currency: "USD",
    })) as { id: string };
    await harness.behavior.callRpc("deals_setStage", {
      id: wonDeal.id,
      stage: "CLOSED_WON",
    });
    const overdue = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
    await harness.behavior.callRpc("activity_create", {
      type: "TASK",
      companyId: company.id,
      createdById: "local_user",
      subject: "Follow up",
      dueAt: overdue,
    });

    await expect(
      harness.behavior.callRpc("dashboard_summary", { scope: "me" }),
    ).resolves.toMatchObject({
      reportingCurrency: "USD",
      pipeline: {
        totalDeals: 1,
        totalCents: 40_000,
        stages: [expect.objectContaining({ stage: "DEMO_BOOKED", count: 1, valueCents: 40_000 })],
      },
      wonThisMonth: { count: 1, valueCents: 15_000 },
      performance: {
        wins: 1,
        losses: 0,
        avgDealCents: 15_000,
      },
      trend: expect.arrayContaining([expect.objectContaining({ month: expect.any(String) })]),
      biggestOpen: [expect.objectContaining({ id: openDeal.id, baseAmountCents: 40_000 })],
      overdueTasks: [expect.objectContaining({ subject: "Follow up" })],
      recentActivity: [expect.objectContaining({ subject: "Follow up" })],
    });
    const summary = await harness.behavior.callRpc("dashboard_summary", {
      scope: "everyone",
    }) as { trend: unknown[] };
    expect(summary.trend).toHaveLength(6);

    await harness.lifecycle.dispose();
  });

  it("serves the complete custom-field definition, option, and value lifecycle", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);
    const company = (await harness.behavior.callRpc("companies_create", {
      name: "Custom Field Co",
    })) as { id: string };
    const field = (await harness.behavior.callRpc("fields_create", {
      entity: "COMPANY",
      label: "Customer tier",
      type: "SELECT",
      options: [{ label: "Enterprise" }, { label: "Growth" }],
      showOnFilter: true,
    })) as { id: string; key: string; options: Array<{ id: string }> };
    const enterprise = field.options[0];

    await expect(
      harness.behavior.callRpc("fields_byKey", {
        entity: "COMPANY",
        key: field.key,
      }),
    ).resolves.toMatchObject({ id: field.id, label: "Customer tier" });
    await expect(
      harness.behavior.callRpc("fields_filters", { entity: "COMPANY" }),
    ).resolves.toEqual([expect.objectContaining({ id: field.id })]);
    await expect(
      harness.behavior.callRpc("companies_update", {
        id: company.id,
        data: { fields: { [field.key]: enterprise.id } },
      }),
    ).resolves.toMatchObject({
      id: company.id,
      fields: { [field.key]: enterprise.id },
    });
    await expect(
      harness.behavior.callRpc("companies_get", { id: company.id }),
    ).resolves.toMatchObject({ fields: { [field.key]: enterprise.id } });
    await expect(
      harness.behavior.callRpc("companies_list", {
        fields: { [field.key]: [enterprise.id] },
      }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      harness.behavior.callRpc("companies_list", {
        fields: { [field.key]: [field.options[1]?.id] },
      }),
    ).resolves.toMatchObject({ total: 0 });
    const value = (await harness.behavior.callRpc("fields_values_create", {
      entity: "COMPANY",
      recordId: company.id,
      fieldId: field.id,
      value: enterprise.id,
    })) as { id: string };
    await expect(
      harness.behavior.callRpc("fields_coverage", { id: field.id }),
    ).resolves.toEqual({ filled: 1, total: 1 });
    await expect(
      harness.behavior.callRpc("fields_values_list", {
        entity: "COMPANY",
        recordId: company.id,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: value.id, value: enterprise.id })]);
    await expect(
      harness.behavior.callRpc("fields_values_update", {
        id: value.id,
        entity: "COMPANY",
        recordId: company.id,
        fieldId: field.id,
        value: field.options[1]?.id,
      }),
    ).resolves.toMatchObject({ id: value.id, value: field.options[1]?.id });
    const option = (await harness.behavior.callRpc("fields_options_create", {
      fieldId: field.id,
      label: "Startup",
    })) as { id: string };
    await expect(
      harness.behavior.callRpc("fields_options_update", {
        id: option.id,
        data: { label: "Early stage" },
      }),
    ).resolves.toMatchObject({ label: "Early stage" });
    await harness.behavior.callRpc("fields_options_archive", { id: option.id });
    await harness.behavior.callRpc("fields_options_restore", { id: option.id });
    await harness.behavior.callRpc("fields_options_delete", { id: option.id });
    await harness.behavior.callRpc("fields_values_delete", {
      id: value.id,
      entity: "COMPANY",
      recordId: company.id,
      fieldId: field.id,
    });
    await harness.behavior.callRpc("fields_update", {
      id: field.id,
      data: { label: "Account tier" },
    });
    await expect(
      harness.behavior.callRpc("fields_reorder", {
        entity: "COMPANY",
        ids: [field.id],
      }),
    ).resolves.toEqual([expect.objectContaining({ id: field.id, position: 0 })]);
    await harness.behavior.callRpc("fields_archive", { id: field.id });
    await expect(
      harness.behavior.callRpc("fields_list", {
        entity: "COMPANY",
        includeArchived: true,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: field.id, archived: true })]);
    await harness.behavior.callRpc("fields_restore", { id: field.id });
    await expect(
      harness.behavior.callRpc("fields_delete", { id: field.id }),
    ).resolves.toEqual({ id: field.id });

    await harness.lifecycle.dispose();
  });

  it("persists installation-owned saved views and their default selection", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);
    const view = (await harness.behavior.callRpc("savedViews_create", {
      entity: "COMPANY",
      name: "Open accounts",
      shared: false,
      filters: {
        q: "acme",
        sort: "name",
        dir: "asc",
        archived: false,
        filters: { owner: ["local_user"] },
        columns: ["name", "domain"],
      },
    })) as { id: string };

    await expect(
      harness.behavior.callRpc("savedViews_setDefault", { id: view.id }),
    ).resolves.toMatchObject({ id: view.id, ownerId: "local_user", isDefault: true });
    await expect(
      harness.behavior.callRpc("savedViews_list", { entity: "COMPANY" }),
    ).resolves.toEqual([
      expect.objectContaining({ id: view.id, mine: true, isDefault: true }),
    ]);
    await expect(
      harness.behavior.callRpc("savedViews_update", {
        id: view.id,
        data: { name: "Named accounts" },
      }),
    ).resolves.toMatchObject({ name: "Named accounts", isDefault: true });
    await expect(
      harness.behavior.callRpc("savedViews_delete", { id: view.id }),
    ).resolves.toEqual({ id: view.id });
    await expect(
      harness.behavior.callRpc("savedViews_list", { entity: "COMPANY" }),
    ).resolves.toEqual([]);

    await harness.lifecycle.dispose();
  });
});
