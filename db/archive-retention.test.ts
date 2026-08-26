import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { AgentStore } from "./agents.js";
import { createCompanyStore } from "./companies.js";
import { createContactStore } from "./contacts.js";
import { createDealStore } from "./deals.js";
import { CrmEventStore } from "./crm-events.js";
import {
  MAX_ARCHIVE_PRUNE_BATCH_SIZE,
  pruneArchivedRecords,
} from "./archive-retention.js";
import { initializeSchema } from "./schema.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-archive-retention-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

function insertActivity(
  db: ReturnType<typeof withDatabase>["db"],
  id: string,
  createdAt: string,
  refs: { companyId?: string; contactId?: string; dealId?: string } = {},
): void {
  db.prepare(`
    INSERT INTO activities (
      id, type, company_id, contact_id, deal_id, created_by_id, created_at, updated_at
    ) VALUES (?, 'NOTE', ?, ?, ?, 'test-user', ?, ?)
  `).run(
    id,
    refs.companyId ?? null,
    refs.contactId ?? null,
    refs.dealId ?? null,
    createdAt,
    createdAt,
  );
}

describe("archive retention", () => {
  it("removes only expired archived records within a global batch bound", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const companies = createCompanyStore(db);
      const contacts = createContactStore(db);
      const deals = createDealStore(db);
      const oldCompany = companies.create({ id: "company-old", name: "Old Company" });
      const oldContact = contacts.create({
        id: "contact-old",
        firstName: "Old",
        email: "old@retention.example",
        companyId: oldCompany.id,
      });
      const oldDeal = deals.create({
        id: "deal-old",
        name: "Old deal",
        companyId: oldCompany.id,
        ownerId: "local_user",
      });
      insertActivity(db, "activity-company-old", "2026-01-01T00:00:00.000Z", {
        companyId: oldCompany.id,
      });
      insertActivity(db, "activity-contact-old", "2026-01-02T00:00:00.000Z", {
        companyId: oldCompany.id,
        contactId: oldContact.id,
      });
      insertActivity(db, "activity-deal-old", "2026-01-03T00:00:00.000Z", {
        companyId: oldCompany.id,
        dealId: oldDeal.id,
      });
      db.prepare("UPDATE companies SET last_activity_at = ? WHERE id = ?").run(
        "2026-01-03T00:00:00.000Z",
        oldCompany.id,
      );
      contacts.archive(oldContact.id);
      deals.archive(oldDeal.id);
      companies.archive(oldCompany.id);

      const currentCompany = companies.create({ id: "company-current", name: "Current Company" });
      const currentDeal = deals.create({
        id: "deal-current",
        name: "Current deal",
        companyId: currentCompany.id,
        ownerId: "local_user",
      });
      const blockedCompany = companies.create({ id: "company-blocked", name: "Blocked Company" });
      deals.create({
        id: "deal-active",
        name: "Active deal",
        companyId: blockedCompany.id,
        ownerId: "local_user",
      });
      companies.archive(blockedCompany.id);
      const futureContact = contacts.create({ id: "contact-future", firstName: "Future" });
      contacts.archive(futureContact.id);

      db.prepare("UPDATE deals SET archived_at = ? WHERE id = ?").run("2025-01-01T00:00:00.000Z", oldDeal.id);
      db.prepare("UPDATE contacts SET archived_at = ? WHERE id = ?").run("2025-01-01T00:00:00.000Z", oldContact.id);
      db.prepare("UPDATE companies SET archived_at = ? WHERE id = ?").run("2025-01-01T00:00:00.000Z", oldCompany.id);
      db.prepare("UPDATE companies SET archived_at = ? WHERE id = ?").run("2025-01-01T00:00:00.000Z", blockedCompany.id);
      db.prepare("UPDATE contacts SET archived_at = ? WHERE id = ?").run("2026-08-25T00:00:00.000Z", futureContact.id);

      const first = pruneArchivedRecords(db, {
        retentionDays: 30,
        now: "2026-08-26T00:00:00.000Z",
        batchSize: 1,
      });
      expect(first).toMatchObject({
        dealsDeleted: 1,
        contactsDeleted: 0,
        companiesDeleted: 0,
        totalDeleted: 1,
        hasMore: true,
      });
      expect(db.prepare("SELECT 1 FROM deals WHERE id = ?").get(oldDeal.id)).toBeUndefined();
      expect(db.prepare("SELECT 1 FROM companies WHERE id = ?").get(oldCompany.id)).toBeDefined();
      expect(db.prepare("SELECT last_activity_at FROM companies WHERE id = ?").pluck().get(oldCompany.id)).toBe(
        "2026-01-02T00:00:00.000Z",
      );

      const second = pruneArchivedRecords(db, {
        retentionDays: 30,
        now: "2026-08-26T00:00:00.000Z",
        batchSize: 1,
      });
      expect(second).toMatchObject({ contactsDeleted: 1, totalDeleted: 1, hasMore: true });
      expect(db.prepare("SELECT reason FROM suppressed_contacts WHERE email = ?").pluck().get("old@retention.example")).toBe(
        "Deleted from the CRM (Old)",
      );
      expect(db.prepare("SELECT last_activity_at FROM companies WHERE id = ?").pluck().get(oldCompany.id)).toBe(
        "2026-01-01T00:00:00.000Z",
      );

      const third = pruneArchivedRecords(db, {
        retentionDays: 30,
        now: "2026-08-26T00:00:00.000Z",
        batchSize: 1,
      });
      expect(third).toMatchObject({ companiesDeleted: 1, totalDeleted: 1 });

      expect(db.prepare("SELECT 1 FROM companies WHERE id = ?").get(currentCompany.id)).toBeDefined();
      expect(db.prepare("SELECT 1 FROM deals WHERE id = ?").get(currentDeal.id)).toBeDefined();
      expect(db.prepare("SELECT 1 FROM deals WHERE id = ?").get("deal-active")).toBeDefined();
      expect(db.prepare("SELECT 1 FROM companies WHERE id = ?").get(blockedCompany.id)).toBeDefined();
      expect(db.prepare("SELECT 1 FROM contacts WHERE id = ?").get(futureContact.id)).toBeDefined();

      expect(() => pruneArchivedRecords(db, { batchSize: MAX_ARCHIVE_PRUNE_BATCH_SIZE + 1 })).toThrow(
        "Archive prune batch size",
      );
    } finally {
      await lifecycle.dispose();
    }
  });

  it("cleans agent artifacts for every record removed by a retention batch", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const companies = createCompanyStore(db);
      const contacts = createContactStore(db);
      const deals = createDealStore(db);
      const agents = new AgentStore(db);
      const events = new CrmEventStore(db);
      const agent = agents.create({ id: "agent_retention_purge", name: "Retention purge agent" });
      const version = agents.createVersion(agent.id, { id: "version_retention_purge", instructions: "run" });
      agents.validateVersion(version.id);
      agents.deploy(agent.id, version.id);

      const company = companies.create({ id: "company_retention_purge", name: "Retention purge company" });
      const contact = contacts.create({
        id: "contact_retention_purge",
        firstName: "Retention",
        email: "retention-purge@example.test",
        companyId: company.id,
      });
      const deal = deals.create({
        id: "deal_retention_purge",
        name: "Retention purge deal",
        companyId: company.id,
        ownerId: "owner_retention",
      });
      companies.archive(company.id);
      contacts.archive(contact.id);
      deals.archive(deal.id);
      db.prepare("UPDATE companies SET archived_at = ? WHERE id = ?").run("2025-01-01T00:00:00.000Z", company.id);
      db.prepare("UPDATE contacts SET archived_at = ? WHERE id = ?").run("2025-01-01T00:00:00.000Z", contact.id);
      db.prepare("UPDATE deals SET archived_at = ? WHERE id = ?").run("2025-01-01T00:00:00.000Z", deal.id);

      const companyRun = agents.queueRun(agent.id, {
        id: "run_retention_company",
        input: { entity: "COMPANY", recordId: company.id },
        idempotencyKey: "retention-company",
      });
      const contactRun = agents.queueRun(agent.id, {
        id: "run_retention_contact",
        input: { entity: "CONTACT", recordId: contact.id },
        idempotencyKey: "retention-contact",
      });
      const dealRun = agents.queueRun(agent.id, {
        id: "run_retention_deal",
        input: { entity: "DEAL", recordId: deal.id },
        idempotencyKey: "retention-deal",
      });
      agents.linkThread(agent.id, {
        id: "thread_retention_company",
        threadId: "thread-retention-company",
        kind: "RECORD",
        recordType: "COMPANY",
        recordId: company.id,
      });
      agents.linkThread(agent.id, {
        id: "thread_retention_contact",
        threadId: "thread-retention-contact",
        kind: "RECORD",
        recordType: "CONTACT",
        recordId: contact.id,
      });
      agents.linkThread(agent.id, {
        id: "thread_retention_deal",
        threadId: "thread-retention-deal",
        kind: "RUN",
        runId: dealRun.id,
      });
      events.enqueue({
        id: "event_retention_company",
        type: "company.created",
        recordKind: "company",
        recordId: company.id,
      });
      events.enqueue({
        id: "event_retention_contact",
        type: "contact.created",
        recordKind: "contact",
        recordId: contact.id,
      });
      events.enqueue({
        id: "event_retention_deal",
        type: "deal.created",
        recordKind: "deal",
        recordId: deal.id,
      });

      const result = pruneArchivedRecords(db, {
        retentionDays: 30,
        now: "2026-08-26T00:00:00.000Z",
        batchSize: 3,
      });

      expect(result).toMatchObject({
        companiesDeleted: 1,
        contactsDeleted: 1,
        dealsDeleted: 1,
        totalDeleted: 3,
      });
      expect(agents.getRunRequired(companyRun.id).status).toBe("CANCELLED");
      expect(agents.getRunRequired(contactRun.id).status).toBe("CANCELLED");
      expect(agents.getRunRequired(dealRun.id).status).toBe("CANCELLED");
      expect(db.prepare("SELECT COUNT(*) FROM agent_thread_links").pluck().get()).toBe(0);
      expect(db.prepare("SELECT COUNT(*) FROM crm_event_outbox").pluck().get()).toBe(0);
      expect(db.prepare("SELECT reason FROM suppressed_contacts WHERE email = ?").pluck().get("retention-purge@example.test")).toBe(
        "Deleted from the CRM (Retention)",
      );
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      await lifecycle.dispose();
    }
  });
});
