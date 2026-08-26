// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceIdentity } from "../../../../contracts/workspace.js";
import { WorkspaceSettingsView } from "./workspace-settings-view.js";
import type { WorkspaceRpcClient } from "./rpc.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(cleanup);

const identity: WorkspaceIdentity = {
  workspaceName: "Acme CRM",
  website: "https://acme.example",
  profile: {
    website: "https://acme.example",
    narrative: "Acme sells compliance automation to growing software companies.",
    sells: "Compliance automation",
    sellsTo: "Growing software companies",
    edge: "Fast evidence collection",
    sourceUrl: "https://acme.example/about",
    refreshedAt: "2026-08-26T10:00:00.000Z",
  },
};

describe("WorkspaceSettingsView", () => {
  it("loads and saves the installation website and persistent profile", async () => {
    const call = vi.fn(async (method: string, input?: unknown) => {
      if (method === "workspace_identity_get") return identity;
      if (method === "workspace_identity_update") {
        return {
          ...identity,
          website: "https://new.acme.example",
          profile: {
            ...identity.profile!,
            website: "https://new.acme.example",
            ...(input as object),
          },
        };
      }
      throw new Error(`Unexpected method ${method}`);
    });
    render(
      <WorkspaceSettingsView
        rpcClient={{ call } as unknown as WorkspaceRpcClient}
      />,
    );

    const websiteInput = await screen.findByDisplayValue("acme.example");
    expect(screen.getByText(/BB-managed workspace name is Acme CRM/)).toBeDefined();
    fireEvent.change(websiteInput, {
      target: { value: "new.acme.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        "workspace_identity_update",
        expect.objectContaining({
          website: "new.acme.example",
          narrative: identity.profile!.narrative,
        }),
      );
    });
    expect(await screen.findByText("Workspace profile saved.")).toBeDefined();
  });

  it("allows the source workspace form to save a website without a profile", async () => {
    const call = vi.fn(async (method: string, input?: unknown) => {
      if (method === "workspace_identity_get") {
        return { workspaceName: "Acme CRM", website: null, profile: null };
      }
      if (method === "workspace_identity_update") {
        return {
          workspaceName: "Acme CRM",
          website: "https://acme.example",
          profile: null,
          ...(input as object),
        };
      }
      throw new Error(`Unexpected method ${method}`);
    });
    render(
      <WorkspaceSettingsView
        rpcClient={{ call } as unknown as WorkspaceRpcClient}
      />,
    );

    const website = await screen.findByPlaceholderText("acme.com");
    const profile = screen.getByPlaceholderText(
      "Optional: what the company does, how it makes money, and who it serves.",
    );
    expect(profile.hasAttribute("required")).toBe(false);
    fireEvent.change(website, { target: { value: "acme.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith("workspace_identity_update", expect.objectContaining({
        website: "acme.example",
        narrative: "",
      }));
    });
  });
});
