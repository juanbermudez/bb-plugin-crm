import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  AgentAttachment,
  AgentAttachmentCopyInput,
  AgentAttachmentCopyOutput,
  AgentAttachmentReadInput,
  AgentAttachmentReadOutput,
  AgentAttachmentUploadInput,
  AgentAuditEvent,
  AgentDefinition,
  AgentDetail,
  AgentListInput,
  AgentListItem,
  AgentRunDetail,
  AgentTrigger,
  AgentVersion,
} from "../../../contracts/agents.js";
import type { rpcContract } from "../../../contracts/rpc.js";

/**
 * The agent workspace deliberately exposes a narrow client surface.  The
 * server owns lifecycle validation; this adapter only keeps the method names
 * and the shapes consumed by the UI easy to discover and mock.
 */
export interface AgentsRpcClient {
  call(method: "agents_list", input: AgentListInput): Promise<AgentListItem[]>;
  call(method: "agents_get", input: { id: string }): Promise<AgentDetail>;
  call(
    method: "agents_create",
    input: { name: string; description?: string | null },
  ): Promise<AgentDefinition>;
  call(
    method: "agents_update",
    input: { id: string; data: { name?: string; description?: string | null } },
  ): Promise<AgentDefinition>;
  call(
    method: "agents_versions_list",
    input: { agentId: string; limit: number; offset: number },
  ): Promise<AgentVersion[]>;
  call(method: "agents_versions_get", input: { id: string }): Promise<AgentVersion>;
  call(
    method: "agents_versions_create",
    input: {
      agentId: string;
      data: {
        instructions: string;
        manifest: Record<string, unknown>;
        modelId: string;
        modelContextWindowTokens: number;
        sandboxPolicy: Record<string, unknown>;
        status?: "DRAFT";
      };
    },
  ): Promise<AgentVersion>;
  call(method: "agents_versions_validate", input: { id: string }): Promise<AgentVersion>;
  call(
    method: "agents_deploy",
    input: { agentId: string; versionId: string },
  ): Promise<{ id: string; versionId: string; status: "LIVE" }>;
  call(method: "agents_pause", input: { id: string }): Promise<AgentDefinition>;
  call(method: "agents_resume", input: { id: string }): Promise<AgentDefinition>;
  call(method: "agents_archive", input: { id: string }): Promise<AgentDefinition>;
  call(method: "agents_restore", input: { id: string }): Promise<AgentDefinition>;
  call(
    method: "agents_triggers_list",
    input: { agentId: string; limit: number; offset: number },
  ): Promise<AgentTrigger[]>;
  call(method: "agents_triggers_get", input: { id: string }): Promise<AgentTrigger>;
  call(
    method: "agents_triggers_create",
    input: {
      agentId: string;
      data: {
        versionId: string;
        type: "MANUAL" | "SCHEDULE" | "EVENT" | "WEBHOOK";
        name: string;
        config: Record<string, unknown>;
        enabled: boolean;
      };
    },
  ): Promise<AgentTrigger>;
  call(
    method: "agents_triggers_update",
    input: { id: string; data: Record<string, unknown> },
  ): Promise<AgentTrigger>;
  call(method: "agents_triggers_delete", input: { id: string }): Promise<{ id: string }>;
  call(
    method: "agents_triggers_enable",
    input: { id: string; enabled: boolean },
  ): Promise<AgentTrigger>;
  call(
    method: "agents_runs_list",
    input: {
      agentId: string;
      limit: number;
      offset: number;
      includeEvents: boolean;
      includeActions: boolean;
    },
  ): Promise<AgentRunDetail[]>;
  call(method: "agents_runs_get", input: { id: string }): Promise<AgentRunDetail>;
  call(method: "agents_runs_queue", input: { agentId: string }): Promise<AgentRunDetail>;
  call(method: "agents_runs_start", input: { id: string }): Promise<AgentRunDetail>;
  call(method: "agents_runs_requestApproval", input: { id: string }): Promise<AgentRunDetail>;
  call(method: "agents_runs_approve", input: { id: string }): Promise<AgentRunDetail>;
  call(method: "agents_runs_success", input: { id: string }): Promise<AgentRunDetail>;
  call(method: "agents_runs_fail", input: { id: string }): Promise<AgentRunDetail>;
  call(method: "agents_runs_cancel", input: { id: string }): Promise<AgentRunDetail & { cancelled: boolean }>;
  call(method: "agents_runs_retry", input: { id: string }): Promise<AgentRunDetail>;
  call(
    method: "agents_attachments_upload",
    input: AgentAttachmentUploadInput,
  ): Promise<AgentAttachment>;
  call(
    method: "agents_attachments_read",
    input: AgentAttachmentReadInput,
  ): Promise<AgentAttachmentReadOutput>;
  call(
    method: "agents_attachments_copy",
    input: AgentAttachmentCopyInput,
  ): Promise<AgentAttachmentCopyOutput>;
  call(
    method: "agents_audit_list",
    input: { agentId: string; limit: number; offset: number },
  ): Promise<AgentAuditEvent[]>;
}

/** Use BB's host client while retaining a small injectable surface for tests. */
export function useAgentsRpc(): AgentsRpcClient {
  return useRpc<typeof rpcContract>() as unknown as AgentsRpcClient;
}
