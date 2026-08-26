// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import type { AgentDefinition } from "../../contracts/agents.js";
import type { AgentsRpcClient } from "../views/agents/rpc.js";
import { AgentBuilderHome, draftAgentName } from "./agent-builder-home.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  experimental_NewThreadComposer: ({
    initialPrompt,
    onSubmit,
  }: {
    initialPrompt?: string;
    onSubmit: (request: unknown) => void | Promise<void>;
  }) => {
    const [value, setValue] = useState(initialPrompt ?? "");
    return (
      <div data-testid="bb-new-thread-composer">
        <textarea
          aria-label="Describe the CRM automation"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          type="button"
          onClick={() => void onSubmit({
            projectId: "project-builder",
            providerId: "provider-codex",
            model: "model-default",
            reasoningLevel: "medium",
            permissionMode: "accept-edits",
            executionInputSources: {},
            environment: { type: "project-default" },
            input: [{ type: "text", text: value, mentions: [] }],
          })}
        >
          Start building
        </button>
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
});

function rpcFor(
  implementation: (method: string, input: unknown) => Promise<unknown>,
) {
  return {
    call: vi.fn(implementation),
  } as unknown as AgentsRpcClient & { call: ReturnType<typeof vi.fn> };
}

describe("AgentBuilderHome", () => {
  it("creates a draft and seeds its visible builder thread from the prompt", async () => {
    const created = { id: "agent_new" } as AgentDefinition;
    const onOpenBuilder = vi.fn();
    const rpc = rpcFor(async (method) => {
      if (method === "agents_create") return created;
      if (method === "agents_threads_createBuilder") return { id: "builder_link_new" };
      return [];
    });

    render(<AgentBuilderHome rpc={rpc} onOpenBuilder={onOpenBuilder} />);
    const prompt = screen.getByLabelText("Describe the CRM automation");
    fireEvent.change(prompt, {
      target: { value: "Flag deals with no activity for 14 days." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start building" }));

    await waitFor(() => expect(onOpenBuilder).toHaveBeenCalledWith(created.id));
    expect(rpc.call).toHaveBeenNthCalledWith(1, "agents_create", {
      name: "Draft · Flag deals with no activity for 14 days",
      description: "Flag deals with no activity for 14 days.",
    });
    expect(rpc.call).toHaveBeenNthCalledWith(2, "agents_threads_createBuilder", {
      agentId: created.id,
      newConversation: false,
      initialPrompt: "Flag deals with no activity for 14 days.",
      spawnRequest: {
        projectId: "project-builder",
        providerId: "provider-codex",
        model: "model-default",
        reasoningLevel: "medium",
        permissionMode: "accept-edits",
        executionInputSources: {},
        environment: { type: "project-default" },
        input: [{ type: "text", text: "Flag deals with no activity for 14 days.", mentions: [] }],
      },
    });
  });

  it("puts suggested prompts in the composer without creating anything", () => {
    const rpc = rpcFor(async () => []);
    render(<AgentBuilderHome rpc={rpc} onOpenBuilder={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Flag deals with no activity for 14 days" }),
    );

    expect(
      (screen.getByLabelText("Describe the CRM automation") as HTMLTextAreaElement).value,
    ).toBe("Flag deals with no activity for 14 days");
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it("derives a bounded draft name while keeping the full request intact", () => {
    expect(draftAgentName("Please create an agent to flag stale deals.")).toBe(
      "Draft · flag stale deals",
    );
    expect(draftAgentName(" ")).toBe("Draft · CRM automation");
    expect(draftAgentName("x".repeat(100))).toHaveLength(78);
  });
});
