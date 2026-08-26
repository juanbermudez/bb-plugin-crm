// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentDetail, AgentThreadLink, AgentVersion } from "../../contracts/agents.js";
import type { AgentsRpcClient } from "../views/agents/rpc.js";
import { AgentBuilderConversation } from "./agent-builder-conversation.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  ThreadChat: ({
    threadId,
    messageActions,
  }: {
    threadId: string;
    messageActions?: Array<{ run(message: { id: string; threadId: string; role: "assistant"; text: string; sourceSeqEnd: number }): void | Promise<void> }>;
  }) => (
    <div data-testid="thread-chat">
      BB thread {threadId}
      {messageActions?.[0] ? (
        <button
          type="button"
          onClick={() => void messageActions[0]!.run({
            id: "assistant-message-1",
            threadId,
            role: "assistant",
            text: "Proposed automation draft from BB.",
            sourceSeqEnd: 4,
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
  id: "version_builder_1",
  agentId: "agent_builder",
  number: 1,
  status: "DRAFT",
  instructions: "Review account changes and propose a follow-up.",
  manifest: {},
  modelId: "default",
  modelContextWindowTokens: 1_000_000,
  sandboxPolicy: {},
  validation: null,
  sourceConversationId: null,
  createdById: "local_user",
  deploymentId: null,
  approvedAt: null,
  deployedAt: null,
  createdAt: "2026-08-26T10:00:00.000Z",
};

const agent: AgentDetail = {
  id: "agent_builder",
  name: "Renewal helper",
  description: "Build renewal workflows.",
  status: "DRAFT",
  createdById: "local_user",
  currentVersionId: version.id,
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
  currentVersion: version,
  versions: [version],
  triggers: [],
  runCount: 0,
};

function link(id: string, threadId: string): AgentThreadLink {
  return {
    id,
    agentId: agent.id,
    threadId,
    kind: "BUILDER",
    runId: null,
    versionId: version.id,
    recordType: null,
    recordId: null,
    summary: "CRM automation builder conversation",
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
  };
}

function rpcFor(implementation: (method: string, input: unknown) => Promise<unknown>) {
  return { call: vi.fn(implementation) } as unknown as AgentsRpcClient & { call: ReturnType<typeof vi.fn> };
}

describe("AgentBuilderConversation", () => {
  it("loads linked history, renders BB ThreadChat, and creates an explicit new conversation", async () => {
    const first = link("builder_link_1", "bb-builder-1");
    const second = link("builder_link_2", "bb-builder-2");
    const rpc = rpcFor(async (method, input) => {
      if (method === "agents_threads_list") return [first];
      if (method === "agents_threads_createBuilder") {
        expect(input).toEqual({
          agentId: agent.id,
          versionId: version.id,
          newConversation: true,
        });
        return second;
      }
      return [];
    });

    render(<AgentBuilderConversation agent={agent} rpc={rpc} />);
    expect((await screen.findByTestId("thread-chat")).textContent).toContain("bb-builder-1");

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await waitFor(() => expect(screen.getByTestId("thread-chat").textContent).toContain("bb-builder-2"));
    expect(rpc.call).toHaveBeenCalledWith("agents_threads_createBuilder", {
      agentId: agent.id,
      versionId: version.id,
      newConversation: true,
    });
  });

  it("uses the idempotent create path for the first conversation and can retain its source id", async () => {
    const first = link("builder_link_1", "bb-builder-1");
    const onUseVersionSource = vi.fn();
    const onUseVersionDraft = vi.fn();
    const rpc = rpcFor(async (method) => {
      if (method === "agents_threads_list") return [];
      if (method === "agents_threads_createBuilder") return first;
      return [];
    });

    render(<AgentBuilderConversation agent={agent} rpc={rpc} onUseVersionSource={onUseVersionSource} onUseVersionDraft={onUseVersionDraft} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start conversation" }));
    await waitFor(() => expect(screen.getByTestId("thread-chat").textContent).toContain("bb-builder-1"));
    fireEvent.click(screen.getByRole("button", { name: "Mock use as version draft" }));
    expect(onUseVersionDraft).toHaveBeenCalledWith("Proposed automation draft from BB.", first.threadId);
    expect(rpc.call).toHaveBeenCalledWith("agents_threads_createBuilder", {
      agentId: agent.id,
      versionId: version.id,
      newConversation: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "Use as version source" }));
    expect(onUseVersionSource).toHaveBeenCalledWith(first.threadId);
  });

  it("requires confirmation before deleting a builder link", async () => {
    const first = link("builder_link_1", "bb-builder-1");
    const rpc = rpcFor(async (method) => {
      if (method === "agents_threads_list") return [first];
      if (method === "agents_threads_deleteBuilder") return { id: first.id };
      return [];
    });

    render(<AgentBuilderConversation agent={agent} rpc={rpc} />);
    await screen.findByTestId("thread-chat");
    fireEvent.click(screen.getByRole("button", { name: `Delete builder conversation ${first.threadId}` }));
    const confirmation = await screen.findByRole("dialog", { name: "Delete builder conversation?" });
    expect(rpc.call).not.toHaveBeenCalledWith("agents_threads_deleteBuilder", {
      agentId: agent.id,
      id: first.id,
    });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete conversation" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("agents_threads_deleteBuilder", {
      agentId: agent.id,
      id: first.id,
    }));
    expect(await screen.findByText("No builder conversation yet")).toBeDefined();
  });
});
