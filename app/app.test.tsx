// @vitest-environment jsdom

import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

describe("CRM nav panel", () => {
  it("registers the native CRM clarification renderer", async () => {
    const app = await loadPluginApp(() => import("../app"));

    expect(app.pendingInteractions).toHaveLength(1);
    expect(app.pendingInteractions[0]?.id).toBe("crm-question");
  });

  it("renders the operational dashboard and records BB navigation", async () => {
    const app = await loadPluginApp(() => import("../app"));
    expect(app.navPanels).toHaveLength(5);
    expect(app.navPanels.map(({ title, path }) => ({ title, path }))).toEqual([
      { title: "CRM", path: "crm" },
      { title: "Companies", path: "companies" },
      { title: "Contacts", path: "contacts" },
      { title: "Deals", path: "deals" },
      { title: "Agents", path: "agents" },
    ]);

    const panel = app.navPanels.find(({ path }) => path === "crm")!;
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
    expect(slot.queryByRole("navigation")).toBeNull();
    expect(slot.queryByText("CRM", { selector: "header *" })).toBeNull();
    expect(slot.inspection.rpcCalls).toContainEqual({
      method: "dashboard_summary",
      input: { scope: "me" },
    });

    const headerSlot = renderSlot(
      { ...panel, component: panel.headerContent! },
      { subPath: "" },
      {
        rpc: {
          enrichment_queue: () => ({
            rows: [{
              id: "run_shell_queue",
              state: "running",
              line: "Research running in Queue researcher",
              createdAt: "2026-08-26T12:00:00.000Z",
              startedAt: "2026-08-26T12:01:00.000Z",
              finishedAt: null,
              subject: {
                kind: "company",
                id: "company_shell_queue",
                name: "Shell Queue Systems",
                iconUrl: null,
                iconDarkUrl: null,
                iconTone: null,
              },
              agentName: "Queue researcher",
              errorMessage: null,
            }],
            total: 1,
            scheduled: [],
            scheduledTotal: 0,
          }),
        },
      },
    );
    expect(headerSlot.getByRole("button", { name: /Enrichment queue/ })).toBeDefined();
    fireEvent.click(headerSlot.getByRole("button", { name: /Enrichment queue/ }));
    fireEvent.click(await headerSlot.findByRole("button", { name: "Open company Shell Queue Systems" }));
    expect(headerSlot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "companies",
      options: { subPath: "company_shell_queue" },
    });

    fireEvent.click(headerSlot.getByRole("button", { name: "New" }));
    const createMenu = headerSlot.getByRole("menu", { name: "Create CRM record" });
    const menuItems = within(createMenu).getAllByRole("menuitem");
    expect(menuItems).toHaveLength(6);
    expect(document.activeElement).toBe(menuItems[0]);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[1]);
    expect(within(createMenu).getByRole("menuitem", { name: "New note" })).toBeDefined();
    expect(within(createMenu).getByRole("menuitem", { name: "New task" })).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(headerSlot.queryByRole("menu", { name: "Create CRM record" })).toBeNull();
    expect(document.activeElement).toBe(headerSlot.getByRole("button", { name: "New" }));
    fireEvent.click(headerSlot.getByRole("button", { name: "New" }));
    fireEvent.mouseDown(document.body);
    expect(headerSlot.queryByRole("menu", { name: "Create CRM record" })).toBeNull();
    fireEvent.click(headerSlot.getByRole("button", { name: "New" }));
    const reopenedMenu = headerSlot.getByRole("menu", { name: "Create CRM record" });
    fireEvent.click(within(reopenedMenu).getByRole("menuitem", { name: "New company" }));
    expect(headerSlot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "companies",
      options: { subPath: "create/company" },
    });

    headerSlot.lifecycle.unmount();
    slot.lifecycle.unmount();
  });

  it("renders the Agents workspace from the BB route", async () => {
    const app = await loadPluginApp(() => import("../app"));
    const panel = app.navPanels.find(({ path }) => path === "agents")!;
    const slot = renderSlot(
      panel,
      { subPath: "" },
      {
        rpc: {
          agents_list: () => [
            {
              id: "agent_research",
              name: "Renewal researcher",
              description: "Find renewal risk.",
              status: "LIVE",
              createdById: "bb-user-local",
              currentVersionId: "version_1",
              archivedAt: null,
              deletedAt: null,
              createdAt: "2026-08-25T08:00:00.000Z",
              updatedAt: "2026-08-25T09:00:00.000Z",
              runCount: 2,
              currentVersion: {
                id: "version_1",
                number: 1,
                status: "DEPLOYED",
                deployedAt: "2026-08-25T09:00:00.000Z",
              },
            },
          ],
        },
      },
    );

    await slot.findByText("Renewal researcher");
    expect(slot.getByRole("heading", { name: "Agents" })).toBeDefined();
    expect(slot.inspection.rpcCalls).toContainEqual({
      method: "agents_list",
      input: {
        search: "",
        includeArchived: false,
        archivedOnly: false,
        limit: 100,
        offset: 0,
      },
    });
    slot.lifecycle.unmount();
  });

  it("routes company drawer tabs with the opened record id", async () => {
    const app = await loadPluginApp(() => import("../app"));
    const panel = app.navPanels.find(({ path }) => path === "companies")!;
    const company = {
      id: "cmp_acme",
      name: "Acme Corporation",
      domain: "acme.example",
      industry: "Software",
      ownerId: "local_user",
      contactCount: 0,
      openDealCount: 1,
      lastActivityAt: null,
      archivedAt: null,
      fields: {},
    };
    const slot = renderSlot(
      panel,
      { subPath: "cmp_acme" },
      {
        rpc: {
          companies_list: () => ({ rows: [company], total: 1, facetCounts: {} }),
          companies_get: () => company,
          savedViews_list: () => [],
          fields_list: () => [],
          fields_values_list: () => [],
        },
      },
    );

    await slot.findByRole("dialog", { name: "Acme Corporation" });
    fireEvent.click(slot.getByRole("tab", { name: "Contacts" }));
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "companies",
      options: { subPath: "cmp_acme/contacts" },
    });
    slot.lifecycle.unmount();
  });

  it("renders CRM configuration in BB Settings", async () => {
    const app = await loadPluginApp(() => import("../app"));
    expect(app.settingsSections).toHaveLength(1);
    const settings = app.settingsSections[0]!;
    expect(settings).toMatchObject({
      id: "crm-settings",
      title: "CRM",
    });
    const settingsSlot = renderSlot(
      settings,
      {},
      {
        rpc: {
          connections_list: () => [],
          tracking_sites_list: () => [],
          tracking_tokens_list: () => [],
          tracking_aggregates_list: () => [],
          status: () => ({ reportingCurrency: "USD" }),
          currency_rates_listEffective: () => [],
          currency_rates_listAudit: () => [],
        },
      },
    );
    expect(settingsSlot.queryByRole("heading", { name: "Settings" })).toBeNull();
    fireEvent.click(settingsSlot.getByRole("tab", { name: "Connections" }));
    await settingsSlot.findByRole("heading", { name: "Connections" });
    expect(settingsSlot.getByText(/OAuth authorization is not bundled/)).toBeDefined();
    expect(settingsSlot.inspection.rpcCalls).toContainEqual({
      method: "connections_list",
      input: {},
    });
    fireEvent.click(settingsSlot.getByRole("tab", { name: "Tracking" }));
    await settingsSlot.findByRole("heading", { name: "Tracking" });
    expect(settingsSlot.getByText("No tracking sites configured")).toBeDefined();
    expect(settingsSlot.inspection.rpcCalls).toContainEqual({
      method: "tracking_sites_list",
      input: { limit: 100, offset: 0 },
    });
    fireEvent.click(settingsSlot.getByRole("tab", { name: "Currency" }));
    const currencyTab = settingsSlot.getByRole("tab", { name: "Currency" });
    expect(currencyTab.getAttribute("aria-selected")).toBe("true");
    expect(settingsSlot.inspection.rpcCalls).toContainEqual({
      method: "currency_rates_listEffective",
      input: {},
    });
    settingsSlot.lifecycle.unmount();
  });
});
