// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EntityPicker } from "./entity-picker.js";

const options = [
  { value: "company-acme", label: "Acme", description: "acme.example" },
  { value: "company-globex", label: "Globex", description: "globex.example" },
];

describe("EntityPicker", () => {
  it("selects persisted CRM choices with arrow-and-enter keyboard controls", () => {
    const onChange = vi.fn();
    render(
      <EntityPicker
        label="Company"
        value={null}
        options={options}
        optional
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Company" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("company-globex");
  });

  it("filters choices without accepting arbitrary typed text", () => {
    const onChange = vi.fn();
    render(
      <EntityPicker
        label="Owner"
        value={null}
        options={options}
        optional
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Owner" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "not-a-real-id" } });

    expect(screen.getByText("No matching CRM records.")).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
  });
});
