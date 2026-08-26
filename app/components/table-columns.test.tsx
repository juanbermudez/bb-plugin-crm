// @vitest-environment jsdom

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ColumnPreferences,
  normalizeColumnPreference,
  usePersistentColumnPreferences,
  type TableColumnPreference,
} from "./table-columns.js";

const columns: readonly TableColumnPreference[] = [
  { id: "name", label: "Name", required: true },
  { id: "domain", label: "Domain" },
  { id: "segment", label: "Segment", defaultVisible: false },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function PreferenceHarness() {
  const preference = usePersistentColumnPreferences("test:columns", columns);
  return (
    <>
      <output data-testid="order">
        {preference.orderedColumns.map((column) => column.id).join(",")}
      </output>
      <output data-testid="visible">
        {preference.visibleColumns.map((column) => column.id).join(",")}
      </output>
      <ColumnPreferences preference={preference} />
    </>
  );
}

function AsyncColumnsHarness() {
  const [customFieldsLoaded, setCustomFieldsLoaded] = React.useState(false);
  const asyncBaseColumns = columns.filter((column) => column.id !== "segment");
  const availableColumns = customFieldsLoaded
    ? [
        ...asyncBaseColumns,
        { id: "field:website", label: "Website" },
      ]
    : asyncBaseColumns;
  const preference = usePersistentColumnPreferences(
    "test:columns",
    availableColumns,
  );
  return (
    <>
      <output data-testid="async-order">
        {preference.orderedColumns.map((column) => column.id).join(",")}
      </output>
      <output data-testid="async-visible">
        {preference.visibleColumns.map((column) => column.id).join(",")}
      </output>
      <button type="button" onClick={() => preference.apply(["name"])}>
        Apply saved columns
      </button>
      <button type="button" onClick={() => setCustomFieldsLoaded(true)}>
        Load custom fields
      </button>
    </>
  );
}

describe("persistent table column preferences", () => {
  it("normalizes stale, hidden, and newly available fields", () => {
    expect(
      normalizeColumnPreference(columns, {
        order: ["domain", "unknown", "domain"],
        hidden: ["name", "domain"],
      }),
    ).toEqual({
      order: ["domain", "name", "segment"],
      hidden: ["domain"],
    });

    expect(normalizeColumnPreference(columns)).toEqual({
      order: ["name", "domain", "segment"],
      hidden: ["segment"],
    });
  });

  it("persists visibility and ordering across mounts", () => {
    const { unmount } = render(<PreferenceHarness />);
    expect(screen.getByTestId("visible").textContent).toBe("name,domain");

    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Domain" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Segment" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Segment up" }));

    expect(screen.getByTestId("visible").textContent).toBe("name,segment");
    expect(JSON.parse(window.localStorage.getItem("test:columns") ?? "{}"))
      .toEqual({
        order: ["name", "segment", "domain"],
        hidden: ["domain"],
      });

    unmount();
    render(<PreferenceHarness />);
    expect(screen.getByTestId("order").textContent).toBe("name,segment,domain");
    expect(screen.getByTestId("visible").textContent).toBe("name,segment");
  });

  it("restores saved custom columns when definitions arrive asynchronously", async () => {
    window.localStorage.setItem(
      "test:columns",
      JSON.stringify({
        order: ["name", "field:website", "domain"],
        hidden: ["domain"],
      }),
    );
    render(<AsyncColumnsHarness />);

    expect(screen.getByTestId("async-order").textContent).toBe("name,domain");
    fireEvent.click(screen.getByRole("button", { name: "Load custom fields" }));

    await waitFor(() =>
      expect(screen.getByTestId("async-order").textContent).toBe(
        "name,field:website,domain",
      ),
    );
    expect(screen.getByTestId("async-visible").textContent).toBe(
      "name,field:website",
    );
    expect(JSON.parse(window.localStorage.getItem("test:columns") ?? "{}"))
      .toEqual({
        order: ["name", "field:website", "domain"],
        hidden: ["domain"],
      });
  });

  it("keeps newly loaded fields hidden when a saved view omitted them", async () => {
    render(<AsyncColumnsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Apply saved columns" }));
    fireEvent.click(screen.getByRole("button", { name: "Load custom fields" }));

    await waitFor(() =>
      expect(screen.getByTestId("async-order").textContent).toBe(
        "name,domain,field:website",
      ),
    );
    expect(screen.getByTestId("async-visible").textContent).toBe("name");
  });
});
