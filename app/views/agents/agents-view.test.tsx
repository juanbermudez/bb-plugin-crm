// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentDetail,
  AgentListItem,
  AgentRunDetail,
  AgentTrigger,
  AgentVersion,
} from "../../../contracts/agents.js";
import { AgentsView, type AgentsRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

const version: AgentVersion = {
  id: "version_research_1",
  agentId: "agent_research",
  number: 1,
  status: "DEPLOYED",
  instructions: "Review the account and summarize renewal risk.",
  manifest: { output: "summary" },
  modelId: "default",
  modelContextWindowTokens: 1_000_000,
  sandboxPolicy: { network: "deny" },
  validation: null,
  sourceConversationId: null,
  createdById: "bb-user-local",
  deploymentId: "deployment_1",
  approvedAt: "2026-08-25T09:00:00.000Z",
  deployedAt: "2026-08-25T09:00:00.000Z",
  createdAt: "2026-08-25T08:00:00.000Z",
};

const trigger: AgentTrigger = {
  id: "trigger_weekly",
  agentId: "agent_research",
  versionId: version.id,
  type: "SCHEDULE",
  name: "Weekly review",
  config: { cron: "0 9 * * 1" },
  createdById: "bb-user-local",
  enabled: false,
  nextRunAt: null,
  lastRunAt: null,
  createdAt: "2026-08-25T09:00:00.000Z",
  updatedAt: "2026-08-25T09:00:00.000Z",
};

const run: AgentRunDetail = {
  id: "run_queued",
  agentId: "agent_research",
  versionId: version.id,
  triggerId: null,
  initiatedById: "bb-user-local",
  triggerType: "MANUAL",
  status: "QUEUED",
  principalId: null,
  sessionId: null,
  idempotencyKey: "run_queued",
  correlationId: "corr_queued",
  input: null,
  result: null,
  summary: null,
  modelId: "default",
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  errorCode: null,
  errorMessage: null,
  approvalReason: null,
  approvalRequestedAt: null,
  approvedAt: null,
  approvedById: null,
  nextEventSequence: 1,
  createdAt: "2026-08-25T09:10:00.000Z",
  startedAt: null,
  finishedAt: null,
  cancelRequestedAt: null,
  cancelDeliveredAt: null,
  events: [
    {
      id: "event_queued",
      runId: "run_queued",
      sequence: 1,
      type: "run.queued",
      data: { triggerType: "MANUAL" },
      emittedAt: "2026-08-25T09:10:00.000Z",
    },
  ],
  actions: [],
};

const agent: AgentDetail = {
  id: "agent_research",
  name: "Renewal researcher",
  description: "Find renewal risk in account activity.",
  status: "LIVE",
  createdById: "bb-user-local",
  currentVersionId: version.id,
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-08-25T08:00:00.000Z",
  updatedAt: "2026-08-25T09:00:00.000Z",
  currentVersion: version,
  versions: [version],
  triggers: [trigger],
  runCount: 1,
};

const listItem: AgentListItem = {
  ...agent,
  currentVersion: {
    id: version.id,
    number: version.number,
    status: version.status,
    deployedAt: version.deployedAt,
  },
};

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "agents_list") return [listItem];
      if (method === "agents_get") return agent;
      if (method === "agents_triggers_list") return [trigger];
      if (method === "agents_runs_list") return [run];
      if (method === "agents_runs_get") return run;
      if (method === "agents_audit_list") return [];
      if (method === "agents_runs_queue") return run;
      if (method === "agents_versions_validate") return { ...version, status: "READY" };
      if (method === "agents_deploy") return { id: agent.id, versionId: version.id, status: "LIVE" };
      if (method === "agents_triggers_enable") return { ...trigger, enabled: true };
      return agent;
    }),
  );
  return { call } as unknown as AgentsRpcClient & { call: typeof call };
}

describe("AgentsView", () => {
  it("creates an agent and deep-links the new definition", async () => {
    const created = { ...agent, id: "agent_new", name: "New agent", description: null, currentVersion: null, versions: [], triggers: [], runCount: 0 };
    const onRecordIdChange = vi.fn();
    const rpc = makeRpc(async (method) => {
      if (method === "agents_list") return [listItem];
      if (method === "agents_create") return created;
      if (method === "agents_get") return created;
      return [];
    });
    render(<AgentsView rpcClient={rpc} onRecordIdChange={onRecordIdChange} />);

    await screen.findByText("Renewal researcher");
    fireEvent.click(screen.getByRole("button", { name: "New agent" }));
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "New agent" } });
    fireEvent.change(screen.getByLabelText("Description (optional)"), { target: { value: "A new workflow" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_create", {
      name: "New agent",
      description: "A new workflow",
    }));
    await waitFor(() => expect(onRecordIdChange).toHaveBeenCalledWith("agent_new"));
    expect(await screen.findByRole("dialog", { name: "New agent" })).toBeDefined();
  });

  it("validates and deploys a selected version", async () => {
    const rpc = makeRpc();
    render(<AgentsView rpcClient={rpc} initialRecordId={agent.id} />);
    const drawer = await screen.findByRole("dialog", { name: agent.name });

    fireEvent.click(within(drawer).getByRole("button", { name: "Validate version" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_versions_validate", { id: version.id }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Deploy version" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_deploy", {
      agentId: agent.id,
      versionId: version.id,
    }));
  });

  it("creates, enables, and deletes a trigger", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "agents_list") return [listItem];
      if (method === "agents_get") return agent;
      if (method === "agents_triggers_list") return [trigger];
      if (method === "agents_triggers_create") return trigger;
      if (method === "agents_triggers_enable") return { ...trigger, enabled: true };
      if (method === "agents_triggers_delete") return { id: trigger.id };
      return [];
    });
    render(<AgentsView rpcClient={rpc} initialRecordId={agent.id} />);
    const drawer = await screen.findByRole("dialog", { name: agent.name });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Triggers" }));
    await within(drawer).findByText("Weekly review");

    fireEvent.change(within(drawer).getByLabelText("Trigger name"), { target: { value: "Manual QA" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Create trigger" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_triggers_create", {
      agentId: agent.id,
      data: {
        versionId: version.id,
        type: "MANUAL",
        name: "Manual QA",
        config: {},
        enabled: false,
      },
    }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_triggers_enable", { id: trigger.id, enabled: true }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_triggers_delete", { id: trigger.id }));
  });

  it("queues a manual run and exposes explicit persisted test transitions", async () => {
    let currentRun = run;
    const rpc = makeRpc(async (method) => {
      if (method === "agents_list") return [listItem];
      if (method === "agents_get") return agent;
      if (method === "agents_runs_list") return [currentRun];
      if (method === "agents_runs_queue") return currentRun;
      if (method === "agents_runs_get") return currentRun;
      if (method === "agents_runs_start") {
        currentRun = { ...currentRun, status: "RUNNING" };
        return currentRun;
      }
      if (method === "agents_runs_success") {
        currentRun = { ...currentRun, status: "SUCCEEDED" };
        return currentRun;
      }
      return [];
    });
    render(<AgentsView rpcClient={rpc} initialRecordId={agent.id} />);
    const drawer = await screen.findByRole("dialog", { name: agent.name });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Run history" }));
    await within(drawer).findByText("run_queued");

    fireEvent.click(within(drawer).getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_runs_queue", { agentId: agent.id }));
    fireEvent.click(within(drawer).getByRole("button", { name: "View run" }));
    await within(drawer).findByText("Persisted test transitions");
    fireEvent.click(within(drawer).getByRole("button", { name: "Start test run" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_runs_start", { id: run.id }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Mark succeeded" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_runs_success", { id: run.id }));
  });

  it("keeps the selected agent in the route callback when opening and closing", async () => {
    const onRecordIdChange = vi.fn();
    const rpc = makeRpc();
    render(<AgentsView rpcClient={rpc} onRecordIdChange={onRecordIdChange} />);
    fireEvent.click(await screen.findByRole("row", { name: /Open Renewal researcher/ }));
    await waitFor(() => expect(onRecordIdChange).toHaveBeenCalledWith(agent.id));
    fireEvent.click(await screen.findByRole("button", { name: "Close record drawer" }));
    await waitFor(() => expect(onRecordIdChange).toHaveBeenCalledWith(null));
  });
});
