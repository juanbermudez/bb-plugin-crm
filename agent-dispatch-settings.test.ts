import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin, { CRM_AGENT_DISPATCH_SERVICE_NAME } from "./server.js";
import { createAgentStore } from "./db/agents.js";

describe("agent execution selector", () => {
  it("forwards strict stored provider, model, and reasoning settings to BB", async () => {
    const spawn = vi.fn(async () => ({ id: "bb-thread-selector" }));
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm-agent-selector",
      settings: {
        agentProviderId: "openai",
        agentModelId: "gpt-5-codex",
        agentReasoningLevel: "high",
      },
      sdk: {
        projects: { list: async () => [{ id: "project-selector", kind: "standard" }] },
        threads: { spawn },
      },
    });
    await plugin(bb);
    try {
      await harness.behavior.callRpc("agents_create", {
        id: "agent-selector",
        name: "Selector agent",
      });
      await harness.behavior.callRpc("agents_versions_create", {
        agentId: "agent-selector",
        data: {
          id: "version-selector",
          instructions: "Use only confirmed CRM facts.",
          manifest: {},
        },
      });
      await harness.behavior.callRpc("agents_versions_validate", { id: "version-selector" });
      await harness.behavior.callRpc("agents_deploy", {
        agentId: "agent-selector",
        versionId: "version-selector",
      });
      await harness.behavior.callRpc("agents_runs_queue", {
        agentId: "agent-selector",
        id: "run-selector",
        idempotencyKey: "run-selector-key",
      });

      const service = harness.behavior.runService(CRM_AGENT_DISPATCH_SERVICE_NAME);
      try {
        const store = createAgentStore(bb.storage.database());
        await vi.waitFor(() => expect(store.getRunRequired("run-selector").status).toBe("RUNNING"));
        expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
          providerId: "openai",
          model: "gpt-5-codex",
          reasoningLevel: "high",
        }));
      } finally {
        service.controller.abort();
        await service.done;
      }
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
