import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { PluginAgentConfigurationContext } from "@get-bb/plugin-sdk";
import plugin from "./server.js";
import { CRM_AGENT_DISPATCH_SERVICE_NAME } from "./server.js";
import { createAgentStore } from "./db/agents.js";
import { createCompanyStore } from "./db/companies.js";
import { createCurrencyStore } from "./db/currency.js";
import { CRM_SCHEMA_VERSION } from "./db/schema.js";

type ServerHarness = ReturnType<typeof createFakePluginHost>["harness"];

function agentConfigurationContext(
  supportsNativeUserQuestion: boolean,
): PluginAgentConfigurationContext {
  return {
    thread: { id: "thread-test", title: null, parentThreadId: null, sourceThreadId: null },
    project: { id: "project-test", kind: "standard", name: "CRM", gitRemoteUrl: null },
    environment: {
      id: "environment-test",
      name: null,
      path: null,
      workspaceProvisionType: "unmanaged",
      branchName: null,
    },
    host: { id: "host-test", name: "Local" },
    provider: {
      id: "provider-test",
      model: "model-test",
      capabilities: { supportsNativeUserQuestion },
    },
    origin: { kind: null, pluginId: null },
  };
}

async function seedLiveServerAgent(
  harness: ServerHarness,
  agentId: string,
  versionId: string,
  manifest: Record<string, unknown> = {},
): Promise<void> {
  await harness.behavior.callRpc("agents_create", {
    id: agentId,
    name: `Dispatcher ${agentId}`,
    description: "A dispatcher test agent.",
  });
  await harness.behavior.callRpc("agents_versions_create", {
    agentId,
    data: {
      id: versionId,
      instructions: "Read the exact CRM records and summarize verified facts.",
      manifest,
    },
  });
  await harness.behavior.callRpc("agents_versions_validate", { id: versionId });
  await harness.behavior.callRpc("agents_deploy", {
    agentId,
    versionId,
    requestId: `deployment-${agentId}`,
  });
}

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
      schemaVersion: CRM_SCHEMA_VERSION,
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

  it("runs strict JSON CLI CRUD, activity, tasks, and diagnostics against SQLite", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const createdCompanyResult = await harness.behavior.runCli([
      "create",
      "company",
      JSON.stringify({ name: "CLI Systems", domain: "cli.example" }),
      "--json",
    ]);
    expect(createdCompanyResult.exitCode).toBe(0);
    const company = JSON.parse(createdCompanyResult.stdout) as { id: string; name: string };
    expect(company).toMatchObject({ name: "CLI Systems" });

    const createdContactResult = await harness.behavior.runCli([
      "create",
      "contact",
      "--data",
      JSON.stringify({
        firstName: "CLI",
        lastName: "User",
        email: "CLI.USER@EXAMPLE.COM",
        companyId: company.id,
      }),
      "--json",
    ]);
    expect(createdContactResult.exitCode).toBe(0);
    const contact = JSON.parse(createdContactResult.stdout) as { id: string; email: string };
    expect(contact.email).toBe("cli.user@example.com");

    const createdDealResult = await harness.behavior.runCli([
      "create",
      "deal",
      JSON.stringify({
        name: "CLI Renewal",
        companyId: company.id,
        ownerId: "local_user",
        amountCents: 12500,
      }),
      "--json",
    ]);
    expect(createdDealResult.exitCode).toBe(0);
    const deal = JSON.parse(createdDealResult.stdout) as { id: string; amountCents: number };
    expect(deal.amountCents).toBe(12500);

    const listed = await harness.behavior.runCli(["list", "company", "--q", "CLI", "--json"]);
    expect(listed.exitCode).toBe(0);
    expect(JSON.parse(listed.stdout)).toMatchObject({ total: 1, rows: [expect.objectContaining({ id: company.id })] });

    const updated = await harness.behavior.runCli([
      "update",
      "contact",
      contact.id,
      JSON.stringify({ title: "Operator" }),
      "--json",
    ]);
    expect(updated.exitCode).toBe(0);
    expect(JSON.parse(updated.stdout)).toMatchObject({ id: contact.id, title: "Operator" });

    const shown = await harness.behavior.runCli(["show", "deal", deal.id, "--json"]);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout)).toMatchObject({ id: deal.id, name: "CLI Renewal" });

    const archived = await harness.behavior.runCli(["archive", "company", company.id, "--json"]);
    expect(archived.exitCode).toBe(0);
    expect(JSON.parse(archived.stdout)).toMatchObject({ id: company.id, archivedAt: expect.any(String) });
    const restored = await harness.behavior.runCli(["restore", "company", company.id, "--json"]);
    expect(restored.exitCode).toBe(0);
    expect(JSON.parse(restored.stdout)).toMatchObject({ id: company.id, archivedAt: null });

    const activity = await harness.behavior.runCli([
      "add-activity",
      JSON.stringify({ type: "TASK", companyId: company.id, subject: "Call CLI account", dueAt: "2099-01-01T00:00:00.000Z" }),
      "--json",
    ]);
    expect(activity.exitCode).toBe(0);
    expect(JSON.parse(activity.stdout)).toMatchObject({ type: "TASK", subject: "Call CLI account" });

    const tasks = await harness.behavior.runCli(["tasks", "upcoming", "--json"]);
    expect(tasks.exitCode).toBe(0);
    expect(JSON.parse(tasks.stdout)).toEqual([expect.objectContaining({ subject: "Call CLI account" })]);

    const doctor = await harness.behavior.runCli(["doctor", "--json"]);
    expect(doctor.exitCode).toBe(0);
    expect(JSON.parse(doctor.stdout)).toMatchObject({
      ok: true,
      schemaVersion: { expected: CRM_SCHEMA_VERSION, actual: CRM_SCHEMA_VERSION },
      sqlite: { integrity: "ok", foreignKeyViolations: 0 },
    });

    const invalid = await harness.behavior.runCli(["create", "company", JSON.stringify({ name: "Bad", secret: "nope" }), "--json"]);
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).toContain("Company payload is invalid");
    const missing = await harness.behavior.runCli(["show", "company", "missing", "--json"]);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stderr)).toMatchObject({ error: expect.stringContaining("No company") });

    await harness.lifecycle.dispose();
  });

  it("round-trips versioned JSON and CSV CLI exports through import", async () => {
    const source = createFakePluginHost({ pluginId: "crm" });
    await plugin(source.bb);
    const created = await source.harness.behavior.runCli([
      "create",
      "company",
      JSON.stringify({ name: "Importable", domain: "importable.example", ownerId: "owner_import" }),
      "--json",
    ]);
    const record = JSON.parse(created.stdout) as { id: string };
    const exportedJson = await source.harness.behavior.runCli(["export", "company", "--format", "json"]);
    expect(exportedJson.exitCode).toBe(0);
    const document = JSON.parse(exportedJson.stdout) as { version: number; entity: string; records: unknown[] };
    expect(document).toMatchObject({ version: 1, entity: "company", records: [expect.objectContaining({ id: record.id })] });
    await source.harness.lifecycle.dispose();

    const target = createFakePluginHost({ pluginId: "crm" });
    await plugin(target.bb);
    const importedJson = await target.harness.behavior.runCli(["import", "company", exportedJson.stdout, "--json"]);
    expect(importedJson.exitCode).toBe(0);
    expect(JSON.parse(importedJson.stdout)).toMatchObject({ entity: "company", imported: 1, ids: [record.id] });
    const listed = await target.harness.behavior.runCli(["list", "company", "--json"]);
    expect(JSON.parse(listed.stdout)).toMatchObject({ total: 1, rows: [expect.objectContaining({ name: "Importable", source: "IMPORT" })] });

    const exportedCsv = await target.harness.behavior.runCli(["export", "company", "--format", "csv"]);
    expect(exportedCsv.exitCode).toBe(0);
    expect(exportedCsv.stdout).toContain("id,name,domain,ownerId");
    expect(exportedCsv.stdout).toContain("Importable");
    await target.harness.lifecycle.dispose();
  });

  it("paginates exports beyond one thousand rows and preserves archive selectors", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);
    const companies = createCompanyStore(bb.storage.database());
    for (let index = 0; index < 1_002; index += 1) {
      const suffix = String(index).padStart(4, "0");
      companies.create({ id: `export-company-${suffix}`, name: `Export Company ${suffix}` });
    }
    companies.archive("export-company-0000");

    const activeExport = await harness.behavior.runCli(["export", "company", "--format", "json"]);
    expect(activeExport.exitCode).toBe(0);
    expect((JSON.parse(activeExport.stdout) as { records: unknown[] }).records).toHaveLength(1_001);

    const allExport = await harness.behavior.runCli(["export", "company", "--format", "json", "--all"]);
    expect(allExport.exitCode).toBe(0);
    expect((JSON.parse(allExport.stdout) as { records: unknown[] }).records).toHaveLength(1_002);

    const archivedExport = await harness.behavior.runCli(["export", "company", "--format", "json", "--archived"]);
    expect(archivedExport.exitCode).toBe(0);
    expect((JSON.parse(archivedExport.stdout) as { records: Array<{ id: string }> }).records).toEqual([
      expect.objectContaining({ id: "export-company-0000" }),
    ]);

    await harness.lifecycle.dispose();
  }, 30_000);

  it("registers native CRM agent tools for search, records, fields, and activity", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);
    expect(harness.registrations.agentTools.map((tool) => tool.name)).toEqual([
      "ask_question",
      "crm_search",
      "crm_get_record",
      "crm_create_record",
      "crm_update_record",
      "crm_add_activity",
      "crm_list_tasks",
      "crm_complete_task",
      "crm_set_field",
      "crm_record_contact_fact",
      "crm_record_contact_brief",
      "crm_record_contact_work_history",
      "crm_finalize_enrichment",
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
    const task = JSON.parse(String(await harness.callAgentTool("crm_add_activity", {
      type: "TASK",
      companyId: created.id,
      subject: "Agent completion",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    }))) as { id: string };
    await expect(harness.callAgentTool("crm_list_tasks", {
      window: "all",
    })).resolves.toContain("Agent follow-up");
    await expect(harness.callAgentTool("crm_complete_task", { id: task.id })).resolves.toContain("completedAt");
    await expect(harness.callAgentTool("crm_complete_task", { id: task.id, unknown: true })).rejects.toThrow();

    await harness.lifecycle.dispose();
  });

  it("withholds the CRM clarification tool when the provider supplies one natively", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      agentSkillIds: ["crm"],
    });
    await plugin(bb);

    const native = await harness.resolveAgentConfiguration(agentConfigurationContext(true));
    const pluginOwned = await harness.resolveAgentConfiguration(agentConfigurationContext(false));
    expect(native.tools.map((tool) => tool.name)).not.toContain("ask_question");
    expect(pluginOwned.tools.map((tool) => tool.name)).toContain("ask_question");

    await harness.lifecycle.dispose();
  });

  it("opens a strict CRM clarification interaction and returns the selected answer", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    await expect(harness.callAgentTool("ask_question", {
      prompt: "Which account should receive this activity?",
      options: [
        { id: "account-a", label: "Account A", description: "Use the existing account." },
        { id: "account-b", label: "Account B", description: "Use the secondary account." },
      ],
      allowFreeform: false,
      unexpected: true,
    })).rejects.toThrow(/arguments are invalid/u);

    const pendingAnswer = harness.callAgentTool("ask_question", {
      prompt: "Which account should receive this activity?",
      options: [
        { id: "account-a", label: "Account A", description: "Use the existing account." },
        { id: "account-b", label: "Account B", description: "Use the secondary account." },
      ],
    });
    await vi.waitFor(() => expect(harness.pendingInteractions).toHaveLength(1));

    const pending = harness.pendingInteractions[0]!;
    expect(pending).toMatchObject({
      threadId: "thread-test",
      rendererId: "crm-question",
      title: "CRM clarification",
    });
    expect(pending.payload).toMatchObject({
      kind: "question",
      prompt: "Which account should receive this activity?",
      display: "select",
      allowFreeform: false,
    });

    harness.submitInteraction(pending.id, {
      requestId: (pending.payload as { requestId: string }).requestId,
      optionId: "account-b",
    });
    await expect(pendingAnswer).resolves.toEqual(JSON.stringify({
      requestId: (pending.payload as { requestId: string }).requestId,
      optionId: "account-b",
    }));

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

  it("serves the agent definition, version, trigger, and run lifecycles", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const created = (await harness.behavior.callRpc("agents_create", {
      id: "agent_server_lifecycle",
      name: "Renewal watcher",
      description: "Watch account renewals.",
    })) as { id: string; createdById: string; status: string };
    expect(created).toMatchObject({
      id: "agent_server_lifecycle",
      createdById: "local_user",
      status: "DRAFT",
    });

    await expect(
      harness.behavior.callRpc("agents_list", { search: "renewal" }),
    ).resolves.toEqual([expect.objectContaining({ id: created.id, runCount: 0 })]);

    const version = (await harness.behavior.callRpc("agents_versions_create", {
      agentId: created.id,
      data: {
        id: "version_server_lifecycle",
        instructions: "Watch renewal changes and summarize them.",
        manifest: { actions: ["crm.note.write"] },
      },
    })) as { id: string; status: string; createdById: string };
    expect(version).toMatchObject({
      id: "version_server_lifecycle",
      status: "DRAFT",
      createdById: "local_user",
    });
    await expect(
      harness.behavior.callRpc("agents_versions_validate", {
        id: version.id,
      }),
    ).resolves.toMatchObject({ id: version.id, status: "READY" });

    const trigger = (await harness.behavior.callRpc("agents_triggers_create", {
      agentId: created.id,
      data: {
        id: "trigger_server_lifecycle",
        versionId: version.id,
        type: "MANUAL",
        name: "Run manually",
      },
    })) as { id: string; enabled: boolean };
    expect(trigger).toMatchObject({ id: "trigger_server_lifecycle", enabled: false });

    await expect(
      harness.behavior.callRpc("agents_deploy", {
        agentId: created.id,
        versionId: version.id,
        requestId: "deployment_server_lifecycle",
      }),
    ).resolves.toEqual({ id: created.id, versionId: version.id, status: "LIVE" });
    await expect(
      harness.behavior.callRpc("agents_get", { id: created.id }),
    ).resolves.toMatchObject({
      id: created.id,
      status: "LIVE",
      currentVersionId: version.id,
      currentVersion: { id: version.id, status: "DEPLOYED" },
      triggers: [{ id: trigger.id, enabled: true }],
    });

    const queued = (await harness.behavior.callRpc("agents_runs_queue", {
      agentId: created.id,
      id: "run_server_lifecycle",
      input: { companyId: "company_1" },
      idempotencyKey: "run_server_lifecycle_key",
    })) as { id: string; agentId: string; status: string; triggerType: string; events: unknown[] };
    expect(queued).toMatchObject({
      id: "run_server_lifecycle",
      agentId: created.id,
      status: "QUEUED",
      triggerType: "MANUAL",
    });
    expect(queued.events).toHaveLength(1);
    await expect(
      harness.behavior.callRpc("agents_threads_list", { agentId: created.id }),
    ).resolves.toEqual([]);

    await expect(
      harness.behavior.callRpc("agents_runs_start", { id: queued.id }),
    ).resolves.toMatchObject({ status: "RUNNING" });
    await expect(
      harness.behavior.callRpc("agents_runs_requestApproval", {
        id: queued.id,
        reason: "The run writes a CRM note.",
      }),
    ).resolves.toMatchObject({ status: "WAITING_FOR_APPROVAL" });
    await expect(
      harness.behavior.callRpc("agents_runs_approve", { id: queued.id }),
    ).resolves.toMatchObject({ status: "RUNNING", approvedById: "local_user" });
    await expect(
      harness.behavior.callRpc("agents_runs_success", {
        id: queued.id,
        result: { noteId: "note_1" },
        summary: "Renewal note written",
      }),
    ).resolves.toMatchObject({ status: "SUCCEEDED", result: { noteId: "note_1" } });
    await expect(
      harness.behavior.callRpc("agents_runs_list", {
        agentId: created.id,
        status: ["SUCCEEDED"],
      }),
    ).resolves.toEqual([expect.objectContaining({ id: queued.id, status: "SUCCEEDED" })]);

    const agentStore = createAgentStore(bb.storage.database());
    const action = agentStore.createAction(queued.id, {
      id: "action_server_lifecycle",
      type: "crm.note.write",
      provider: "crm",
      summary: "Write renewal note",
    });
    await expect(
      harness.behavior.callRpc("agents_actions_get", { id: action.id }),
    ).resolves.toMatchObject({ id: action.id, status: "PLANNED" });
    await expect(
      harness.behavior.callRpc("agents_actions_list", { runId: queued.id }),
    ).resolves.toEqual([expect.objectContaining({ id: action.id })]);

    const thread = agentStore.linkThread(created.id, {
      id: "thread_server_lifecycle",
      threadId: "bb-thread-server-lifecycle",
      kind: "BUILDER",
      versionId: version.id,
      summary: "Builder transcript",
    }, "local_user");
    await expect(
      harness.behavior.callRpc("agents_threads_get", { id: thread.id }),
    ).resolves.toMatchObject({ id: thread.id, threadId: thread.threadId });
    await expect(
      harness.behavior.callRpc("agents_threads_list", { agentId: created.id, kind: "BUILDER" }),
    ).resolves.toEqual([expect.objectContaining({ id: thread.id })]);
    await expect(
      harness.behavior.callRpc("agents_audit_list", { agentId: created.id }),
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ type: "agent.deployed" })]));

    await expect(
      harness.behavior.callRpc("agents_pause", { id: created.id }),
    ).resolves.toMatchObject({ status: "PAUSED" });
    await expect(
      harness.behavior.callRpc("agents_resume", { id: created.id }),
    ).resolves.toMatchObject({ status: "LIVE" });
    await expect(
      harness.behavior.callRpc("agents_archive", { id: created.id }),
    ).resolves.toMatchObject({ status: "ARCHIVED" });
    await expect(
      harness.behavior.callRpc("agents_restore", { id: created.id }),
    ).resolves.toMatchObject({ status: "PAUSED" });

    expect(harness.realtimeSignals).toEqual(
      expect.arrayContaining([
        { channel: "changed", payload: { entity: "agent", action: "created", id: created.id } },
        { channel: "changed", payload: { entity: "agent", action: "deployed", id: created.id } },
        { channel: "changed", payload: { entity: "agent-run", action: "queued", id: queued.id } },
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
      recentActivity: expect.arrayContaining([
        expect.objectContaining({ subject: "Follow up" }),
        expect.objectContaining({ type: "STAGE_CHANGE", subject: "Stage changed" }),
      ]),
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

  it("queues bounded idempotent fill-rest runs only for missing agent-filled values", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: {
        researchApiKey: "provider-test-key",
        researchAgentId: "agent_field_backfill_server",
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(
      harness,
      "agent_field_backfill_server",
      "version_field_backfill_server",
    );

    const missingCompany = await harness.behavior.callRpc("companies_create", {
      name: "Missing Field Co",
    }) as { id: string };
    const filledCompany = await harness.behavior.callRpc("companies_create", {
      name: "Filled Field Co",
    }) as { id: string };
    const field = await harness.behavior.callRpc("fields_create", {
      entity: "COMPANY",
      label: "Research segment",
      type: "TEXT",
      agentFilled: true,
      agentBrief: "Use confirmed company evidence only.",
    }) as { id: string; key: string };
    await harness.behavior.callRpc("fields_values_create", {
      entity: "COMPANY",
      recordId: filledCompany.id,
      fieldId: field.id,
      value: "Enterprise",
    });

    await expect(harness.behavior.callRpc("fields_backfill", { id: field.id }))
      .resolves.toEqual({ queued: true });
    await expect(harness.behavior.callRpc("fields_backfill", { id: field.id }))
      .resolves.toEqual({ queued: true });

    const runs = await harness.behavior.callRpc("agents_runs_list", {
      agentId: "agent_field_backfill_server",
      status: "QUEUED",
      limit: 100,
      includeEvents: false,
      includeActions: false,
    }) as Array<{ input: Record<string, unknown> }>;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.input).toMatchObject({
      kind: "CRM_FIELD_BACKFILL",
      entity: "COMPANY",
      recordId: missingCompany.id,
      fieldId: field.id,
      fieldKeys: [field.key],
      onlyIfMissing: true,
      requiresExternalProvider: true,
    });
    expect(runs[0]?.input.writePolicy).toEqual(expect.stringContaining("Never guess"));

    await harness.behavior.callRpc("fields_values_create", {
      entity: "COMPANY",
      recordId: missingCompany.id,
      fieldId: field.id,
      value: "Mid-market",
    });
    await expect(harness.behavior.callRpc("fields_backfill", { id: field.id }))
      .resolves.toEqual({ queued: false });

    const manualField = await harness.behavior.callRpc("fields_create", {
      entity: "COMPANY",
      label: "Manual note",
      type: "TEXT",
      agentFilled: false,
    }) as { id: string };
    await expect(harness.behavior.callRpc("fields_backfill", { id: manualField.id }))
      .rejects.toThrow("active agent-filled");

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

  it("serves strict connection health and tracking lifecycles over SQLite", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const connection = (await harness.behavior.callRpc("connections_upsert", {
      id: "connection_phase7",
      provider: "GOOGLE",
      externalAccountId: "workspace-1",
      displayName: "Google Workspace",
      configuration: { accountEmail: "ops@example.com" },
      scopes: ["calendar.readonly", "gmail.readonly"],
    })) as { id: string; health: { status: string }; configuration: Record<string, unknown> };
    expect(connection).toMatchObject({
      id: "connection_phase7",
      health: { status: "DISCONNECTED" },
      configuration: { accountEmail: "ops@example.com" },
    });
    await expect(harness.behavior.callRpc("connections_health", { id: connection.id }))
      .resolves.toMatchObject({ status: "DISCONNECTED" });

    await expect(harness.behavior.callRpc("connections_syncSuccess", {
      connectionId: connection.id,
      stream: "mail",
      cursor: "cursor-1",
      at: "2026-08-25T12:00:00.000Z",
    })).resolves.toMatchObject({ health: { status: "CONNECTED" } });
    await expect(harness.behavior.callRpc("connections_syncFailure", {
      connectionId: connection.id,
      stream: "mail",
      errorCode: "RATE_LIMIT",
      errorMessage: "Bearer abc should not leak",
      at: "2026-08-25T12:01:00.000Z",
    })).resolves.toMatchObject({
      health: {
        status: "ERROR",
        failureMessage: "Bearer [redacted] should not leak",
        consecutiveFailures: 1,
      },
    });
    await expect(harness.behavior.callRpc("connections_syncCursors", { id: connection.id }))
      .resolves.toEqual([expect.objectContaining({ stream: "mail", cursor: "cursor-1" })]);
    await expect(harness.behavior.callRpc("connections_diagnostics", { id: connection.id }))
      .resolves.toMatchObject({
        connection: { id: connection.id, health: { status: "ERROR" } },
        syncCursors: [expect.objectContaining({ stream: "mail" })],
      });
    await expect(harness.behavior.callRpc("connections_disable", {
      id: connection.id,
      at: "2026-08-25T12:02:00.000Z",
    })).resolves.toMatchObject({ enabled: false, health: { status: "DISABLED" } });
    await expect(harness.behavior.callRpc("connections_syncResult", {
      connectionId: connection.id,
      result: "SUCCESS",
      stream: "mail",
      cursor: "cursor-2",
    })).rejects.toThrow("disabled connection");

    const site = (await harness.behavior.callRpc("tracking_sites_create", {
      id: "site_phase7",
      name: "Marketing site",
      allowedDomains: ["example.com", "*.preview.example.com"],
      eventRetentionDays: 1,
      aggregateRetentionDays: 30,
    })) as { id: string; siteKey: string; status: string };
    expect(site).toMatchObject({ id: "site_phase7", status: "ACTIVE" });
    const token = (await harness.behavior.callRpc("tracking_tokens_provision", {
      siteId: site.id,
      at: "2026-08-25T12:03:00.000Z",
    })) as { id: string; token: string; secret: string; scope: string };
    expect(token).toMatchObject({ scope: "TRACKING", token: expect.stringMatching(/^crm_trk_/), secret: token.token });
    expect(token).not.toHaveProperty("tokenHash");

    const eventInput = {
      siteId: site.id,
      token: token.token,
      eventType: "PAGE_VIEW",
      origin: "https://example.com",
      path: "/pricing",
      visitorId: "visitor-1",
      source: "newsletter",
      eventKey: "event-1",
      occurredAt: "2026-08-20T12:00:00.000Z",
      receivedAt: "2026-08-20T12:00:00.000Z",
      properties: { plan: "pro" },
    } as const;
    const event = (await harness.behavior.callRpc("tracking_events_ingest", eventInput)) as {
      id: string;
      visitorHash: string | null;
      properties: Record<string, unknown>;
    };
    expect(event).toMatchObject({ id: expect.any(String), properties: { plan: "pro" } });
    expect(event.visitorHash).not.toBe("visitor-1");
    expect(event).not.toHaveProperty("token");
    await expect(harness.behavior.callRpc("tracking_events_ingestBatch", {
      events: [
        { ...eventInput, id: "event-2", eventKey: "event-2", path: "/home" },
        { ...eventInput, id: "event-3", eventKey: "event-3", path: "/pricing", visitorId: "visitor-2" },
      ],
    })).resolves.toHaveLength(2);
    await expect(harness.behavior.callRpc("tracking_events_list", { siteId: site.id }))
      .resolves.toHaveLength(3);

    await expect(harness.behavior.callRpc("tracking_sites_verify", {
      id: site.id,
      domain: "example.com",
      verifiedAt: "2026-08-25T12:04:00.000Z",
    })).resolves.toMatchObject({ verificationStatus: "VERIFIED" });
    await expect(harness.behavior.callRpc("tracking_sites_pause", {
      id: site.id,
      at: "2026-08-25T12:05:00.000Z",
    })).resolves.toMatchObject({ status: "PAUSED" });
    await expect(harness.behavior.callRpc("tracking_sites_pause", {
      id: site.id,
      paused: false,
      at: "2026-08-25T12:06:00.000Z",
    })).resolves.toMatchObject({ status: "ACTIVE" });

    const rotated = (await harness.behavior.callRpc("tracking_sites_rotate", {
      id: site.id,
      at: "2026-08-25T12:07:00.000Z",
    })) as { siteKey: string; token: string; tokenId: string; site: { siteKey: string } };
    expect(rotated.siteKey).not.toBe(site.siteKey);
    expect(rotated.site.siteKey).toBe(rotated.siteKey);
    expect(rotated).not.toHaveProperty("tokenHash");
    await expect(harness.behavior.callRpc("tracking_events_ingest", {
      ...eventInput,
      token: token.token,
      eventKey: "event-old-token",
    })).rejects.toThrow("not authorized");
    await expect(harness.behavior.callRpc("tracking_events_ingest", {
      ...eventInput,
      token: rotated.token,
      siteKey: rotated.siteKey,
      eventKey: "event-rotated",
    })).resolves.toMatchObject({ tokenId: rotated.tokenId });

    const intake = (await harness.behavior.callRpc("tracking_tokens_provision", {
      scope: "INTAKE",
      at: "2026-08-25T12:08:00.000Z",
    })) as { id: string; scope: string; token: string };
    expect(intake.scope).toBe("INTAKE");
    await expect(harness.behavior.callRpc("tracking_tokens_list", { siteId: site.id }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: rotated.tokenId, revokedAt: null }),
      ]));
    await expect(harness.behavior.callRpc("tracking_tokens_revoke", {
      id: intake.id,
      at: "2026-08-25T12:09:00.000Z",
    })).resolves.toMatchObject({ id: intake.id, revokedAt: "2026-08-25T12:09:00.000Z" });

    await expect(harness.behavior.callRpc("tracking_aggregates_rollup", {
      siteId: site.id,
      now: "2026-08-25T12:10:00.000Z",
    })).resolves.toMatchObject({ aggregateCount: 2, eventCount: 4 });
    await expect(harness.behavior.callRpc("tracking_aggregates_list", { siteId: site.id }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ day: "2026-08-20", eventCount: 3, uniqueVisitors: 2 }),
      ]));
    await expect(harness.behavior.callRpc("tracking_aggregates_prune", {
      siteId: site.id,
      now: "2026-08-25T12:10:00.000Z",
      batchSize: 2,
    })).resolves.toMatchObject({ eventsDeleted: 4, aggregatesDeleted: 0, sitesProcessed: 1 });

    const doctor = await harness.behavior.runCli(["doctor", "--json"]);
    expect(doctor.exitCode).toBe(0);
    expect(JSON.parse(doctor.stdout)).toMatchObject({
      integrations: {
        connections: { total: 1, enabled: 0, errors: 0 },
        tracking: { sites: 1, activeSites: 1, verifiedSites: 1, activeTokens: 1 },
      },
    });

    expect(harness.realtimeSignals).toEqual(expect.arrayContaining([
      { channel: "changed", payload: { entity: "connection", action: "created", id: connection.id } },
      { channel: "changed", payload: { entity: "connection", action: "sync-succeeded", id: connection.id } },
      { channel: "changed", payload: { entity: "tracking-site", action: "created", id: site.id } },
      { channel: "changed", payload: { entity: "tracking-token", action: "provisioned", id: token.id } },
      { channel: "changed", payload: { entity: "tracking-event", action: "ingested", id: event.id } },
    ]));

    await harness.lifecycle.dispose();
  });

  it("dispatches a durable manual queue through the bounded background service", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-manual" }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: {
          list: async () => [
            { id: "fallback-project", kind: "standard", deletedAt: null },
            { id: "preferred-project", kind: "standard", deletedAt: null },
          ],
        },
        threads: { spawn },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_dispatch_server", "version_dispatch_server", {
      projectId: "preferred-project",
    });
    await harness.behavior.callRpc("agents_runs_queue", {
      agentId: "agent_dispatch_server",
      id: "run_dispatch_server",
      input: { companyId: "company_server" },
      idempotencyKey: "run-dispatch-server-key",
    });

    const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    const store = createAgentStore(bb.storage.database());
    try {
      await vi.waitFor(() => {
        expect(store.getRunRequired("run_dispatch_server").status).toBe("RUNNING");
      });
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(harness.inspection.sdk.callsTo("projects.list")).toEqual([
        [{ includePersonal: true }],
      ]);
      expect(harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject({
        projectId: "preferred-project",
        visibility: "hidden",
      });
      expect(store.listThreads("agent_dispatch_server", { runId: "run_dispatch_server" }))
        .toEqual([expect.objectContaining({ threadId: "bb-thread-manual" })]);
    } finally {
      service.controller.abort();
      await service.done;
      await harness.lifecycle.dispose();
    }
  });

  it("leases due CRM tasks into the explicitly configured hidden agent worker", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-due-task" }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: {
        taskAgentId: "agent_due_task_server",
      },
      sdk: {
        projects: { list: async () => [{ id: "project-due-task", kind: "standard" }] },
        threads: { spawn },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_due_task_server", "version_due_task_server");
    const company = await harness.behavior.callRpc("companies_create", { name: "Due Task Co" }) as { id: string };
    const activity = await harness.behavior.callRpc("activity_create", {
      type: "TASK",
      companyId: company.id,
      createdById: "human-task-author",
      subject: "Call the account",
      dueAt: new Date(Date.now() - 1_000).toISOString(),
    }) as { id: string };

    const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    const store = createAgentStore(bb.storage.database());
    try {
      await vi.waitFor(() => {
        const runs = store.listRuns({
          agentId: "agent_due_task_server",
          status: ["QUEUED", "RUNNING"],
          limit: 100,
          includeEvents: false,
          includeActions: false,
        });
        expect(runs).toEqual([expect.objectContaining({ triggerType: "MANUAL", triggerId: null })]);
        expect(runs[0]?.input).toMatchObject({
          kind: "CRM_DUE_TASK",
          activity: { id: activity.id, createdById: "human-task-author" },
        });
      });
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject({
        projectId: "project-due-task",
        visibility: "hidden",
      });
      const dispatch = bb.storage.database().prepare(
        "SELECT status, attempts, run_id AS runId FROM crm_activity_task_dispatches WHERE activity_id = ?",
      ).get(activity.id) as { status: string; attempts: number; runId: string | null };
      expect(dispatch).toMatchObject({ status: "DISPATCHED", attempts: 1, runId: expect.any(String) });
    } finally {
      service.controller.abort();
      await service.done;
      await harness.lifecycle.dispose();
    }
  });

  it("creates an idempotent visible BB thread linked to a CRM company", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-company-record" }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: { list: async () => [{ id: "project-record", kind: "standard" }] },
        threads: { spawn },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_record_server", "version_record_server");
    createCompanyStore(bb.storage.database()).create({ id: "company_record", name: "Record Co" });

    const first = await harness.behavior.callRpc("agents_threads_createRecord", {
      agentId: "agent_record_server",
      recordType: "COMPANY",
      recordId: "company_record",
    }) as { id: string; threadId: string; kind: string; recordType: string; recordId: string };
    const second = await harness.behavior.callRpc("agents_threads_createRecord", {
      agentId: "agent_record_server",
      recordType: "COMPANY",
      recordId: "company_record",
    });

    expect(first).toMatchObject({
      threadId: "bb-thread-company-record",
      kind: "RECORD",
      recordType: "COMPANY",
      recordId: "company_record",
    });
    expect(second).toEqual(expect.objectContaining({ id: first.id }));
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject({
      projectId: "project-record",
      visibility: "visible",
    });
    expect(String((harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0] as { input?: Array<{ text?: string }> }).input?.[0]?.text))
      .toContain('"recordType":"COMPANY"');

    await harness.lifecycle.dispose();
  });

  it("cancels a linked BB worker and returns the persisted cancellation result", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-cancel-server" }));
    const archive = vi.fn(async () => ({ ok: true }));
    const stop = vi.fn(async () => ({ ok: true }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: { list: async () => [{ id: "project-cancel", kind: "standard" }] },
        threads: { spawn, archive, stop },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_cancel_server", "version_cancel_server");
    await harness.behavior.callRpc("agents_runs_queue", {
      agentId: "agent_cancel_server",
      id: "run_cancel_server",
      idempotencyKey: "run-cancel-server-key",
    });
    const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    try {
      await vi.waitFor(() => expect(createAgentStore(bb.storage.database()).getRunRequired("run_cancel_server").status).toBe("RUNNING"));
      const cancelled = await harness.behavior.callRpc("agents_runs_cancel", {
        id: "run_cancel_server",
        reason: "No longer needed.",
        actorId: "user_cancel",
      }) as { status: string; cancelled: boolean; cancelRequestedAt: string | null };
      expect(cancelled).toMatchObject({ status: "CANCELLED", cancelled: true });
      expect(cancelled.cancelRequestedAt).toEqual(expect.any(String));
      expect(archive).toHaveBeenCalledWith({ threadId: "bb-thread-cancel-server" });
      expect(stop).toHaveBeenCalledWith({ threadId: "bb-thread-cancel-server" });
    } finally {
      service.controller.abort();
      await service.done;
      await harness.lifecycle.dispose();
    }
  });

  it("keeps queued runs durable when no non-deleted BB project exists", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-never-created" }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: {
          list: async () => [
            { id: "deleted-project", kind: "standard", deletedAt: "2026-08-25T00:00:00.000Z" },
          ],
        },
        threads: { spawn },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_no_project", "version_no_project");
    await harness.behavior.callRpc("agents_runs_queue", {
      agentId: "agent_no_project",
      id: "run_no_project",
      idempotencyKey: "run-no-project-key",
    });

    const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    const store = createAgentStore(bb.storage.database());
    try {
      await vi.waitFor(() => {
        expect(harness.inspection.logEntries).toEqual(expect.arrayContaining([
          expect.objectContaining({
            level: "warn",
            message: expect.stringContaining("queued agent runs remain QUEUED"),
          }),
        ]));
      });
      expect(store.getRunRequired("run_no_project").status).toBe("QUEUED");
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      service.controller.abort();
      await service.done;
      await harness.lifecycle.dispose();
    }
  });

  it("reclaims an orphaned running claim on a later dispatcher sweep", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-orphan-server" }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: { list: async () => [{ id: "project-orphan", kind: "standard" }] },
        threads: { spawn },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_orphan_server", "version_orphan_server");
    await harness.behavior.callRpc("agents_runs_queue", {
      agentId: "agent_orphan_server",
      id: "run_orphan_server",
      idempotencyKey: "run-orphan-server-key",
    });
    const store = createAgentStore(bb.storage.database());
    store.startRun("run_orphan_server", "crm-dispatcher");
    bb.storage.database().prepare("UPDATE agent_runs SET started_at = ? WHERE id = ?").run(
      new Date(Date.now() - 10 * 60 * 1_000).toISOString(),
      "run_orphan_server",
    );

    const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    try {
      await vi.waitFor(() => {
        expect(store.listThreads("agent_orphan_server", { runId: "run_orphan_server" })).toEqual([
          expect.objectContaining({ threadId: "bb-thread-orphan-server" }),
        ]);
      });
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(store.getRunRequired("run_orphan_server").events.map((event) => event.type)).toEqual([
        "run.queued",
        "run.started",
        "run.recovered",
      ]);
      expect(store.listRunAudit("run_orphan_server")).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "thread.linked" }),
      ]));
    } finally {
      service.controller.abort();
      await service.done;
      await harness.lifecycle.dispose();
    }
  });

  it("persistently disables an invalid enabled schedule after one failure", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: { projects: { list: async () => [] } },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_invalid_schedule", "version_invalid_schedule");
    const trigger = await harness.behavior.callRpc("agents_triggers_create", {
      agentId: "agent_invalid_schedule",
      data: {
        id: "trigger_invalid_schedule",
        versionId: "version_invalid_schedule",
        type: "SCHEDULE",
        name: "Invalid schedule",
        config: { cron: "not-a-cron" },
        enabled: true,
      },
    }) as { id: string; enabled: boolean; nextRunAt: string | null };
    expect(trigger).toMatchObject({ id: "trigger_invalid_schedule", enabled: true });

    const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    try {
      await vi.waitFor(() => {
        expect(createAgentStore(bb.storage.database()).getTriggerRequired(trigger.id)).toMatchObject({
          enabled: false,
          nextRunAt: null,
        });
      });
      const failures = () => harness.inspection.logEntries.filter((entry) =>
        entry.message.includes("CRM agent schedule trigger_invalid_schedule is invalid"),
      );
      expect(failures()).toHaveLength(1);
    } finally {
      service.controller.abort();
      await service.done;
      await harness.lifecycle.dispose();
    }
  });

  it("reconciles linked running runs after reload without spawning a duplicate worker", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-reload" }));
    const get = vi.fn(async () => ({
      id: "bb-thread-reload",
      status: "active",
      visibility: "hidden",
    }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: { list: async () => [{ id: "project-reload", kind: "standard" }] },
        threads: { spawn, get },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_reload", "version_reload");
    await harness.behavior.callRpc("agents_runs_queue", {
      agentId: "agent_reload",
      id: "run_reload",
      idempotencyKey: "run-reload-key",
    });
    const firstService = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    const store = createAgentStore(bb.storage.database());
    await vi.waitFor(() => {
      expect(store.getRunRequired("run_reload").status).toBe("RUNNING");
    });

    const reloaded = await harness.lifecycle.reload(async (replacementBb) => {
      await plugin(replacementBb);
    });
    await firstService.done;
    const replacementService = reloaded.harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    try {
      await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(reloaded.harness.inspection.registrations.threadEventHandlers).toMatchObject({
        "thread.idle": 1,
        "thread.failed": 1,
        "thread.deleted": 1,
      });
      expect(reloaded.harness.inspection.registrations.services).toHaveLength(2);
    } finally {
      replacementService.controller.abort();
      await replacementService.done;
      await reloaded.harness.lifecycle.dispose();
    }
  });

  it("settles linked runs from lifecycle events and publishes run invalidations", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-lifecycle" }));
    const archive = vi.fn(async () => ({ ok: true }));
    const stop = vi.fn(async () => ({ ok: true }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: { list: async () => [{ id: "project-lifecycle", kind: "standard" }] },
        threads: { spawn, archive, stop },
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_lifecycle_server", "version_lifecycle_server");
    await harness.behavior.callRpc("agents_runs_queue", {
      agentId: "agent_lifecycle_server",
      id: "run_lifecycle_server",
      idempotencyKey: "run-lifecycle-server-key",
    });
    const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
    const store = createAgentStore(bb.storage.database());
    try {
      await vi.waitFor(() => {
        expect(store.getRunRequired("run_lifecycle_server").status).toBe("RUNNING");
      });
      const emitted = await harness.behavior.emitThreadEvent("thread.idle", {
        thread: makeThreadResponse({
          id: "bb-thread-lifecycle",
          visibility: "hidden",
          status: "idle",
        }),
        lastAssistantText: "Verified lifecycle settlement.",
      });
      expect(emitted.errors).toEqual([]);
      expect(store.getRunRequired("run_lifecycle_server")).toMatchObject({
        status: "SUCCEEDED",
        summary: "Verified lifecycle settlement.",
        result: null,
      });
      expect(archive).toHaveBeenCalledWith({ threadId: "bb-thread-lifecycle" });
      expect(stop).toHaveBeenCalledWith({ threadId: "bb-thread-lifecycle" });
      expect(harness.inspection.realtimeSignals).toEqual(expect.arrayContaining([
        { channel: "changed", payload: { entity: "agent-run", action: "started", id: "run_lifecycle_server" } },
        { channel: "changed", payload: { entity: "agent-run", action: "succeeded", id: "run_lifecycle_server" } },
        { channel: "changed", payload: { entity: "agent-thread", action: "lifecycle", id: expect.any(String) } },
      ]));
    } finally {
      service.controller.abort();
      await service.done;
      await harness.lifecycle.dispose();
    }
  });

  it("keeps enrichment requests explicit when the research provider is unavailable", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);
    const company = await harness.behavior.callRpc("companies_create", {
      name: "No Provider Co",
      domain: "no-provider.example",
    }) as { id: string };
    const result = await harness.behavior.callRpc("companies_enrich", { id: company.id }) as {
      id: string;
      queued: boolean;
      status: string;
      reason: string | null;
    };

    expect(result).toMatchObject({
      id: company.id,
      queued: false,
      status: "SKIPPED",
      reason: expect.stringContaining("credentials are not configured"),
    });
    await expect(harness.behavior.callRpc("companies_get", { id: company.id }))
      .resolves.toMatchObject({
        enrichmentStatus: "SKIPPED",
        enrichmentError: expect.stringContaining("no external data was fetched"),
      });

    await harness.lifecycle.dispose();
  });

  it("queues provider-backed bulk enrichment and finalizes only after contact evidence", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: {
        researchApiKey: "provider-test-key",
        researchAgentId: "agent_enrichment_server",
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(
      harness,
      "agent_enrichment_server",
      "version_enrichment_server",
    );
    const contact = await harness.behavior.callRpc("contacts_create", {
      firstName: "Evidence",
      lastName: "Candidate",
      email: "candidate@example.com",
    }) as { id: string };

    const bulk = await harness.behavior.callRpc("contacts_bulkEnrich", {
      ids: [contact.id],
    });
    expect(bulk).toMatchObject({ requested: 1, succeeded: 1, skipped: 0, failed: 0 });
    const runs = await harness.behavior.callRpc("agents_runs_list", {
      agentId: "agent_enrichment_server",
      status: "QUEUED",
    }) as Array<{ id: string; input: Record<string, unknown> }>;
    expect(runs).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({
          kind: "CRM_ENRICHMENT_REQUEST",
          entity: "CONTACT",
          recordId: contact.id,
          operation: "enrich",
        }),
      }),
    ]);
    const runId = runs[0]!.id;
    await harness.behavior.callRpc("agents_runs_start", { id: runId });

    await harness.callAgentTool("crm_record_contact_fact", {
      contactId: contact.id,
      field: "twitterUrl",
      value: "https://x.com/evidence_candidate",
      score: 0.8,
      band: "PROBABLE",
      evidence: [{
        kind: "handle.name-form",
        detail: "The profile handle matches the contact's name.",
        sourceUrl: "https://x.com/evidence_candidate",
      }],
      method: "x.handle+citation",
      sourceUrl: "https://x.com/evidence_candidate",
    });
    await expect(harness.callAgentTool("crm_finalize_enrichment", {
      entity: "contact",
      recordId: contact.id,
      runId,
    })).resolves.toContain('"completed":true');
    await expect(harness.behavior.callRpc("contacts_get", { id: contact.id }))
      .resolves.toMatchObject({ enrichmentStatus: "COMPLETE", enrichedAt: expect.any(String) });

    await harness.lifecycle.dispose();
  });

  it("accepts fetched currency rates only through a provider-labelled RPC", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: { currencyRateProvider: "test-provider" },
    });
    await plugin(bb);
    await expect(harness.behavior.callRpc("currency_rates_upsertFetched", {
      baseCurrency: "USD",
      quoteCurrency: "EUR",
      rate: 0.92,
      provider: "test-provider",
      asOf: "2026-08-26T00:00:00.000Z",
    })).resolves.toMatchObject({
      baseCurrency: "USD",
      quoteCurrency: "EUR",
      source: "FETCHED",
      provider: "test-provider",
      rate: 0.92,
    });
    await expect(harness.behavior.callRpc("currency_rates_upsertFetched", {
      baseCurrency: "USD",
      quoteCurrency: "GBP",
      rate: 0.8,
    })).rejects.toThrow();
    await expect(harness.behavior.callRpc("currency_rates_upsertFetched", {
      baseCurrency: "USD",
      quoteCurrency: "GBP",
      rate: 0.8,
      provider: "unconfigured-provider",
    })).rejects.toThrow(/configured currencyRateProvider/);
    await harness.lifecycle.dispose();
  });

  it("keeps social and work-history research provider-backed and evidence-oriented", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: {
        researchApiKey: "provider-test-key",
        researchAgentId: "agent_research_paths",
      },
    });
    await plugin(bb);
    await seedLiveServerAgent(harness, "agent_research_paths", "version_research_paths");
    const company = await harness.behavior.callRpc("companies_create", {
      name: "Missing Domain Co",
    }) as { id: string };
    await expect(harness.behavior.callRpc("companies_research", { id: company.id }))
      .resolves.toMatchObject({
        queued: false,
        status: "SKIPPED",
        reason: expect.stringContaining("domain or website"),
      });

    const contact = await harness.behavior.callRpc("contacts_create", {
      firstName: "No",
      lastName: "Profile",
    }) as { id: string };
    await expect(harness.behavior.callRpc("contacts_research", {
      id: contact.id,
      focus: "work-history",
    })).resolves.toMatchObject({
      queued: false,
      status: "SKIPPED",
      reason: expect.stringContaining("LinkedIn URL"),
    });
    await expect(harness.behavior.callRpc("contacts_research", {
      id: contact.id,
      focus: "socials",
    })).resolves.toMatchObject({ queued: true, status: "PENDING", runId: expect.any(String) });

    await expect(harness.callAgentTool("crm_update_record", {
      entity: "contact",
      id: contact.id,
      data: { twitterUrl: "https://x.com/unverified" },
    })).rejects.toThrow();

    await harness.lifecycle.dispose();
  });
});
