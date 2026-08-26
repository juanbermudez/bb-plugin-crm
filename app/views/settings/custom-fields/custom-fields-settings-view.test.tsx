// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FieldDefinition, FieldOption } from "../../../../contracts/core.js";
import {
  CustomFieldsSettingsView,
  type CustomFieldsRpcClient,
} from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const segmentOption: FieldOption = {
  id: "option_enterprise",
  fieldId: "field_segment",
  label: "Enterprise",
  position: 0,
  archived: false,
  archivedAt: null,
};

const secondSegmentOption: FieldOption = {
  ...segmentOption,
  id: "option_startup",
  label: "Startup",
  position: 1,
};

const segment: FieldDefinition = {
  id: "field_segment",
  entity: "COMPANY",
  key: "segment",
  label: "Segment",
  type: "SELECT",
  agentFilled: true,
  agentBrief: "Use the account's current plan.",
  required: false,
  showOnSheet: true,
  showOnTable: true,
  showOnFilter: true,
  position: 0,
  archived: false,
  archivedAt: null,
  options: [segmentOption],
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const seats: FieldDefinition = {
  id: "field_seats",
  entity: "COMPANY",
  key: "seats",
  label: "Seats",
  type: "NUMBER",
  agentFilled: false,
  agentBrief: null,
  required: true,
  showOnSheet: true,
  showOnTable: false,
  showOnFilter: false,
  position: 1,
  archived: false,
  archivedAt: null,
  options: [],
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const archivedField: FieldDefinition = {
  ...seats,
  id: "field_legacy",
  key: "legacy",
  label: "Legacy tier",
  position: 2,
  archived: true,
  archivedAt: "2026-08-21T00:00:00.000Z",
};

function makeRpc(
  fields: readonly FieldDefinition[] = [segment, seats],
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "fields_list") return fields;
      if (method === "fields_coverage") return { filled: 4, total: 10 };
      if (method === "fields_options_list") return [segmentOption, secondSegmentOption];
      if (method === "fields_reorder") return fields;
      if (method === "fields_create") return segment;
      if (method === "fields_update") return segment;
      if (method === "fields_delete") return { id: "field_segment" };
      return segment;
    }),
  );
  return { call } as unknown as CustomFieldsRpcClient & { call: typeof call };
}

describe("CustomFieldsSettingsView", () => {
  it("loads entity tabs, definitions, ordering metadata, and coverage", async () => {
    const rpc = makeRpc([segment, seats]);
    render(<CustomFieldsSettingsView rpcClient={rpc} />);

    expect(await screen.findByText("Segment")).toBeDefined();
    expect(screen.getByText("Select")).toBeDefined();
    expect(screen.getAllByText("4 of 10 (40%)").length).toBe(2);
    expect(screen.getByRole("tab", { name: /Companies/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(rpc.call).toHaveBeenCalledWith("fields_list", {
      entity: "COMPANY",
      includeArchived: false,
    });
    expect(rpc.call).toHaveBeenCalledWith("fields_coverage", { id: segment.id });
    expect(rpc.call).toHaveBeenCalledWith("fields_coverage", { id: seats.id });
  });

  it("creates a select field with flags, agent guidance, and options", async () => {
    const created: FieldDefinition = {
      ...segment,
      id: "field_customer_tier",
      key: "customer_tier",
      label: "Customer tier",
    };
    const rpc = makeRpc([], async (method) => {
      if (method === "fields_list") return [];
      if (method === "fields_coverage") return { filled: 0, total: 0 };
      if (method === "fields_create") return created;
      return [];
    });
    render(<CustomFieldsSettingsView rpcClient={rpc} />);
    await screen.findByText("No active companies fields");

    fireEvent.click(screen.getAllByRole("button", { name: "Add custom field" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Add custom field" });
    fireEvent.change(within(dialog).getByLabelText("Field label"), {
      target: { value: "Customer tier" },
    });
    fireEvent.change(within(dialog).getByLabelText("Field type"), {
      target: { value: "SELECT" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add option" }));
    fireEvent.change(within(dialog).getByLabelText("Option 1"), {
      target: { value: "Enterprise" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Agent brief \/ instructions/), {
      target: { value: "Choose the latest plan from the account evidence." },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Required" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Show in table" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create field" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_create", {
        entity: "COMPANY",
        label: "Customer tier",
        type: "SELECT",
        options: [{ label: "Enterprise", position: 0 }],
        agentFilled: true,
        agentBrief: "Choose the latest plan from the account evidence.",
        required: true,
        showOnSheet: true,
        showOnTable: true,
        showOnFilter: false,
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Add custom field" })).toBeNull();
  });

  it("confirms archive, restore, delete, and sends reorder requests", async () => {
    const rpc = makeRpc([segment, seats, archivedField]);
    render(<CustomFieldsSettingsView rpcClient={rpc} />);
    await screen.findByText("Segment");

    fireEvent.click(screen.getByRole("button", { name: "Move field “Segment” down" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_reorder", {
        entity: "COMPANY",
        ids: [seats.id, segment.id],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive field “Segment”" }));
    let confirmation = await screen.findByRole("dialog", { name: /Archive the “Segment” field/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_archive", { id: segment.id }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived fields" }));
    expect(await screen.findByText("Legacy tier")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Restore field “Legacy tier”" }));
    confirmation = await screen.findByRole("dialog", { name: /Restore the “Legacy tier” field/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_restore", { id: archivedField.id }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete field “Legacy tier”" }));
    confirmation = await screen.findByRole("dialog", { name: /Delete the “Legacy tier” field/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_delete", { id: archivedField.id }),
    );
  });

  it("edits field metadata and manages persisted select options", async () => {
    const rpc = makeRpc([segment], async (method) => {
      if (method === "fields_list") return [segment];
      if (method === "fields_coverage") return { filled: 1, total: 1 };
      if (method === "fields_options_list") return [segmentOption, secondSegmentOption];
      if (method === "fields_options_archive") return { ...segmentOption, archived: true };
      if (method === "fields_options_restore") return segmentOption;
      if (method === "fields_options_delete") return { id: segmentOption.id };
      if (method === "fields_update") return { ...segment, label: "Customer segment" };
      return segment;
    });
    render(<CustomFieldsSettingsView rpcClient={rpc} />);
    await screen.findByText("Segment");

    fireEvent.click(screen.getByRole("button", { name: "Edit field “Segment”" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Segment" });
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_options_list", {
        fieldId: segment.id,
        includeArchived: true,
      }),
    );
    expect(await within(dialog).findByDisplayValue("Startup")).toBeDefined();
    fireEvent.change(within(dialog).getByLabelText("Field label"), {
      target: { value: "Customer segment" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive option Enterprise" }));
    let confirmation = await screen.findByRole("dialog", { name: /Archive the “Enterprise” option/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_options_archive", {
        id: segmentOption.id,
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore option Enterprise" }));
    confirmation = await screen.findByRole("dialog", { name: /Restore the “Enterprise” option/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_options_restore", {
        id: segmentOption.id,
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete option Enterprise" }));
    confirmation = await screen.findByRole("dialog", { name: /Delete the “Enterprise” option/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_options_delete", {
        id: segmentOption.id,
      }),
    );
    const save = within(dialog).getByRole("button", { name: "Save changes" });
    await waitFor(() => {
      if ((save as HTMLButtonElement).disabled) throw new Error("Option mutation still busy");
    });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_update", {
        id: segment.id,
        data: {
          label: "Customer segment",
          type: "SELECT",
          options: [{ id: secondSegmentOption.id, label: secondSegmentOption.label, position: 0 }],
          agentFilled: true,
          agentBrief: "Use the account's current plan.",
          required: false,
          showOnSheet: true,
          showOnTable: true,
          showOnFilter: true,
        },
      }),
    );
  });

  it("queues fill-rest from the editor only for an incomplete agent-filled field", async () => {
    const rpc = makeRpc([segment, seats], async (method, input) => {
      if (method === "fields_list") return [segment, seats];
      if (method === "fields_coverage") {
        return (input as { id: string }).id === segment.id
          ? { filled: 4, total: 10 }
          : { filled: 10, total: 10 };
      }
      if (method === "fields_options_list") return [segmentOption];
      if (method === "fields_backfill") return { queued: true };
      return segment;
    });
    render(<CustomFieldsSettingsView rpcClient={rpc} />);
    await screen.findByText("Segment");

    fireEvent.click(screen.getByRole("button", { name: "Edit field “Segment”" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Segment" });
    const fillRest = within(dialog).getByRole("button", { name: "Fill the rest" });
    expect((fillRest as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(fillRest);

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("fields_backfill", { id: segment.id }),
    );
    expect(screen.getByText("Fill-rest research queued for Segment.")).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await screen.findByText("Seats");
    fireEvent.click(screen.getByRole("button", { name: "Edit field “Seats”" }));
    const manualDialog = await screen.findByRole("dialog", { name: "Edit Seats" });
    expect(within(manualDialog).queryByRole("button", { name: "Fill the rest" })).toBeNull();
  });

  it("keeps the list usable when a coverage request fails", async () => {
    const rpc = makeRpc([segment], async (method) => {
      if (method === "fields_list") return [segment];
      if (method === "fields_coverage") throw new Error("coverage unavailable");
      if (method === "fields_options_list") return [segmentOption];
      return segment;
    });
    render(<CustomFieldsSettingsView rpcClient={rpc} />);

    expect(await screen.findByText("Segment")).toBeDefined();
    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
