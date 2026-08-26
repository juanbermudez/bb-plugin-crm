import { describe, expect, it, vi } from "vitest";

import {
  copyAgentAttachments,
  decodeAgentAttachmentBase64,
  readAgentAttachment,
  uploadAgentAttachment,
} from "./agent-attachments.js";

const uploadInput = {
  agentId: "agent-attachments",
  name: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 5,
  contentBase64: "aGVsbG8=",
} as const;

describe("agent project attachments", () => {
  it("uploads bytes through the BB project attachment API", async () => {
    const upload = vi.fn(async () => ({
      path: "attachments/notes.txt",
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      type: "localFile" as const,
    }));

    const result = await uploadAgentAttachment(
      { attachments: { upload, read: vi.fn(), copy: vi.fn() } },
      "project-agent",
      uploadInput,
    );

    expect(result).toMatchObject({ path: "attachments/notes.txt", sizeBytes: 5 });
    expect(upload).toHaveBeenCalledWith({
      projectId: "project-agent",
      clientFile: expect.any(Uint8Array),
      filename: "notes.txt",
      mimeType: "text/plain",
    });
    const bytes = (upload.mock.calls[0]?.[0] as { clientFile: Uint8Array }).clientFile;
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("reads bytes as bounded JSON-safe base64", async () => {
    const read = vi.fn(async () => ({
      bytes: new TextEncoder().encode("hello"),
      mimeType: "text/plain",
      sizeBytes: 5,
    }));
    await expect(readAgentAttachment(
      { attachments: { upload: vi.fn(), read, copy: vi.fn() } },
      "project-agent",
      "attachments/notes.txt",
    )).resolves.toEqual({
      path: "attachments/notes.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      contentBase64: "aGVsbG8=",
    });
    expect(read).toHaveBeenCalledWith({ projectId: "project-agent", path: "attachments/notes.txt" });
  });

  it("copies only relative server-managed paths", async () => {
    const copy = vi.fn(async () => undefined);
    await expect(copyAgentAttachments(
      { attachments: { upload: vi.fn(), read: vi.fn(), copy } },
      "target-project",
      "source-project",
      ["attachments/notes.txt"],
    )).resolves.toEqual({ paths: ["attachments/notes.txt"] });
    expect(copy).toHaveBeenCalledWith({
      projectId: "target-project",
      sourceProjectId: "source-project",
      paths: ["attachments/notes.txt"],
    });
    await expect(copyAgentAttachments(
      { attachments: { upload: vi.fn(), read: vi.fn(), copy: vi.fn() } },
      "target-project",
      "source-project",
      ["../../etc/passwd"],
    )).rejects.toThrow(/traversal|relative|unsafe/u);
  });

  it("rejects malformed or oversized bytes before the SDK is called", () => {
    expect(() => decodeAgentAttachmentBase64("not base64!", 7)).toThrow(/base64/u);
    expect(() => decodeAgentAttachmentBase64("aGVsbG8=", 6)).toThrow(/size/u);
  });
});
