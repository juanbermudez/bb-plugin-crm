// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActivityEntry,
  CompanyListOutput,
  ContactListOutput,
  DealListOutput,
} from "../../contracts/core.js";
import {
  GlobalActivityCreate,
  type GlobalActivityRpcClient,
} from "./global-activity-create.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

function makeRpc() {
  const companyResult = {
    rows: [
      {
        id: "cmp_acme",
        name: "Acme Corporation",
        domain: "acme.example",
        fields: {},
      },
    ],
    total: 1,
    facetCounts: {},
  } as unknown as CompanyListOutput;
  const emptyContacts = {
    rows: [],
    total: 0,
    facetCounts: {},
  } as unknown as ContactListOutput;
  const emptyDeals = {
    rows: [],
    total: 0,
    facetCounts: {},
    openValueCents: null,
    reportingCurrency: "USD",
    unconverted: { count: 0, currencies: [] },
  } as unknown as DealListOutput;
  const call = vi.fn(async (method: string) => {
    if (method === "companies_list") return companyResult;
    if (method === "contacts_list") return emptyContacts;
    if (method === "deals_list") return emptyDeals;
    return {} as ActivityEntry;
  });
  return { call } as unknown as GlobalActivityRpcClient & { call: typeof call };
}

describe("GlobalActivityCreate", () => {
  it("selects an existing record and creates a routed note", async () => {
    const rpc = makeRpc();
    const onClose = vi.fn();
    render(<GlobalActivityCreate type="note" rpcClient={rpc} onClose={onClose} />);

    const recordPicker = await screen.findByRole("combobox", { name: "Record" });
    await waitFor(() => expect((recordPicker as HTMLInputElement).disabled).toBe(false));
    fireEvent.focus(recordPicker);
    fireEvent.click(await screen.findByRole("option", { name: /Acme Corporation/ }));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Discovery follow-up" },
    });
    fireEvent.change(screen.getByLabelText(/^Details/), {
      target: { value: "Send the recap." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("activity_create", {
        companyId: "cmp_acme",
        type: "NOTE",
        createdById: "local_user",
        subject: "Discovery follow-up",
        body: "Send the recap.",
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("searches the server beyond the first 100 records", async () => {
    const firstPage = {
      rows: [{ id: "cmp_first", name: "First page company", domain: "first.example", fields: {} }],
      total: 101,
      facetCounts: {},
    } as unknown as CompanyListOutput;
    const searchResult = {
      rows: [{ id: "cmp_target", name: "Target company", domain: "target.example", fields: {} }],
      total: 1,
      facetCounts: {},
    } as unknown as CompanyListOutput;
    const emptyContacts = { rows: [], total: 0, facetCounts: {} } as unknown as ContactListOutput;
    const emptyDeals = {
      rows: [],
      total: 0,
      facetCounts: {},
      openValueCents: null,
      reportingCurrency: "USD",
      unconverted: { count: 0, currencies: [] },
    } as unknown as DealListOutput;
    const call = vi.fn(async (method: string, input: unknown) => {
      if (method === "companies_list") {
        return (input as { q?: string }).q === "Target" ? searchResult : firstPage;
      }
      if (method === "contacts_list") return emptyContacts;
      if (method === "deals_list") return emptyDeals;
      return {} as ActivityEntry;
    });
    const rpc = { call } as unknown as GlobalActivityRpcClient & { call: typeof call };

    render(<GlobalActivityCreate type="note" rpcClient={rpc} onClose={vi.fn()} />);
    const recordPicker = await screen.findByRole("combobox", { name: "Record" });
    await waitFor(() => expect((recordPicker as HTMLInputElement).disabled).toBe(false));
    fireEvent.focus(recordPicker);
    fireEvent.change(recordPicker, { target: { value: "Target" } });

    expect(await screen.findByRole("option", { name: /Target company/ })).toBeDefined();
    expect(call).toHaveBeenCalledWith("companies_list", expect.objectContaining({
      q: "Target",
      page: 1,
      pageSize: 100,
    }));
  });

  it.each(["note", "task"] as const)(
    "returns focus to the persistent New trigger when a global %s closes",
    async (type) => {
      const rpc = makeRpc();
      const returnFocusRef = { current: null as HTMLElement | null };
      function Host() {
        const [open, setOpen] = useState(true);
        return (
          <>
            <button
              ref={(element) => {
                returnFocusRef.current = element;
              }}
              type="button"
            >
              New
            </button>
            {open ? (
              <GlobalActivityCreate
                type={type}
                rpcClient={rpc}
                returnFocusRef={returnFocusRef}
                onClose={() => setOpen(false)}
              />
            ) : null}
          </>
        );
      }

      render(<Host />);
      const trigger = screen.getByRole("button", { name: "New", hidden: true });
      fireEvent.click(await screen.findByRole("button", { name: "Close record drawer" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
      });
    },
  );
});
