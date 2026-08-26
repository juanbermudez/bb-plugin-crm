import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type {
  Company as CompanyOutput,
  CompanyListInput,
  Contact as ContactOutput,
  ContactListInput,
} from "./contracts/core.js";
import { rpcContract } from "./contracts/rpc.js";
import {
  createCompanyStore,
  type Company as StoredCompany,
  type CompanyListOptions,
} from "./db/companies.js";
import {
  createContactStore,
  type Contact as StoredContact,
  type ContactListOptions,
} from "./db/contacts.js";
import { CRM_SCHEMA_VERSION, initializeSchema } from "./db/schema.js";

export const CRM_PLUGIN_VERSION = "0.1.0";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    workspaceName: {
      type: "string",
      label: "Workspace name",
      default: "My CRM",
    },
    reportingCurrency: {
      type: "select",
      label: "Reporting currency",
      options: [
        "USD",
        "EUR",
        "JPY",
        "GBP",
        "CNY",
        "AUD",
        "CAD",
        "CHF",
        "HKD",
        "SGD",
        "ZAR",
      ],
      default: "USD",
    },
    researchApiKey: {
      type: "string",
      label: "Research API key",
      secret: true,
    },
  });

  const db = bb.storage.database();
  initializeSchema(bb, db);
  const companies = createCompanyStore(db);
  const contacts = createContactStore(db);

  function companyOutput(company: StoredCompany): CompanyOutput {
    const counts = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM contacts
            WHERE company_id = @id AND archived_at IS NULL) AS contactCount,
          (SELECT COUNT(*) FROM deals
            WHERE company_id = @id AND archived_at IS NULL
              AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')) AS openDealCount
      `)
      .get({ id: company.id }) as { contactCount: number; openDealCount: number };
    return {
      ...company,
      fields: {},
      contactCount: counts.contactCount,
      openDealCount: counts.openDealCount,
    };
  }

  function companyListOptions(input: CompanyListInput): CompanyListOptions {
    const sortBy =
      input.sort === "createdAt" || input.sort === "lastActivity"
        ? input.sort
        : input.sort === "domain" || input.sort === "industry" || input.sort === "owner"
          ? input.sort
          : "name";
    return {
      search: input.q,
      archivedOnly: input.archived,
      ownerIds: input.owner,
      industries: input.industry,
      sources: input.source,
      enrichmentStatuses: input.enrichment,
      sortBy,
      sortDirection: input.dir,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  function facetCounts(): Record<string, Record<string, number>> {
    const facets: Record<string, Record<string, number>> = {};
    const definitions = [
      ["owner", "COALESCE(owner_id, 'unassigned')"],
      ["industry", "industry"],
      ["enrichment", "enrichment_status"],
      ["source", "source"],
    ] as const;
    for (const [name, expression] of definitions) {
      const rows = db
        .prepare(`SELECT ${expression} AS value, COUNT(*) AS count FROM companies WHERE archived_at IS NULL AND ${expression} IS NOT NULL GROUP BY ${expression}`)
        .all() as Array<{ value: string; count: number }>;
      facets[name] = Object.fromEntries(rows.map((row) => [row.value, row.count]));
    }
    return facets;
  }

  function changed(entity: "company" | "contact", action: string, id: string): void {
    bb.realtime.publish("changed", { entity, action, id });
  }

  function bulk(
    entity: "company" | "contact",
    ids: readonly string[],
    action: (id: string) => void,
  ): { requested: number; succeeded: number; failed: number; message: string | null } {
    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        action(id);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        bb.log.warn(
          `CRM ${entity} bulk operation skipped ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return {
      requested: ids.length,
      succeeded,
      failed,
      message: failed === 0 ? null : `${failed} record${failed === 1 ? "" : "s"} could not be changed.`,
    };
  }

  function contactOutput(contact: StoredContact): ContactOutput {
    const company = contact.companyId
      ? (db.prepare(`
          SELECT id, name, domain, icon_url AS iconUrl, icon_dark_url AS iconDarkUrl,
            icon_tone AS iconTone, logo_url AS logoUrl
          FROM companies WHERE id = ?
        `).get(contact.companyId) as
          | {
              id: string;
              name: string;
              domain: string | null;
              iconUrl: string | null;
              iconDarkUrl: string | null;
              iconTone: string | null;
              logoUrl: string | null;
            }
          | undefined)
      : undefined;
    const deals = db.prepare(`
      SELECT deals.id, deals.name
      FROM deals
      INNER JOIN deal_contacts ON deal_contacts.deal_id = deals.id
      WHERE deal_contacts.contact_id = ? AND deals.archived_at IS NULL
      ORDER BY deals.created_at DESC
    `).all(contact.id) as Array<{ id: string; name: string }>;
    const isPrimaryContact =
      db.prepare("SELECT 1 FROM companies WHERE primary_contact_id = ? LIMIT 1").get(contact.id) !==
      undefined;
    return {
      ...contact,
      company: company ?? null,
      isPrimaryContact,
      deals,
      fields: {},
    };
  }

  function contactListOptions(input: ContactListInput): ContactListOptions {
    const sortBy =
      input.sort === "email" ||
      input.sort === "title" ||
      input.sort === "company" ||
      input.sort === "owner" ||
      input.sort === "createdAt" ||
      input.sort === "lastActivity"
        ? input.sort
        : "name";
    return {
      search: input.q,
      archivedOnly: input.archived,
      ownerIds: input.owner,
      companyIds: input.company,
      sources: input.source,
      titles: input.title,
      seniorities: input.seniority,
      functions: input.persona,
      sortBy,
      sortDirection: input.dir,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  function contactFacetCounts(): Record<string, Record<string, number>> {
    const facets: Record<string, Record<string, number>> = {};
    const definitions = [
      ["owner", "COALESCE(owner_id, 'unassigned')"],
      ["company", "COALESCE(company_id, 'unassigned')"],
      ["title", "title"],
      ["seniority", "seniority"],
      ["persona", "function"],
      ["source", "source"],
    ] as const;
    for (const [name, expression] of definitions) {
      const rows = db
        .prepare(`SELECT ${expression} AS value, COUNT(*) AS count FROM contacts WHERE archived_at IS NULL AND ${expression} IS NOT NULL GROUP BY ${expression}`)
        .all() as Array<{ value: string; count: number }>;
      facets[name] = Object.fromEntries(rows.map((row) => [row.value, row.count]));
    }
    return facets;
  }

  bb.rpc.register(rpcContract, {
    async status() {
      const { workspaceName, reportingCurrency } = await settings.get();
      return {
        version: CRM_PLUGIN_VERSION,
        schemaVersion: CRM_SCHEMA_VERSION,
        workspaceName,
        reportingCurrency,
      };
    },
    companies_list(input) {
      const options = companyListOptions(input);
      return {
        rows: companies.list(options).map(companyOutput),
        total: companies.count(options),
        facetCounts: facetCounts(),
      };
    },
    companies_get({ id }) {
      return companyOutput(companies.getRequired(id));
    },
    companies_create(input) {
      const company = companies.create(input);
      changed("company", "created", company.id);
      return companyOutput(company);
    },
    companies_update({ id, data }) {
      const { fields: _fields, ...record } = data;
      const company = companies.update(id, record);
      changed("company", "updated", company.id);
      return companyOutput(company);
    },
    companies_archive({ id }) {
      const company = companies.archive(id);
      changed("company", "archived", company.id);
      return companyOutput(company);
    },
    companies_restore({ id }) {
      const company = companies.restore(id);
      changed("company", "restored", company.id);
      return companyOutput(company);
    },
    companies_purge({ id }) {
      const company = companies.purge(id);
      changed("company", "purged", company.id);
      return companyOutput(company);
    },
    companies_bulkAssignOwner({ ids, ownerId }) {
      return bulk("company", ids, (id) => {
        companies.update(id, { ownerId });
        changed("company", "updated", id);
      });
    },
    companies_bulkArchive({ ids }) {
      return bulk("company", ids, (id) => {
        companies.archive(id);
        changed("company", "archived", id);
      });
    },
    companies_bulkRestore({ ids }) {
      return bulk("company", ids, (id) => {
        companies.restore(id);
        changed("company", "restored", id);
      });
    },
    companies_bulkPurge({ ids }) {
      return bulk("company", ids, (id) => {
        companies.purge(id);
        changed("company", "purged", id);
      });
    },
    contacts_list(input) {
      const options = contactListOptions(input);
      return {
        rows: contacts.list(options).map(contactOutput),
        total: contacts.count(options),
        facetCounts: contactFacetCounts(),
      };
    },
    contacts_get({ id }) {
      return contactOutput(contacts.getRequired(id));
    },
    contacts_create(input) {
      const contact = contacts.create(input);
      changed("contact", "created", contact.id);
      return contactOutput(contact);
    },
    contacts_update({ id, data }) {
      const { fields: _fields, ...record } = data;
      const contact = contacts.update(id, record);
      changed("contact", "updated", contact.id);
      return contactOutput(contact);
    },
    contacts_archive({ id }) {
      const contact = contacts.archive(id);
      changed("contact", "archived", contact.id);
      return contactOutput(contact);
    },
    contacts_restore({ id }) {
      const contact = contacts.restore(id);
      changed("contact", "restored", contact.id);
      return contactOutput(contact);
    },
    contacts_purge({ id }) {
      const contact = contacts.purge(id);
      changed("contact", "purged", contact.id);
      return contactOutput(contact);
    },
    contacts_bulkAssignOwner({ ids, ownerId }) {
      return bulk("contact", ids, (id) => {
        contacts.update(id, { ownerId });
        changed("contact", "updated", id);
      });
    },
    contacts_bulkAssignCompany({ ids, companyId }) {
      return bulk("contact", ids, (id) => {
        contacts.update(id, { companyId });
        changed("contact", "updated", id);
      });
    },
    contacts_bulkArchive({ ids }) {
      return bulk("contact", ids, (id) => {
        contacts.archive(id);
        changed("contact", "archived", id);
      });
    },
    contacts_bulkRestore({ ids }) {
      return bulk("contact", ids, (id) => {
        contacts.restore(id);
        changed("contact", "restored", id);
      });
    },
    contacts_bulkPurge({ ids }) {
      return bulk("contact", ids, (id) => {
        contacts.purge(id);
        changed("contact", "purged", id);
      });
    },
  });

  bb.cli.register({
    name: "crm",
    summary: "Manage CRM records, activities, agents, and integrations",
    commands: [
      {
        name: "status",
        summary: "Show CRM extension status",
        usage: "bb crm status",
      },
    ],
    async run(argv) {
      const command = argv[0] ?? "status";
      if (command !== "status") {
        return {
          exitCode: 2,
          stderr: `Unknown CRM command: ${command}\nRun: bb crm status`,
        };
      }
      const { workspaceName, reportingCurrency } = await settings.get();
      return {
        exitCode: 0,
        stdout: [
          `CRM ${CRM_PLUGIN_VERSION}`,
          `Workspace: ${workspaceName}`,
          `Reporting currency: ${reportingCurrency}`,
          `Schema: ${CRM_SCHEMA_VERSION}`,
        ].join("\n"),
      };
    },
  });

  bb.log.info(`CRM ${CRM_PLUGIN_VERSION} loaded`);
}
