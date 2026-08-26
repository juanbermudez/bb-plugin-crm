// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EnrichmentQueue,
  type EnrichmentQueueRpcClient,
} from "./enrichment-queue.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn(async () => ({ rows: [], total: 0, scheduled: [], scheduledTotal: 0 })) }),
}));

afterEach(() => cleanup());

describe("global enrichment queue", () => {
  it("surfaces local run status and opens a related CRM record", async () => {
    const call = vi.fn(async () => ({
      rows: [
        {
          id: "run_running",
          state: "running" as const,
          line: "Research running in Queue researcher",
          createdAt: "2026-08-26T12:00:00.000Z",
          startedAt: "2026-08-26T12:01:00.000Z",
          finishedAt: null,
          subject: {
            kind: "company" as const,
            id: "company_queue",
            name: "Queue Systems",
            iconUrl: null,
            iconDarkUrl: null,
            iconTone: null,
          },
          agentName: "Queue researcher",
          errorMessage: null,
        },
        {
          id: "run_failed",
          state: "failed" as const,
          line: "Research failed: no verified result",
          createdAt: "2026-08-26T11:00:00.000Z",
          startedAt: "2026-08-26T11:01:00.000Z",
          finishedAt: "2026-08-26T11:02:00.000Z",
          subject: {
            kind: "contact" as const,
            id: "contact_queue",
            name: "Ada Lovelace",
            email: "ada@example.com",
            imageUrl: null,
          },
          agentName: "Queue researcher",
          errorMessage: "no verified result",
        },
      ],
      total: 2,
      scheduled: [
        {
          id: "activity:task_queue",
          due: "2026-08-27T09:00:00.000Z",
          createdAt: "2026-08-26T10:00:00.000Z",
          line: "CRM task scheduled",
          subject: {
            kind: "task" as const,
            id: "task_queue",
            name: "Review the renewal",
            related: { kind: "company" as const, id: "company_queue", name: "Queue Systems" },
          },
          agentName: null,
        },
      ],
      scheduledTotal: 1,
    }));
    const onOpen = vi.fn();

    render(
      <EnrichmentQueue
        rpcClient={{ call } as unknown as EnrichmentQueueRpcClient}
        onOpen={onOpen}
      />,
    );

    await waitFor(() => expect(call).toHaveBeenCalledWith("enrichment_queue", { limit: 25 }));
    const trigger = screen.getByRole("button", { name: /Enrichment queue/ });
    expect(trigger.textContent).toContain("Enrichment");
    expect(trigger.textContent).toContain("3");
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Enrichment queue" })).toBeDefined();
    expect(screen.getByText("Current work (2)")).toBeDefined();
    expect(screen.getByText("Running")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();
    expect(screen.getByText(/does not claim provider delivery/)).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Enrichment queue" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Enrichment queue" })).toBeNull());
    fireEvent.click(trigger);

    // Expand the scheduled section so due work is visible too.
    fireEvent.click(screen.getByRole("button", { name: "Scheduled (1)" }));
    expect(screen.getByText("Review the renewal")).toBeDefined();
    expect(screen.getByText("CRM task scheduled")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Open company Queue Systems" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({
      kind: "company",
      id: "company_queue",
    }));
  });
});
