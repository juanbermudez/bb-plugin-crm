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

import type { Contact, ContactListOutput } from "../../../contracts/core.js";
import { ContactsView, type ContactsRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
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

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "contacts_list") return listResult();
      if (method === "contacts_get") return contact;
      if (method === "contacts_create") return contact;
      if (method === "contacts_update") return contact;
      return contact;
    }),
  );
  return { call } as unknown as ContactsRpcClient & { call: typeof call };
}

describe("ContactsView", () => {
  it("loads a searchable contact table and opens the staged record tabs", async () => {
    const rpc = makeRpc();
    render(<ContactsView rpcClient={rpc} />);

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
      expect.objectContaining({ q: "", page: 1, pageSize: 25, archived: false }),
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
    expect(screen.getByText("Deals is staged next")).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("contacts_get", { id: "con_ada" });
  });

  it("creates a contact from the wide BB-native drawer form", async () => {
    const created: Contact = { ...contact, id: "con_grace", firstName: "Grace", lastName: "Hopper" };
    const rpc = makeRpc(async (method) => {
      if (method === "contacts_list") return listResult();
      if (method === "contacts_create") return created;
      if (method === "contacts_get") return contact;
      return contact;
    });
    render(<ContactsView rpcClient={rpc} />);
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: "New contact" }));
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
    fireEvent.change(screen.getByLabelText("Company ID (optional)"), {
      target: { value: "cmp_acme" },
    });
    fireEvent.change(screen.getByLabelText("Owner ID (optional)"), {
      target: { value: "usr_juan" },
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
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
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ContactsView rpcClient={rpc} />);
    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByRole("row", { name: /Open Ada Lovelace/ }));
    await screen.findByRole("dialog", { name: "Ada Lovelace" });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("contacts_purge", { id: "con_ada" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ada Lovelace" })).toBeNull(),
    );
    expect(confirm).toHaveBeenCalledWith(
      "Delete Ada Lovelace permanently? This cannot be undone.",
    );
    confirm.mockRestore();
  });
});
