import { describe, expect, it } from "vitest";
import {
  agentDefinitionSchema,
  agentRunDetailSchema,
  agentVersionCreateInputSchema,
} from "./agents.js";

describe("agent workspace contracts", () => {
  it("rejects unknown input keys and non-JSON manifests", () => {
    expect(
      agentVersionCreateInputSchema.safeParse({
        agentId: "agent-1",
        data: { instructions: "Summarize the account", unexpected: true },
      }).success,
    ).toBe(false);
    expect(
      agentVersionCreateInputSchema.safeParse({
        agentId: "agent-1",
        data: { instructions: "Summarize the account", manifest: { createdAt: new Date() } },
      }).success,
    ).toBe(false);
  });

  it("fills version defaults at the contract boundary", () => {
    expect(
      agentVersionCreateInputSchema.parse({
        agentId: "agent-1",
        data: { instructions: "Summarize the account" },
      }).data,
    ).toMatchObject({
      status: "DRAFT",
      manifest: {},
      modelId: "default",
      modelContextWindowTokens: 1_000_000,
      sandboxPolicy: {},
      validation: null,
      sourceConversationId: null,
    });
  });

  it("keeps persisted output objects strict", () => {
    const agent = {
      id: "agent-1",
      name: "Renewal watcher",
      description: null,
      status: "DRAFT" as const,
      createdById: "local_user",
      currentVersionId: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    };
    expect(agentDefinitionSchema.safeParse(agent).success).toBe(true);
    expect(agentDefinitionSchema.safeParse({ ...agent, extra: true }).success).toBe(false);
    expect(
      agentRunDetailSchema.safeParse({
        id: "run-1",
        agentId: "agent-1",
        versionId: "version-1",
        triggerId: null,
        initiatedById: "local_user",
        triggerType: "MANUAL",
        status: "QUEUED",
        principalId: null,
        sessionId: null,
        idempotencyKey: "run-key",
        correlationId: "correlation",
        input: null,
        result: null,
        summary: null,
        modelId: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        errorCode: null,
        errorMessage: null,
        approvalReason: null,
        approvalRequestedAt: null,
        approvedAt: null,
        approvedById: null,
        nextEventSequence: 0,
        createdAt: "2026-08-25T00:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        cancelRequestedAt: null,
        cancelDeliveredAt: null,
        events: [],
        actions: [],
      }).success,
    ).toBe(true);
  });
});
