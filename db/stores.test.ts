import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { CRM_SCHEMA_MIGRATIONS, initializeSchema } from "./schema.js";
import {
  archiveCompany,
  companyFaviconUrl,
  companyForEmail,
  createCompany,
  getCompany,
  listCompanies,
  purgeCompany,
  restoreCompany,
  setPrimaryContact,
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
import { domainFromEmail, RecordConflictError } from "./types.js";
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

function withSchema9Database() {
  const host = createFakePluginHost({ pluginId: "crm-schema-9-test" });
  const db = host.bb.storage.database();
  host.bb.storage.migrate(db, CRM_SCHEMA_MIGRATIONS.slice(0, 9));
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
        "agent_actions",
        "agent_audit_events",
        "agent_definitions",
        "agent_run_events",
        "agent_runs",
        "agent_thread_links",
        "agent_triggers",
        "agent_versions",
        "agent_webhook_tokens",
        "companies",
        "connection_health",
        "connection_sync_cursors",
        "connections",
        "contact_briefs",
        "contact_facts",
        "contact_work_history",
        "contacts",
        "crm_activity_task_dispatches",
        "crm_event_outbox",
        "crm_metadata",
        "deal_contacts",
        "deals",
        "exchange_rate_audit",
        "exchange_rates",
        "field_definitions",
        "field_options",
        "field_values",
        "saved_views",
        "suppressed_contacts",
        "tracking_daily_aggregates",
        "tracking_daily_traffic_sources",
        "tracking_events",
        "tracking_retention",
        "tracking_sites",
        "tracking_tokens",
        "workspace_identity",
      ]);

      const migrationIds = db
        .prepare("SELECT id FROM _bb_migrations ORDER BY id")
        .all() as Array<{ id: number }>;
      expect(migrationIds.map(({ id }) => id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(
        db
          .prepare("SELECT value FROM crm_metadata WHERE key = 'schema_version'")
          .pluck()
          .get(),
      ).toBe("11");

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
          "agent_runs_status_created_idx",
        ]),
      );

      // A second load does not re-run or duplicate the append-only sequence.
      initializeSchema(bb, db);
      expect(
        (db.prepare("SELECT COUNT(*) AS count FROM _bb_migrations").get() as { count: number })
          .count,
      ).toBe(11);
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

  it("derives HTTPS company favicons and preserves explicit artwork", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const created = createCompany(db, {
        name: "Favicon Systems",
        domain: "https://www.Favicon.Example/pricing",
      });
      expect(created.iconUrl).toBe("https://favicon.example/favicon.ico");
      expect(created.logoUrl).toBeNull();
      expect(created.iconDarkUrl).toBeNull();

      const renamed = updateCompany(db, created.id, { domain: "new.favicon.example" });
      expect(renamed.iconUrl).toBe("https://new.favicon.example/favicon.ico");

      const explicitlyBlank = createCompany(db, {
        name: "No Favicon",
        domain: "blank.favicon.example",
        iconUrl: null,
      });
      expect(explicitlyBlank.iconUrl).toBeNull();

      const custom = updateCompany(db, renamed.id, {
        iconUrl: "https://cdn.example/favicon-systems.svg",
        logoUrl: "https://cdn.example/favicon-systems-logo.svg",
      });
      const customAfterDomainChange = updateCompany(db, custom.id, {
        domain: "custom.favicon.example",
      });
      expect(customAfterDomainChange.iconUrl).toBe("https://cdn.example/favicon-systems.svg");
      expect(customAfterDomainChange.logoUrl).toBe("https://cdn.example/favicon-systems-logo.svg");

      expect(companyFaviconUrl("WWW.Example.com/path")).toBe("https://example.com/favicon.ico");
      expect(companyFaviconUrl(null)).toBeNull();
      expect(companyFaviconUrl("localhost")).toBeNull();
    } finally {
      await lifecycle.dispose();
    }
  });

  it("applies the tracking configuration migration after schema 9", async () => {
    const { bb, db, lifecycle } = withSchema9Database();
    try {
      expect(db.prepare("SELECT value FROM crm_metadata WHERE key = 'schema_version'").pluck().get()).toBe("9");
      expect(db.prepare("SELECT id FROM _bb_migrations ORDER BY id").all()).toEqual(
        [0, 1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id })),
      );
      expect(db.prepare("PRAGMA table_info(tracking_events)").all()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "medium" })]),
      );
      expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tracking_daily_traffic_sources'").get()).toBeUndefined();

      const timestamp = "2026-08-25T12:00:00.000Z";
      db.prepare(`
        INSERT INTO tracking_sites (
          id, site_key, name, allowed_domains, status, verification_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "site_legacy",
        "site_legacy",
        "Legacy site",
        JSON.stringify(["example.com"]),
        "ACTIVE",
        "PENDING",
        timestamp,
        timestamp,
      );
      db.prepare(`
        INSERT INTO tracking_retention (
          site_id, event_retention_days, aggregate_retention_days, updated_at
        ) VALUES (?, ?, ?, ?)
      `).run("site_legacy", 30, 730, timestamp);
      db.prepare(`
        INSERT INTO tracking_tokens (
          id, site_id, scope, token_hash, token_hint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run("token_legacy", "site_legacy", "TRACKING", "a".repeat(64), "aaaaaaaaaaaa", timestamp);
      db.prepare(`
        INSERT INTO tracking_events (
          id, site_id, token_id, event_type, occurred_at, received_at,
          origin, path, source, properties, event_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "event_legacy",
        "site_legacy",
        "token_legacy",
        "PAGE_VIEW",
        timestamp,
        timestamp,
        "https://example.com",
        "/pricing",
        "newsletter",
        "{}",
        "legacy-event",
        timestamp,
      );

      initializeSchema(bb, db);

      expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'suppressed_contacts'").get()).toBeDefined();
      expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tracking_daily_traffic_sources'").get()).toBeDefined();
      expect(db.prepare("SELECT cross_domain, limit_to_domains, cookie_days FROM tracking_sites WHERE id = ?").get("site_legacy")).toEqual({
        cross_domain: 1,
        limit_to_domains: 1,
        cookie_days: 395,
      });
      expect(db.prepare("SELECT source, medium, properties FROM tracking_events WHERE id = ?").get("event_legacy")).toEqual({
        source: "newsletter",
        medium: null,
        properties: "{}",
      });
      expect(db.prepare("PRAGMA table_info(tracking_events)").all()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "medium" })]),
      );
      expect(db.prepare("SELECT value FROM crm_metadata WHERE key = 'schema_version'").pluck().get()).toBe("11");
      expect(db.prepare("SELECT MAX(id) FROM _bb_migrations").pluck().get()).toBe(10);
      expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workspace_identity'").get()).toBeDefined();
    } finally {
      await lifecycle.dispose();
    }
  });

  it("reports normalized duplicate conflicts, writes purge tombstones, and auto-associates work domains", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      expect(domainFromEmail("Ada@Acme.Example")).toBe("acme.example");
      expect(domainFromEmail("Ada@gmail.com")).toBeNull();
      expect(domainFromEmail("no-reply@sendgrid.net")).toBeNull();

      const company = createCompany(db, { name: "Acme", domain: "acme.example" });
      expect(() => createCompany(db, { name: "Duplicate", domain: "HTTPS://ACME.EXAMPLE/path" })).toThrow(RecordConflictError);

      const contact = createContact(db, {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ADA@OTHER.EXAMPLE",
        ownerId: "owner_1",
      });
      expect(contact.companyId).not.toBeNull();
      expect(getCompany(db, contact.companyId!)).toMatchObject({
        name: "other.example",
        domain: "other.example",
        website: "https://other.example",
        source: "EMAIL",
        ownerId: "owner_1",
      });
      expect(companyForEmail(db, "second@OTHER.EXAMPLE", { ownerId: "owner_2" })).toBe(contact.companyId);
      expect(() => createContact(db, { firstName: "Ada Again", email: "ada@other.example" })).toThrow(RecordConflictError);

      const free = createContact(db, { firstName: "Free", email: "free@gmail.com" });
      expect(free.companyId).toBeNull();
      const machine = createContact(db, { firstName: "Robot", email: "noreply@sendgrid.net" });
      expect(machine.companyId).toBeNull();

      archiveContact(db, contact.id);
      expect(db.prepare("SELECT 1 FROM suppressed_contacts WHERE email = ?").get(contact.email)).toBeUndefined();
      restoreContact(db, contact.id);
      const purged = purgeContact(db, contact.id);
      expect(purged.email).toBe("ada@other.example");
      expect(db.prepare("SELECT reason FROM suppressed_contacts WHERE email = ?").pluck().get("ADA@OTHER.EXAMPLE")).toBe(
        "Deleted from the CRM (Ada Lovelace)",
      );

      const recreated = createContact(db, {
        firstName: "Ada Recreated",
        email: "ADA@OTHER.EXAMPLE",
      });
      expect(recreated.companyId).toBe(contact.companyId);
      expect(db.prepare("SELECT 1 FROM suppressed_contacts WHERE email = ?").get("ada@other.example")).toBeUndefined();

      const updateTarget = createContact(db, { firstName: "Update", email: "update@other.example" });
      expect(() => updateContact(db, updateTarget.id, { email: "ada@other.example" })).toThrow(RecordConflictError);
      expect(getContact(db, updateTarget.id)?.email).toBe("update@other.example");
      expect(company.id).toBeDefined();
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
      const otherCompany = createCompany(db, { name: "Other", domain: "other.example" });
      const foreignContact = createContact(db, {
        firstName: "Foreign",
        email: "foreign@other.example",
        companyId: otherCompany.id,
      });
      expect(setPrimaryContact(db, replacement.id, contact.id).primaryContactId).toBe(contact.id);
      expect(() => setPrimaryContact(db, replacement.id, foreignContact.id)).toThrow(
        "That contact does not work at this company.",
      );
      expect(() => updateCompany(db, replacement.id, { primaryContactId: "missing-contact" })).toThrow(
        "No contact with id missing-contact.",
      );
      expect(() => createCompany(db, {
        name: "Invalid Primary",
        domain: "invalid-primary.example",
        primaryContactId: foreignContact.id,
      })).toThrow("That contact does not work at this company.");
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

  it("keeps list activity, relation search, relation sorting, null ordering, and count sorting aligned", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const day = 24 * 60 * 60 * 1_000;
      const recent = new Date(Date.now() - 2 * day).toISOString();
      const stale = new Date(Date.now() - 45 * day).toISOString();
      const alpha = createCompany(db, {
        id: "cmp_alpha",
        name: "Alpha Account",
        lastActivityAt: recent,
      });
      const zulu = createCompany(db, {
        id: "cmp_zulu",
        name: "Zulu Account",
        lastActivityAt: stale,
      });
      const inactive = createCompany(db, {
        id: "cmp_inactive",
        name: "No Activity Account",
      });

      const alphaContact = createContact(db, {
        id: "con_alpha",
        firstName: "Alpha",
        lastName: "Contact",
        companyId: alpha.id,
        lastActivityAt: recent,
      });
      createContact(db, {
        id: "con_alpha_second",
        firstName: "Alpha Second",
        lastName: "Contact",
        companyId: alpha.id,
      });
      const archivedZuluContact = createContact(db, {
        id: "con_zulu_archived",
        firstName: "Archived",
        lastName: "Zulu Contact",
        companyId: zulu.id,
      });
      archiveContact(db, archivedZuluContact.id);
      const zuluContact = createContact(db, {
        id: "con_zulu",
        firstName: "Zulu",
        lastName: "Contact",
        companyId: zulu.id,
        lastActivityAt: stale,
      });

      const alphaDeal = createDeal(db, {
        id: "deal_alpha",
        name: "Alpha renewal",
        companyId: alpha.id,
        ownerId: "owner_alpha",
        amountCents: 5_000,
        baseAmountCents: 5_000,
        currency: "USD",
        baseCurrency: "USD",
        fxRate: 1,
        lastActivityAt: recent,
      });
      createDeal(db, {
        id: "deal_alpha_second",
        name: "Alpha expansion",
        companyId: alpha.id,
        ownerId: "owner_alpha",
        amountCents: 4_000,
        baseAmountCents: 4_000,
        currency: "USD",
        baseCurrency: "USD",
        fxRate: 1,
      });
      const zuluDeal = createDeal(db, {
        id: "deal_zulu",
        name: "Zulu renewal",
        companyId: zulu.id,
        ownerId: "owner_zulu",
        lastActivityAt: stale,
      });
      const archivedZuluDeal = createDeal(db, {
        id: "deal_zulu_archived",
        name: "Zulu archived renewal",
        companyId: zulu.id,
        ownerId: "owner_zulu",
      });
      archiveDeal(db, archivedZuluDeal.id);

      expect(listCompanies(db, { activity: ["7"] }).map((value) => value.id)).toEqual([alpha.id]);
      expect(listCompanies(db, { activity: ["7", "30"] }).map((value) => value.id)).toEqual([alpha.id]);
      expect(listContacts(db, { activity: ["7"] }).map((value) => value.id)).toEqual([alphaContact.id]);
      expect(listContacts(db, { search: "Alpha Account" }).map((value) => value.id)).toEqual(
        expect.arrayContaining([alphaContact.id]),
      );
      expect(listDeals(db, { search: "Alpha Account" }).map((value) => value.id)).toEqual(
        expect.arrayContaining([alphaDeal.id]),
      );

      expect(listContacts(db, { sortBy: "company", sortDirection: "asc" }).map((value) => value.id)).toEqual([
        alphaContact.id,
        "con_alpha_second",
        zuluContact.id,
      ]);
      expect(listDeals(db, { sortBy: "company", sortDirection: "asc" }).map((value) => value.id)).toEqual([
        "deal_alpha_second",
        alphaDeal.id,
        zuluDeal.id,
      ]);
      expect(listCompanies(db, { sortBy: "lastActivity", sortDirection: "desc" }).map((value) => value.id)).toEqual([
        alpha.id,
        zulu.id,
        inactive.id,
      ]);
      expect(listCompanies(db, { sortBy: "contacts", sortDirection: "desc" }).map((value) => value.id)).toEqual([
        zulu.id,
        alpha.id,
        inactive.id,
      ]);
      expect(listCompanies(db, { sortBy: "deals", sortDirection: "desc" }).map((value) => value.id)).toEqual([
        zulu.id,
        alpha.id,
        inactive.id,
      ]);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("defaults lists to newest first and keeps nullable ascending keys last", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const oldCompany = createCompany(db, {
        id: "cmp_old",
        name: "Old company",
        industry: "Software",
      });
      const newCompany = createCompany(db, {
        id: "cmp_new",
        name: "New company",
      });
      const oldContact = createContact(db, {
        id: "con_old",
        firstName: "Old",
        lastName: "Contact",
        companyId: oldCompany.id,
      });
      const newContact = createContact(db, {
        id: "con_new",
        firstName: "New",
        lastName: "Contact",
        companyId: oldCompany.id,
      });
      const oldDeal = createDeal(db, {
        id: "deal_old",
        name: "Old deal",
        companyId: oldCompany.id,
        ownerId: "owner_old",
      });
      const newDeal = createDeal(db, {
        id: "deal_new",
        name: "New deal",
        companyId: oldCompany.id,
        ownerId: "owner_new",
      });

      db.prepare("UPDATE companies SET created_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", oldCompany.id);
      db.prepare("UPDATE companies SET created_at = ? WHERE id = ?").run("2026-01-02T00:00:00.000Z", newCompany.id);
      db.prepare("UPDATE contacts SET created_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", oldContact.id);
      db.prepare("UPDATE contacts SET created_at = ? WHERE id = ?").run("2026-01-02T00:00:00.000Z", newContact.id);
      db.prepare("UPDATE deals SET created_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", oldDeal.id);
      db.prepare("UPDATE deals SET created_at = ? WHERE id = ?").run("2026-01-02T00:00:00.000Z", newDeal.id);

      expect(listCompanies(db).map((value) => value.id)).toEqual([newCompany.id, oldCompany.id]);
      expect(listContacts(db).map((value) => value.id)).toEqual([newContact.id, oldContact.id]);
      expect(listDeals(db).map((value) => value.id)).toEqual([newDeal.id, oldDeal.id]);

      const nullableIndustry = createCompany(db, {
        id: "cmp_industry_null",
        name: "Industry null",
      });
      const valuedIndustry = createCompany(db, {
        id: "cmp_industry_value",
        name: "Industry value",
        industry: "Software",
      });
      expect(listCompanies(db, { sortBy: "industry", sortDirection: "asc" }).map((value) => value.id)).toEqual([
        valuedIndustry.id,
        oldCompany.id,
        nullableIndustry.id,
        newCompany.id,
      ]);

      const nullLastName = createContact(db, {
        id: "con_null_last",
        firstName: "Ava",
        companyId: oldCompany.id,
      });
      const valuedLastName = createContact(db, {
        id: "con_valued_last",
        firstName: "Zoe",
        lastName: "Adams",
        companyId: oldCompany.id,
      });
      expect(listContacts(db, { sortBy: "name", sortDirection: "asc" }).map((value) => value.id)).toEqual([
        valuedLastName.id,
        newContact.id,
        oldContact.id,
        nullLastName.id,
      ]);

      const closeCompany = createCompany(db, {
        id: "cmp_close_order",
        name: "Close order",
      });
      const datedDeal = createDeal(db, {
        id: "deal_dated_close",
        name: "Dated close",
        companyId: closeCompany.id,
        ownerId: "owner_close",
        expectedCloseDate: "2026-12-31",
      });
      const noCloseDeal = createDeal(db, {
        id: "deal_no_close",
        name: "No close",
        companyId: closeCompany.id,
        ownerId: "owner_close",
      });
      expect(listDeals(db, { companyId: closeCompany.id, sortBy: "expectedClose", sortDirection: "asc" }).map((value) => value.id)).toEqual([
        datedDeal.id,
        noCloseDeal.id,
      ]);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("sorts companies by all related deals, including closed deals", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const closedOnly = createCompany(db, {
        id: "cmp_closed_only",
        name: "A closed-only company",
      });
      const noDeals = createCompany(db, {
        id: "cmp_no_deals",
        name: "Z no-deals company",
      });
      createDeal(db, {
        id: "deal_closed_only",
        name: "Closed deal",
        companyId: closedOnly.id,
        ownerId: "owner_closed",
        stage: "CLOSED_WON",
      });

      expect(listCompanies(db, { sortBy: "deals", sortDirection: "desc" }).map((value) => value.id).slice(0, 2)).toEqual([
        closedOnly.id,
        noDeals.id,
      ]);
    } finally {
      await lifecycle.dispose();
    }
  });
});
