// @vitest-environment jsdom

import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

describe("CRM nav panel", () => {
  it("renders the dashboard status and records BB navigation", async () => {
    const app = await loadPluginApp(() => import("../app"));
    expect(app.navPanels).toHaveLength(1);

    const panel = app.navPanels[0]!;
    expect(panel).toMatchObject({
      id: "crm",
      title: "CRM",
      icon: "Target",
      path: "crm",
    });

    const slot = renderSlot(
      panel,
      { subPath: "dashboard" },
      {
        rpc: {
          status: () => ({
            version: "0.1.0",
            schemaVersion: 1,
            workspaceName: "Acme Revenue",
            reportingCurrency: "EUR",
          }),
        },
      },
    );

    await slot.findByText("Acme Revenue");
    expect(slot.getByText("EUR")).toBeDefined();
    expect(slot.getByText("0.1.0")).toBeDefined();
    expect(slot.getByText("1")).toBeDefined();
    expect(slot.inspection.rpcCalls).toContainEqual({
      method: "status",
      input: null,
    });

    fireEvent.click(slot.getByRole("button", { name: "Companies" }));
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "crm",
      options: { subPath: "companies" },
    });

    slot.lifecycle.unmount();
  });
});
