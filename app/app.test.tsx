// @vitest-environment jsdom

import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

describe("CRM nav panel", () => {
  it("renders the operational dashboard and records BB navigation", async () => {
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
          dashboard_summary: () => ({
            scope: "me",
            reportingCurrency: "EUR",
            unconverted: { count: 0, currencies: [] },
            pipeline: { stages: [], totalCents: 0, totalDeals: 0 },
            wonThisMonth: { count: 0, valueCents: 0 },
            wonPrevMonth: { count: 0, valueCents: 0 },
            performance: {
              windowDays: 90,
              wins: 0,
              losses: 0,
              winRate: null,
              avgDealCents: null,
              avgCycleDays: null,
            },
            trend: [
              { month: "Mar 2026", won: 0, created: 0 },
              { month: "Apr 2026", won: 0, created: 0 },
              { month: "May 2026", won: 0, created: 0 },
              { month: "Jun 2026", won: 0, created: 0 },
              { month: "Jul 2026", won: 0, created: 0 },
              { month: "Aug 2026", won: 0, created: 0 },
            ],
            closingThisMonthTotal: { count: 0, valueCents: 0 },
            biggestOpen: [],
            overdueTasks: [],
            recentActivity: [],
          }),
        },
      },
    );

    await slot.findByText("Open pipeline");
    expect(slot.getByText("Your dashboard is clear")).toBeDefined();
    expect(slot.getByText(/0 open deals · EUR/)).toBeDefined();
    expect(slot.inspection.rpcCalls).toContainEqual({
      method: "dashboard_summary",
      input: { scope: "me" },
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
