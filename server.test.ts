import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

describe("CRM plugin foundation", () => {
  it("registers status RPC and CLI over migrated storage", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "crm",
      settings: {
        workspaceName: "Revenue",
        reportingCurrency: "EUR",
      },
    });

    await plugin(bb);

    await expect(harness.behavior.callRpc("status", null)).resolves.toEqual({
      version: "0.1.0",
      schemaVersion: 2,
      workspaceName: "Revenue",
      reportingCurrency: "EUR",
    });

    const result = await harness.behavior.runCli(["status"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Workspace: Revenue");
    expect(result.stdout).toContain("Reporting currency: EUR");

    await harness.lifecycle.dispose();
  });

  it("rejects unknown CLI commands", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const result = await harness.behavior.runCli(["unknown"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown CRM command");

    await harness.lifecycle.dispose();
  });

  it("persists the typed company RPC lifecycle and publishes changes", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm" });
    await plugin(bb);

    const acme = await harness.behavior.callRpc("companies_create", {
      name: "Acme",
      domain: "https://www.acme.example/pricing",
      ownerId: "owner_1",
    });
    expect(acme).toMatchObject({
      name: "Acme",
      domain: "acme.example",
      ownerId: "owner_1",
      contactCount: 0,
      openDealCount: 0,
      fields: {},
    });

    const listed = await harness.behavior.callRpc("companies_list", {
      q: "acme.example",
    });
    expect(listed).toMatchObject({ total: 1 });
    expect((listed as { rows: Array<{ id: string }> }).rows).toHaveLength(1);

    const id = (acme as { id: string }).id;
    const archived = await harness.behavior.callRpc("companies_archive", { id });
    expect(archived).toMatchObject({ id, archivedAt: expect.any(String) });
    await expect(
      harness.behavior.callRpc("companies_list", { archived: true }),
    ).resolves.toMatchObject({ total: 1 });

    await expect(
      harness.behavior.callRpc("companies_bulkRestore", { ids: [id, "missing"] }),
    ).resolves.toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(harness.realtimeSignals).toEqual(
      expect.arrayContaining([
        { channel: "changed", payload: { entity: "company", action: "created", id } },
        { channel: "changed", payload: { entity: "company", action: "restored", id } },
      ]),
    );

    await harness.lifecycle.dispose();
  });
});
