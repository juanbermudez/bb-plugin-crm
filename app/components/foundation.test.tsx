// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EmptyState,
  PageHeader,
  RecordDrawer,
  SearchField,
  TableShell,
} from "./index.js";

afterEach(() => {
  cleanup();
});

describe("CRM frontend foundation components", () => {
  it("keeps page heading content and actions accessible", () => {
    render(
      <PageHeader
        title="Companies"
        description="Manage the organizations in your workspace."
        actions={<button type="button">New company</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Companies" })).toBeDefined();
    expect(
      screen.getByText("Manage the organizations in your workspace."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "New company" })).toBeDefined();
  });

  it("labels the searchbox and exposes a controlled clear action", () => {
    const onClear = vi.fn();
    render(
      <SearchField
        label="Search companies"
        value="Acme"
        onChange={() => {}}
        onClear={onClear}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: "Search companies" }).getAttribute(
        "value",
      ),
    ).toBe("Acme");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("renders empty-state copy and an optional action", () => {
    render(
      <EmptyState
        title="No contacts yet"
        description="Create a contact to start building your pipeline."
        action={<button type="button">Create contact</button>}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("No contacts yet");
    expect(
      screen.getByText("Create a contact to start building your pipeline."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Create contact" })).toBeDefined();
  });

  it("keeps table headers available during loading and rows semantic when ready", () => {
    const { rerender } = render(
      <TableShell
        caption="Companies"
        columns={["Name", { id: "owner", label: "Owner" }]}
        loading
      />,
    );

    expect(screen.getByRole("table", { name: "Companies" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain(
      "Loading Companies…",
    );

    rerender(
      <TableShell caption="Companies" columns={["Name", "Owner"]}>
        <tr>
          <td>Acme</td>
          <td>Juan</td>
        </tr>
      </TableShell>,
    );

    expect(screen.getByRole("row", { name: "Acme Juan" })).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("provides a wide, labelled record drawer and closes through its control", () => {
    const onOpenChange = vi.fn();
    render(
      <RecordDrawer
        open
        onOpenChange={onOpenChange}
        title="Acme Corporation"
        description="Company details"
        actions={<button type="button">Edit</button>}
        footer={<button type="button">Archive</button>}
      >
        <p>Primary contact</p>
      </RecordDrawer>,
    );

    expect(screen.getByRole("dialog", { name: "Acme Corporation" })).toBeDefined();
    expect(screen.getByText("Company details")).toBeDefined();
    expect(screen.getByText("Primary contact")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Close record drawer" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
