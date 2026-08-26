// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackingAggregate, TrackingSite, TrackingToken } from "../../../../contracts/connections.js";
import {
  TrackingSettingsView,
  type TrackingRpcClient,
} from "./index.js";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => ({ call: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const site: TrackingSite = {
  id: "site_marketing",
  siteKey: "marketing_site",
  name: "Marketing site",
  allowedDomains: ["example.com", "*.preview.example.com"],
  status: "ACTIVE",
  verificationStatus: "PENDING",
  verifiedAt: null,
  pausedAt: null,
  rotatedAt: null,
  retention: {
    siteId: "site_marketing",
    eventRetentionDays: 30,
    aggregateRetentionDays: 730,
    lastRollupAt: null,
    lastPrunedAt: null,
    updatedAt: "2026-08-25T10:00:00.000Z",
  },
  createdAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-25T10:00:00.000Z",
};

const token: TrackingToken = {
  id: "token_tracking",
  siteId: site.id,
  scope: "TRACKING",
  tokenHint: "abcdef123456",
  createdAt: "2026-08-25T10:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
};

const aggregate: TrackingAggregate = {
  siteId: site.id,
  day: "2026-08-25",
  eventType: "PAGE_VIEW",
  path: "/pricing",
  source: "newsletter",
  eventCount: 4,
  uniqueVisitors: 3,
  firstSeenAt: "2026-08-25T10:00:00.000Z",
  lastSeenAt: "2026-08-25T11:00:00.000Z",
  rolledUpAt: "2026-08-25T12:00:00.000Z",
};

function makeRpc(
  implementation?: (method: string, input: unknown) => Promise<unknown>,
) {
  const call = vi.fn(
    implementation ?? (async (method: string) => {
      if (method === "tracking_sites_list") return [site];
      if (method === "tracking_tokens_list") return [token];
      if (method === "tracking_aggregates_list") return [aggregate];
      if (method === "tracking_sites_verify") return { ...site, verificationStatus: "VERIFIED" };
      if (method === "tracking_sites_pause") return { ...site, status: "PAUSED" };
      if (method === "tracking_sites_create") return { ...site, id: "site_new", siteKey: "new_site", name: "New site" };
      if (method === "tracking_tokens_provision") return {
        ...token,
        id: "token_new",
        token: "crm_trk_one_time_secret_value",
        secret: "crm_trk_one_time_secret_value",
      };
      if (method === "tracking_tokens_revoke") return { ...token, revokedAt: "2026-08-25T13:00:00.000Z" };
      if (method === "tracking_aggregates_rollup") return { aggregateCount: 2, eventCount: 4 };
      if (method === "tracking_aggregates_prune") return { eventsDeleted: 1, aggregatesDeleted: 2, sitesProcessed: 1 };
      return site;
    }),
  );
  return { call } as unknown as TrackingRpcClient & { call: typeof call };
}

describe("TrackingSettingsView", () => {
  it("creates a site with allowed domains and retention, then displays a token once", async () => {
    const rpc = makeRpc();
    render(<TrackingSettingsView rpcClient={rpc} />);
    await screen.findAllByText("Marketing site");

    fireEvent.click(screen.getByRole("button", { name: "Add tracking site" }));
    const dialog = screen.getByRole("dialog", { name: "Add tracking site" });
    fireEvent.change(within(dialog).getByLabelText("Site name"), { target: { value: "New site" } });
    fireEvent.change(within(dialog).getByLabelText("Site key (optional)"), { target: { value: "new_site" } });
    fireEvent.change(within(dialog).getByLabelText("Allowed domains"), { target: { value: "example.org\n*.preview.example.org" } });
    fireEvent.change(within(dialog).getByLabelText("Event retention (days)"), { target: { value: "14" } });
    fireEvent.change(within(dialog).getByLabelText("Aggregate retention (days)"), { target: { value: "90" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create tracking site" }));

    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("tracking_sites_create", {
        name: "New site",
        siteKey: "new_site",
        allowedDomains: ["example.org", "*.preview.example.org"],
        eventRetentionDays: 14,
        aggregateRetentionDays: 90,
      }),
    );
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("tracking_tokens_provision", {
        scope: "TRACKING",
        siteId: "site_new",
      }),
    );
    expect(await screen.findByText("crm_trk_one_time_secret_value")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "I copied it — hide secret" }));
    expect(screen.queryByText("crm_trk_one_time_secret_value")).toBeNull();
  });

  it("supports site verification/pause, token revocation, and aggregate rollup/prune", async () => {
    const rpc = makeRpc();
    render(<TrackingSettingsView rpcClient={rpc} />);
    await screen.findAllByText("Marketing site");

    fireEvent.click(screen.getByRole("button", { name: "Confirm allowed domain" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("tracking_sites_verify", { id: site.id }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause site" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("tracking_sites_pause", { id: site.id, paused: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: `Revoke token ${token.id}` }));
    let confirmation = await screen.findByRole("dialog", { name: /Revoke the tracking token/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Revoke token" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("tracking_tokens_revoke", { id: token.id }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Roll up events" }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith("tracking_aggregates_rollup", {}),
    );
    fireEvent.click(screen.getByRole("button", { name: "Prune retained data" }));
    confirmation = await screen.findByRole("dialog", { name: "Prune retained tracking data?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Prune data" }));

    await waitFor(() => {
      expect(rpc.call).toHaveBeenCalledWith("tracking_aggregates_prune", {});
    });
    expect(await screen.findByText(/Rolled up 4 events/)).toBeDefined();
    expect(await screen.findByText(/Pruned 1 events/)).toBeDefined();
  });
});
