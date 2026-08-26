// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
