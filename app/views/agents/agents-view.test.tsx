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
  AgentThreadLink,
  AgentTrigger,
  AgentVersion,
} from "../../../contracts/agents.js";
import { AgentsView, type AgentsRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
  ThreadChat: ({
    threadId,
    messageActions,
  }: {
    threadId: string;
    messageActions?: Array<{ run(message: { id: string; threadId: string; role: "assistant"; text: string; sourceSeqEnd: number }): void | Promise<void> }>;
  }) => (
    <div data-testid="agent-thread-chat">
      BB thread {threadId}
      {messageActions?.[0] ? (
        <button
          type="button"
          onClick={() => void messageActions[0]!.run({
            id: "assistant-message-1",
            threadId,
            role: "assistant",
            text: "Exact assistant automation draft.",
            sourceSeqEnd: 7,
          })}
        >
          Mock use as version draft
        </button>
      ) : null}
    </div>
  ),
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
  sandboxPolicy: { permissionMode: "accept-edits" },
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

const builderLink: AgentThreadLink = {
  id: "builder_link_1",
  agentId: agent.id,
  threadId: "bb-builder-1",
  kind: "BUILDER",
  runId: null,
  versionId: version.id,
  recordType: null,
  recordId: null,
  summary: "CRM automation builder conversation",
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
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

  it("restores a deep-linked Conversation tab and reports tab changes", async () => {
    const onTabChange = vi.fn();
    const rpc = makeRpc(async (method) => {
      if (method === "agents_list") return [listItem];
      if (method === "agents_get") return agent;
      if (method === "agents_threads_list") return [];
      return [];
    });
    render(
      <AgentsView
        rpcClient={rpc}
        initialRecordId={agent.id}
        initialTab="conversation"
        onTabChange={onTabChange}
      />,
    );
    const drawer = await screen.findByRole("dialog", { name: agent.name });
    expect(within(drawer).getByRole("tab", { name: "Conversation" }).getAttribute("aria-selected")).toBe("true");
    expect(await within(drawer).findByText("No builder conversation yet")).toBeDefined();

    fireEvent.click(within(drawer).getByRole("tab", { name: "Versions" }));
    expect(onTabChange).toHaveBeenCalledWith("versions", agent.id);
  });

  it("copies an exact assistant message into an unsaved version draft with provenance", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "agents_list") return [listItem];
      if (method === "agents_get") return agent;
      if (method === "agents_threads_list") return [builderLink];
      if (method === "agents_versions_create") return version;
      return [];
    });
    render(<AgentsView rpcClient={rpc} initialRecordId={agent.id} initialTab="conversation" />);
    const drawer = await screen.findByRole("dialog", { name: agent.name });
    await within(drawer).findByTestId("agent-thread-chat");
    fireEvent.click(within(drawer).getByRole("button", { name: "Mock use as version draft" }));

    const instructions = within(drawer).getByLabelText("Instructions") as HTMLTextAreaElement;
    expect(instructions.value).toBe("Exact assistant automation draft.");
    fireEvent.click(within(drawer).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_versions_create", {
      agentId: agent.id,
      data: {
        status: "DRAFT",
        instructions: "Exact assistant automation draft.",
        modelId: version.modelId,
        modelContextWindowTokens: version.modelContextWindowTokens,
        manifest: version.manifest,
        sandboxPolicy: version.sandboxPolicy,
        sourceConversationId: builderLink.threadId,
      },
    }));
  });

  it("requires destructive confirmation before deleting an agent", async () => {
    let currentAgent = agent;
    const deletedAgent: AgentDetail = {
      ...agent,
      status: "DELETED",
      deletedAt: "2026-08-25T09:30:00.000Z",
    };
    const rpc = makeRpc(async (method) => {
      if (method === "agents_list") return currentAgent.status === "DELETED" ? [] : [listItem];
      if (method === "agents_get") return currentAgent;
      if (method === "agents_delete") {
        currentAgent = deletedAgent;
        return deletedAgent;
      }
      return [];
    });
    render(<AgentsView rpcClient={rpc} initialRecordId={agent.id} />);
    const drawer = await screen.findByRole("dialog", { name: agent.name });
    fireEvent.click(within(drawer).getByRole("button", { name: "Delete agent" }));

    const confirmation = await screen.findByRole("dialog", { name: `Delete ${agent.name}?` });
    expect(rpc.call).not.toHaveBeenCalledWith("agents_delete", { id: agent.id });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete agent" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_delete", { id: agent.id }));
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

  it("resolves an approval request and retries a cancelled run", async () => {
    let currentRun: AgentRunDetail = {
      ...run,
      status: "WAITING_FOR_APPROVAL",
      approvalReason: "Write a follow-up note.",
      approvalRequestedAt: "2026-08-25T09:20:00.000Z",
    };
    const retriedRun: AgentRunDetail = { ...run, id: "run_retry", status: "QUEUED" };
    const rpc = makeRpc(async (method, input) => {
      if (method === "agents_list") return [listItem];
      if (method === "agents_get") return agent;
      if (method === "agents_runs_list") return [currentRun];
      if (method === "agents_runs_get") return currentRun;
      if (method === "agents_runs_cancel") {
        currentRun = { ...currentRun, status: "CANCELLED" };
        return { ...currentRun, cancelled: true };
      }
      if (method === "agents_runs_retry") {
        expect(input).toEqual({ id: run.id });
        return retriedRun;
      }
      return [];
    });
    render(<AgentsView rpcClient={rpc} initialRecordId={agent.id} />);
    const drawer = await screen.findByRole("dialog", { name: agent.name });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Run history" }));
    await within(drawer).findByText("run_queued");
    fireEvent.click(within(drawer).getByRole("button", { name: "View run" }));
    fireEvent.click(await within(drawer).findByRole("button", { name: "Deny approval" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_runs_cancel", {
      id: run.id,
      reason: "Approval denied by user.",
    }));
    fireEvent.click(await within(drawer).findByRole("button", { name: "Retry run" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_runs_retry", { id: run.id }));
  });
});
