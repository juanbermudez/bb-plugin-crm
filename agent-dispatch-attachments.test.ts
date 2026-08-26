import { describe, expect, it } from "vitest";

import {
  buildAgentRunPrompt,
  buildAgentThreadInput,
} from "./agent-dispatch.js";
import type { Agent, AgentRun, AgentVersion } from "./db/agents.js";

const agent: Agent = {
  id: "agent_prompt",
  name: "Brief reader",
  description: null,
  status: "LIVE",
  createdById: "user_prompt",
  currentVersionId: "version_prompt",
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};
const version: AgentVersion = {
  id: "version_prompt",
  agentId: agent.id,
  number: 1,
  status: "DEPLOYED",
  instructions: "Read the supplied brief.",
  manifest: {},
  modelId: "default",
  modelContextWindowTokens: 1_000,
  sandboxPolicy: {},
  validation: null,
  sourceConversationId: null,
  createdById: "user_prompt",
  deploymentId: "deployment_prompt",
  approvedAt: "2026-08-25T00:00:00.000Z",
  deployedAt: "2026-08-25T00:00:00.000Z",
  createdAt: "2026-08-25T00:00:00.000Z",
};

const attachment = {
  path: "attachments/brief.txt",
  name: "brief.txt",
  mimeType: "text/plain",
  sizeBytes: 5,
  type: "localFile" as const,
};

const run: AgentRun = {
  id: "run_prompt",
  agentId: agent.id,
  versionId: version.id,
  triggerId: null,
  initiatedById: "user_prompt",
  triggerType: "MANUAL",
  status: "RUNNING",
  principalId: null,
  sessionId: null,
  idempotencyKey: "run_prompt",
  correlationId: "corr_prompt",
  input: { attachments: [attachment] },
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
  createdAt: "2026-08-25T00:00:00.000Z",
  startedAt: "2026-08-25T00:00:00.000Z",
  finishedAt: null,
  cancelRequestedAt: null,
  cancelDeliveredAt: null,
};

describe("CRM agent attachment prompt plumbing", () => {
  it("includes bounded attachment metadata in the prompt envelope", () => {
    const prompt = buildAgentRunPrompt({ agent, version, run });
    expect(prompt).toContain('"path":"attachments/brief.txt"');
    expect(prompt).toContain("## Run attachments (JSON)");
    expect(prompt).not.toContain("contentBase64");
  });

  it("forwards only safe BB attachment refs as agent-only prompt parts", () => {
    expect(buildAgentThreadInput("Read this.", [attachment])).toEqual([
      { type: "text", text: "Read this.", mentions: [] },
      {
        type: "localFile",
        path: "attachments/brief.txt",
        name: "brief.txt",
        sizeBytes: 5,
        mimeType: "text/plain",
        visibility: "agent-only",
      },
    ]);
    expect(() => buildAgentThreadInput("Read this.", [{ ...attachment, path: "../../etc/passwd" }])).toThrow();
  });
});
