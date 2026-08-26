import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { AgentStore } from "./agents.js";
import { CrmEventStore } from "./crm-events.js";
import { createCompanyStore } from "./companies.js";
import { createContactStore } from "./contacts.js";
import { createDealStore } from "./deals.js";
import { purgeRecordArtifacts } from "./purge-artifacts.js";
import { initializeSchema } from "./schema.js";
import type { Db } from "./types.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-purge-artifacts-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

function createLiveAgent(db: Db) {
  const agents = new AgentStore(db);
  const agent = agents.create({ id: "agent_purge", name: "Purge test agent" });
  const version = agents.createVersion(agent.id, { id: "version_purge", instructions: "run" });
  agents.validateVersion(version.id);
  agents.deploy(agent.id, version.id);
  return agents;
}

describe("record purge artifact cleanup", () => {
  it("cancels every active target run and removes only its dangling artifacts", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const agents = createLiveAgent(db);
      const events = new CrmEventStore(db);
      const queued = agents.queueRun("agent_purge", {
        id: "run_purge_queued",
        input: { entity: "contact", recordId: "contact_purged" },
        idempotencyKey: "purge-queued",
      });
      const running = agents.queueRun("agent_purge", {
        id: "run_purge_running",
        input: { activity: { contactId: "contact_purged" } },
        idempotencyKey: "purge-running",
      });
      agents.startRun(running.id);
      const runningAction = agents.createAction(running.id, {
        id: "action_purge_running",
        type: "crm.note.write",
        provider: "crm",
        summary: "Write a note",
      });
      agents.startAction(runningAction.id);

      const waiting = agents.queueRun("agent_purge", {
        id: "run_purge_waiting",
        input: { payload: { record: { kind: "CONTACT", id: "contact_purged" } } },
        idempotencyKey: "purge-waiting",
      });
      agents.startRun(waiting.id);
      agents.requestApproval(waiting.id, { reason: "Needs review" });
      const waitingAction = agents.createAction(waiting.id, {
        id: "action_purge_waiting",
        type: "crm.note.write",
        provider: "crm",
        summary: "Write another note",
      });

      const terminal = agents.queueRun("agent_purge", {
        id: "run_purge_terminal",
        input: { recordType: "CONTACT", recordId: "contact_purged" },
        idempotencyKey: "purge-terminal",
      });
      agents.startRun(terminal.id);
      const terminalAction = agents.createAction(terminal.id, {
        id: "action_purge_terminal",
        type: "crm.note.write",
        provider: "crm",
        summary: "Keep completed note",
      });
      agents.startAction(terminalAction.id);
      agents.succeedAction(terminalAction.id, "note-complete");
      agents.succeedRun(terminal.id, { summary: "Completed" });

      const unrelated = agents.queueRun("agent_purge", {
        id: "run_purge_unrelated",
        input: { entity: "CONTACT", recordId: "contact_keep" },
        idempotencyKey: "purge-unrelated",
      });

      agents.linkThread("agent_purge", {
        id: "thread_purge_record",
        threadId: "thread-purge-record",
        kind: "RECORD",
        recordType: "CONTACT",
        recordId: "contact_purged",
      });
      agents.linkThread("agent_purge", {
        id: "thread_purge_running",
        threadId: "thread-purge-running",
        kind: "RUN",
        runId: running.id,
      });
      agents.linkThread("agent_purge", {
        id: "thread_purge_terminal",
        threadId: "thread-purge-terminal",
        kind: "RUN",
        runId: terminal.id,
      });
      agents.linkThread("agent_purge", {
        id: "thread_purge_unrelated",
        threadId: "thread-purge-unrelated",
        kind: "RECORD",
        recordType: "CONTACT",
        recordId: "contact_keep",
      });
      agents.linkThread("agent_purge", {
        id: "thread_purge_builder",
        threadId: "thread-purge-builder",
        kind: "BUILDER",
      });

      events.enqueue({
        id: "event_purge_pending",
        type: "contact.created",
        recordKind: "contact",
        recordId: "contact_purged",
      });
      const processed = events.enqueue({
        id: "event_purge_processed",
        type: "contact.created",
        recordKind: "contact",
        recordId: "contact_purged",
      });
      events.markProcessed(processed.id, "2026-08-26T00:00:00.000Z");
      events.enqueue({
        id: "event_purge_unrelated",
        type: "contact.created",
        recordKind: "contact",
        recordId: "contact_keep",
      });

      const result = purgeRecordArtifacts(db, "contact", "contact_purged", {
        actorId: "purge-test",
        reason: "Contact was permanently deleted.",
      });

      expect(result).toEqual({
        entity: "CONTACT",
        recordId: "contact_purged",
        matchedRunIds: [queued.id, running.id, waiting.id, terminal.id],
        cancelledRunIds: [queued.id, running.id, waiting.id],
        removedThreadLinkIds: ["thread_purge_record", "thread_purge_running", "thread_purge_terminal"],
        removedPendingEventIds: ["event_purge_pending"],
      });
      expect(agents.getRunRequired(queued.id)).toMatchObject({
        status: "CANCELLED",
        errorCode: "RECORD_PURGED",
        errorMessage: "Contact was permanently deleted.",
      });
      expect(agents.getRunRequired(running.id)).toMatchObject({ status: "CANCELLED" });
      expect(agents.getRunRequired(waiting.id)).toMatchObject({ status: "CANCELLED" });
      expect(agents.getRunRequired(terminal.id)).toMatchObject({ status: "SUCCEEDED" });
      expect(agents.getRunRequired(unrelated.id)).toMatchObject({ status: "QUEUED" });
      expect(agents.getAction(runningAction.id)).toMatchObject({ status: "CANCELLED", errorCode: "RECORD_PURGED" });
      expect(agents.getAction(waitingAction.id)).toMatchObject({ status: "CANCELLED", errorCode: "RECORD_PURGED" });
      expect(agents.getAction(terminalAction.id)).toMatchObject({ status: "SUCCEEDED", externalId: "note-complete" });
      expect(agents.getRunRequired(running.id).events.at(-1)).toMatchObject({ type: "run.cancelled" });
      expect(agents.listRunAudit(running.id).some((event) => event.type === "run.cancelled")).toBe(true);

      expect(db.prepare("SELECT id FROM agent_thread_links ORDER BY id").pluck().all()).toEqual([
        "thread_purge_builder",
        "thread_purge_unrelated",
      ]);
      expect(db.prepare("SELECT id, processed_at AS processedAt FROM crm_event_outbox ORDER BY id").all()).toEqual([
        { id: "event_purge_processed", processedAt: "2026-08-26T00:00:00.000Z" },
        { id: "event_purge_unrelated", processedAt: null },
      ]);
      expect(db.prepare("SELECT COUNT(*) FROM agent_run_events WHERE run_id IN (?, ?, ?)").pluck().get(
        queued.id,
        running.id,
        waiting.id,
      )).toBe(9);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

      const second = purgeRecordArtifacts(db, "CONTACT", "contact_purged");
      expect(second.cancelledRunIds).toEqual([]);
      expect(second.removedThreadLinkIds).toEqual([]);
      expect(second.removedPendingEventIds).toEqual([]);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("matches company/deal JSON targets without touching other records or history", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const agents = createLiveAgent(db);
      const events = new CrmEventStore(db);
      const companyRun = agents.queueRun("agent_purge", {
        id: "run_company_target",
        input: { recordType: "COMPANY", recordId: "company_purged" },
        idempotencyKey: "company-target",
      });
      const dealRun = agents.queueRun("agent_purge", {
        id: "run_deal_target",
        input: { metadata: { dealId: "deal_purged" } },
        idempotencyKey: "deal-target",
      });
      const otherDealRun = agents.queueRun("agent_purge", {
        id: "run_deal_other",
        input: { dealId: "deal_keep" },
        idempotencyKey: "deal-other",
      });

      agents.linkThread("agent_purge", {
        id: "thread_company_target",
        threadId: "thread-company-target",
        kind: "RECORD",
        recordType: "COMPANY",
        recordId: "company_purged",
      });
      agents.linkThread("agent_purge", {
        id: "thread_deal_target",
        threadId: "thread-deal-target",
        kind: "RUN",
        runId: dealRun.id,
      });
      events.enqueue({
        id: "event_company_target",
        type: "company.created",
        recordKind: "company",
        recordId: "company_purged",
      });
      events.enqueue({
        id: "event_deal_target",
        type: "deal.created",
        recordKind: "deal",
        recordId: "deal_purged",
      });

      expect(purgeRecordArtifacts(db, "COMPANY", "company_purged")).toMatchObject({
        matchedRunIds: [companyRun.id],
        cancelledRunIds: [companyRun.id],
        removedThreadLinkIds: ["thread_company_target"],
        removedPendingEventIds: ["event_company_target"],
      });
      expect(purgeRecordArtifacts(db, "DEAL", "deal_purged")).toMatchObject({
        matchedRunIds: [dealRun.id],
        cancelledRunIds: [dealRun.id],
        removedThreadLinkIds: ["thread_deal_target"],
        removedPendingEventIds: ["event_deal_target"],
      });
      expect(agents.getRunRequired(otherDealRun.id).status).toBe("QUEUED");
      expect(db.prepare("SELECT COUNT(*) FROM crm_event_outbox WHERE id = ?").pluck().get("event_deal_target")).toBe(0);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("wires cleanup into direct contact/deal purges and cascading company purges", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const companies = createCompanyStore(db);
      const contacts = createContactStore(db);
      const deals = createDealStore(db);
      const agents = createLiveAgent(db);
      const events = new CrmEventStore(db);
      const company = companies.create({ id: "company_store_purge", name: "Store purge company" });
      const contact = contacts.create({
        id: "contact_store_purge",
        firstName: "Store",
        email: "store-purge@example.test",
        companyId: company.id,
      });
      const deal = deals.create({
        id: "deal_store_purge",
        name: "Store purge deal",
        companyId: company.id,
        ownerId: "owner_store",
      });
      const companyRun = agents.queueRun("agent_purge", {
        id: "run_store_company",
        input: { entity: "COMPANY", recordId: company.id },
        idempotencyKey: "store-company",
      });
      const dealRun = agents.queueRun("agent_purge", {
        id: "run_store_deal",
        input: { dealId: deal.id },
        idempotencyKey: "store-deal",
      });
      const contactRun = agents.queueRun("agent_purge", {
        id: "run_store_contact",
        input: { entity: "CONTACT", recordId: contact.id },
        idempotencyKey: "store-contact",
      });
      agents.linkThread("agent_purge", {
        id: "thread_store_company",
        threadId: "thread-store-company",
        kind: "RECORD",
        recordType: "COMPANY",
        recordId: company.id,
      });
      agents.linkThread("agent_purge", {
        id: "thread_store_deal",
        threadId: "thread-store-deal",
        kind: "RUN",
        runId: dealRun.id,
      });
      agents.linkThread("agent_purge", {
        id: "thread_store_contact",
        threadId: "thread-store-contact",
        kind: "RECORD",
        recordType: "CONTACT",
        recordId: contact.id,
      });
      events.enqueue({
        id: "event_store_company",
        type: "company.created",
        recordKind: "company",
        recordId: company.id,
      });
      events.enqueue({
        id: "event_store_deal",
        type: "deal.created",
        recordKind: "deal",
        recordId: deal.id,
      });
      events.enqueue({
        id: "event_store_contact",
        type: "contact.created",
        recordKind: "contact",
        recordId: contact.id,
      });

      companies.purge(company.id);
      expect(db.prepare("SELECT 1 FROM companies WHERE id = ?").get(company.id)).toBeUndefined();
      expect(db.prepare("SELECT 1 FROM deals WHERE id = ?").get(deal.id)).toBeUndefined();
      expect(contacts.getRequired(contact.id).companyId).toBeNull();
      expect(agents.getRunRequired(companyRun.id).status).toBe("CANCELLED");
      expect(agents.getRunRequired(dealRun.id).status).toBe("CANCELLED");
      expect(agents.getRunRequired(contactRun.id).status).toBe("QUEUED");
      expect(db.prepare("SELECT id FROM agent_thread_links ORDER BY id").pluck().all()).toEqual([
        "thread_store_contact",
      ]);
      expect(db.prepare("SELECT id FROM crm_event_outbox ORDER BY id").pluck().all()).toEqual(
        expect.arrayContaining(["event_store_contact"]),
      );
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

      contacts.purge(contact.id);
      expect(agents.getRunRequired(contactRun.id).status).toBe("CANCELLED");
      expect(db.prepare("SELECT 1 FROM agent_thread_links WHERE id = ?").get("thread_store_contact")).toBeUndefined();
      expect(db.prepare("SELECT 1 FROM crm_event_outbox WHERE id = ?").get("event_store_contact")).toBeUndefined();

      const directCompany = companies.create({ id: "company_direct_deal", name: "Direct deal company" });
      const directDeal = deals.create({
        id: "deal_direct_purge",
        name: "Direct purge deal",
        companyId: directCompany.id,
        ownerId: "owner_store",
      });
      const directDealRun = agents.queueRun("agent_purge", {
        id: "run_direct_deal",
        input: { recordType: "DEAL", recordId: directDeal.id },
        idempotencyKey: "direct-deal",
      });
      agents.linkThread("agent_purge", {
        id: "thread_direct_deal",
        threadId: "thread-direct-deal",
        kind: "RUN",
        runId: directDealRun.id,
      });
      events.enqueue({
        id: "event_direct_deal",
        type: "deal.created",
        recordKind: "deal",
        recordId: directDeal.id,
      });

      deals.purge(directDeal.id);
      expect(agents.getRunRequired(directDealRun.id).status).toBe("CANCELLED");
      expect(db.prepare("SELECT 1 FROM agent_thread_links WHERE id = ?").get("thread_direct_deal")).toBeUndefined();
      expect(db.prepare("SELECT 1 FROM crm_event_outbox WHERE id = ?").get("event_direct_deal")).toBeUndefined();
      expect(db.prepare("SELECT 1 FROM companies WHERE id = ?").get(directCompany.id)).toBeDefined();
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("rejects unknown record kinds and empty ids before opening a transaction", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      expect(() => purgeRecordArtifacts(db, "PERSON", "person_1")).toThrow("Invalid purge record type");
      expect(() => purgeRecordArtifacts(db, "COMPANY", "  ")).toThrow("Purge record id is required");
    } finally {
      await lifecycle.dispose();
    }
  });
});
