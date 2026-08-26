import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import {
  createAgentStore,
  type AgentJsonValue,
} from "./db/agents.js";
import { initializeSchema } from "./db/schema.js";
import {
  buildAgentRunPrompt,
  createAgentDispatcher,
  type AgentDispatcher,
} from "./agent-dispatch.js";

function fixture(options: {
  spawn?: (args: unknown) => unknown | Promise<unknown>;
  send?: (args: unknown) => unknown | Promise<unknown>;
  get?: (args: unknown) => unknown | Promise<unknown>;
  archive?: (args: unknown) => unknown | Promise<unknown>;
  stop?: (args: unknown) => unknown | Promise<unknown>;
} = {}) {
  const host = createFakePluginHost({
    pluginId: "crm-agent-dispatch-test",
    sdk: {
      threads: {
        spawn: async (args) => options.spawn?.(args) ?? { id: "bb-thread-1" },
        send: async (args) => options.send?.(args) ?? { ok: true },
        get: async (args) => options.get?.(args) ?? {
          id: "bb-thread-1",
          status: "active",
          visibility: "hidden",
        },
        archive: async (args) => options.archive?.(args) ?? { ok: true },
        stop: async (args) => options.stop?.(args) ?? { ok: true },
      },
    },
  });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  const store = createAgentStore(db);
  const agent = store.create({
    id: "agent_dispatch",
    name: "Account researcher",
    description: "Research CRM accounts.",
    createdById: "user_1",
  });
  const version = store.createVersion(agent.id, {
    id: "version_dispatch_1",
    instructions: "Read the exact company and summarize verified facts.",
    manifest: { tools: ["crm_get_record", "crm_add_activity"] },
    modelId: "crm/model-1",
    sandboxPolicy: { permissionMode: "accept-edits" },
  }, "user_1");
  store.validateVersion(version.id, undefined, "user_1");
  store.deploy(agent.id, version.id, "user_1");

  function queueRun(id: string, input: AgentJsonValue = { companyId: "company_1" }) {
    return store.queueRun(agent.id, {
      id,
      versionId: version.id,
      input,
      idempotencyKey: `key-${id}`,
      correlationId: `correlation-${id}`,
    }, "user_1");
  }

  const dispatcher = createAgentDispatcher({
    bb: host.bb,
    db,
    projectId: "project_crm",
    cleanupHiddenThreads: false,
  });
  return { host, db, store, agent, version, dispatcher, queueRun };
}

async function dispose(dispatcherFixture: ReturnType<typeof fixture>): Promise<void> {
  await dispatcherFixture.host.harness.lifecycle.dispose();
}

describe("CRM agent thread dispatcher", () => {
  it("atomically claims one queued run, spawns a hidden thread, and links it idempotently", async () => {
    const state = fixture();
    const run = state.queueRun("run_dispatch");
    try {
      const [first, second] = await Promise.all([
        state.dispatcher.dispatchQueuedRun(run.id),
        state.dispatcher.dispatchQueuedRun(run.id),
      ]);

      expect(hostCallKinds([first, second])).toEqual(
        expect.arrayContaining(["dispatched", "in-flight"]),
      );
      expect(state.host.harness.sdk.callsTo("threads.spawn")).toHaveLength(1);
      const spawnArgs = state.host.harness.sdk.callsTo("threads.spawn")[0]?.[0] as {
        projectId: string;
        environment: { type: string };
        visibility: string;
        permissionMode: string;
        input: Array<{ type: string; text: string; mentions: unknown[] }>;
      };
      expect(spawnArgs).toMatchObject({
        projectId: "project_crm",
        environment: { type: "project-default" },
        visibility: "hidden",
        permissionMode: "accept-edits",
      });
      expect(spawnArgs.input).toHaveLength(1);
      expect(spawnArgs.input[0]?.mentions).toEqual([]);
      expect(spawnArgs.input[0]?.text).toContain("[CRM AGENT RUN]");
      expect(spawnArgs.input[0]?.text).toContain('"agentId":"agent_dispatch"');
      expect(spawnArgs.input[0]?.text).toContain('"versionId":"version_dispatch_1"');
      expect(spawnArgs.input[0]?.text).toContain("Read the exact company");
      expect(spawnArgs.input[0]?.text).toContain('"companyId":"company_1"');
      expect(spawnArgs.input[0]?.text).toContain("request approval");

      const linked = state.store.listThreads(state.agent.id, { runId: run.id });
      expect(linked).toEqual([
        expect.objectContaining({
          kind: "RUN",
          runId: run.id,
          versionId: state.version.id,
          threadId: "bb-thread-1",
        }),
      ]);
      expect(state.store.getRunRequired(run.id).status).toBe("RUNNING");

      const repeated = await state.dispatcher.dispatchQueuedRun(run.id);
      expect(repeated.kind).toBe("already-dispatched");
      expect(state.host.harness.sdk.callsTo("threads.spawn")).toHaveLength(1);
    } finally {
      await dispose(state);
    }
  });

  it("marks a claimed run failed when thread creation fails", async () => {
    const state = fixture({
      spawn: async () => {
        throw new Error("project unavailable");
      },
    });
    const run = state.queueRun("run_spawn_failure");
    try {
      const result = await state.dispatcher.dispatchQueuedRun(run.id);

      expect(result.kind).toBe("failed");
      expect(result).toMatchObject({ error: "project unavailable" });
      expect(state.store.getRunRequired(run.id)).toMatchObject({
        status: "FAILED",
        errorCode: "THREAD_DISPATCH_FAILED",
        errorMessage: "project unavailable",
        result: null,
      });
      expect(state.store.listThreads(state.agent.id, { runId: run.id })).toEqual([]);
    } finally {
      await dispose(state);
    }
  });

  it("reclaims an expired unlinked RUNNING claim and links exactly one retry thread", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-recovered" }));
    const state = fixture({ spawn });
    const run = state.queueRun("run_orphan_recovery");
    state.store.startRun(run.id, "crm-dispatcher");
    state.db.prepare("UPDATE agent_runs SET started_at = ? WHERE id = ?").run(
      new Date(Date.now() - 10 * 60 * 1_000).toISOString(),
      run.id,
    );
    try {
      expect(state.dispatcher.listOrphanedRunningRunIds()).toEqual([run.id]);
      const result = await state.dispatcher.dispatchQueuedRun(run.id);

      expect(result).toMatchObject({
        kind: "dispatched",
        run: { status: "RUNNING" },
        thread: { threadId: "bb-thread-recovered", runId: run.id },
      });
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(state.store.listThreads(state.agent.id, { runId: run.id })).toEqual([
        expect.objectContaining({ threadId: "bb-thread-recovered" }),
      ]);
      expect(state.store.getRunRequired(run.id).events.map((event) => event.type)).toEqual([
        "run.queued",
        "run.started",
        "run.recovered",
      ]);
      expect(state.store.listRunAudit(run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "run.recovered" }),
      ]));
    } finally {
      await dispose(state);
    }
  });

  it("does not reclaim a fresh unlinked RUNNING claim", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-fresh" }));
    const state = fixture({ spawn });
    const run = state.queueRun("run_fresh_claim");
    state.store.startRun(run.id, "crm-dispatcher");
    try {
      expect(state.dispatcher.listOrphanedRunningRunIds()).toEqual([]);
      const result = await state.dispatcher.dispatchQueuedRun(run.id);

      expect(result).toMatchObject({ kind: "in-flight", run: { status: "RUNNING" } });
      expect(spawn).not.toHaveBeenCalled();
      expect(state.store.listThreads(state.agent.id, { runId: run.id })).toEqual([]);
    } finally {
      await dispose(state);
    }
  });

  it("uses the public send API for a linked recovery and marks send failures failed", async () => {
    const send = vi.fn(async () => {
      throw new Error("provider is offline");
    });
    const state = fixture({ send });
    const run = state.queueRun("run_send_failure");
    state.store.startRun(run.id, "crm-dispatcher");
    const link = state.store.linkThread(state.agent.id, {
      threadId: "recovery-thread",
      kind: "RUN",
      runId: run.id,
      versionId: state.version.id,
    }, "crm-dispatcher");
    try {
      const result = await state.dispatcher.sendPromptToLinkedRun(run.id);

      expect(result.kind).toBe("failed");
      expect(send).toHaveBeenCalledTimes(1);
      expect(state.host.harness.sdk.callsTo("threads.send")[0]?.[0]).toMatchObject({
        threadId: link.threadId,
        mode: "auto",
      });
      const sendArgs = state.host.harness.sdk.callsTo("threads.send")[0]?.[0] as {
        input: Array<{ text: string }>;
      };
      expect(sendArgs.input[0]?.text).toContain("[CRM AGENT RUN]");
      expect(state.store.getRunRequired(run.id)).toMatchObject({
        status: "FAILED",
        errorCode: "THREAD_DISPATCH_FAILED",
        errorMessage: "provider is offline",
        result: null,
      });
    } finally {
      await dispose(state);
    }
  });

  it("maps idle, failure, and explicit cancellation signals without inventing results", async () => {
    let nextThread = 0;
    const state = fixture({
      spawn: async () => ({ id: `thread-${++nextThread}` }),
    });
    const idleRun = state.queueRun("run_idle");
    const failedRun = state.queueRun("run_failed");
    const cancelledRun = state.queueRun("run_cancelled");
    try {
      await state.dispatcher.dispatchQueuedRun(idleRun.id);
      await state.dispatcher.dispatchQueuedRun(failedRun.id);
      await state.dispatcher.dispatchQueuedRun(cancelledRun.id);

      const idle = await state.dispatcher.reconcileThreadSignal({
        type: "idle",
        threadId: "thread-1",
        lastAssistantText: "Verified two facts.",
      });
      expect(idle).toMatchObject({ kind: "succeeded", run: { status: "SUCCEEDED" } });
      expect(state.store.getRunRequired(idleRun.id)).toMatchObject({
        status: "SUCCEEDED",
        summary: "Verified two facts.",
        result: null,
      });

      const duplicate = await state.dispatcher.reconcileThreadSignal({
        type: "idle",
        threadId: "thread-1",
        lastAssistantText: "A different duplicate event.",
      });
      expect(duplicate.kind).toBe("ignored");
      expect(state.store.getRunRequired(idleRun.id).summary).toBe("Verified two facts.");

      const failed = await state.dispatcher.reconcileThreadSignal({
        type: "failed",
        threadId: "thread-2",
        error: "model turn failed",
      });
      expect(failed).toMatchObject({ kind: "failed", run: { status: "FAILED" } });
      expect(state.store.getRunRequired(failedRun.id)).toMatchObject({
        status: "FAILED",
        errorCode: "THREAD_FAILED",
        errorMessage: "model turn failed",
        result: null,
      });

      const cancelled = await state.dispatcher.reconcileThreadSignal({
        type: "cancelled",
        threadId: "thread-3",
        reason: "Operator stopped this run.",
      });
      expect(cancelled).toMatchObject({ kind: "cancelled", run: { status: "CANCELLED" } });
      expect(state.store.getRunRequired(cancelledRun.id)).toMatchObject({
        status: "CANCELLED",
        errorCode: "CANCELLED",
        errorMessage: "Operator stopped this run.",
        result: null,
      });
    } finally {
      await dispose(state);
    }
  });

  it("registers lifecycle hooks and cleans up hidden workers after terminal events", async () => {
    const archive = vi.fn(async () => ({ ok: true }));
    const stop = vi.fn(async () => ({ ok: true }));
    const state = fixture({ archive, stop });
    const run = state.queueRun("run_events");
    const dispatcher = createAgentDispatcher({
      bb: state.host.bb,
      db: state.db,
      projectId: "project_crm",
      cleanupHiddenThreads: true,
    });
    dispatcher.registerLifecycleHooks(state.host.bb.events);
    try {
      await dispatcher.dispatchQueuedRun(run.id);
      const payload = makeThreadResponse({
        id: "bb-thread-1",
        visibility: "hidden",
        status: "idle",
      });
      const emitted = await state.host.harness.emitThreadEvent("thread.idle", {
        thread: payload,
        lastAssistantText: null,
      });
      expect(emitted.errors).toEqual([]);
      expect(state.store.getRunRequired(run.id).status).toBe("SUCCEEDED");
      expect(archive).toHaveBeenCalledWith({ threadId: "bb-thread-1" });
      expect(stop).toHaveBeenCalledWith({ threadId: "bb-thread-1" });
    } finally {
      await dispose(state);
    }
  });

  it("leaves stopping threads pending because BB has no public cancellation status", async () => {
    const state = fixture({
      get: async () => ({
        id: "bb-thread-1",
        status: "stopping",
        visibility: "hidden",
      }),
    });
    const run = state.queueRun("run_stopping");
    try {
      await state.dispatcher.dispatchQueuedRun(run.id);
      const result = await state.dispatcher.reconcileThread("bb-thread-1");

      expect(result).toMatchObject({
        kind: "pending",
        reason: expect.stringContaining("no cancellation signal"),
        run: { status: "RUNNING" },
      });
      expect(state.store.getRunRequired(run.id).status).toBe("RUNNING");
    } finally {
      await dispose(state);
    }
  });

  it("renders the complete structured prompt envelope", async () => {
    const state = fixture();
    const run = state.queueRun("run_prompt", { nested: { ok: true }, count: 3 });
    try {
      const prompt = buildAgentRunPrompt({
        agent: state.agent,
        version: state.version,
        run,
        safetyRules: ["Use approved tools only."],
      });

      expect(prompt).toContain("## Agent (JSON)");
      expect(prompt).toContain("## Version (JSON)");
      expect(prompt).toContain("## Agent instructions (verbatim task content)");
      expect(prompt).toContain("## Run input (JSON)");
      expect(prompt).toContain('"nested":{"ok":true}');
      expect(prompt).toContain("Use approved tools only.");
      expect(prompt).toContain("Do not fabricate a result payload");
    } finally {
      await dispose(state);
    }
  });
});

function hostCallKinds(results: Awaited<ReturnType<AgentDispatcher["dispatchQueuedRun"]>>[]): string[] {
  return results.map((result) => result.kind);
}
