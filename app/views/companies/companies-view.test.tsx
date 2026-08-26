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
  Company,
  Contact,
  Deal,
  CompanyListOutput,
  SavedView,
} from "../../../contracts/core.js";
import {
  CompaniesView,
  type CompaniesRpcClient,
} from "./index.js";
import type { SavedViewsRpcClient } from "../saved-views/index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn(async (method: string) =>
    method === "savedViews_list" || method === "fields_list" || method === "fields_values_list" ? [] : null,
  ) }),
}));

afterEach(() => {
  cleanup();
});

const company: Company = {
  id: "cmp_acme",
  name: "Acme Corporation",
  domain: "acme.example",
  industry: "SaaS",
  ownerId: "usr_juan",
  contactCount: 4,
  openDealCount: 2,
  lastActivityAt: "2026-08-20T12:00:00.000Z",
  archivedAt: null,
  fields: {},
};

function listResult(rows: Company[] = [company]): CompanyListOutput {
  return { rows, total: rows.length, facetCounts: {} };
}

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
    if (method === "companies_list") return listResult();
    if (method === "companies_get") return company;
    if (method === "companies_create") return company;
    if (method === "companies_update") return company;
    return company;
    }),
  );
  return { call } as unknown as CompaniesRpcClient & { call: typeof call };
}

describe("CompaniesView", () => {
  it("loads a semantic company table and opens record tabs", async () => {
    const rpc = makeRpc();
    render(<CompaniesView rpcClient={rpc} />);

    expect(await screen.findByText("Acme Corporation")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeDefined();
    expect(screen.getByText("SaaS")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith(
      "companies_list",
      expect.objectContaining({
        q: "",
        sort: "createdAt",
        dir: "desc",
        page: 1,
        pageSize: 25,
        archived: false,
      }),
    );

    fireEvent.click(screen.getByRole("row", { name: /Open Acme Corporation/ }));
    const drawer = await screen.findByRole("dialog", { name: "Acme Corporation" });
    expect(within(drawer).getAllByText("acme.example").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Contacts" }));
    expect(screen.getByText("No contacts linked")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("companies_get", { id: "cmp_acme" });
  });

  it("renders a company icon URL as the table mark", async () => {
    const faviconCompany: Company = {
      ...company,
      iconUrl: "https://acme.example/favicon.ico",
    };
    const rpc = makeRpc(async (method) => {
      if (method === "companies_list") return listResult([faviconCompany]);
      if (method === "companies_get") return faviconCompany;
      return faviconCompany;
    });
    render(<CompaniesView rpcClient={rpc} />);

    const row = await screen.findByRole("row", { name: /Open Acme Corporation/ });
    expect(row.querySelector("img")?.getAttribute("src")).toBe(
      "https://acme.example/favicon.ico",
    );
  });

  it("renders owner-aware contact and deal relationship rows", async () => {
    const relatedCompany: Company = {
      ...company,
      contacts: [
        {
          id: "con_ada",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          title: "Founder",
          imageUrl: null,
          ownerId: "owner_contact",
          owner: {
            id: "owner_contact",
            name: "Contact owner",
            email: "contact-owner@example.com",
            image: null,
          },
        },
      ],
      deals: [
        {
          id: "deal_expansion",
          name: "Expansion",
          stage: "CONTRACT_SENT",
          amountCents: 125_000,
          currency: "USD",
          ownerId: "owner_deal",
          owner: {
            id: "owner_deal",
            name: "Deal owner",
            email: "deal-owner@example.com",
            image: null,
          },
          expectedCloseDate: "2026-10-31",
        },
      ],
    };
    const rpc = makeRpc(async (method) => {
      if (method === "companies_list") return listResult([relatedCompany]);
      if (method === "companies_get") return relatedCompany;
      return relatedCompany;
    });
    render(<CompaniesView rpcClient={rpc} />);

    fireEvent.click(await screen.findByRole("row", { name: /Open Acme Corporation/ }));
    const drawer = await screen.findByRole("dialog", { name: "Acme Corporation" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Contacts" }));
    const contacts = within(drawer).getByRole("region", { name: "Company contacts" });
    expect(within(contacts).getByRole("button", { name: "Open Ada Lovelace" })).toBeDefined();
    expect(within(contacts).getByText("Contact owner")).toBeDefined();

    fireEvent.click(within(drawer).getByRole("tab", { name: "Deals" }));
    const deals = within(drawer).getByRole("region", { name: "Company deals" });
    expect(within(deals).getByRole("button", { name: "Open Expansion" })).toBeDefined();
    expect(within(deals).getByText("Contract sent")).toBeDefined();
    expect(within(deals).getByText("$1,250.00")).toBeDefined();
    expect(within(deals).getByText("Deal owner")).toBeDefined();
    expect(within(deals).getByText(/Oct 31, 2026/)).toBeDefined();
  });

  it("marks archived relationship rows while keeping them visible", async () => {
    const relatedCompany: Company = {
      ...company,
      contacts: [{
        id: "con_archived",
        firstName: "Archived",
        lastName: "Contact",
        email: "archived@example.com",
        title: "Former buyer",
        imageUrl: null,
        ownerId: null,
        owner: null,
        archivedAt: "2026-08-25T00:00:00.000Z",
      }],
      deals: [{
        id: "deal_archived",
        name: "Archived expansion",
        stage: "CLOSED_LOST",
        amountCents: null,
        currency: "USD",
        ownerId: null,
        owner: null,
        expectedCloseDate: null,
        archivedAt: "2026-08-25T00:00:00.000Z",
      }],
    };
    const rpc = makeRpc(async (method) => {
      if (method === "companies_list") return listResult([relatedCompany]);
      if (method === "companies_get") return relatedCompany;
      return relatedCompany;
    });
    render(<CompaniesView rpcClient={rpc} />);

    fireEvent.click(await screen.findByRole("row", { name: /Open Acme Corporation/ }));
    const drawer = await screen.findByRole("dialog", { name: "Acme Corporation" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Contacts" }));
    const contacts = within(drawer).getByRole("region", { name: "Company contacts" });
    expect(within(contacts).getByText("Archived")).toBeDefined();

    fireEvent.click(within(drawer).getByRole("tab", { name: "Deals" }));
    const deals = within(drawer).getByRole("region", { name: "Company deals" });
    expect(within(deals).getByText("Archived")).toBeDefined();
  });

  it("restores a deep-linked drawer tab and reports tab changes", async () => {
    const onTabChange = vi.fn();
    const rpc = makeRpc();
    render(
      <CompaniesView
        rpcClient={rpc}
        initialRecordId={company.id}
        initialTab="contacts"
        onTabChange={onTabChange}
      />,
    );

    const drawer = await screen.findByRole("dialog", { name: "Acme Corporation" });
    expect(within(drawer).getByRole("tab", { name: "Contacts" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(within(drawer).getByRole("tab", { name: "Deals" }));
    expect(onTabChange).toHaveBeenCalledWith("deals", company.id);
  });

  it("renders source company social links in the record overview", async () => {
    const linkedCompany: Company = {
      ...company,
      linkedinUrl: "https://linkedin.com/company/acme",
      twitterUrl: "https://x.com/acme",
      githubUrl: "https://github.com/acme",
      pricingUrl: "https://acme.example/pricing",
      careersUrl: "https://acme.example/careers",
    };
    const rpc = makeRpc(async (method) => {
      if (method === "companies_list") return listResult([linkedCompany]);
      if (method === "companies_get") return linkedCompany;
      return linkedCompany;
    });
    render(<CompaniesView rpcClient={rpc} />);

    await screen.findByText("Acme Corporation");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Corporation/ }));
    const drawer = await screen.findByRole("dialog", { name: "Acme Corporation" });
    expect(within(drawer).getByRole("region", { name: "Company social links" })).toBeDefined();
    expect(
      within(drawer).getByRole("link", { name: /LinkedIn/ }).getAttribute("href"),
    ).toBe("https://linkedin.com/company/acme");
    expect(
      within(drawer).getByRole("link", { name: /Pricing/ }).getAttribute("href"),
    ).toBe("https://acme.example/pricing");
  });

  it("creates a company from the BB-native drawer form", async () => {
    const created: Company = { ...company, id: "cmp_new", name: "Newco" };
    const rpc = makeRpc(async (method) => {
        if (method === "companies_list") return listResult();
        if (method === "companies_create") return created;
        if (method === "companies_get") return company;
        return company;
      });
    render(<CompaniesView rpcClient={rpc} initialCreate />);
    await screen.findByText("Acme Corporation");

    expect(screen.getByRole("dialog", { name: "New company" })).toBeDefined();
    fireEvent.change(screen.getByLabelText("Company name"), {
      target: { value: "Newco" },
    });
    fireEvent.change(screen.getByLabelText("Domain (optional)"), {
      target: { value: "newco.example" },
    });
    fireEvent.focus(screen.getByRole("combobox", { name: "Owner" }));
    fireEvent.click(screen.getByRole("option", { name: /usr_juan/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create company" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("companies_create", {
        name: "Newco",
        domain: "newco.example",
        ownerId: "usr_juan",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New company" })).toBeNull());
  });

  it("archives and restores the selected company and switches the list filter", async () => {
    let current = company;
    const rpc = makeRpc(async (method, input) => {
        if (method === "companies_list") {
          const archived = (input as { archived?: boolean }).archived === true;
          return listResult(archived || !current.archivedAt ? [current] : []);
        }
        if (method === "companies_get") return current;
        if (method === "companies_archive") {
          current = { ...current, archivedAt: "2026-08-25T00:00:00.000Z" };
          return current;
        }
        if (method === "companies_restore") {
          current = { ...current, archivedAt: null };
          return current;
        }
        return current;
      });
    render(<CompaniesView rpcClient={rpc} />);
    await screen.findByText("Acme Corporation");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Corporation/ }));
    await screen.findByRole("dialog", { name: "Acme Corporation" });

    fireEvent.click(screen.getByRole("button", { name: "Archive company" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore company" })).toBeDefined());
    expect(rpc.call).toHaveBeenCalledWith("companies_archive", { id: "cmp_acme" });

    fireEvent.click(screen.getByRole("button", { name: "Close record drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Acme Corporation" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Archived companies" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "companies_list",
        expect.objectContaining({ archived: true }),
      ),
    );
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Corporation/ }));
    await screen.findByRole("dialog", { name: "Acme Corporation" });
    fireEvent.click(screen.getByRole("button", { name: "Restore company" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive company" })).toBeDefined());
    expect(rpc.call).toHaveBeenCalledWith("companies_restore", { id: "cmp_acme" });
  });

  it("carries sorting, standard/custom facets, selection, and bulk archive to RPC", async () => {
    const second = { ...company, id: "cmp_beta", name: "Beta Corporation" };
    const rpc = makeRpc(async (method, input) => {
      if (method === "companies_list") {
        return {
          ...listResult([company, second]),
          facetCounts: {
            owner: { usr_juan: 2 },
            industry: { SaaS: 2 },
            source: { MANUAL: 2 },
            activity: { "7": 2 },
            "field:segment": { opt_enterprise: 1 },
          },
        };
      }
      if (method === "fields_filters") {
        return [
          {
            id: "field_segment",
            entity: "COMPANY",
            key: "segment",
            label: "Segment",
            type: "SELECT",
            agentFilled: false,
            agentBrief: null,
            required: false,
            showOnSheet: true,
            showOnTable: false,
            showOnFilter: true,
            position: 0,
            options: [
              {
                id: "opt_enterprise",
                fieldId: "field_segment",
                label: "Enterprise",
                position: 0,
              },
            ],
          },
        ];
      }
      if (method === "companies_bulkArchive") {
        expect(input).toEqual({ ids: ["cmp_acme"] });
        return { requested: 1, succeeded: 1, failed: 0, message: null };
      }
      return company;
    });
    render(<CompaniesView rpcClient={rpc} />);

    await screen.findByText("Acme Corporation");
    const sort = screen.getByRole("button", { name: /Sort companies/ });
    fireEvent.click(sort);
    expect(screen.getByRole("option", { name: "Contacts" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Open deals" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Archived" })).toBeDefined();
    fireEvent.click(screen.getByRole("option", { name: "Industry" }));
    expect(screen.getByRole("button", { name: "Sort descending" })).toBeDefined();
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "companies_list",
        expect.objectContaining({ sort: "industry", dir: "desc" }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    await screen.findByRole("checkbox", { name: /^Enterprise/ });
    const segmentFacet = screen.getByText("Segment").closest("fieldset");
    expect(segmentFacet).not.toBeNull();
    expect(within(segmentFacet as HTMLElement).getByText("1")).toBeDefined();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Active within 7 days/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^SaaS/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Enterprise/ }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "companies_list",
        expect.objectContaining({
          activity: ["7"],
          industry: ["SaaS"],
          fields: { segment: ["opt_enterprise"] },
        }),
      ),
    );

    fireEvent.click(screen.getByLabelText("Select Acme Corporation"));
    fireEvent.click(screen.getByRole("button", { name: "Archive selected" }));
    const confirmation = await screen.findByRole("dialog", {
      name: "Archive 1 company?",
    });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("companies_bulkArchive", {
        ids: ["cmp_acme"],
      }),
    );
  });

  it("opens the create drawer for a routed header action", async () => {
    render(<CompaniesView rpcClient={makeRpc()} initialCreate />);

    expect(await screen.findByRole("dialog", { name: "New company" })).toBeDefined();
  });

  it("reports skipped and failed enrichment counts from the bulk RPC", async () => {
    const rpc = makeRpc(async (method, input) => {
      if (method === "companies_list") return listResult();
      if (method === "companies_bulkEnrich") {
        expect(input).toEqual({ ids: [company.id] });
        return {
          requested: 1,
          succeeded: 0,
          skipped: 1,
          failed: 0,
          message: "No research agent is configured.",
        };
      }
      return company;
    });
    render(<CompaniesView rpcClient={rpc} />);

    await screen.findByText("Acme Corporation");
    fireEvent.click(screen.getByLabelText("Select Acme Corporation"));
    fireEvent.click(screen.getByRole("button", { name: "Enrich selected" }));

    await waitFor(() =>
      expect(screen.getByText(/Company enrichment: requested 1/).textContent).toContain(
        "Company enrichment: requested 1 · succeeded 0 · skipped 1 · failed 0 · No research agent is configured.",
      ),
    );
  });

  it("restores query, sorting, direction, and facets from a saved view", async () => {
    const saved: SavedView = {
      id: "view_enterprise",
      entity: "COMPANY",
      name: "Enterprise accounts",
      shared: false,
      isDefault: true,
      filters: {
        q: "Acme",
        sort: "domain",
        dir: "desc",
        archived: false,
        filters: { industry: ["SaaS"], segment: ["opt_enterprise"] },
        columns: [],
      },
    };
    const savedRpc = {
      call: vi.fn(async (method: string) =>
        method === "savedViews_list" ? [saved] : saved,
      ),
    } as unknown as SavedViewsRpcClient;
    const rpc = makeRpc(async (method) => {
      if (method === "companies_list") {
        return {
          ...listResult(),
          facetCounts: { industry: { SaaS: 1 } },
        };
      }
      if (method === "fields_filters") return [];
      return company;
    });
    render(<CompaniesView rpcClient={rpc} savedViewsRpcClient={savedRpc} />);

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "companies_list",
        expect.objectContaining({
          q: "Acme",
          sort: "domain",
          dir: "desc",
          industry: ["SaaS"],
          fields: { segment: ["opt_enterprise"] },
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Sort companies: Domain" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Sort descending" })).toBeDefined();
  });

  it("assigns a primary contact and opens linked records in a nested stack", async () => {
    const contact: Contact = {
      id: "con_ada",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      companyId: company.id,
      fields: {},
      deals: [{
        id: "deal_archived_nested",
        name: "Archived nested expansion",
        archivedAt: "2026-08-25T00:00:00.000Z",
      }],
    };
    let current: Company = {
      ...company,
      primaryContactId: null,
      contacts: [
        {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email ?? null,
          title: null,
          imageUrl: null,
        },
      ],
    };
    const rpc = makeRpc(async (method, input) => {
      if (method === "companies_list") return listResult([current]);
      if (method === "companies_get") return current;
      if (method === "companies_setPrimaryContact") {
        expect(input).toEqual({
          companyId: company.id,
          contactId: contact.id,
        });
        current = { ...current, primaryContactId: contact.id };
        return { id: company.id, primaryContactId: contact.id };
      }
      if (method === "contacts_get") return contact;
      return current;
    });

    render(<CompaniesView rpcClient={rpc} />);
    await screen.findByText("Acme Corporation");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Corporation/ }));
    await screen.findByRole("dialog", { name: "Acme Corporation" });
    fireEvent.click(screen.getByRole("tab", { name: "Contacts" }));

    fireEvent.click(
      screen.getByRole("button", { name: /Make Ada Lovelace primary contact/ }),
    );
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("companies_setPrimaryContact", {
        companyId: company.id,
        contactId: contact.id,
      }),
    );
    expect(screen.getByRole("button", { name: /Clear primary contact: Ada Lovelace/ })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Open Ada Lovelace" }));
    await screen.findByRole("dialog", { name: "Ada Lovelace" });
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_get", { id: contact.id }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ada Lovelace" })).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Acme Corporation" })).toBeDefined();
  });

  it("keeps the company drawer open while nested contacts and deals use full record workflows", async () => {
    let nestedContact: Contact = {
      id: "con_ada",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      companyId: company.id,
      company: {
        id: company.id,
        name: company.name,
        domain: company.domain ?? null,
        iconUrl: null,
        iconDarkUrl: null,
        iconTone: null,
        logoUrl: null,
      },
      deals: [{ id: "deal_expansion", name: "Expansion", stage: "DEMO_BOOKED" }],
      fields: {},
      archivedAt: null,
    };
    let nestedDeal: Deal = {
      id: "deal_expansion",
      name: "Expansion",
      description: "Expand the Acme deployment.",
      companyId: company.id,
      company: {
        id: company.id,
        name: company.name,
        domain: company.domain ?? null,
        iconUrl: null,
        iconDarkUrl: null,
        iconTone: null,
        logoUrl: null,
      },
      ownerId: "usr_juan",
      owner: null,
      stage: "DEMO_BOOKED",
      currency: "USD",
      amountCents: 125_000,
      baseAmountCents: null,
      closedReason: null,
      expectedCloseDate: null,
      closedAt: null,
      fields: {},
      contacts: [{
        id: nestedContact.id,
        firstName: nestedContact.firstName,
        lastName: nestedContact.lastName ?? null,
        email: nestedContact.email ?? null,
        title: null,
        imageUrl: null,
        role: "Champion",
      }],
    };
    let currentCompany: Company = {
      ...company,
      contacts: [{
        id: nestedContact.id,
        firstName: nestedContact.firstName,
        lastName: nestedContact.lastName ?? null,
        email: nestedContact.email ?? null,
        title: null,
        imageUrl: null,
      }],
      deals: [{ id: nestedDeal.id, name: nestedDeal.name, stage: nestedDeal.stage }],
    };
    const rpc = makeRpc(async (method, input) => {
      if (method === "companies_list") return listResult([currentCompany]);
      if (method === "companies_get") return currentCompany;
      if (method === "contacts_get") return nestedContact;
      if (method === "deals_get") return nestedDeal;
      if (method === "deals_setStage") {
        const request = input as {
          id: string;
          stage: Deal["stage"];
          closedReason?: string;
        };
        nestedDeal = {
          ...nestedDeal,
          stage: request.stage,
          closedReason: request.closedReason ?? null,
        };
        nestedContact = {
          ...nestedContact,
          deals: nestedContact.deals?.map((deal) =>
            deal.id === request.id ? { ...deal, stage: request.stage } : deal,
          ),
        };
        return nestedDeal;
      }
      if (method === "contacts_update") {
        const data = (input as { data: Partial<Contact> }).data;
        nestedContact = { ...nestedContact, ...data };
        return nestedContact;
      }
      if (method === "contacts_archive") {
        nestedContact = { ...nestedContact, archivedAt: "2026-08-26T00:00:00.000Z" };
        return nestedContact;
      }
      if (method === "contacts_facts_list" || method === "contacts_workHistory_list" || method === "contacts_briefs_current") return [];
      if (method === "fields_list" || method === "fields_values_list" || method === "agents_list") return [];
      if (method === "activity_timeline") return { entries: [], nextCursor: null };
      if (method === "activity_timelineCounts") return { all: 0, notes: 0, upcoming: 0, done: 0, email: 0, meetings: 0 };
      return currentCompany;
    });

    render(<CompaniesView rpcClient={rpc} />);
    await screen.findByText("Acme Corporation");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Corporation/ }));
    const companyDrawer = await screen.findByRole("dialog", { name: "Acme Corporation" });
    fireEvent.click(within(companyDrawer).getByRole("tab", { name: "Contacts" }));
    fireEvent.click(within(companyDrawer).getByRole("button", { name: "Open Ada Lovelace" }));

    const contactDrawer = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    expect(within(contactDrawer).getByRole("tab", { name: "Overview" })).toBeDefined();
    expect(within(contactDrawer).getByRole("button", { name: "Archive contact" })).toBeDefined();

    fireEvent.click(within(contactDrawer).getByRole("tab", { name: "Deals" }));
    const contactDeals = within(contactDrawer).getByRole("list", { name: "Contact deals" });
    fireEvent.click(within(contactDeals).getByRole("button", { name: "Demo booked" }));
    const stageMenu = await within(contactDeals).findByRole("menu", {
      name: "Change stage for Expansion",
    });
    fireEvent.click(within(stageMenu).getByRole("menuitemradio", { name: "Closed lost" }));
    const reasonDialog = await screen.findByRole("dialog", { name: "Close as lost" });
    fireEvent.change(within(reasonDialog).getByLabelText(/Reason/), {
      target: { value: "Budget" },
    });
    fireEvent.click(within(reasonDialog).getByRole("button", { name: "Save stage" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("deals_setStage", {
        id: nestedDeal.id,
        stage: "CLOSED_LOST",
        closedReason: "Budget",
      }),
    );
    fireEvent.click(within(contactDrawer).getByRole("button", { name: "Expansion" }));
    const dealDrawer = await screen.findByRole("dialog", { name: "Expansion" });
    fireEvent.click(within(dealDrawer).getByRole("tab", { name: "Contacts" }));
    expect(within(dealDrawer).getByRole("button", { name: "Ada Lovelace" })).toBeDefined();

    fireEvent.click(within(dealDrawer).getByRole("tab", { name: "Agent" }));
    expect(await within(dealDrawer).findByRole("region", { name: "Expansion agent workspace" })).toBeDefined();

    fireEvent.click(within(dealDrawer).getByRole("button", { name: "Back" }));
    const contactAgain = await screen.findByRole("dialog", { name: "Ada Lovelace" });
    fireEvent.click(within(contactAgain).getByRole("tab", { name: "Overview" }));
    fireEvent.click(within(contactAgain).getByRole("button", { name: "First name" }));
    const firstNameInput = within(contactAgain).getByLabelText("First name");
    fireEvent.change(firstNameInput, { target: { value: "Grace" } });
    fireEvent.keyDown(firstNameInput, { key: "Enter" });
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("contacts_update", {
      id: nestedContact.id,
      data: { firstName: "Grace" },
    }));
    await screen.findByRole("dialog", { name: "Grace Lovelace" });

    fireEvent.click(screen.getByRole("button", { name: "Archive contact" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore contact" })).toBeDefined());
    expect(rpc.call).toHaveBeenCalledWith("contacts_archive", { id: nestedContact.id });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "Acme Corporation" })).toBeDefined();
  });

  it("optimistically edits a company field and settles through the typed update RPC", async () => {
    let current = company;
    let resolveUpdate: ((value: Company) => void) | undefined;
    const rpc = makeRpc(async (method, input) => {
      if (method === "companies_list") return listResult([current]);
      if (method === "companies_get") return current;
      if (method === "companies_update") {
        expect(input).toEqual({
          id: company.id,
          data: { name: "Acme North" },
        });
        current = { ...current, name: "Acme North" };
        return new Promise<Company>((resolve) => {
          resolveUpdate = resolve;
        });
      }
      return current;
    });

    render(<CompaniesView rpcClient={rpc} />);
    await screen.findByText("Acme Corporation");
    fireEvent.click(screen.getByRole("row", { name: /Open Acme Corporation/ }));
    await screen.findByRole("dialog", { name: "Acme Corporation" });

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Acme North" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Acme North" })).toBeDefined(),
    );
    expect(rpc.call).toHaveBeenCalledWith("companies_update", {
      id: company.id,
      data: { name: "Acme North" },
    });
    resolveUpdate?.(current);
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog", { name: "Acme North" })).getByRole("button", {
          name: "Name",
        }).textContent,
      ).toContain("Acme North"),
    );
  });
});
