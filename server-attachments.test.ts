import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";

import plugin from "./server.js";

describe("CRM agent attachment RPCs", () => {
  it("resolves the agent project and keeps copy sources scoped to visible projects", async () => {
    const list = vi.fn(async () => [
      { id: "fallback-project", deletedAt: null },
      { id: "agent-project", deletedAt: null },
      { id: "deleted-project", deletedAt: "2026-08-25T00:00:00.000Z" },
    ]);
    const upload = vi.fn(async () => ({
      path: "attachments/brief.txt",
      name: "brief.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      type: "localFile" as const,
    }));
    const read = vi.fn(async () => ({
      bytes: new TextEncoder().encode("hello"),
      mimeType: "text/plain",
      sizeBytes: 5,
    }));
    const copy = vi.fn(async () => undefined);
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      sdk: {
        projects: {
          list,
          attachments: { upload, read, copy },
        },
      },
    });

    await plugin(bb);
    try {
      await harness.behavior.callRpc("agents_create", {
        id: "agent_attachment_rpc",
        name: "Attachment agent",
      });
      const version = await harness.behavior.callRpc("agents_versions_create", {
        agentId: "agent_attachment_rpc",
        data: {
          id: "version_attachment_rpc",
          instructions: "Use the supplied brief.",
          manifest: { projectId: "agent-project" },
          modelId: "default",
          modelContextWindowTokens: 1000,
          sandboxPolicy: {},
        },
      }) as { id: string };

      await expect(harness.behavior.callRpc("agents_attachments_upload", {
        agentId: "agent_attachment_rpc",
        versionId: version.id,
        name: "brief.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        contentBase64: "aGVsbG8=",
      })).resolves.toMatchObject({ path: "attachments/brief.txt", type: "localFile" });
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({ projectId: "agent-project" }));

      await expect(harness.behavior.callRpc("agents_attachments_read", {
        agentId: "agent_attachment_rpc",
        versionId: version.id,
        path: "attachments/brief.txt",
      })).resolves.toMatchObject({ contentBase64: "aGVsbG8=", sizeBytes: 5 });
      expect(read).toHaveBeenCalledWith({ projectId: "agent-project", path: "attachments/brief.txt" });

      await expect(harness.behavior.callRpc("agents_attachments_copy", {
        agentId: "agent_attachment_rpc",
        versionId: version.id,
        sourceProjectId: "fallback-project",
        paths: ["attachments/brief.txt"],
      })).resolves.toEqual({ paths: ["attachments/brief.txt"] });
      expect(copy).toHaveBeenCalledWith({
        projectId: "agent-project",
        sourceProjectId: "fallback-project",
        paths: ["attachments/brief.txt"],
      });

      await expect(harness.behavior.callRpc("agents_attachments_copy", {
        agentId: "agent_attachment_rpc",
        versionId: version.id,
        sourceProjectId: "deleted-project",
        paths: ["attachments/brief.txt"],
      })).rejects.toThrow(/unavailable|deleted/u);
      await expect(harness.behavior.callRpc("agents_attachments_read", {
        agentId: "agent_attachment_rpc",
        versionId: version.id,
        path: "../../etc/passwd",
      })).rejects.toThrow(/traversal|relative|invalid|validation/u);
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
