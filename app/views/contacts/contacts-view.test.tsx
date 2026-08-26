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
  Contact,
  ContactListOutput,
  CompanyListOutput,
  DealStage,
} from "../../../contracts/core.js";
import { ContactsView, type ContactsRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn(async (method: string) =>
    method === "savedViews_list" || method === "fields_list" || method === "fields_values_list" ? [] : null,
  ) }),
}));

afterEach(() => {
  cleanup();
});

const contact: Contact = {
  id: "con_ada",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+1 555 0100",
  title: "VP Engineering",
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
  source: "MANUAL",
  deals: [{ id: "deal_1", name: "Expansion" }],
  lastActivityAt: "2026-08-20T12:00:00.000Z",
  archivedAt: null,
  fields: {},
};

function listResult(rows: Contact[] = [contact]): ContactListOutput {
  return { rows, total: rows.length, facetCounts: {} };
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
      if (method === "contacts_list") return listResult();
      if (method === "companies_list") return companyListResult();
      if (method === "contacts_get") return contact;
      if (method === "contacts_create") return contact;
      if (method === "contacts_update") return contact;
      return contact;
    }),
  );
  return { call } as unknown as ContactsRpcClient & { call: typeof call };
}

describe("ContactsView", () => {
  it("displays a portrait with initials fallback and saves an edited portrait URL", async () => {
    let current = { ...contact, imageUrl: "https://cdn.example/ada.jpg" };
    const rpc = makeRpc(async (method, input) => {
      if (method === "contacts_list") return listResult([current]);
      if (method === "contacts_get") return current;
      if (method === "contacts_update") {
        const data = (input as { data: { imageUrl?: string | null } }).data;
        current = { ...current, imageUrl: data.imageUrl ?? null };
        return current;
      }
      return current;
    });
    render(<ContactsView rpcClient={rpc} />);

    const row = await screen.findByRole("row", { name: /Open Ada Lovelace/ });
    const tableAvatar = within(row).getByRole("img", { name: "Ada Lovelace" });
    expect(tableAvatar.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example/ada.jpg",
    );

    fireEvent.click(row);
    const drawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    const drawerAvatar = within(drawer).getByRole("img", { name: "Ada Lovelace" });
    expect(drawerAvatar.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example/ada.jpg",
    );

    fireEvent.error(drawerAvatar.querySelector("img")!);
    expect(drawerAvatar.textContent).toContain("AL");

    fireEvent.click(within(drawer).getByRole("button", { name: "Photo URL" }));
    const photoInput = within(drawer).getByLabelText("Photo URL");
    fireEvent.change(photoInput, {
      target: { value: "https://cdn.example/ada-new.jpg" },
    });
    fireEvent.blur(photoInput);
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_update", {
        id: "con_ada",
        data: { imageUrl: "https://cdn.example/ada-new.jpg" },
      }),
    );
  });

  it("loads a searchable contact table and opens the related deals tab", async () => {
    const rpc = makeRpc();
    const onOpenRelatedRecord = vi.fn();
    render(
      <ContactsView
        rpcClient={rpc}
        onOpenRelatedRecord={onOpenRelatedRecord}
      />,
    );

    expect(await screen.findByText("Ada Lovelace")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Contact" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Title" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Email" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Deals" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Last activity" })).toBeDefined();
    expect(screen.getByText("Acme Corporation")).toBeDefined();
    expect(screen.getByText("VP Engineering")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith(
      "contacts_list",
      expect.objectContaining({
        q: "",
        sort: "createdAt",
        dir: "desc",
        page: 1,
        pageSize: 25,
        archived: false,
      }),
    );
    fireEvent.change(screen.getByLabelText("Search contacts"), {
      target: { value: "Ada" },
    });
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "contacts_list",
        expect.objectContaining({ q: "Ada", page: 1, archived: false }),
      ),
    );

    fireEvent.click(screen.getByRole("row", { name: /Open Ada Lovelace/ }));
    const drawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    expect(within(drawer).getAllByText("ada@example.com").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Deals" }));
    expect(screen.getByRole("list", { name: "Contact deals" })).toBeDefined();
    expect(screen.getByText("Expansion")).toBeDefined();
    expect(screen.getByText("deal_1")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Expansion" }));
    expect(onOpenRelatedRecord).toHaveBeenCalledWith("deal", "deal_1");
    expect(rpc.call).toHaveBeenCalledWith("contacts_get", { id: "con_ada" });
  });

  it("renders the computed We Know Them relationship summary", async () => {
    const relatedContact: Contact = {
      ...contact,
      relationship: {
        emails: 3,
        threads: 2,
        lastReplyAt: "2026-08-20T12:00:00.000Z",
        meetings: 1,
        nextMeeting: {
          title: "Planning session",
          startsAt: "2099-01-01T12:00:00.000Z",
        },
        colleagues: [
          { id: "con_grace", name: "Grace Hopper", title: "Compiler Engineer" },
        ],
      },
    };
    const rpc = makeRpc(async (method) => {
      if (method === "contacts_list") return listResult([relatedContact]);
      if (method === "contacts_get") return relatedContact;
      return relatedContact;
    });
    const onRecordIdChange = vi.fn();
    render(<ContactsView rpcClient={rpc} onRecordIdChange={onRecordIdChange} />);

    fireEvent.click(await screen.findByRole("row", { name: /Open Ada Lovelace/ }));
    const drawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    const summary = within(drawer).getByRole("region", { name: "We Know Them" });
    expect(within(summary).getByText("3")).toBeDefined();
    expect(within(summary).getByText("2")).toBeDefined();
    expect(within(summary).getByText("Planning session · Jan 1, 2099")).toBeDefined();
    expect(within(summary).getByText("Grace Hopper")).toBeDefined();
    expect(within(summary).getByText("Compiler Engineer")).toBeDefined();
    fireEvent.click(within(summary).getByRole("button", { name: "Grace Hopper" }));
    expect(onRecordIdChange).toHaveBeenCalledWith("con_grace");
  });

  it("offers source contact actions and can make a company contact primary", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "contacts_list") return listResult();
      if (method === "companies_list") return companyListResult();
      if (method === "contacts_get") return contact;
      if (method === "companies_setPrimaryContact") {
        return { id: "cmp_acme", primaryContactId: contact.id };
      }
      return contact;
    });
    const onOpenRelatedRecord = vi.fn();
    render(
      <ContactsView
        rpcClient={rpc}
        onOpenRelatedRecord={onOpenRelatedRecord}
      />,
    );

    fireEvent.click(await screen.findByRole("row", { name: /Open Ada Lovelace/ }));
    const drawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    expect(within(drawer).getByRole("link", { name: "Email" }).getAttribute("href"))
      .toBe("mailto:ada@example.com");
    expect(within(drawer).getByRole("link", { name: "Call" }).getAttribute("href"))
      .toBe("tel:+1 555 0100");
    fireEvent.click(within(drawer).getByRole("button", { name: "Company" }));
    expect(onOpenRelatedRecord).toHaveBeenCalledWith("company", "cmp_acme");
    fireEvent.click(within(drawer).getByRole("button", { name: "Make primary" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith(
      "companies_setPrimaryContact",
      { companyId: "cmp_acme", contactId: "con_ada" },
    ));
    expect(await within(drawer).findByText("Primary contact")).toBeDefined();
  });

  it("marks archived related deals while keeping them visible", async () => {
    const relatedContact: Contact = {
      ...contact,
      deals: [{
        id: "deal_archived",
        name: "Archived expansion",
        archivedAt: "2026-08-25T00:00:00.000Z",
      }],
    };
    const rpc = makeRpc(async (method) => {
      if (method === "contacts_list") return listResult([relatedContact]);
      if (method === "contacts_get") return relatedContact;
      return relatedContact;
    });
    render(<ContactsView rpcClient={rpc} />);

    fireEvent.click(await screen.findByRole("row", { name: /Open Ada Lovelace/ }));
    const drawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Deals" }));
    const deals = within(drawer).getByRole("list", { name: "Contact deals" });
    expect(within(deals).getByText("Archived")).toBeDefined();
  });

  it("changes related deal stages inline and requires a reason for terminal stages", async () => {
    let current: Contact = {
      ...contact,
      deals: [{ id: "deal_1", name: "Expansion", stage: "DEMO_BOOKED" }],
    };
    const rpc = makeRpc(async (method, input) => {
      if (method === "contacts_list") return listResult([current]);
      if (method === "contacts_get") return current;
      if (method === "deals_setStage") {
        const request = input as { id: string; stage: DealStage };
        current = {
          ...current,
          deals: current.deals?.map((deal) =>
            deal.id === request.id ? { ...deal, stage: request.stage } : deal,
          ),
        };
        return current;
      }
      return current;
    });
    render(<ContactsView rpcClient={rpc} />);

    fireEvent.click(await screen.findByRole("row", { name: /Open Ada Lovelace/ }));
    const drawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Deals" }));
    const deals = within(drawer).getByRole("list", { name: "Contact deals" });

    fireEvent.click(within(deals).getByRole("button", { name: "Demo booked" }));
    const stageMenu = await within(deals).findByRole("menu", {
      name: "Change stage for Expansion",
    });
    expect(
      within(stageMenu).getByRole("menuitemradio", { name: "Unqualified to buy" }),
    ).toBeDefined();
    fireEvent.click(
      within(stageMenu).getByRole("menuitemradio", { name: "Closed lost" }),
    );
    const lostDialog = await screen.findByRole("dialog", { name: "Close as lost" });
    const saveLost = within(lostDialog).getByRole("button", { name: "Save stage" });
    expect((saveLost as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(lostDialog).getByLabelText(/Reason/), {
      target: { value: "Budget" },
    });
    fireEvent.click(saveLost);
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_setStage", {
        id: "deal_1",
        stage: "CLOSED_LOST",
        closedReason: "Budget",
      }),
    );
    await waitFor(() =>
      expect(within(deals).getByRole("button", { name: "Closed lost" })).toBeDefined(),
    );
  });

  it("restores a deep-linked drawer tab and reports tab changes", async () => {
    const onTabChange = vi.fn();
    const rpc = makeRpc();
    render(
      <ContactsView
        rpcClient={rpc}
        initialRecordId={contact.id}
        initialTab="deals"
        onTabChange={onTabChange}
      />,
    );

    const drawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    expect(within(drawer).getByRole("tab", { name: "Deals" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(within(drawer).getByRole("tab", { name: "Overview" }));
    expect(onTabChange).toHaveBeenCalledWith("overview", contact.id);
  });

  it("shows an empty state when a contact has no related deals", async () => {
    const noDeals = { ...contact, deals: [] };
    const rpc = makeRpc(async (method) => {
      if (method === "contacts_list") return listResult([noDeals]);
      if (method === "contacts_get") return noDeals;
      return noDeals;
    });
    render(<ContactsView rpcClient={rpc} />);

    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByRole("row", { name: /Open Ada Lovelace/ }));
    await screen.findByRole("dialog", { name: "Ada Lovelace" });
    fireEvent.click(screen.getByRole("tab", { name: "Deals" }));

    expect(screen.getByText("No deals linked")).toBeDefined();
    expect(screen.getByText("Deals for this contact will appear here.")).toBeDefined();
  });

  it("creates a contact from the wide BB-native drawer form", async () => {
    const created: Contact = { ...contact, id: "con_grace", firstName: "Grace", lastName: "Hopper" };
    const rpc = makeRpc(async (method) => {
      if (method === "contacts_list") return listResult();
      if (method === "companies_list") return companyListResult();
      if (method === "contacts_create") return created;
      if (method === "contacts_get") return contact;
      return contact;
    });
    render(<ContactsView rpcClient={rpc} initialCreate />);
    await screen.findByText("Ada Lovelace");

    expect(screen.getByRole("dialog", { name: "New contact" })).toBeDefined();
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Grace" },
    });
    fireEvent.change(screen.getByLabelText("Last name (optional)"), {
      target: { value: "Hopper" },
    });
    fireEvent.change(screen.getByLabelText("Email (optional)"), {
      target: { value: "grace@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Title (optional)"), {
      target: { value: "Admiral" },
    });
    fireEvent.focus(screen.getByRole("combobox", { name: "Company" }));
    fireEvent.click(screen.getByRole("option", { name: /Acme Corporation/ }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Owner" }));
    fireEvent.click(screen.getByRole("option", { name: /Juan Bermudez/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create contact" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_create", {
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.com",
        title: "Admiral",
        companyId: "cmp_acme",
        ownerId: "usr_juan",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New contact" })).toBeNull(),
    );
  });

  it("supports deep-linked archive and restore with a controlled drawer id", async () => {
    let current = contact;
    const onRecordIdChange = vi.fn();
    const rpc = makeRpc(async (method, input) => {
      if (method === "contacts_list") {
        const archived = (input as { archived?: boolean }).archived === true;
        return listResult(archived || !current.archivedAt ? [current] : []);
      }
      if (method === "contacts_get") return current;
      if (method === "contacts_archive") {
        current = { ...current, archivedAt: "2026-08-25T00:00:00.000Z" };
        return current;
      }
      if (method === "contacts_restore") {
        current = { ...current, archivedAt: null };
        return current;
      }
      return current;
    });
    render(
      <ContactsView
        rpcClient={rpc}
        initialRecordId="con_ada"
        onRecordIdChange={onRecordIdChange}
      />,
    );
    await screen.findByRole("dialog", { name: "Ada Lovelace" });
    expect(rpc.call).toHaveBeenCalledWith("contacts_get", { id: "con_ada" });

    fireEvent.click(screen.getByRole("button", { name: "Archive contact" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Restore contact" })).toBeDefined(),
    );
    expect(rpc.call).toHaveBeenCalledWith("contacts_archive", { id: "con_ada" });

    fireEvent.click(screen.getByRole("button", { name: "Close record drawer" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ada Lovelace" })).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archived contacts" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "contacts_list",
        expect.objectContaining({ archived: true }),
      ),
    );
    fireEvent.click(screen.getByRole("row", { name: /Open Ada Lovelace/ }));
    await screen.findByRole("dialog", { name: "Ada Lovelace" });
    fireEvent.click(screen.getByRole("button", { name: "Restore contact" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Archive contact" })).toBeDefined(),
    );
    expect(rpc.call).toHaveBeenCalledWith("contacts_restore", { id: "con_ada" });
    expect(onRecordIdChange).toHaveBeenCalledWith("con_ada");
    expect(onRecordIdChange).toHaveBeenCalledWith(null);
  });

  it("purges an archived contact after confirmation", async () => {
    const archived = { ...contact, archivedAt: "2026-08-25T00:00:00.000Z" };
    const rpc = makeRpc(async (method) => {
      if (method === "contacts_list") return listResult([archived]);
      if (method === "contacts_get") return archived;
      if (method === "contacts_purge") return archived;
      return archived;
    });
    render(<ContactsView rpcClient={rpc} />);
    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByRole("row", { name: /Open Ada Lovelace/ }));
    await screen.findByRole("dialog", { name: "Ada Lovelace" });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    const confirmation = await screen.findByRole("dialog", {
      name: "Delete Ada Lovelace permanently?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_purge", { id: "con_ada" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ada Lovelace" })).toBeNull(),
    );
  });

  it("sends contact facets and sorting, supports clear-all chips, and assigns a company in bulk", async () => {
    const second = { ...contact, id: "con_grace", firstName: "Grace", lastName: "Hopper" };
    const rpc = makeRpc(async (method, input) => {
      if (method === "contacts_list") {
        return {
          ...listResult([contact, second]),
          facetCounts: {
            owner: { usr_juan: 2 },
            company: { cmp_acme: 2 },
            title: { "VP Engineering": 1 },
            source: { MANUAL: 2 },
          },
        };
      }
      if (method === "fields_filters") return [];
      if (method === "contacts_bulkAssignCompany") {
        expect(input).toEqual({ ids: ["con_ada"], companyId: "cmp_beta" });
        return { requested: 1, succeeded: 1, failed: 0, message: null };
      }
      return contact;
    });
    render(<ContactsView rpcClient={rpc} />);

    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByLabelText("Sort contacts"));
    fireEvent.click(screen.getByRole("option", { name: "Title" }));
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    fireEvent.click(screen.getByLabelText("VP Engineering"));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "contacts_list",
        expect.objectContaining({ sort: "title", title: ["VP Engineering"] }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "contacts_list",
        expect.objectContaining({ title: [], fields: {} }),
      ),
    );

    fireEvent.click(screen.getByLabelText("Select Ada Lovelace"));
    fireEvent.change(screen.getByLabelText("Bulk company ID"), {
      target: { value: "cmp_beta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign company" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_bulkAssignCompany", {
        ids: ["con_ada"],
        companyId: "cmp_beta",
      }),
    );
  });

  it("opens the create drawer for a routed header action", async () => {
    render(<ContactsView rpcClient={makeRpc()} initialCreate />);

    expect(await screen.findByRole("dialog", { name: "New contact" })).toBeDefined();
  });

  it("reports skipped and failed enrichment counts from the bulk RPC", async () => {
    const rpc = makeRpc(async (method, input) => {
      if (method === "contacts_list") return listResult();
      if (method === "contacts_bulkEnrich") {
        expect(input).toEqual({ ids: [contact.id] });
        return {
          requested: 1,
          succeeded: 0,
          skipped: 1,
          failed: 0,
          message: "No research agent is configured.",
        };
      }
      return contact;
    });
    render(<ContactsView rpcClient={rpc} />);

    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByLabelText("Select Ada Lovelace"));
    fireEvent.click(screen.getByRole("button", { name: "Enrich selected" }));

    await waitFor(() =>
      expect(screen.getByText(/Contact enrichment: requested 1/).textContent).toContain(
        "Contact enrichment: requested 1 · succeeded 0 · skipped 1 · failed 0 · No research agent is configured.",
      ),
    );
  });

  it("rolls back an optimistic contact edit when the typed update fails", async () => {
    let rejectUpdate: ((cause: Error) => void) | undefined;
    const rpc = makeRpc(async (method, input) => {
      if (method === "contacts_list") return listResult();
      if (method === "contacts_get") return contact;
      if (method === "contacts_update") {
        expect(input).toEqual({
          id: contact.id,
          data: { title: "Head of Revenue" },
        });
        return new Promise<never>((_resolve, reject) => {
          rejectUpdate = reject;
        });
      }
      return contact;
    });

    render(<ContactsView rpcClient={rpc} />);
    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByRole("row", { name: /Open Ada Lovelace/ }));
    await screen.findByRole("dialog", { name: "Ada Lovelace" });

    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Head of Revenue" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_update", {
        id: contact.id,
        data: { title: "Head of Revenue" },
      }),
    );

    expect(
      within(screen.getByRole("dialog", { name: "Ada Lovelace" })).getByText("Head of Revenue"),
    ).toBeDefined();
    rejectUpdate?.(new Error("contact update failed"));
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog", { name: "Ada Lovelace" })).getByRole("button", {
          name: "Title",
        }).textContent,
      ).toContain("VP Engineering"),
    );
    expect(screen.getByRole("alert").textContent).toContain("contact update failed");
  });
});
