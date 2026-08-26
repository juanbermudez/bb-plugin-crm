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

import type {
  CompanyListOutput,
  Contact,
  Deal,
  DealListOutput,
} from "../../../contracts/core.js";
import { DealsView, type DealsRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn(async (method: string) =>
    method === "savedViews_list" || method === "fields_list" || method === "fields_values_list" ? [] : null,
  ) }),
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

function companyListResult(): CompanyListOutput {
  return {
    rows: [{ id: "cmp_acme", name: "Acme Corporation", domain: "acme.example", fields: {} }],
    total: 1,
    facetCounts: {},
  };
}

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "deals_list") return listResult();
      if (method === "companies_list") return companyListResult();
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
  it("loads status-filtered deal rows and opens the related contacts tab", async () => {
    const rpc = makeRpc();
    const onOpenRelatedRecord = vi.fn();
    render(
      <DealsView
        rpcClient={rpc}
        onOpenRelatedRecord={onOpenRelatedRecord}
      />,
    );

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
    expect(screen.getByRole("list", { name: "Deal contacts" })).toBeDefined();
    expect(screen.getByText("Ada Lovelace")).toBeDefined();
    expect(screen.getByText("Champion")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    expect(onOpenRelatedRecord).toHaveBeenCalledWith("contact", "con_ada");
    expect(rpc.call).toHaveBeenCalledWith("deals_get", { id: "deal_acme_expand" });
  });

  it("marks archived related contacts while keeping them visible", async () => {
    const relatedDeal: Deal = {
      ...deal,
      contacts: [{
        id: "con_archived",
        firstName: "Archived",
        lastName: "Contact",
        email: "archived@example.com",
        title: "Former buyer",
        imageUrl: null,
        role: null,
        archivedAt: "2026-08-25T00:00:00.000Z",
      }],
    };
    const rpc = makeRpc(async (method) => {
      if (method === "deals_list") return listResult([relatedDeal]);
      if (method === "deals_get") return relatedDeal;
      return relatedDeal;
    });
    render(<DealsView rpcClient={rpc} />);

    fireEvent.click(await screen.findByRole("row", { name: /Open Acme Expansion/ }));
    const drawer = await screen.findByRole("dialog", { name: "Acme Expansion" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Contacts" }));
    const contacts = within(drawer).getByRole("list", { name: "Deal contacts" });
    expect(within(contacts).getByText("Archived")).toBeDefined();
  });

  it("restores a deep-linked drawer tab and reports tab changes", async () => {
    const onTabChange = vi.fn();
    const rpc = makeRpc();
    render(
      <DealsView
        rpcClient={rpc}
        initialRecordId={deal.id}
        initialTab="contacts"
        onTabChange={onTabChange}
      />,
    );

    const drawer = await screen.findByRole("dialog", { name: "Acme Expansion" });
    expect(within(drawer).getByRole("tab", { name: "Contacts" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(within(drawer).getByRole("tab", { name: "Overview" }));
    expect(onTabChange).toHaveBeenCalledWith("overview", deal.id);
  });

  it("shows an empty state when a deal has no related contacts", async () => {
    const noContacts = { ...deal, contacts: [] };
    const rpc = makeRpc(async (method) => {
      if (method === "deals_list") return listResult([noContacts]);
      if (method === "deals_get") return noContacts;
      return noContacts;
    });
    render(<DealsView rpcClient={rpc} />);

    await screen.findByText("Acme Expansion");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Expansion/ }));
    await screen.findByRole("dialog", { name: "Acme Expansion" });
    fireEvent.click(screen.getByRole("tab", { name: "Contacts" }));

    expect(screen.getByText("No contacts linked")).toBeDefined();
    expect(screen.getByText("Contacts assigned to this deal will appear here.")).toBeDefined();
  });

  it("attaches, edits, and detaches a same-company deal contact", async () => {
    let current = deal;
    const contactRecord: Contact = {
      id: "con_ada",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      title: "VP Engineering",
      companyId: "cmp_acme",
      ownerId: "usr_juan",
      fields: {},
    };
    const rpc = makeRpc(async (method, input) => {
      if (method === "deals_list") return listResult([current]);
      if (method === "deals_get") return current;
      if (method === "contacts_list") {
        return { rows: [contactRecord], total: 1, facetCounts: {} };
      }
      if (method === "deals_contacts_updateRole") {
        const { role } = input as { role: string | null };
        current = {
          ...current,
          contacts: current.contacts?.map((item) =>
            item.id === "con_ada" ? { ...item, role } : item,
          ),
        };
        return current;
      }
      if (method === "deals_contacts_detach") {
        current = { ...current, contacts: [] };
        return current;
      }
      if (method === "deals_contacts_attach") {
        const { role } = input as { role: string | null };
        current = {
          ...current,
          contacts: [{
            id: contactRecord.id,
            firstName: contactRecord.firstName,
            lastName: contactRecord.lastName ?? null,
            email: contactRecord.email ?? null,
            title: contactRecord.title ?? null,
            imageUrl: null,
            role,
          }],
        };
        return current;
      }
      return current;
    });
    render(<DealsView rpcClient={rpc} />);

    await screen.findByText("Acme Expansion");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Expansion/ }));
    await screen.findByRole("dialog", { name: "Acme Expansion" });
    fireEvent.click(screen.getByRole("tab", { name: "Contacts" }));

    fireEvent.click(screen.getByRole("button", { name: "Role for Ada Lovelace" }));
    const roleInput = screen.getByLabelText("Role for Ada Lovelace");
    fireEvent.change(roleInput, { target: { value: "Economic buyer" } });
    fireEvent.blur(roleInput);
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_contacts_updateRole", {
        dealId: deal.id,
        contactId: "con_ada",
        role: "Economic buyer",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Ada Lovelace from deal" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_contacts_detach", {
        dealId: deal.id,
        contactId: "con_ada",
      }),
    );
    expect(await screen.findByText("No contacts linked")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_list", expect.objectContaining({
        company: ["cmp_acme"],
        pageSize: 100,
      })),
    );
    fireEvent.focus(screen.getByRole("combobox", { name: "Contact" }));
    fireEvent.click(screen.getByRole("option", { name: /Ada Lovelace/ }));
    fireEvent.change(screen.getByLabelText("Role (optional)"), {
      target: { value: "Champion" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach contact" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_contacts_attach", {
        dealId: deal.id,
        contactId: "con_ada",
        role: "Champion",
      }),
    );
  });

  it("creates a deal with explicit stage, minor-unit amount, and currency", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "deals_list") return listResult();
      if (method === "companies_list") return companyListResult();
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
    fireEvent.focus(screen.getByRole("combobox", { name: "Company" }));
    fireEvent.click(screen.getByRole("option", { name: /Acme Corporation/ }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Owner" }));
    fireEvent.click(screen.getByRole("option", { name: /Juan Bermudez/ }));
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

  it("opens the create drawer for a routed header action", async () => {
    render(<DealsView rpcClient={makeRpc()} initialCreate />);

    expect(await screen.findByRole("dialog", { name: "New deal" })).toBeDefined();
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
          closedReason:
            stageInput.stage === "CLOSED_LOST"
              ? stageInput.closedReason ?? null
              : null,
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
    const drawer = await screen.findByRole("dialog", { name: "Acme Expansion" });

    fireEvent.change(within(drawer).getByLabelText("Stage"), {
      target: { value: "UNQUALIFIED_TO_BUY" },
    });
    expect(within(drawer).getByLabelText(/Qualification reason/).hasAttribute("required")).toBe(true);
    fireEvent.change(within(drawer).getByLabelText(/Qualification reason/), {
      target: { value: "No current need" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save stage" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_setStage", {
        id: "deal_acme_expand",
        stage: "UNQUALIFIED_TO_BUY",
        closedReason: "No current need",
      }),
    );
    await waitFor(() =>
      expect(
        (within(drawer).getByRole("button", { name: "Save stage" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );

    fireEvent.change(within(drawer).getByLabelText("Stage"), {
      target: { value: "CLOSED_LOST" },
    });
    expect(within(drawer).getByLabelText(/Close reason/).hasAttribute("required")).toBe(true);
    expect(
      (within(drawer).getByRole("button", { name: "Save stage" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(within(drawer).getByLabelText(/Close reason/), {
      target: { value: "Budget" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save stage" }));
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

    fireEvent.click(within(drawer).getByRole("button", { name: "Archive deal" }));
    await waitFor(() =>
      expect(within(drawer).getByRole("button", { name: "Restore deal" })).toBeDefined(),
    );
    expect(rpc.call).toHaveBeenCalledWith("deals_archive", { id: "deal_acme_expand" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close record drawer" }));
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
    const restoredDrawer = await screen.findByRole("dialog", { name: "Acme Expansion" });
    fireEvent.click(within(restoredDrawer).getByRole("button", { name: "Restore deal" }));
    await waitFor(() =>
      expect(within(restoredDrawer).getByRole("button", { name: "Archive deal" })).toBeDefined(),
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
    render(<DealsView rpcClient={rpc} />);
    await screen.findByText("Acme Expansion");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Expansion/ }));
    await screen.findByRole("dialog", { name: "Acme Expansion" });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    const confirmation = await screen.findByRole("dialog", {
      name: "Delete Acme Expansion permanently?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_purge", { id: "deal_acme_expand" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Acme Expansion" })).toBeNull(),
    );
  });

  it("opens an inline stage menu and requires a reason before closing a deal as lost", async () => {
    const rpc = makeRpc();
    render(<DealsView rpcClient={rpc} />);

    await screen.findByText("Acme Expansion");
    fireEvent.click(screen.getByRole("button", { name: "Demo booked" }));
    const menu = screen.getByRole("menu", {
      name: "Change stage for Acme Expansion",
    });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Closed lost" }));

    const dialog = await screen.findByRole("dialog", { name: "Close as lost" });
    expect(
      (within(dialog).getByRole("button", { name: "Save stage" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "Budget" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save stage" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_setStage", {
        id: deal.id,
        stage: "CLOSED_LOST",
        closedReason: "Budget",
      }),
    );
  });

  it("persists the required reason when a list deal becomes unqualified", async () => {
    const rpc = makeRpc();
    render(<DealsView rpcClient={rpc} />);

    await screen.findByText("Acme Expansion");
    fireEvent.click(screen.getByRole("button", { name: "Demo booked" }));
    const menu = screen.getByRole("menu", {
      name: "Change stage for Acme Expansion",
    });
    fireEvent.click(
      within(menu).getByRole("menuitemradio", { name: "Unqualified to buy" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Mark as unqualified" });
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "No current need" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save stage" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_setStage", {
        id: deal.id,
        stage: "UNQUALIFIED_TO_BUY",
        closedReason: "No current need",
      }),
    );
  });

  it("carries deal sorting/facets and selected ids to bulk stage RPC", async () => {
    const second = { ...deal, id: "deal_beta", name: "Beta Renewal" };
    const rpc = makeRpc(async (method, input) => {
      if (method === "deals_list") {
        return {
          ...listResult([deal, second]),
          facetCounts: {
            owner: { usr_juan: 2 },
            stage: { DEMO_BOOKED: 2 },
            closing: { "this-month": 2 },
          },
        };
      }
      if (method === "fields_filters") return [];
      if (method === "deals_bulkSetStage") {
        expect(input).toEqual({ ids: ["deal_acme_expand"], stage: "CONTRACT_SENT" });
        return { requested: 1, succeeded: 1, failed: 0, message: null };
      }
      return deal;
    });
    render(<DealsView rpcClient={rpc} />);

    await screen.findByText("Acme Expansion");
    fireEvent.change(screen.getByLabelText("Sort deals"), {
      target: { value: "amount" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByLabelText("Demo booked"));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "deals_list",
        expect.objectContaining({ sort: "amount", stage: ["DEMO_BOOKED"] }),
      ),
    );

    fireEvent.click(screen.getByLabelText("Select Acme Expansion"));
    fireEvent.change(screen.getByLabelText("Bulk stage"), {
      target: { value: "CONTRACT_SENT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change stage" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_bulkSetStage", {
        ids: ["deal_acme_expand"],
        stage: "CONTRACT_SENT",
      }),
    );
  });

  it("converts an optimistic deal amount edit to typed minor units", async () => {
    let current = deal;
    let resolveUpdate: ((value: Deal) => void) | undefined;
    const rpc = makeRpc(async (method, input) => {
      if (method === "deals_list") return listResult([current]);
      if (method === "deals_get") return current;
      if (method === "deals_update") {
        expect(input).toEqual({
          id: deal.id,
          data: { amountCents: 250050 },
        });
        current = { ...current, amountCents: 250050 };
        return new Promise<Deal>((resolve) => {
          resolveUpdate = resolve;
        });
      }
      return current;
    });

    render(<DealsView rpcClient={rpc} />);
    await screen.findByText("Acme Expansion");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Expansion/ }));
    await screen.findByRole("dialog", { name: "Acme Expansion" });

    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "2500.50" } });
    fireEvent.keyDown(amountInput, { key: "Enter" });
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_update", {
        id: deal.id,
        data: { amountCents: 250050 },
      }),
    );
    expect(
      within(screen.getByRole("dialog", { name: "Acme Expansion" })).getByText("$2,500.50"),
    ).toBeDefined();
    resolveUpdate?.(current);
  });
});
