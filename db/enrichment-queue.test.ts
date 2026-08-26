import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";

import { createActivityStore } from "./activities.js";
import { createActivityTaskDispatchStore } from "./activity-task-dispatch.js";
import { AgentStore } from "./agents.js";
import { createCompanyStore } from "./companies.js";
import { createContactStore } from "./contacts.js";
import { createDealStore } from "./deals.js";
import { createEnrichmentQueueStore } from "./enrichment-queue.js";
import { initializeSchema } from "./schema.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-enrichment-queue-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("enrichment queue store", () => {
  it("projects local agent runs, CRM tasks, and scheduled work with record labels", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const now = "2026-08-26T12:00:00.000Z";
      const company = createCompanyStore(db).create({
        id: "company_queue",
        name: "Queue Systems",
        domain: "queue.example",
      });
      const contact = createContactStore(db).create({
        id: "contact_queue",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@queue.example",
        companyId: company.id,
      });
      const deal = createDealStore(db).create({
        id: "deal_queue",
        name: "Queue expansion",
        companyId: company.id,
        ownerId: "user_queue",
      });
      const activities = createActivityStore(db);
      const task = activities.create({
        id: "activity_queue",
        type: "TASK",
        subject: "Review the renewal",
        companyId: company.id,
        createdById: "user_queue",
        dueAt: "2026-08-27T09:00:00.000Z",
      });
      const dueTask = activities.create({
        id: "activity_queue_due",
        type: "TASK",
        subject: "Send the follow-up",
        contactId: contact.id,
        createdById: "user_queue",
        dueAt: "2026-08-25T09:00:00.000Z",
      });
      createActivityTaskDispatchStore(db).claimDue(10, { now });

      const agents = new AgentStore(db);
      const agent = agents.create({ id: "agent_queue", name: "Queue researcher" });
      const version = agents.createVersion(agent.id, {
        id: "version_queue",
        instructions: "Read CRM context and prepare a verified summary.",
      });
      agents.validateVersion(version.id);
      agents.deploy(agent.id, version.id);
      const trigger = agents.createTrigger(agent.id, {
        id: "trigger_queue",
        versionId: version.id,
        type: "SCHEDULE",
        name: "Tomorrow morning",
        config: { cron: "0 9 * * *" },
        enabled: true,
        nextRunAt: "2026-08-27T09:00:00.000Z",
      });

      const queued = agents.queueRun(agent.id, {
        id: "run_queue_queued",
        input: {
          kind: "CRM_ENRICHMENT_REQUEST",
          entity: "CONTACT",
          recordId: contact.id,
          operation: "research",
        },
        idempotencyKey: "queue-queued",
      });
      const running = agents.queueRun(agent.id, {
        id: "run_queue_running",
        input: {
          kind: "CRM_ENRICHMENT_REQUEST",
          entity: "COMPANY",
          recordId: company.id,
          operation: "brief",
        },
        idempotencyKey: "queue-running",
      });
      agents.startRun(running.id);
      const failed = agents.queueRun(agent.id, {
        id: "run_queue_failed",
        input: {
          kind: "CRM_DUE_TASK",
          activity: {
            id: task.id,
            subject: task.subject,
            companyId: company.id,
            contactId: null,
            dealId: null,
          },
        },
        idempotencyKey: "queue-failed",
      });
      agents.startRun(failed.id);
      agents.failRun(failed.id, { errorMessage: "No verified result" });
      const dealBackfill = agents.queueRun(agent.id, {
        id: "run_queue_deal_backfill",
        input: {
          kind: "CRM_FIELD_BACKFILL",
          entity: "DEAL",
          recordId: deal.id,
          fieldId: "field_deal_segment",
          fieldLabel: "Deal segment",
        },
        idempotencyKey: "queue-deal-backfill",
      });

      const queue = createEnrichmentQueueStore(db).list(10, now);
      expect(queue.total).toBe(5);
      expect(queue.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: running.id, state: "running", subject: expect.objectContaining({ kind: "company", id: company.id, name: company.name }) }),
        expect.objectContaining({ id: queued.id, state: "queued", subject: expect.objectContaining({ kind: "contact", id: contact.id, name: "Ada Lovelace" }) }),
        expect.objectContaining({ id: `dispatch:${dueTask.id}`, state: "queued", subject: expect.objectContaining({ kind: "task", id: dueTask.id, name: dueTask.subject }) }),
        expect.objectContaining({ id: failed.id, state: "failed", subject: expect.objectContaining({ kind: "task", id: task.id, name: task.subject, related: expect.objectContaining({ kind: "company", id: company.id, name: company.name }) }) }),
        expect.objectContaining({ id: dealBackfill.id, state: "queued", subject: { kind: "deal", id: deal.id, name: deal.name } }),
      ]));
      expect(queue.rows.find((row) => row.id === failed.id)?.line).toContain("No verified result");
      expect(queue.scheduledTotal).toBe(2);
      expect(queue.scheduled).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `activity:${task.id}`,
          due: task.dueAt,
          subject: expect.objectContaining({ kind: "task", id: task.id, name: task.subject }),
        }),
        expect.objectContaining({
          id: `trigger:${trigger.id}`,
          due: trigger.nextRunAt,
          subject: expect.objectContaining({ kind: "agent", id: agent.id, name: agent.name }),
        }),
      ]));
    } finally {
      await lifecycle.dispose();
    }
  });

  it("keeps scheduled runs out of current work when a future dueAt is persisted", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      createCompanyStore(db).create({ id: "company_queue_future", name: "Future queue company" });
      const agents = new AgentStore(db);
      const agent = agents.create({ id: "agent_queue_future", name: "Future queue" });
      const version = agents.createVersion(agent.id, { id: "version_queue_future", instructions: "run" });
      agents.validateVersion(version.id);
      agents.deploy(agent.id, version.id);
      const run = agents.queueRun(agent.id, {
        id: "run_queue_future",
        input: {
          kind: "CRM_ENRICHMENT_REQUEST",
          entity: "COMPANY",
          recordId: "company_queue_future",
          operation: "research",
          dueAt: "2026-08-27T09:00:00.000Z",
        },
        idempotencyKey: "queue-future",
      });
      const queue = createEnrichmentQueueStore(db).list(10, "2026-08-26T12:00:00.000Z");
      expect(run.status).toBe("QUEUED");
      expect(queue.total).toBe(0);
      expect(queue.scheduledTotal).toBe(1);
      expect(queue.scheduled[0]).toMatchObject({
        id: `run:${run.id}`,
        subject: expect.objectContaining({ kind: "company", id: "company_queue_future" }),
      });
    } finally {
      await lifecycle.dispose();
    }
  });
});
