import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Company as CompanyOutput, CompanyListInput } from "./contracts/core.js";
import { rpcContract } from "./contracts/rpc.js";
import {
  createCompanyStore,
  type Company as StoredCompany,
  type CompanyListOptions,
} from "./db/companies.js";
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

  function changed(action: string, id: string): void {
    bb.realtime.publish("changed", { entity: "company", action, id });
  }

  function bulk(
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
          `CRM company bulk operation skipped ${id}: ${error instanceof Error ? error.message : String(error)}`,
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
      changed("created", company.id);
      return companyOutput(company);
    },
    companies_update({ id, data }) {
      const { fields: _fields, ...record } = data;
      const company = companies.update(id, record);
      changed("updated", company.id);
      return companyOutput(company);
    },
    companies_archive({ id }) {
      const company = companies.archive(id);
      changed("archived", company.id);
      return companyOutput(company);
    },
    companies_restore({ id }) {
      const company = companies.restore(id);
      changed("restored", company.id);
      return companyOutput(company);
    },
    companies_purge({ id }) {
      const company = companies.purge(id);
      changed("purged", company.id);
      return companyOutput(company);
    },
    companies_bulkAssignOwner({ ids, ownerId }) {
      return bulk(ids, (id) => {
        companies.update(id, { ownerId });
        changed("updated", id);
      });
    },
    companies_bulkArchive({ ids }) {
      return bulk(ids, (id) => {
        companies.archive(id);
        changed("archived", id);
      });
    },
    companies_bulkRestore({ ids }) {
      return bulk(ids, (id) => {
        companies.restore(id);
        changed("restored", id);
      });
    },
    companies_bulkPurge({ ids }) {
      return bulk(ids, (id) => {
        companies.purge(id);
        changed("purged", id);
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
