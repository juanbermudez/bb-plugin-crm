import { describe, expect, it } from "vitest";
import { rpcContract } from "./rpc.js";

describe("CRM RPC contract", () => {
  it("uses deterministic flat method names for all implemented surfaces", () => {
    expect(Object.keys(rpcContract)).toEqual([
      "status",
      "connections_list",
      "connections_get",
      "connections_health",
      "connections_upsert",
      "connections_disable",
      "connections_syncSuccess",
      "connections_syncFailure",
      "connections_syncCursors",
      "connections_syncResult",
      "connections_diagnostics",
      "tracking_sites_list",
      "tracking_sites_get",
      "tracking_sites_create",
      "tracking_sites_verify",
      "tracking_sites_pause",
      "tracking_sites_rotate",
      "tracking_tokens_list",
      "tracking_tokens_provision",
      "tracking_tokens_rotate",
      "tracking_tokens_revoke",
      "tracking_events_get",
      "tracking_events_list",
      "tracking_events_ingest",
      "tracking_events_ingestBatch",
      "tracking_aggregates_list",
      "tracking_aggregates_rollup",
      "tracking_aggregates_prune",
      "archive_retention_get",
      "archive_retention_prune",
      "companies_list",
      "companies_get",
      "companies_create",
      "companies_update",
      "companies_archive",
      "companies_restore",
      "companies_purge",
      "companies_bulkAssignOwner",
      "companies_enrich",
      "companies_bulkEnrich",
      "companies_research",
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
      "contacts_enrich",
      "contacts_bulkEnrich",
      "contacts_research",
      "contacts_bulkArchive",
      "contacts_bulkRestore",
      "contacts_bulkPurge",
      "contacts_facts_list",
      "contacts_facts_get",
      "contacts_facts_create",
      "contacts_facts_decide",
      "contacts_facts_supersede",
      "contacts_briefs_current",
      "contacts_briefs_get",
      "contacts_briefs_getVersion",
      "contacts_briefs_list",
      "contacts_briefs_create",
      "contacts_workHistory_list",
      "contacts_workHistory_get",
      "contacts_workHistory_create",
      "contacts_workHistory_decide",
      "contacts_workHistory_supersede",
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
      "currency_rates_upsertFetched",
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
      "fields_backfill",
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
      "agents_list",
      "agents_get",
      "agents_create",
      "agents_update",
      "agents_versions_list",
      "agents_versions_get",
      "agents_versions_create",
      "agents_versions_validate",
      "agents_deploy",
      "agents_pause",
      "agents_resume",
      "agents_archive",
      "agents_restore",
      "agents_triggers_list",
      "agents_triggers_get",
      "agents_triggers_create",
      "agents_triggers_update",
      "agents_triggers_delete",
      "agents_triggers_enable",
      "agents_webhooks_list",
      "agents_webhooks_provision",
      "agents_webhooks_rotate",
      "agents_webhooks_revoke",
      "agents_runs_list",
      "agents_runs_get",
      "agents_runs_queue",
      "agents_runs_start",
      "agents_runs_requestApproval",
      "agents_runs_approve",
      "agents_runs_success",
      "agents_runs_fail",
      "agents_runs_cancel",
      "agents_runs_retry",
      "agents_actions_list",
      "agents_actions_get",
      "agents_audit_list",
      "agents_threads_list",
      "agents_threads_get",
      "agents_threads_createRecord",
      "agents_attachments_upload",
      "agents_attachments_read",
      "agents_attachments_copy",
    ]);
  });

  it("keeps agent workspace inputs strict and JSON-safe", () => {
    expect(
      rpcContract.agents_create.input.safeParse({ name: "Renewal watcher", unexpected: true })
        .success,
    ).toBe(false);
    expect(
      rpcContract.agents_list.input.safeParse({ status: ["UNKNOWN"] }).success,
    ).toBe(false);
    expect(
      rpcContract.agents_versions_create.input.safeParse({
        agentId: "agent-1",
        data: { instructions: "Watch renewals", manifest: { actions: ["crm.note.write"] } },
      }).success,
    ).toBe(true);
    expect(
      rpcContract.agents_versions_create.input.safeParse({
        agentId: "agent-1",
        data: { instructions: "Watch renewals", manifest: { bad: new Date() } },
      }).success,
    ).toBe(false);
    expect(
      rpcContract.agents_triggers_update.input.safeParse({
        id: "trigger-1",
        data: { enabled: true, extra: true },
      }).success,
    ).toBe(false);
    expect(
      rpcContract.agents_runs_queue.input.safeParse({
        agentId: "agent-1",
        input: { companyId: "company-1" },
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.agents_runs_success.input.safeParse({
        id: "run-1",
        result: { noteId: "note-1" },
        costUsd: 0.001,
      }).success,
    ).toBe(true);
    expect(
      rpcContract.agents_threads_list.input.safeParse({
        agentId: "agent-1",
        recordType: "COMPANY",
        unknown: 1,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.agents_threads_createRecord.input.safeParse({
        agentId: "agent-1",
        recordType: "CONTACT",
        recordId: "contact-1",
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.agents_runs_retry.input.safeParse({ id: "run-1" }).success,
    ).toBe(true);
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

  it("keeps evidence, brief, and work-history RPC inputs strict", () => {
    const evidence = {
      kind: "linkedin.employer-and-name",
      detail: "Profile names the person and employer.",
      sourceUrl: "https://www.linkedin.com/in/ada",
    };
    expect(
      rpcContract.contacts_facts_list.input.safeParse({
        contactId: "contact-1",
        statuses: ["PROPOSED"],
        includeSuperseded: false,
        limit: 25,
      }).success,
    ).toBe(true);
    expect(
      rpcContract.contacts_facts_list.input.safeParse({
        contactId: "contact-1",
        statuses: ["UNKNOWN"],
      }).success,
    ).toBe(false);
    expect(
      rpcContract.contacts_facts_create.input.safeParse({
        contactId: "contact-1",
        field: "title",
        value: "Principal Engineer",
        score: 0.9,
        band: "VERIFIED",
        evidence: [evidence],
        method: "linkedin",
        sourceUrl: "https://www.linkedin.com/in/ada",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.contacts_facts_create.input.safeParse({
        contactId: "contact-1",
        field: "title",
        value: "Principal Engineer",
        score: 0.9,
        band: "VERIFIED",
        evidence: [],
        method: "linkedin",
      }).success,
    ).toBe(false);
    expect(
      rpcContract.contacts_facts_decide.input.safeParse({
        id: "fact-1",
        decision: "accept",
        decidedById: "user-1",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.contacts_facts_decide.input.safeParse({
        id: "fact-1",
        decision: "accept",
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.contacts_briefs_getVersion.input.safeParse({
        contactId: "contact-1",
        version: 1,
      }).success,
    ).toBe(true);
    expect(
      rpcContract.contacts_briefs_getVersion.input.safeParse({
        contactId: "contact-1",
        version: 0,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.contacts_workHistory_create.input.safeParse({
        contactId: "contact-1",
        organizationName: "Example Labs",
        startDate: "2024-01-01",
        score: 0.8,
        band: "PROBABLE",
        evidence: [evidence],
        method: "profile",
      }).success,
    ).toBe(true);
    expect(
      rpcContract.contacts_workHistory_list.input.safeParse({
        contactId: "contact-1",
        includeSuperseded: false,
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
