// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Deal, DealListOutput } from "../../../contracts/core.js";
import { DealsView, type DealsRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn(async (method: string) => method === "savedViews_list" ? [] : null) }),
}));

afterEach(() => {
  cleanup();
});

const deal: Deal = {
  id: "deal_acme_expand",
  name: "Acme Expansion",
  description: "Expand the Acme deployment to the full revenue team.",
  companyId: "cmp_acme",
  company: {
    id: "cmp_acme",
    name: "Acme Corporation",
    domain: "acme.example",
    iconUrl: null,
    iconDarkUrl: null,
    iconTone: null,
    logoUrl: null,
  },
  ownerId: "usr_juan",
  owner: {
    id: "usr_juan",
    name: "Juan Bermudez",
    email: "juan@example.com",
    image: null,
  },
  stage: "DEMO_BOOKED",
  currency: "USD",
  amountCents: 125_000,
  baseAmountCents: 115_000,
  baseCurrency: "EUR",
  reportingCurrency: "EUR",
  fxRate: 0.92,
  fxRateAt: "2026-08-20T12:00:00.000Z",
  closedReason: null,
  stageChangedAt: "2026-08-20T12:00:00.000Z",
  expectedCloseDate: "2026-09-30",
  closedAt: null,
  lastActivityAt: "2026-08-20T12:00:00.000Z",
  archivedAt: null,
  fields: {},
  contacts: [
    {
      id: "con_ada",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      title: "VP Engineering",
      imageUrl: null,
      role: "Champion",
    },
  ],
};

function listResult(rows: Deal[] = [deal]): DealListOutput {
  return {
    rows,
    total: rows.length,
    facetCounts: {},
    openValueCents: rows.length > 0 ? 115_000 : null,
    reportingCurrency: "EUR",
    unconverted: { count: 0, currencies: [] },
  };
}

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "deals_list") return listResult();
      if (method === "deals_get") return deal;
      if (method === "deals_create") return deal;
      if (method === "deals_update") return deal;
      if (method === "deals_setStage") return deal;
      return deal;
    }),
  );
  return { call } as unknown as DealsRpcClient & { call: typeof call };
}

describe("DealsView", () => {
  it("loads status-filtered deal rows and opens the overview tabs", async () => {
    const rpc = makeRpc();
    render(<DealsView rpcClient={rpc} />);

    expect(await screen.findByText("Acme Expansion")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Deal" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Stage" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Close date" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Last activity" })).toBeDefined();
    expect(screen.getByText("Demo booked")).toBeDefined();
    expect(screen.getByText("$1,250.00")).toBeDefined();
    expect(screen.getByText(/Open pipeline \(EUR\)/)).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith(
      "deals_list",
      expect.objectContaining({ status: "open", page: 1, pageSize: 25, archived: false }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "deals_list",
        expect.objectContaining({ status: "closed", archived: false }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "deals_list",
        expect.objectContaining({ status: "all", archived: false }),
      ),
    );

    fireEvent.click(screen.getByRole("row", { name: /Open Acme Expansion/ }));
    const drawer = await screen.findByRole("dialog", { name: "Acme Expansion" });
    expect(within(drawer).getByText("Frozen base amount")).toBeDefined();
    expect(within(drawer).getByText("€1,150.00")).toBeDefined();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Contacts" }));
    expect(screen.getByText("Contacts is staged next")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("deals_get", { id: "deal_acme_expand" });
  });

  it("creates a deal with explicit stage, minor-unit amount, and currency", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "deals_list") return listResult();
      if (method === "deals_create") return { ...deal, id: "deal_new" };
      if (method === "deals_get") return deal;
      return deal;
    });
    render(<DealsView rpcClient={rpc} />);
    await screen.findByText("Acme Expansion");

    fireEvent.click(screen.getByRole("button", { name: "New deal" }));
    expect(screen.getByRole("dialog", { name: "New deal" })).toBeDefined();
    fireEvent.change(screen.getByLabelText("Deal name"), {
      target: { value: "New Expansion" },
    });
    fireEvent.change(screen.getByLabelText("Company ID"), {
      target: { value: "cmp_acme" },
    });
    fireEvent.change(screen.getByLabelText("Owner ID"), {
      target: { value: "usr_juan" },
    });
    fireEvent.change(screen.getByLabelText("Stage"), {
      target: { value: "CONTRACT_SENT" },
    });
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "EUR" },
    });
    fireEvent.change(screen.getByLabelText(/Amount \(minor units\)/), {
      target: { value: "250000" },
    });
    fireEvent.change(screen.getByLabelText(/Expected close date/), {
      target: { value: "2026-10-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create deal" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_create", {
        name: "New Expansion",
        companyId: "cmp_acme",
        ownerId: "usr_juan",
        stage: "CONTRACT_SENT",
        amountCents: 250000,
        currency: "EUR",
        expectedCloseDate: "2026-10-31",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New deal" })).toBeNull(),
    );
  });

  it("sets a stage with a lost reason and archives/restores a deep-linked deal", async () => {
    let current = deal;
    const onRecordIdChange = vi.fn();
    const rpc = makeRpc(async (method, input) => {
      if (method === "deals_list") {
        const archived = (input as { archived?: boolean }).archived === true;
        return listResult(archived || !current.archivedAt ? [current] : []);
      }
      if (method === "deals_get") return current;
      if (method === "deals_setStage") {
        const stageInput = input as { stage: Deal["stage"]; closedReason?: string };
        current = {
          ...current,
          stage: stageInput.stage,
          closedReason: stageInput.closedReason ?? null,
          closedAt: stageInput.stage === "CLOSED_LOST" ? "2026-08-25T00:00:00.000Z" : null,
        };
        return current;
      }
      if (method === "deals_archive") {
        current = { ...current, archivedAt: "2026-08-25T00:00:00.000Z" };
        return current;
      }
      if (method === "deals_restore") {
        current = { ...current, archivedAt: null };
        return current;
      }
      return current;
    });
    render(
      <DealsView
        rpcClient={rpc}
        initialRecordId="deal_acme_expand"
        onRecordIdChange={onRecordIdChange}
      />,
    );
    await screen.findByRole("dialog", { name: "Acme Expansion" });

    fireEvent.change(screen.getByLabelText("Stage"), {
      target: { value: "CLOSED_LOST" },
    });
    expect(screen.getByLabelText(/Close reason/).hasAttribute("required")).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Save stage" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(/Close reason/), {
      target: { value: "Budget" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save stage" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_setStage", {
        id: "deal_acme_expand",
        stage: "CLOSED_LOST",
        closedReason: "Budget",
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("Closed lost").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive deal" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Restore deal" })).toBeDefined(),
    );
    expect(rpc.call).toHaveBeenCalledWith("deals_archive", { id: "deal_acme_expand" });
    fireEvent.click(screen.getByRole("button", { name: "Close record drawer" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Acme Expansion" })).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "deals_list",
        expect.objectContaining({ archived: true }),
      ),
    );
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Expansion/ }));
    await screen.findByRole("dialog", { name: "Acme Expansion" });
    fireEvent.click(screen.getByRole("button", { name: "Restore deal" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Archive deal" })).toBeDefined(),
    );
    expect(rpc.call).toHaveBeenCalledWith("deals_restore", { id: "deal_acme_expand" });
    expect(onRecordIdChange).toHaveBeenCalledWith("deal_acme_expand");
    expect(onRecordIdChange).toHaveBeenCalledWith(null);
  });

  it("purges an archived deal after confirmation", async () => {
    const archived = { ...deal, archivedAt: "2026-08-25T00:00:00.000Z" };
    const rpc = makeRpc(async (method) => {
      if (method === "deals_list") return listResult([archived]);
      if (method === "deals_get") return archived;
      if (method === "deals_purge") return archived;
      return archived;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DealsView rpcClient={rpc} />);
    await screen.findByText("Acme Expansion");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Expansion/ }));
    await screen.findByRole("dialog", { name: "Acme Expansion" });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_purge", { id: "deal_acme_expand" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Acme Expansion" })).toBeNull(),
    );
    expect(confirm).toHaveBeenCalledWith(
      "Delete Acme Expansion permanently? This cannot be undone.",
    );
    confirm.mockRestore();
  });
});
