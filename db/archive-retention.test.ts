import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createCompanyStore } from "./companies.js";
import { createContactStore } from "./contacts.js";
import { createDealStore } from "./deals.js";
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

      const second = pruneArchivedRecords(db, {
        retentionDays: 30,
        now: "2026-08-26T00:00:00.000Z",
        batchSize: 1,
      });
      expect(second).toMatchObject({ contactsDeleted: 1, totalDeleted: 1, hasMore: true });
      expect(db.prepare("SELECT reason FROM suppressed_contacts WHERE email = ?").pluck().get("old@retention.example")).toBe(
        "Deleted from the CRM (Old)",
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
});
