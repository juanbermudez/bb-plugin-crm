// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ListControls } from "./list-controls.js";

describe("ListControls compact toolbar", () => {
  it("searches large facet sets and applies a selected option", () => {
    const onFiltersChange = vi.fn();
    render(
      <ListControls
        compact
        entityLabel="companies"
        sort="name"
        dir="asc"
        sortOptions={[{ value: "name", label: "Company" }]}
        filters={{}}
        facets={[{
          id: "owner",
          label: "Owner",
          options: Array.from({ length: 10 }, (_, index) => ({
            value: `owner-${index + 1}`,
            label: `Owner ${index + 1}`,
          })),
        }]}
        onSortChange={vi.fn()}
        onDirChange={vi.fn()}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search filters" }), {
      target: { value: "Owner 9" },
    });
    expect(screen.getByLabelText("Owner 9")).toBeDefined();
    expect(screen.queryByLabelText("Owner 1")).toBeNull();
    fireEvent.click(screen.getByLabelText("Owner 9"));
    expect(onFiltersChange).toHaveBeenCalledWith({ owner: ["owner-9"] });
  });
});
