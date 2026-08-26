// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentAttachment } from "../../../contracts/agents.js";
import type { AgentsRpcClient } from "./rpc.js";
import { AgentAttachmentPicker } from "./agent-attachments.js";

afterEach(() => cleanup());

describe("AgentAttachmentPicker", () => {
  it("uploads file bytes and returns BB-managed metadata", async () => {
    const attachment: AgentAttachment = {
      path: "attachments/brief.txt",
      name: "brief.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      type: "localFile",
    };
    const call = vi.fn(async () => attachment);
    const onChange = vi.fn();
    const rpc = { call } as unknown as AgentsRpcClient;
    render(
      <AgentAttachmentPicker
        agentId="agent_picker"
        versionId="version_picker"
        rpc={rpc}
        value={[]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Choose attachment files"), {
      target: { files: [new File(["hello"], "brief.txt", { type: "text/plain" })] },
    });
    await waitFor(() => expect(call).toHaveBeenCalledWith("agents_attachments_upload", expect.objectContaining({
      agentId: "agent_picker",
      versionId: "version_picker",
      name: "brief.txt",
      sizeBytes: 5,
      contentBase64: "aGVsbG8=",
    }))); 
    expect(onChange).toHaveBeenCalledWith([attachment]);
  });

  it("rejects an oversized file before making an RPC call", async () => {
    const call = vi.fn();
    const rpc = { call } as unknown as AgentsRpcClient;
    render(
      <AgentAttachmentPicker
        agentId="agent_picker"
        rpc={rpc}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    const oversized = new File([new Uint8Array(2_000_001)], "large.bin", { type: "application/octet-stream" });
    fireEvent.change(screen.getByLabelText("Choose attachment files"), { target: { files: [oversized] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/2,000,000/u);
    expect(call).not.toHaveBeenCalled();
  });
});
