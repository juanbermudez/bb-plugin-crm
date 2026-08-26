// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActivityEntry,
  CompleteActivityInput,
  DashboardSummaryInput,
  DashboardSummaryOutput,
} from "../../../contracts/core.js";
import { DashboardView } from "./index.js";
import type { DashboardRpcClient } from "./rpc.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

function summary(scope: "me" | "everyone" = "me"): DashboardSummaryOutput {
  return {
    scope,
    reportingCurrency: "USD",
    unconverted: { count: 1, currencies: ["EUR"] },
    pipeline: {
      stages: [
        { stage: "DEMO_BOOKED", count: 2, valueCents: 125_000 },
        { stage: "QUALIFIED_TO_BUY", count: 1, valueCents: 75_000 },
      ],
      totalCents: 200_000,
      totalDeals: 3,
    },
    wonThisMonth: { count: 2, valueCents: 100_000 },
    wonPrevMonth: { count: 1, valueCents: 50_000 },
    performance: {
      windowDays: 90,
      wins: 2,
      losses: 1,
      winRate: 2 / 3,
      avgDealCents: 50_000,
      avgCycleDays: 14,
    },
    trend: [
      { month: "Mar 2026", won: 25_000, created: 60_000 },
      { month: "Apr 2026", won: 40_000, created: 80_000 },
      { month: "May 2026", won: 0, created: 30_000 },
      { month: "Jun 2026", won: 60_000, created: 100_000 },
      { month: "Jul 2026", won: 75_000, created: 100_000 },
      { month: "Aug 2026", won: 100_000, created: 125_000 },
    ],
    closingThisMonthTotal: { count: 1, valueCents: 125_000 },
    biggestOpen: [
      {
        id: "deal_acme",
        name: "Acme expansion",
        stage: "DEMO_BOOKED",
        currency: "USD",
        company: {
          id: "cmp_acme",
          name: "Acme Corporation",
          iconUrl: null,
          iconDarkUrl: null,
          iconTone: null,
        },
        owner: {
          id: "usr_local",
          name: "Local user",
          email: "local@example.com",
          image: null,
        },
        amountCents: 125_000,
        baseAmountCents: 125_000,
        expectedCloseDate: "2026-08-31T00:00:00.000Z",
        stageChangedAt: "2026-08-20T12:00:00.000Z",
      },
    ],
    overdueTasks: [
      {
        id: "task_follow_up",
        subject: "Follow up with Acme",
        company: { id: "cmp_acme", name: "Acme Corporation" },
        deal: { id: "deal_acme", name: "Acme expansion" },
        dueAt: "2026-08-20T12:00:00.000Z",
      },
    ],
    recentActivity: [
      {
        id: "activity_note",
        type: "NOTE",
        subject: "Pricing discussion",
        body: "Customer asked for a revised rollout plan.",
        createdBy: {
          id: "usr_local",
          name: "Local user",
          email: "local@example.com",
          image: null,
        },
        company: { id: "cmp_acme", name: "Acme Corporation" },
        deal: { id: "deal_acme", name: "Acme expansion" },
        createdAt: "2026-08-22T12:00:00.000Z",
        meta: {},
      },
    ],
  };
}

function makeRpc(
  implementation?: (input: DashboardSummaryInput) => Promise<DashboardSummaryOutput>,
  completeImplementation?: (input: CompleteActivityInput) => Promise<ActivityEntry>,
) {
  const call = vi.fn(
    async (
      method: "dashboard_summary" | "activity_complete",
      input: DashboardSummaryInput | CompleteActivityInput,
    ) => {
      if (method === "activity_complete") {
        return completeImplementation
          ? completeImplementation(input)
          : ({} as ActivityEntry);
      }
      return implementation
        ? implementation(input as DashboardSummaryInput)
        : summary((input as DashboardSummaryInput).scope);
    },
  );
  return { call } as unknown as DashboardRpcClient & { call: typeof call };
}

const completedTask: ActivityEntry = {
  id: "task_follow_up",
  type: "TASK",
  subject: "Follow up with Acme",
  body: null,
  occurredAt: "2026-08-20T12:00:00.000Z",
  dueAt: "2026-08-20T12:00:00.000Z",
  completedAt: "2026-08-26T12:00:00.000Z",
  meta: {},
  createdAt: "2026-08-20T12:00:00.000Z",
  createdBy: {
    id: "usr_local",
    name: "Local user",
    email: "local@example.com",
    image: null,
  },
  company: { id: "cmp_acme", name: "Acme Corporation" },
  contact: null,
  deal: { id: "deal_acme", name: "Acme expansion" },
  emailThread: null,
  calendarEvent: null,
};

describe("DashboardView", () => {
  it("renders the typed summary and refreshes when scope changes", async () => {
    const rpc = makeRpc();
    render(<DashboardView rpcClient={rpc} />);

    expect(await screen.findByText("Open pipeline")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Open pipeline by stage" })).toBeDefined();
    expect(screen.getByText("Closed won this month")).toBeDefined();
    expect(screen.getByText("Closed won vs. new pipeline")).toBeDefined();
    expect(screen.getByRole("table", { name: "Open pipeline by stage" })).toBeDefined();
    expect(screen.getByRole("table", { name: "Six-month deal value trend by month" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Open biggest deal Acme expansion" })).toBeDefined();
    expect(screen.getByText("Follow up with Acme")).toBeDefined();
    expect(screen.getByText("Pricing discussion")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("dashboard_summary", { scope: "me" });

    const everyone = screen.getByRole("button", { name: "Everyone" });
    fireEvent.click(everyone);
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("dashboard_summary", { scope: "everyone" }),
    );
    expect(everyone.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps loading failures actionable and exposes empty queues", async () => {
    const rpc = makeRpc(async () => {
      throw new Error("RPC offline");
    });
    render(<DashboardView rpcClient={rpc} />);

    expect((await screen.findByRole("alert")).textContent).toContain("RPC offline");
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();

    const emptyRpc = makeRpc(async (input) => ({
      ...summary(input.scope),
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
      trend: Array.from({ length: 6 }, (_, index) => ({
        month: `M${index + 1}`,
        won: 0,
        created: 0,
      })),
      closingThisMonthTotal: { count: 0, valueCents: 0 },
      biggestOpen: [],
      overdueTasks: [],
      recentActivity: [],
    }));
    cleanup();
    render(<DashboardView rpcClient={emptyRpc} />);
    expect(await screen.findByText("Your dashboard is clear")).toBeDefined();
    expect(screen.getByText("No open pipeline")).toBeDefined();
    expect(screen.getByText("No overdue tasks")).toBeDefined();
    expect(screen.getByText("No recent activity")).toBeDefined();
  });

  it("completes an overdue task optimistically and refreshes the summary", async () => {
    let refreshed = false;
    let resolveCompletion!: (activity: ActivityEntry) => void;
    const completion = new Promise<ActivityEntry>((resolve) => {
      resolveCompletion = resolve;
    });
    const rpc = makeRpc(
      async (input) => ({
        ...summary(input.scope),
        overdueTasks: refreshed ? [] : summary(input.scope).overdueTasks,
      }),
      async () => completion.then((activity) => {
        refreshed = true;
        return activity;
      }),
    );
    render(<DashboardView rpcClient={rpc} />);

    expect(await screen.findByText("Follow up with Acme")).toBeDefined();
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark as done" }));

    await waitFor(() => expect(screen.queryByText("Follow up with Acme")).toBeNull());
    expect(rpc.call).toHaveBeenCalledWith("activity_complete", {
      id: "task_follow_up",
      completed: true,
    });

    resolveCompletion(completedTask);
    await waitFor(() => {
      const summaryCalls = rpc.call.mock.calls.filter(
        ([method]) => method === "dashboard_summary",
      );
      expect(summaryCalls.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText("No overdue tasks")).toBeDefined();
  });

  it("routes dashboard deal, stage, activity, and currency actions", async () => {
    const onOpenRecord = vi.fn();
    const onOpenDeals = vi.fn();
    const onOpenCurrencySettings = vi.fn();
    render(
      <DashboardView
        rpcClient={makeRpc()}
        onOpenRecord={onOpenRecord}
        onOpenDeals={onOpenDeals}
        onOpenCurrencySettings={onOpenCurrencySettings}
      />,
    );

    expect(await screen.findByRole("button", { name: "Open biggest deal Acme expansion" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Open deals" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Demo booked deals" }));
    fireEvent.click(screen.getByRole("button", { name: "Open biggest deal Acme expansion" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Open deal Acme expansion" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Open company Acme Corporation" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Set reporting currency" }));

    expect(onOpenDeals).toHaveBeenNthCalledWith(1);
    expect(onOpenDeals).toHaveBeenNthCalledWith(2, "DEMO_BOOKED");
    expect(onOpenRecord).toHaveBeenCalledWith("deal", "deal_acme");
    expect(onOpenRecord).toHaveBeenCalledWith("company", "cmp_acme");
    expect(onOpenCurrencySettings).toHaveBeenCalledTimes(1);
  });
});
