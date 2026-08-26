// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalSearch, type GlobalSearchRpcClient } from "./global-search.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn(async () => ({ rows: [], total: 0, facetCounts: {} })) }),
}));

afterEach(() => cleanup());

describe("global CRM search", () => {
  it("searches all record lists and opens a selected result", async () => {
    const call = vi.fn(async (method: string) => {
      if (method === "companies_list") {
        return { rows: [{ id: "cmp_acme", name: "Acme Corporation", domain: "acme.example" }] };
      }
      if (method === "contacts_list") {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const onOpen = vi.fn();
    const rpc = { call } as unknown as GlobalSearchRpcClient & { call: typeof call };

    render(<GlobalSearch rpcClient={rpc} onOpen={onOpen} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search CRM" }), {
      target: { value: "Acme" },
    });

    const result = await screen.findByRole("button", { name: /Acme Corporation/ });
    expect(result).toBeDefined();
    expect(call).toHaveBeenCalledWith(
      "companies_list",
      expect.objectContaining({ q: "Acme", page: 1, pageSize: 5 }),
    );
    fireEvent.click(result);
    await waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith({
        id: "cmp_acme",
        kind: "company",
        label: "Acme Corporation",
        description: "acme.example",
      }),
    );
  });

  it("opens with Cmd/Ctrl-Shift-K and supports arrow-and-enter selection", async () => {
    const call = vi.fn(async (method: string) => {
      if (method === "contacts_list") {
        return {
          rows: [{ id: "contact_ada", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" }],
        };
      }
      return { rows: [] };
    });
    const onOpen = vi.fn();
    render(
      <GlobalSearch
        rpcClient={{ call } as unknown as GlobalSearchRpcClient}
        onOpen={onOpen}
      />,
    );

    fireEvent.keyDown(window, { key: "k", metaKey: true, shiftKey: true });
    const search = screen.getByRole("searchbox", { name: "Search CRM" });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "Ada" } });
    await screen.findByRole("button", { name: /Ada Lovelace/ });
    fireEvent.keyDown(search, { key: "Enter" });

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({
      id: "contact_ada",
      kind: "contact",
    })));
  });
});
