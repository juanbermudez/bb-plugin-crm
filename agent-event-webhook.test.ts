import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin, {
  CRM_AGENT_WEBHOOK_PATH,
  signCrmAgentWebhookRequest,
} from "./server.js";
import { CRM_SCHEMA_VERSION } from "./db/schema.js";

type ServerHarness = ReturnType<typeof createFakePluginHost>["harness"];

async function seedLiveServerAgent(
  harness: ServerHarness,
  agentId: string,
  versionId: string,
): Promise<void> {
  await harness.behavior.callRpc("agents_create", {
    id: agentId,
    name: `Dispatcher ${agentId}`,
    description: "A dispatcher test agent.",
  });
  await harness.behavior.callRpc("agents_versions_create", {
    agentId,
    data: {
      id: versionId,
      instructions: "Read the exact CRM records and summarize verified facts.",
    },
  });
  await harness.behavior.callRpc("agents_versions_validate", { id: versionId });
  await harness.behavior.callRpc("agents_deploy", {
    agentId,
    versionId,
    requestId: `deployment-${agentId}`,
  });
}

describe("CRM event and webhook agent triggers", () => {
  it("queues one idempotent run per matching persisted CRM event", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm-event-trigger" });
    await plugin(bb);
    try {
      await seedLiveServerAgent(harness, "agent_event", "version_event");
      const trigger = await harness.behavior.callRpc("agents_triggers_create", {
        agentId: "agent_event",
        data: {
          id: "trigger_deal_created",
          versionId: "version_event",
          type: "EVENT",
          name: "Deal created",
          config: { event: "deal.created" },
          enabled: true,
        },
      }) as { id: string };
      const company = await harness.behavior.callRpc("companies_create", {
        name: "Event Company",
      }) as { id: string };
      const deal = await harness.behavior.callRpc("deals_create", {
        name: "Event Deal",
        companyId: company.id,
        ownerId: "owner_event",
        amountCents: 10_000,
      }) as { id: string };

      const runs = await harness.behavior.callRpc("agents_runs_list", {
        triggerId: trigger.id,
        includeEvents: true,
        includeActions: true,
      }) as Array<{ input: unknown; triggerType: string }>;
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        triggerType: "EVENT",
        input: {
          event: { type: "deal.created", data: { companyId: company.id, stage: "DEMO_BOOKED" } },
          record: { kind: "deal", id: deal.id },
        },
      });

      const db = bb.storage.database();
      expect(db.prepare("SELECT value FROM crm_metadata WHERE key = 'schema_version'").pluck().get()).toBe(String(CRM_SCHEMA_VERSION));
      expect(db.prepare("SELECT COUNT(*) FROM crm_event_outbox WHERE processed_at IS NULL").pluck().get()).toBe(0);

      // A same-stage update emits no duplicate lifecycle event.
      await harness.behavior.callRpc("deals_setStage", { id: deal.id, stage: "DEMO_BOOKED" });
      expect((await harness.behavior.callRpc("agents_runs_list", {
        triggerId: trigger.id,
        includeEvents: false,
        includeActions: false,
      }) as unknown[])).toHaveLength(1);
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("authenticates a trigger-scoped signed webhook and deduplicates event ids", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm-webhook-trigger" });
    await plugin(bb);
    try {
      await seedLiveServerAgent(harness, "agent_webhook", "version_webhook");
      const trigger = await harness.behavior.callRpc("agents_triggers_create", {
        agentId: "agent_webhook",
        data: {
          id: "trigger_webhook",
          versionId: "version_webhook",
          type: "WEBHOOK",
          name: "External webhook",
          config: {},
          enabled: true,
        },
      }) as { id: string };
      const provisioned = await harness.behavior.callRpc("agents_webhooks_provision", {
        triggerId: trigger.id,
      }) as { token: string; id: string };
      expect(provisioned.token).toMatch(/^crm_wh_[A-Za-z0-9_-]{32,}$/u);
      expect(bb.storage.database().prepare("SELECT token_hash FROM agent_webhook_tokens WHERE id = ?").pluck().get(provisioned.id)).not.toBe(provisioned.token);

      const body = JSON.stringify({
        triggerId: trigger.id,
        eventId: "external-event-1",
        input: { source: "billing", amountCents: 1250 },
      });
      const timestamp = String(Math.floor(Date.now() / 1_000));
      const headers = {
        "content-type": "application/json",
        "x-crm-webhook-token": provisioned.token,
        "x-crm-webhook-timestamp": timestamp,
        "x-crm-webhook-signature": signCrmAgentWebhookRequest(provisioned.token, timestamp, body),
      };
      const accepted = await harness.behavior.fetchHttp("POST", CRM_AGENT_WEBHOOK_PATH, { headers, body });
      expect(accepted.status).toBe(200);
      const acceptedBody = await accepted.json() as { ok: boolean; runId: string; duplicate: boolean };
      expect(acceptedBody).toMatchObject({ ok: true, duplicate: false, runId: expect.any(String) });

      const duplicate = await harness.behavior.fetchHttp("POST", CRM_AGENT_WEBHOOK_PATH, { headers, body });
      expect(duplicate.status).toBe(200);
      await expect(duplicate.json()).resolves.toMatchObject({ ok: true, duplicate: true, runId: acceptedBody.runId });
      expect((await harness.behavior.callRpc("agents_runs_list", {
        triggerId: trigger.id,
        includeEvents: false,
        includeActions: false,
      }) as unknown[])).toHaveLength(1);

      const malformedBody = JSON.stringify({ ...JSON.parse(body) as object, unexpected: true });
      const malformed = await harness.behavior.fetchHttp("POST", CRM_AGENT_WEBHOOK_PATH, {
        headers: {
          ...headers,
          "x-crm-webhook-signature": signCrmAgentWebhookRequest(provisioned.token, timestamp, malformedBody),
        },
        body: malformedBody,
      });
      expect(malformed.status).toBe(400);

      const rotated = await harness.behavior.callRpc("agents_webhooks_rotate", { triggerId: trigger.id }) as { token: string };
      const revoked = await harness.behavior.fetchHttp("POST", CRM_AGENT_WEBHOOK_PATH, { headers, body });
      expect(revoked.status).toBe(401);
      expect(rotated.token).not.toBe(provisioned.token);
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
