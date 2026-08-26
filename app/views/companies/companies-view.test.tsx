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
      expect.objectContaining({ q: "", page: 1, pageSize: 25, archived: false }),
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
    expect(onTabChange).toHaveBeenCalledWith("deals");
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
    render(<CompaniesView rpcClient={rpc} />);
    await screen.findByText("Acme Corporation");

    fireEvent.click(screen.getByRole("button", { name: "New company" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
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
            segment: { opt_enterprise: 1 },
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
    fireEvent.change(screen.getByLabelText("Sort companies"), {
      target: { value: "industry" },
    });
    fireEvent.change(screen.getByLabelText("Sort direction"), {
      target: { value: "desc" },
    });
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "companies_list",
        expect.objectContaining({ sort: "industry", dir: "desc" }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    await screen.findByLabelText("Enterprise");
    fireEvent.click(screen.getByLabelText("SaaS"));
    fireEvent.click(screen.getByLabelText("Enterprise"));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith(
        "companies_list",
        expect.objectContaining({
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
    expect((screen.getByLabelText("Sort companies") as HTMLSelectElement).value).toBe(
      "domain",
    );
    expect((screen.getByLabelText("Sort direction") as HTMLSelectElement).value).toBe(
      "desc",
    );
  });

  it("assigns a primary contact and opens linked records in a nested stack", async () => {
    const contact: Contact = {
      id: "con_ada",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      companyId: company.id,
      fields: {},
      deals: [],
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
      if (method === "companies_update") {
        expect(input).toEqual({
          id: company.id,
          data: { primaryContactId: contact.id },
        });
        current = { ...current, primaryContactId: contact.id };
        return current;
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
      expect(rpc.call).toHaveBeenCalledWith("companies_update", {
        id: company.id,
        data: { primaryContactId: contact.id },
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
