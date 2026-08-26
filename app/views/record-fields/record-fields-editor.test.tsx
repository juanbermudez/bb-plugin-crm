// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  FieldDefinition,
  FieldValueDto,
} from "../../../contracts/core.js";
import {
  RecordFieldsEditor,
  validateRecordFieldDraft,
  type RecordFieldsRpcClient,
} from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

function definition(
  overrides: Partial<FieldDefinition> & Pick<FieldDefinition, "id" | "label" | "type">,
): FieldDefinition {
  return {
    id: overrides.id,
    entity: "COMPANY",
    key: overrides.id,
    label: overrides.label,
    type: overrides.type,
    agentFilled: false,
    agentBrief: null,
    required: false,
    showOnSheet: true,
    showOnTable: false,
    showOnFilter: false,
    position: 0,
    archived: false,
    archivedAt: null,
    options: [],
    ...overrides,
  };
}

function value(
  fieldId: string,
  fieldValue: FieldValueDto["value"],
  id = `value-${fieldId}`,
): FieldValueDto {
  return {
    id,
    fieldId,
    entity: "COMPANY",
    recordId: "cmp_acme",
    value: fieldValue,
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

function makeRpc(
  implementation: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(implementation);
  return { call } as unknown as RecordFieldsRpcClient & { call: typeof call };
}

describe("RecordFieldsEditor", () => {
  it("loads only active sheet fields in position order and renders typed current values", async () => {
    const fields = [
      definition({
        id: "field-hidden",
        label: "Hidden",
        type: "TEXT",
        position: 1,
        showOnSheet: false,
      }),
      definition({
        id: "field-plan",
        label: "Plan",
        type: "SELECT",
        position: 2,
        options: [
          { id: "opt-pro", label: "Pro", position: 0 },
          {
            id: "opt-legacy",
            label: "Legacy",
            position: 1,
            archived: true,
            archivedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
      definition({
        id: "field-site",
        label: "Website",
        type: "URL",
        position: 0,
      }),
      definition({
        id: "field-archived",
        label: "Archived",
        type: "TEXT",
        position: 3,
        archived: true,
        archivedAt: "2026-08-01T00:00:00.000Z",
      }),
      definition({
        id: "field-active-number",
        label: "Employees",
        type: "NUMBER",
        position: 4,
      }),
    ];
    const rpc = makeRpc(async (method) => {
      if (method === "fields_list") return fields;
      if (method === "fields_values_list") {
        return [
          value("field-site", "https://acme.example"),
          value("field-plan", "opt-legacy"),
          value("field-active-number", 42),
        ];
      }
      throw new Error(`Unexpected method ${method}`);
    });

    render(
      <RecordFieldsEditor
        entity="COMPANY"
        recordId="cmp_acme"
        rpcClient={rpc}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Custom fields" })).toBeDefined();
    expect(screen.queryByLabelText("Hidden")).toBeNull();
    expect(screen.queryByLabelText("Archived")).toBeNull();
    expect((screen.getByLabelText("Website") as HTMLInputElement).value).toBe(
      "https://acme.example",
    );
    expect((screen.getByLabelText("Employees") as HTMLInputElement).value).toBe("42");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("opt-legacy");
    expect(
      (within(screen.getByRole("combobox")).getByText("Legacy (archived)") as HTMLOptionElement)
        .disabled,
    ).toBe(true);

    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Website"),
      expect.stringContaining("Plan"),
      expect.stringContaining("Employees"),
    ]);
    expect(rpc.call).toHaveBeenCalledWith("fields_list", {
      entity: "COMPANY",
      includeArchived: false,
    });
    expect(rpc.call).toHaveBeenCalledWith("fields_values_list", {
      entity: "COMPANY",
      recordId: "cmp_acme",
      includeArchived: false,
    });
  });

  it("creates, updates, and deletes values with explicit accessible field saves", async () => {
    const fields = [
      definition({ id: "field-name", label: "Short name", type: "TEXT", position: 0 }),
      definition({ id: "field-email", label: "Email", type: "EMAIL", position: 1 }),
      definition({ id: "field-site", label: "Website", type: "URL", position: 2 }),
    ];
    const calls: Array<{ method: string; input: unknown }> = [];
    const rpc = makeRpc(async (method, input) => {
      calls.push({ method, input });
      if (method === "fields_list") return fields;
      if (method === "fields_values_list") {
        return [value("field-name", "Acme"), value("field-site", "https://acme.example")];
      }
      if (method === "fields_values_create") {
        const createInput = input as { fieldId: string; value: FieldValueDto["value"] };
        return value(createInput.fieldId, createInput.value, "value-created");
      }
      if (method === "fields_values_update") {
        const updateInput = input as { fieldId: string; value: FieldValueDto["value"] };
        return value(updateInput.fieldId, updateInput.value);
      }
      if (method === "fields_values_delete") return { id: "value-field-site" };
      throw new Error(`Unexpected method ${method}`);
    });

    render(
      <RecordFieldsEditor
        entity="CONTACT"
        recordId="con_amy"
        rpcClient={rpc}
      />,
    );
    await screen.findByLabelText("Short name");

    fireEvent.change(screen.getByLabelText("Short name"), {
      target: { value: "Acme North" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Short name" }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "fields_values_update",
        input: {
          id: "value-field-name",
          entity: "CONTACT",
          recordId: "con_amy",
          fieldId: "field-name",
          value: "Acme North",
        },
      }),
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "amy@acme.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Email" }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "fields_values_create",
        input: {
          entity: "CONTACT",
          recordId: "con_amy",
          fieldId: "field-email",
          value: "amy@acme.example",
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear Website" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Website" }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "fields_values_delete",
        input: {
          id: "value-field-site",
          entity: "CONTACT",
          recordId: "con_amy",
          fieldId: "field-site",
        },
      }),
    );
    expect(screen.getByText("Website saved.")).toBeDefined();
  });

  it("renders a control for every supported field type", async () => {
    const fields = [
      definition({ id: "field-text", label: "Text", type: "TEXT", position: 0 }),
      definition({ id: "field-long", label: "Long text", type: "LONG_TEXT", position: 1 }),
      definition({ id: "field-number", label: "Number", type: "NUMBER", position: 2 }),
      definition({ id: "field-check", label: "Opt in", type: "CHECKBOX", position: 3 }),
      definition({ id: "field-date", label: "Date", type: "DATE", position: 4 }),
      definition({ id: "field-url", label: "URL", type: "URL", position: 5 }),
      definition({ id: "field-email", label: "Email", type: "EMAIL", position: 6 }),
      definition({ id: "field-phone", label: "Phone", type: "PHONE", position: 7 }),
      definition({
        id: "field-select",
        label: "Select",
        type: "SELECT",
        position: 8,
        options: [{ id: "option-one", label: "One", position: 0 }],
      }),
      definition({ id: "field-user", label: "User", type: "USER", position: 9 }),
    ];
    const rpc = makeRpc(async (method) => {
      if (method === "fields_list") return fields;
      if (method === "fields_values_list") return [];
      throw new Error(`Unexpected method ${method}`);
    });

    render(<RecordFieldsEditor entity="COMPANY" recordId="cmp_1" rpcClient={rpc} />);
    await screen.findByLabelText("Text");

    expect(screen.getByLabelText("Long text").tagName).toBe("TEXTAREA");
    expect((screen.getByLabelText("Number") as HTMLInputElement).type).toBe("number");
    expect((screen.getByLabelText("Opt in") as HTMLInputElement).type).toBe("checkbox");
    expect((screen.getByLabelText("Date") as HTMLInputElement).type).toBe("date");
    expect((screen.getByLabelText("URL") as HTMLInputElement).type).toBe("url");
    expect((screen.getByLabelText("Email") as HTMLInputElement).type).toBe("email");
    expect((screen.getByLabelText("Phone") as HTMLInputElement).type).toBe("tel");
    expect(screen.getByLabelText("Select").tagName).toBe("SELECT");
    expect((screen.getByLabelText("User") as HTMLInputElement).type).toBe("text");
  });

  it("validates required, date, URL, select, and phone drafts before calling the host", async () => {
    const required = definition({
      id: "field-required",
      label: "Required name",
      type: "TEXT",
      required: true,
      position: 0,
    });
    const date = definition({
      id: "field-date",
      label: "Start date",
      type: "DATE",
      required: true,
      position: 1,
    });
    const url = definition({
      id: "field-url",
      label: "Site",
      type: "URL",
      required: true,
      position: 2,
    });
    const select = definition({
      id: "field-select",
      label: "Tier",
      type: "SELECT",
      required: true,
      position: 3,
      options: [{ id: "opt-basic", label: "Basic", position: 0 }],
    });
    const phone = definition({
      id: "field-phone",
      label: "Phone",
      type: "PHONE",
      required: true,
      position: 4,
    });
    const rpc = makeRpc(async (method) => {
      if (method === "fields_list") return [required, date, url, select, phone];
      if (method === "fields_values_list") return [];
      throw new Error("A validation failure should not issue a write RPC.");
    });

    render(
      <RecordFieldsEditor entity="DEAL" recordId="deal_1" rpcClient={rpc} />,
    );
    await screen.findByLabelText("Required name");

    fireEvent.click(screen.getByRole("button", { name: "Save all fields" }));
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "Required name is required.",
      "Start date is required.",
      "Site is required.",
      "Tier is required.",
      "Phone is required.",
    ]);

    fireEvent.change(screen.getByLabelText("Required name"), {
      target: { value: "Deal" },
    });
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-02-30" },
    });
    fireEvent.change(screen.getByLabelText("Site"), {
      target: { value: "not a URL" },
    });
    fireEvent.change(screen.getByLabelText("Tier"), {
      target: { value: "archived-option" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save all fields" }));

    expect(screen.getByText("Start date is required.")).toBeDefined();
    expect(screen.getByText("Site must be a valid URL.")).toBeDefined();
    expect(screen.getByText("Tier is required.")).toBeDefined();
    expect(screen.getByText("Phone must be a valid phone number.")).toBeDefined();
    expect(rpc.call).not.toHaveBeenCalledWith("fields_values_create", expect.anything());
    expect(rpc.call).not.toHaveBeenCalledWith("fields_values_update", expect.anything());
    expect(rpc.call).not.toHaveBeenCalledWith("fields_values_delete", expect.anything());
    expect(validateRecordFieldDraft(date, "2026-02-30").error).toBe(
      "Start date must be a valid date.",
    );
  });

  it("surfaces loading, empty, and RPC error states", async () => {
    let resolveFields: ((value: FieldDefinition[]) => void) | undefined;
    const pending = new Promise<FieldDefinition[]>((resolve) => {
      resolveFields = resolve;
    });
    const loadingRpc = makeRpc(async (method) => {
      if (method === "fields_list") return pending;
      return [];
    });
    render(
      <RecordFieldsEditor entity="COMPANY" recordId="cmp_1" rpcClient={loadingRpc} />,
    );
    expect(screen.getByRole("status").textContent).toContain("Loading custom fields");
    resolveFields?.([]);
    expect(
      await screen.findByText("No custom fields are configured to show on this record."),
    ).toBeDefined();

    cleanup();
    const errorRpc = makeRpc(async () => {
      throw new Error("offline");
    });
    render(
      <RecordFieldsEditor entity="COMPANY" recordId="cmp_1" rpcClient={errorRpc} />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("offline");
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});
