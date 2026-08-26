import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./contracts/rpc.js";
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
