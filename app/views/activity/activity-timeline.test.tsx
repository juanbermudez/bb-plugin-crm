// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActivityEntry,
  TimelineCountsOutput,
  TimelineOutput,
} from "../../../contracts/core.js";
import { ActivityTimeline, type ActivityRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

const author = {
  id: "usr_juan",
  name: "Juan Bermudez",
  email: "juan@example.com",
  image: null,
} as const;

function activity(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "act_note",
    type: "NOTE",
    subject: "Kickoff notes",
    body: "Confirm the discovery agenda.",
    occurredAt: "2026-08-25T14:00:00.000Z",
    dueAt: null,
    completedAt: null,
    meta: {},
    createdAt: "2026-08-25T14:00:00.000Z",
    createdBy: author,
    company: { id: "cmp_acme", name: "Acme Corporation" },
    contact: null,
    deal: null,
    emailThread: null,
    calendarEvent: null,
    ...overrides,
  };
}

const counts: TimelineCountsOutput = {
  all: 2,
  notes: 1,
  upcoming: 1,
  done: 0,
  email: 0,
  meetings: 0,
};

function makeRpc(
  implementation: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(implementation);
  return { call } as unknown as ActivityRpcClient & { call: typeof call };
}

describe("ActivityTimeline", () => {
  it("loads an anchored timeline, renders source counts, due dates, and day groups", async () => {
    const note = activity();
    const task = activity({
      id: "act_task",
      type: "TASK",
      subject: "Send proposal",
      body: "Include the implementation timeline.",
      dueAt: "2026-08-27T16:00:00.000Z",
    });
    const rpc = makeRpc(async (method) => {
      if (method === "activity_timeline") {
        return { entries: [note, task], nextCursor: "cursor-old" } satisfies TimelineOutput;
      }
      if (method === "activity_timelineCounts") return counts;
      return task;
    });

    render(
      <ActivityTimeline
        anchor={{ companyId: "cmp_acme" }}
        rpcClient={rpc}
      />,
    );

    expect(await screen.findByText("Kickoff notes")).toBeDefined();
    expect(screen.getByText("Send proposal")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Aug 25, 2026" })).toBeDefined();
    expect(screen.getByText(/Due Aug 27, 2026/)).toBeDefined();
    expect(screen.getByRole("tab", { name: /All/ })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Upcoming/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Load older activity" })).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("activity_timeline", {
      companyId: "cmp_acme",
      filter: "all",
      limit: 30,
    });
    expect(rpc.call).toHaveBeenCalledWith("activity_timelineCounts", {
      companyId: "cmp_acme",
    });
  });

  it("changes source tabs and loads the next cursor page without losing prior rows", async () => {
    const current = activity();
    const older = activity({
      id: "act_older",
      subject: "Older note",
      occurredAt: "2026-08-20T14:00:00.000Z",
      createdAt: "2026-08-20T14:00:00.000Z",
    });
    const email = activity({
      id: "act_email",
      type: "EMAIL",
      subject: "Sent recap",
    });
    const rpc = makeRpc(async (method, input) => {
      if (method === "activity_timeline") {
        const timelineInput = input as { cursor?: string; filter?: string };
        if (timelineInput.filter === "email") {
          return { entries: [email], nextCursor: null } satisfies TimelineOutput;
        }
        if (timelineInput.cursor === "cursor-old") {
          return { entries: [older], nextCursor: null } satisfies TimelineOutput;
        }
        return { entries: [current], nextCursor: "cursor-old" } satisfies TimelineOutput;
      }
      if (method === "activity_timelineCounts") return counts;
      return current;
    });

    render(<ActivityTimeline anchor={{ contactId: "con_ada" }} rpcClient={rpc} />);
    expect(await screen.findByText("Kickoff notes")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Load older activity" }));
    expect(await screen.findByText("Older note")).toBeDefined();
    expect(screen.getByText("Kickoff notes")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("activity_timeline", {
      contactId: "con_ada",
      filter: "all",
      cursor: "cursor-old",
      limit: 30,
    });

    fireEvent.click(screen.getByRole("tab", { name: /Email/ }));
    expect(await screen.findByText("Sent recap")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("activity_timeline", {
      contactId: "con_ada",
      filter: "email",
      limit: 30,
    });
  });

  it("creates a task with the default BB-safe actor and due date", async () => {
    const created = activity({
      id: "act_follow_up",
      type: "TASK",
      subject: "Send quote",
      body: "Use the approved pricing sheet.",
      dueAt: "2026-08-26T12:00:00.000Z",
    });
    const rpc = makeRpc(async (method) => {
      if (method === "activity_timeline") {
        return { entries: [], nextCursor: null } satisfies TimelineOutput;
      }
      if (method === "activity_timelineCounts") return { ...counts, all: 0 };
      if (method === "activity_create") return created;
      return created;
    });

    render(<ActivityTimeline anchor={{ dealId: "deal_acme" }} rpcClient={rpc} />);
    await screen.findByRole("button", { name: "Add activity" });

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "TASK" },
    });
    fireEvent.change(screen.getByLabelText(/Subject/), {
      target: { value: "Send quote" },
    });
    fireEvent.change(screen.getByLabelText(/Details/), {
      target: { value: "Use the approved pricing sheet." },
    });
    fireEvent.change(screen.getByLabelText(/Due date/), {
      target: { value: "2026-08-26T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "activity_create",
        expect.objectContaining({
          dealId: "deal_acme",
          type: "TASK",
          createdById: "local_user",
          subject: "Send quote",
          body: "Use the approved pricing sheet.",
          dueAt: expect.stringMatching(/^2026-08-26T/),
        }),
      ),
    );
    expect(await screen.findByText("Send quote")).toBeDefined();
    expect(screen.getByText("Task added.")).toBeDefined();
  });

  it("completes and reopens task entries through the typed lifecycle RPC", async () => {
    const task = activity({
      id: "act_task",
      type: "TASK",
      subject: "Confirm attendees",
      dueAt: "2026-08-26T16:00:00.000Z",
    });
    const completed = { ...task, completedAt: "2026-08-25T15:00:00.000Z" };
    const rpc = makeRpc(async (method) => {
      if (method === "activity_timeline") {
        return { entries: [task], nextCursor: null } satisfies TimelineOutput;
      }
      if (method === "activity_timelineCounts") return counts;
      if (method === "activity_complete") return completed;
      return task;
    });

    render(<ActivityTimeline anchor={{ companyId: "cmp_acme" }} rpcClient={rpc} />);
    await screen.findByText("Confirm attendees");

    fireEvent.click(
      screen.getByRole("button", { name: "Complete task: Confirm attendees" }),
    );
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("activity_complete", {
        id: "act_task",
        completed: true,
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Reopen task: Confirm attendees" }),
    ).toBeDefined();
  });
});
