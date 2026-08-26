// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  SavedView,
  SavedViewFilters,
} from "../../../contracts/core.js";
import { SavedViewBar, type SavedViewsRpcClient } from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const defaultFilters: SavedViewFilters = {
  q: "",
  sort: "",
  dir: "asc",
  archived: false,
  filters: {},
  columns: [],
};

const currentFilters: SavedViewFilters = {
  ...defaultFilters,
  q: "acme",
  sort: "name",
  columns: ["name", "owner"],
  filters: { owner: ["local_user"] },
};

const pipelineView: SavedView = {
  id: "view_pipeline",
  entity: "DEAL",
  name: "Pipeline",
  shared: true,
  filters: currentFilters,
  ownerId: "local_user",
  mine: true,
  isDefault: false,
};

function makeRpc(
  implementation: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(implementation);
  return { call } as unknown as SavedViewsRpcClient & { call: typeof call };
}

describe("SavedViewBar", () => {
  it("loads entity views, applies a selection, and exposes sharing/default state", async () => {
    const applied = vi.fn();
    const rpc = makeRpc(async (method) => {
      if (method === "savedViews_list") return [pipelineView];
      return pipelineView;
    });

    render(
      <SavedViewBar
        entity="DEAL"
        currentFilters={defaultFilters}
        rpcClient={rpc}
        onApplyFilters={applied}
      />,
    );

    const chooser = await screen.findByRole("combobox", { name: "Saved views" });
    expect(screen.getByRole("option", { name: /Pipeline/ })).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("savedViews_list", { entity: "DEAL" });

    fireEvent.change(chooser, { target: { value: pipelineView.id } });
    expect(applied).toHaveBeenCalledWith(currentFilters, pipelineView);
    expect(screen.getByText("Shared")).toBeDefined();
    expect(screen.getByText("Owner: local_user")).toBeDefined();
    expect(screen.getByRole("button", { name: "Set as default" })).toBeDefined();
  });

  it("saves the current filters and updates the selected owned view", async () => {
    const created: SavedView = {
      ...pipelineView,
      id: "view_qualified",
      name: "Qualified accounts",
      entity: "COMPANY",
      shared: false,
    };
    const updated: SavedView = {
      ...created,
      filters: { ...currentFilters, q: "updated" },
    };
    const applied = vi.fn();
    const rpc = makeRpc(async (method) => {
      if (method === "savedViews_list") return [];
      if (method === "savedViews_create") return created;
      if (method === "savedViews_update") return updated;
      return created;
    });

    render(
      <SavedViewBar
        entity="COMPANY"
        currentFilters={currentFilters}
        rpcClient={rpc}
        onApplyFilters={applied}
      />,
    );
    await screen.findByRole("button", { name: "Save current view" });

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
    expect(screen.getByRole("dialog", { name: "Save current view" })).toBeDefined();
    expect(screen.getByText(/created for local_user/)).toBeDefined();
    fireEvent.change(screen.getByLabelText("View name"), {
      target: { value: "Qualified accounts" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Share with the workspace/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("savedViews_create", {
        entity: "COMPANY",
        name: "Qualified accounts",
        shared: true,
        filters: currentFilters,
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Save current view" })).toBeNull();
    expect(screen.getByText("Qualified accounts")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Update view" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("savedViews_update", {
        id: "view_qualified",
        data: { filters: currentFilters },
      }),
    );
    expect(applied).toHaveBeenLastCalledWith(updated.filters, updated);
  });

  it("sets a default view, resets to the default state, and deletes owned views", async () => {
    const defaulted: SavedView = { ...pipelineView, isDefault: true };
    const applied = vi.fn();
    const rpc = makeRpc(async (method) => {
      if (method === "savedViews_list") return [pipelineView];
      if (method === "savedViews_setDefault") return defaulted;
      if (method === "savedViews_delete") return { id: pipelineView.id };
      return pipelineView;
    });

    render(
      <SavedViewBar
        entity="CONTACT"
        currentFilters={currentFilters}
        rpcClient={rpc}
        onApplyFilters={applied}
      />,
    );
    const chooser = await screen.findByRole("combobox", { name: "Saved views" });
    fireEvent.change(chooser, { target: { value: pipelineView.id } });

    fireEvent.click(screen.getByRole("button", { name: "Set as default" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("savedViews_setDefault", {
        id: pipelineView.id,
      }),
    );
    expect(screen.getByText("Default")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(applied).toHaveBeenLastCalledWith(currentFilters, defaulted);

    fireEvent.change(chooser, { target: { value: pipelineView.id } });
    fireEvent.click(screen.getByRole("button", { name: "Delete view" }));
    const confirmation = await screen.findByRole("dialog", {
      name: /Delete the saved view “Pipeline”/,
    });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete view" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("savedViews_delete", {
        id: pipelineView.id,
      }),
    );
  });

  it("applies the persisted default view when the workspace loads", async () => {
    const defaulted: SavedView = { ...pipelineView, isDefault: true };
    const applied = vi.fn();
    const rpc = makeRpc(async () => [defaulted]);

    render(
      <SavedViewBar
        entity="DEAL"
        currentFilters={defaultFilters}
        rpcClient={rpc}
        onApplyFilters={applied}
      />,
    );

    await waitFor(() =>
      expect(applied).toHaveBeenCalledWith(currentFilters, defaulted),
    );
    expect(
      (screen.getByRole("combobox", { name: "Saved views" }) as HTMLSelectElement)
        .value,
    ).toBe(defaulted.id);
    expect(screen.getByText("Showing default view Pipeline.")).toBeDefined();
  });
});
