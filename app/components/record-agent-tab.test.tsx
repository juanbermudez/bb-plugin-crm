// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordAgentTab, type RecordAgentRpcClient } from "./record-agent-tab.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  ThreadChat: ({ threadId }: { threadId: string }) => <div>BB thread {threadId}</div>,
}));

afterEach(() => cleanup());

describe("RecordAgentTab", () => {
  it("creates and renders a BB thread link for a record", async () => {
    const link = {
      id: "link_company_1",
      agentId: "agent_1",
      threadId: "thread_company_1",
      kind: "RECORD",
      runId: null,
      versionId: "version_1",
      recordType: "COMPANY",
      recordId: "company_1",
      summary: "CRM company conversation",
      createdAt: "2026-08-25T10:00:00.000Z",
      updatedAt: "2026-08-25T10:00:00.000Z",
    };
    const call = vi.fn(async (method: string) => {
      if (method === "agents_list") {
        return [{ id: "agent_1", name: "Account researcher", status: "LIVE", currentVersionId: "version_1" }];
      }
      if (method === "agents_threads_list") return [];
      if (method === "agents_threads_createRecord") return link;
      return null;
    });
    const rpc = { call } as unknown as RecordAgentRpcClient & { call: typeof call };

    render(
      <RecordAgentTab
        rpc={rpc}
        recordType="COMPANY"
        recordId="company_1"
        recordLabel="Acme"
      />,
    );

    expect(await screen.findByText("No agent thread yet")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Start agent thread" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("agents_threads_createRecord", {
      agentId: "agent_1",
      recordType: "COMPANY",
      recordId: "company_1",
    }));
    expect(await screen.findByText("BB thread thread_company_1")).toBeDefined();
  });
});
