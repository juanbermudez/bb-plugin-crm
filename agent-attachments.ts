import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import {
  AGENT_ATTACHMENT_MAX_BASE64_LENGTH,
  AGENT_ATTACHMENT_MAX_BYTES,
  agentAttachmentCopyInputSchema,
  agentAttachmentCopyOutputSchema,
  agentAttachmentPathSchema,
  agentAttachmentReadOutputSchema,
  agentAttachmentSchema,
  agentAttachmentUploadInputSchema,
  type AgentAttachment,
  type AgentAttachmentCopyInput,
  type AgentAttachmentUploadInput,
} from "./contracts/agents.js";

/** The only SDK surface this module is allowed to use for attachment bytes. */
export type AgentProjectAttachments = Pick<
  BbPluginApi["sdk"]["projects"]["attachments"],
  "upload" | "read" | "copy"
>;

export interface AgentAttachmentProjectHost {
  attachments: AgentProjectAttachments;
}

export interface CanonicalAgentAttachmentUpload {
  name: string;
  mimeType?: string;
  sizeBytes: number;
  contentBase64: string;
}

function invalid(message: string): never {
  throw new Error(message);
}

function canonicalUploadInput(input: AgentAttachmentUploadInput): CanonicalAgentAttachmentUpload {
  const parsed = agentAttachmentUploadInputSchema.parse(input);
  const name = parsed.name ?? parsed.filename;
  const sizeBytes = parsed.sizeBytes ?? parsed.size;
  if (!name || sizeBytes === undefined) {
    return invalid("Attachment name and size are required.");
  }
  if (parsed.contentBase64.length > AGENT_ATTACHMENT_MAX_BASE64_LENGTH) {
    return invalid("Attachment content exceeds the maximum encoded size.");
  }
  return {
    name,
    ...(parsed.mimeType ?? parsed.type
      ? { mimeType: parsed.mimeType ?? parsed.type }
      : {}),
    sizeBytes,
    contentBase64: parsed.contentBase64,
  };
}

/** Decode only canonical base64 and verify the caller-provided byte bound. */
export function decodeAgentAttachmentBase64(
  contentBase64: string,
  sizeBytes: number,
): Uint8Array {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > AGENT_ATTACHMENT_MAX_BYTES) {
    return invalid("Attachment size is outside the supported bounds.");
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(contentBase64)) {
    return invalid("Attachment content must be canonical base64.");
  }
  const bytes = Buffer.from(contentBase64, "base64");
  // Buffer accepts some malformed input by ignoring characters. Re-encoding
  // prevents that behavior from weakening the RPC schema's strict boundary.
  if (bytes.toString("base64") !== contentBase64 || bytes.byteLength !== sizeBytes) {
    return invalid("Attachment size does not match contentBase64.");
  }
  return new Uint8Array(bytes);
}

function parsedAttachment(value: unknown): AgentAttachment {
  const parsed = agentAttachmentSchema.safeParse(value);
  if (!parsed.success) return invalid("BB returned invalid attachment metadata.");
  if (parsed.data.path !== agentAttachmentPathSchema.parse(parsed.data.path)) {
    return invalid("BB returned an unsafe attachment path.");
  }
  return parsed.data;
}

/** Upload bytes to the already-resolved BB project; no filesystem path is accepted. */
export async function uploadAgentAttachment(
  host: AgentAttachmentProjectHost,
  projectId: string,
  input: AgentAttachmentUploadInput,
): Promise<AgentAttachment> {
  const canonical = canonicalUploadInput(input);
  const bytes = decodeAgentAttachmentBase64(canonical.contentBase64, canonical.sizeBytes);
  const uploaded = await host.attachments.upload({
    projectId,
    clientFile: bytes,
    filename: canonical.name,
    ...(canonical.mimeType === undefined ? {} : { mimeType: canonical.mimeType }),
  });
  const attachment = parsedAttachment(uploaded);
  if (attachment.sizeBytes !== canonical.sizeBytes) {
    return invalid("BB returned an attachment size different from the uploaded bytes.");
  }
  return attachment;
}

/** Read an attachment through BB's project API and return JSON-safe bytes. */
export async function readAgentAttachment(
  host: AgentAttachmentProjectHost,
  projectId: string,
  path: string,
): Promise<z.infer<typeof agentAttachmentReadOutputSchema>> {
  const safePath = agentAttachmentPathSchema.parse(path);
  const result = await host.attachments.read({ projectId, path: safePath });
  if (!(result.bytes instanceof Uint8Array)) {
    return invalid("BB returned invalid attachment bytes.");
  }
  if (!Number.isSafeInteger(result.sizeBytes) || result.sizeBytes !== result.bytes.byteLength) {
    return invalid("BB returned inconsistent attachment byte metadata.");
  }
  if (result.sizeBytes < 1 || result.sizeBytes > AGENT_ATTACHMENT_MAX_BYTES) {
    return invalid("The requested attachment exceeds the supported size.");
  }
  const contentBase64 = Buffer.from(result.bytes).toString("base64");
  if (contentBase64.length > AGENT_ATTACHMENT_MAX_BASE64_LENGTH) {
    return invalid("The requested attachment exceeds the supported encoded size.");
  }
  return agentAttachmentReadOutputSchema.parse({
    path: safePath,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    contentBase64,
  });
}

/** Copy only server-managed relative paths between projects visible to the caller. */
export async function copyAgentAttachments(
  host: AgentAttachmentProjectHost,
  targetProjectId: string,
  sourceProjectId: string,
  paths: readonly string[],
): Promise<{ paths: string[] }> {
  const parsed = agentAttachmentCopyInputSchema.parse({
    agentId: "attachment-copy",
    sourceProjectId,
    paths: [...paths],
  } satisfies Omit<AgentAttachmentCopyInput, "agentId"> & { agentId: string });
  await host.attachments.copy({
    projectId: targetProjectId,
    sourceProjectId: parsed.sourceProjectId,
    paths: parsed.paths,
  });
  return agentAttachmentCopyOutputSchema.parse({ paths: [...parsed.paths] });
}
