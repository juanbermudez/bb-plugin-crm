import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { initializeSchema } from "./schema.js";
import {
  archiveCompany,
  createCompany,
  getCompany,
  listCompanies,
  purgeCompany,
  restoreCompany,
  updateCompany,
} from "./companies.js";
import {
  archiveContact,
  createContact,
  getContact,
  listContacts,
  purgeContact,
  restoreContact,
  updateContact,
} from "./contacts.js";
import {
  archiveDeal,
  createDeal,
  getDeal,
  listDeals,
  purgeDeal,
  restoreDeal,
  updateDeal,
} from "./deals.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-db-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { ...host, db, bb: host.bb, lifecycle: host.harness.lifecycle };
}

describe("CRM SQLite foundation", () => {
  it("applies the append-only migration and creates normalized tables/indexes", async () => {
    const { bb, db, lifecycle } = withDatabase();
    try {
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
        )
        .all() as Array<{ name: string }>;
      expect(tables.map(({ name }) => name)).toEqual([
        "_bb_migrations",
        "activities",
        "companies",
        "contacts",
        "crm_metadata",
        "deal_contacts",
        "deals",
        "field_definitions",
        "field_options",
        "field_values",
        "saved_views",
      ]);

      const migrationIds = db
        .prepare("SELECT id FROM _bb_migrations ORDER BY id")
        .all() as Array<{ id: number }>;
      expect(migrationIds.map(({ id }) => id)).toEqual([0, 1]);
      expect(
        db
          .prepare("SELECT value FROM crm_metadata WHERE key = 'schema_version'")
          .pluck()
          .get(),
      ).toBe("2");

      const indexNames = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
        )
        .all() as Array<{ name: string }>;
      expect(indexNames.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "companies_domain_active_idx",
          "contacts_email_active_idx",
          "deals_base_amount_idx",
          "activities_company_created_idx",
          "field_values_field_text_idx",
        ]),
      );

      // A second load does not re-run or duplicate the append-only sequence.
      initializeSchema(bb, db);
      expect(
        (db.prepare("SELECT COUNT(*) AS count FROM _bb_migrations").get() as { count: number })
          .count,
      ).toBe(2);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("supports typed company/contact/deal CRUD with archive and restore semantics", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompany(db, {
        id: "cmp_acme",
        name: "Acme, Inc.",
        domain: "https://www.Acme.com/path",
        source: "IMPORT",
      });
      expect(company.domain).toBe("acme.com");
      expect(company.website).toBe("https://acme.com");

      const contact = createContact(db, {
        id: "con_ada",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ADA@EXAMPLE.COM",
        companyId: company.id,
      });
      expect(contact.email).toBe("ada@example.com");

      const deal = createDeal(db, {
        id: "deal_acme",
        name: "Acme expansion",
        companyId: company.id,
        ownerId: "bb-user-1",
        amountCents: 125_00,
        currency: "usd",
        baseAmountCents: 125_00,
        baseCurrency: "USD",
        fxRate: 1,
        fxRateAt: "2026-08-25T12:00:00.000Z",
      });
      expect(deal.currency).toBe("USD");
      expect(deal.baseAmountCents).toBe(125_00);

      expect(listCompanies(db)).toHaveLength(1);
      expect(listContacts(db, { companyId: company.id })).toHaveLength(1);
      expect(listDeals(db, { companyId: company.id })).toHaveLength(1);
      expect(listCompanies(db, { search: "acme" })).toHaveLength(1);
      expect(listContacts(db, { search: "ada@example" })).toHaveLength(1);
      expect(listDeals(db, { search: "expansion" })).toHaveLength(1);

      const updatedCompany = updateCompany(db, company.id, {
        industry: "Software",
        description: "Updated company",
      });
      expect(updatedCompany.industry).toBe("Software");
      expect(updatedCompany.description).toBe("Updated company");
      const updatedContact = updateContact(db, contact.id, {
        title: "Principal Engineer",
      });
      expect(updatedContact.title).toBe("Principal Engineer");

      archiveCompany(db, company.id);
      archiveContact(db, contact.id);
      archiveDeal(db, deal.id);
      expect(listCompanies(db)).toHaveLength(0);
      expect(listContacts(db)).toHaveLength(0);
      expect(listDeals(db)).toHaveLength(0);
      expect(listCompanies(db, { archivedOnly: true })).toHaveLength(1);
      expect(getCompany(db, company.id)?.archivedAt).not.toBeNull();
      expect(getContact(db, contact.id, { includeArchived: false })).toBeNull();

      restoreCompany(db, company.id);
      restoreContact(db, contact.id);
      restoreDeal(db, deal.id);
      expect(listCompanies(db)).toHaveLength(1);
      expect(listContacts(db)).toHaveLength(1);
      expect(listDeals(db)).toHaveLength(1);

      purgeDeal(db, deal.id);
      purgeContact(db, contact.id);
      purgeCompany(db, company.id);
      expect(getDeal(db, deal.id)).toBeNull();
      expect(getContact(db, contact.id)).toBeNull();
      expect(getCompany(db, company.id)).toBeNull();
    } finally {
      await lifecycle.dispose();
    }
  });

  it("enforces relationships, active uniqueness, and frozen deal base money", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompany(db, { name: "Example", domain: "example.com" });
      expect(() => createCompany(db, { name: "Duplicate", domain: "EXAMPLE.COM" })).toThrow();

      const archived = archiveCompany(db, company.id);
      expect(archived.archivedAt).not.toBeNull();
      const replacement = createCompany(db, { name: "Replacement", domain: "example.com" });
      expect(replacement.domain).toBe("example.com");
      expect(() => restoreCompany(db, company.id)).toThrow();

      const contact = createContact(db, {
        firstName: "Grace",
        email: "grace@example.com",
        companyId: replacement.id,
      });
      const deal = createDeal(db, {
        name: "Expansion",
        companyId: replacement.id,
        ownerId: "bb-user-1",
        amountCents: 10_000,
        currency: "EUR",
        baseAmountCents: 11_000,
        baseCurrency: "USD",
        fxRate: 1.1,
      });
      db.prepare(
        "INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES (?, ?, ?)",
      ).run(deal.id, contact.id, "Champion");
      db.prepare(
        "INSERT INTO activities (id, type, deal_id, created_by_id) VALUES (?, ?, ?, ?)",
      ).run("act_1", "NOTE", deal.id, "bb-user-1");
      db.prepare(
        "INSERT INTO field_definitions (id, entity, key, label, type, position) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("field_1", "DEAL", "tier", "Tier", "SELECT", 0);
      db.prepare(
        "INSERT INTO field_options (id, field_id, label, position) VALUES (?, ?, ?, ?)",
      ).run("option_1", "field_1", "Enterprise", 0);
      db.prepare(
        "INSERT INTO field_values (id, field_id, deal_id, option_id) VALUES (?, ?, ?, ?)",
      ).run("value_1", "field_1", deal.id, "option_1");

      const changed = updateDeal(db, deal.id, {
        amountCents: 20_000,
        currency: "GBP",
        description: "Updated without re-rating",
      });
      expect(changed.amountCents).toBe(20_000);
      expect(changed.currency).toBe("GBP");
      expect(changed.baseAmountCents).toBe(11_000);
      expect(changed.baseCurrency).toBe("USD");
      expect(changed.fxRate).toBe(1.1);

      // Core foreign keys cascade or null out according to relation semantics.
      purgeCompany(db, replacement.id);
      expect(getContact(db, contact.id)?.companyId).toBeNull();
      expect(getDeal(db, deal.id)).toBeNull();
      expect(db.prepare("SELECT COUNT(*) AS count FROM deal_contacts").pluck().get()).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM activities").pluck().get()).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM field_values").pluck().get()).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM field_options").pluck().get()).toBe(1);
    } finally {
      await lifecycle.dispose();
    }
  });
});
