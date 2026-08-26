// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TableToolbarSelect } from "./table-toolbar-select.js";

describe("TableToolbarSelect", () => {
  it("opens the ejected beUI list and reports the selected value", () => {
    const onValueChange = vi.fn();
    render(
      <TableToolbarSelect
        label="Sort contacts"
        value="createdAt"
        options={[
          { value: "createdAt", label: "Created" },
          { value: "name", label: "Contact" },
        ]}
        onValueChange={onValueChange}
        icon="Sort"
        className="w-36"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Sort contacts" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("option", { name: "Created" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "Contact" }));
    expect(onValueChange).toHaveBeenCalledWith("name");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
