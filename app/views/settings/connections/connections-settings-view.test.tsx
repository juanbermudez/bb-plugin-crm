// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Connection, SyncCursor } from "../../../../contracts/connections.js";
import {
  ConnectionsSettingsView,
  type ConnectionsRpcClient,
} from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const connection: Connection = {
  id: "conn_google",
  provider: "GOOGLE",
  externalAccountId: "workspace-1",
  displayName: "Google Workspace",
  configuration: { accountEmail: "ops@example.com" },
  scopes: ["calendar.readonly", "gmail.readonly"],
  enabled: true,
  health: {
    status: "CONNECTED",
    lastCheckedAt: "2026-08-25T12:00:00.000Z",
    lastSuccessAt: "2026-08-25T11:59:00.000Z",
    lastFailureAt: null,
    failureCode: null,
    failureMessage: null,
    consecutiveFailures: 0,
    updatedAt: "2026-08-25T12:00:00.000Z",
  },
  createdAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-25T12:00:00.000Z",
};

const cursor: SyncCursor = {
  id: "cursor_mail",
  connectionId: connection.id,
  stream: "mail",
  cursor: "cursor-1",
  lastSuccessAt: "2026-08-25T11:59:00.000Z",
  lastFailureAt: null,
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-25T11:59:00.000Z",
};

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "connections_list") return [connection];
      if (method === "connections_diagnostics") return { connection, syncCursors: [cursor] };
      if (method === "connections_health") return connection.health;
      if (method === "connections_disable") return { ...connection, enabled: false, health: { ...connection.health, status: "DISABLED" } };
      if (method === "connections_upsert") return connection;
      return connection;
    }),
  );
  return { call } as unknown as ConnectionsRpcClient & { call: typeof call };
}

describe("ConnectionsSettingsView", () => {
  it("shows provider health, non-secret metadata, scopes, and the OAuth boundary", async () => {
    const rpc = makeRpc();
    render(<ConnectionsSettingsView rpcClient={rpc} />);

    expect(await screen.findByText("Google Workspace")).toBeDefined();
    expect(screen.getByText("Google")).toBeDefined();
    expect(screen.getByText("Microsoft")).toBeDefined();
    expect(screen.getByText("Slack")).toBeDefined();
    expect(screen.getByText("calendar.readonly")).toBeDefined();
    expect(screen.getByText(/OAuth authorization is not bundled/)).toBeDefined();
    expect(rpc.call).toHaveBeenCalledWith("connections_list", {});
  });

  it("disables a connection and loads sync diagnostics with accessible actions", async () => {
    const rpc = makeRpc();
    render(<ConnectionsSettingsView rpcClient={rpc} />);
    await screen.findByText("Google Workspace");

    fireEvent.click(screen.getByRole("button", { name: "Disable Google connection" }));
    const confirmation = await screen.findByRole("dialog", {
      name: /Disable the google connection/,
    });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Disable connection" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("connections_disable", { id: connection.id }),
    );

    fireEvent.click(screen.getByRole("button", { name: "View diagnostics" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("connections_diagnostics", { id: connection.id }),
    );
    expect(await screen.findByText(/Cursor: cursor-1/)).toBeDefined();
    expect(screen.getByText("Sync diagnostics")).toBeDefined();
  });

  it("runs a provider sync from the connection card", async () => {
    const rpc = makeRpc(async (method) => {
      if (method === "connections_list") return [connection];
      if (method === "connections_syncNow") {
        return { provider: "GOOGLE", connection, emailMessages: 2, calendarEvents: 1, channels: 0, people: 0, matchedPeople: 0 };
      }
      if (method === "connections_health") return connection.health;
      return connection;
    });
    render(<ConnectionsSettingsView rpcClient={rpc} />);
    await screen.findByText("Google Workspace");

    fireEvent.click(screen.getByRole("button", { name: "Sync Google now" }));
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith("connections_syncNow", { id: connection.id }));
  });

  it("renders Slack channel inventory and exact-email people matches", async () => {
    const slack = { ...connection, id: "conn_slack", provider: "SLACK" as const, displayName: "Acme Slack", externalAccountId: "T1", configuration: {}, scopes: ["users:read"] };
    const rpc = makeRpc(async (method) => {
      if (method === "connections_list") return [slack];
      if (method === "slack_channels_list") return [{ id: "slack_channel_C1", slackChannelId: "C1", name: "sales", isPrivate: false, isMember: true, memberCount: 8 }];
      if (method === "slack_matches_list") return [{ id: "slack_match_1", contactId: "con_ada", contactName: "Ada Lovelace", contactEmail: "ada@example.com", slackUserId: "U1", slackHandle: "@ada", slackEmail: "ada@example.com", matched: true }];
      return slack;
    });
    render(<ConnectionsSettingsView rpcClient={rpc} />);

    expect(await screen.findByText("#sales")).toBeDefined();
    expect(screen.getByText("Ada Lovelace")).toBeDefined();
    expect(screen.getByText("@ada")).toBeDefined();
  });
});
