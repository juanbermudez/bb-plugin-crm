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
  CompanyListOutput,
} from "../../../contracts/core.js";
import { CompaniesView, type CompaniesRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn(async (method: string) => method === "savedViews_list" ? [] : null) }),
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
    fireEvent.change(screen.getByLabelText("Owner ID (optional)"), {
      target: { value: "usr_juan" },
    });
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
});
