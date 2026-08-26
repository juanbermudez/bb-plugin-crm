import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { initializeSchema } from "./schema.js";
import {
  AgentStateError,
  AgentStore,
} from "./agents.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-agents-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("CRM agent workspace persistence", () => {
  it("keeps the migration v5 agent graph intact after later migrations", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      expect(db.prepare("SELECT value FROM crm_metadata WHERE key = 'schema_version'").pluck().get()).toBe("6");
      expect(db.prepare("SELECT MAX(id) FROM _bb_migrations").pluck().get()).toBe(5);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_%' ORDER BY name",
      ).all() as Array<{ name: string }>;
      expect(tables.map((row) => row.name)).toEqual([
        "agent_actions",
        "agent_audit_events",
        "agent_definitions",
        "agent_run_events",
        "agent_runs",
        "agent_thread_links",
        "agent_triggers",
        "agent_versions",
      ]);
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'agent_%' ORDER BY name",
      ).all() as Array<{ name: string }>;
      expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
        "agent_definitions_status_updated_idx",
        "agent_versions_agent_number_idx",
        "agent_triggers_enabled_next_run_idx",
        "agent_runs_status_created_idx",
        "agent_audit_agent_emitted_idx",
        "agent_thread_links_record_idx",
      ]));
      const triggers = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'agent_%' ORDER BY name",
      ).all() as Array<{ name: string }>;
      expect(triggers.map((row) => row.name)).toEqual(expect.arrayContaining([
        "agent_versions_immutable_content",
        "agent_run_status_transition_guard",
        "agent_definition_current_version_update_guard",
      ]));
    } finally {
      await lifecycle.dispose();
    }
  });

  it("persists a deploy, trigger, approval, action, thread, and terminal run lifecycle", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new AgentStore(db);
      const agent = store.create({ id: "agent_lifecycle", name: "Renewal watcher", createdById: "user_1" });
      const version = store.createVersion(agent.id, {
        id: "version_lifecycle_1",
        instructions: "Watch renewals and summarize changes.",
        manifest: { actions: ["crm.note.write"] },
        modelId: "test/model",
        sandboxPolicy: { network: "deny" },
      }, "user_1");
      expect(version).toMatchObject({ agentId: agent.id, number: 1, status: "DRAFT" });

      store.validateVersion(version.id, undefined, "user_1");
      const deployed = store.deploy(agent.id, version.id, "user_1");
      expect(deployed).toEqual({ id: agent.id, versionId: version.id, status: "LIVE" });
      expect(store.list({ search: "renewal" })).toEqual([
        expect.objectContaining({ id: agent.id, currentVersion: expect.objectContaining({ id: version.id, status: "DEPLOYED" }), runCount: 0 }),
      ]);
      const trigger = store.createTrigger(agent.id, {
        id: "trigger_lifecycle",
        versionId: version.id,
        type: "SCHEDULE",
        name: "Every morning",
        config: { cron: "0 9 * * *" },
        enabled: true,
      }, "user_1");
      expect(trigger.enabled).toBe(true);

      const queued = store.queueRun(agent.id, {
        id: "run_lifecycle",
        triggerId: trigger.id,
        input: { companyId: "company_1" },
        idempotencyKey: "run-request-1",
      }, "user_1");
      expect(queued).toMatchObject({ id: "run_lifecycle", status: "QUEUED", triggerType: "SCHEDULE" });
      expect(queued.events).toEqual([
        expect.objectContaining({ sequence: 0, type: "run.queued", data: { triggerType: "SCHEDULE" } }),
      ]);

      expect(store.startRun(queued.id, "worker").status).toBe("RUNNING");
      expect(store.requestApproval(queued.id, { reason: "This writes a CRM note." }, "worker").status).toBe("WAITING_FOR_APPROVAL");
      const approved = store.approveRun(queued.id, { approvedById: "user_1" });
      expect(approved).toMatchObject({ status: "RUNNING", approvedById: "user_1" });

      const action = store.createAction(queued.id, {
        id: "action_lifecycle",
        type: "crm.note.write",
        provider: "crm",
        targetType: "COMPANY",
        targetId: "company_1",
        summary: "Write renewal note",
        metadata: { source: "agent" },
      }, "worker");
      expect(store.startAction(action.id, "worker")).toMatchObject({ status: "RUNNING", attemptCount: 1 });
      expect(store.succeedAction(action.id, "note_1", "worker")).toMatchObject({ status: "SUCCEEDED", externalId: "note_1" });

      const succeeded = store.succeedRun(queued.id, {
        result: { noteId: "note_1" },
        summary: "Renewal note written",
        inputTokens: 20,
        outputTokens: 8,
        costUsd: 0.0012,
      }, "worker");
      expect(succeeded).toMatchObject({ status: "SUCCEEDED", summary: "Renewal note written", result: { noteId: "note_1" } });
      expect(succeeded.events.map((event) => event.type)).toEqual([
        "run.queued",
        "run.started",
        "run.approval.requested",
        "run.approved",
        "run.succeeded",
      ]);

      const link = store.linkThread(agent.id, {
        id: "thread_lifecycle",
        threadId: "bb-thread-1",
        kind: "RECORD",
        recordType: "COMPANY",
        recordId: "company_1",
        versionId: version.id,
        summary: "Renewal watcher transcript",
      }, "user_1");
      expect(store.listThreads(agent.id)).toEqual([expect.objectContaining({ id: link.id, threadId: "bb-thread-1" })]);

      const detail = store.detail(agent.id);
      expect(detail).toMatchObject({
        status: "LIVE",
        currentVersionId: version.id,
        currentVersion: { id: version.id, status: "DEPLOYED" },
        triggers: [{ id: trigger.id, enabled: true }],
        runCount: 1,
      });
      expect(store.listAudit(agent.id).length).toBeGreaterThanOrEqual(8);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("enforces JSON shape, immutable version payloads, and legal state transitions", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new AgentStore(db);
      const agent = store.create({ name: "Validation test", createdById: "user_1" });
      expect(() => store.createVersion(agent.id, {
        instructions: "bad",
        manifest: { broken: Number.NaN },
      })).toThrow("non-finite number");
      const version = store.createVersion(agent.id, { instructions: "run" });
      expect(() => db.prepare("UPDATE agent_versions SET instructions = 'changed' WHERE id = ?").run(version.id)).toThrow("immutable");
      expect(() => store.pause(agent.id)).toThrow(AgentStateError);
      expect(() => store.startRun("missing")).toThrow("No agent run");

      expect(() => store.deploy(agent.id, version.id)).toThrow(
        "Only a validated READY or already DEPLOYED agent version can be deployed",
      );
      store.validateVersion(version.id);
      store.deploy(agent.id, version.id);
      const run = store.queueRun(agent.id, { idempotencyKey: "invalid-transition-run" });
      expect(() => store.succeedRun(run.id)).toThrow("from QUEUED to SUCCEEDED");
      store.startRun(run.id);
      store.requestApproval(run.id);
      expect(() => store.succeedRun(run.id)).toThrow("from WAITING_FOR_APPROVAL to SUCCEEDED");
      store.approveRun(run.id);
      store.succeedRun(run.id);
      expect(() => store.cancelRun(run.id)).not.toThrow();
      expect(store.getRunRequired(run.id).status).toBe("SUCCEEDED");
    } finally {
      await lifecycle.dispose();
    }
  });

  it("does not deploy an unvalidated draft version", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new AgentStore(db);
      const agent = store.create({ id: "agent_deploy_validation", name: "Deploy validation" });
      const version = store.createVersion(agent.id, {
        id: "version_deploy_validation",
        instructions: "run",
      });

      expect(version.status).toBe("DRAFT");
      expect(() => store.deploy(agent.id, version.id)).toThrow(
        "Only a validated READY or already DEPLOYED agent version can be deployed",
      );
      expect(store.getRequired(agent.id).status).toBe("DRAFT");
      expect(store.getVersionRequired(version.id).status).toBe("DRAFT");
    } finally {
      await lifecycle.dispose();
    }
  });

  it("cascades child persistence when an agent is explicitly purged", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new AgentStore(db);
      const agent = store.create({ id: "agent_cascade", name: "Cascade test" });
      const version = store.createVersion(agent.id, { instructions: "run" });
      store.validateVersion(version.id);
      store.deploy(agent.id, version.id);
      const trigger = store.createTrigger(agent.id, {
        versionId: version.id,
        type: "MANUAL",
        name: "Manual",
        config: {},
      });
      const run = store.queueRun(agent.id, { triggerId: trigger.id, idempotencyKey: "cascade-run" });
      store.createAction(run.id, { type: "crm.note.write", provider: "crm", summary: "Note" });
      store.linkThread(agent.id, { threadId: "cascade-thread", kind: "RUN", runId: run.id });

      db.prepare("DELETE FROM agent_definitions WHERE id = ?").run(agent.id);
      for (const table of [
        "agent_definitions",
        "agent_versions",
        "agent_triggers",
        "agent_runs",
        "agent_run_events",
        "agent_actions",
        "agent_audit_events",
        "agent_thread_links",
      ]) {
        const count = table === "agent_definitions"
          ? db.prepare(`SELECT COUNT(*) FROM ${table} WHERE id = ?`).pluck().get(agent.id)
          : table === "agent_run_events"
            ? db.prepare("SELECT COUNT(*) FROM agent_run_events WHERE run_id = ?").pluck().get(run.id)
            : db.prepare(`SELECT COUNT(*) FROM ${table} WHERE agent_id = ?`).pluck().get(agent.id);
        expect(count).toBe(0);
      }
    } finally {
      await lifecycle.dispose();
    }
  });
});
