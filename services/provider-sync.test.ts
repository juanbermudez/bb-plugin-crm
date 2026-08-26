import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { createActivityStore } from "../db/activities.js";
import { createConnectionStore } from "../db/connections.js";
import { createContactStore } from "../db/contacts.js";
import { createMailboxStore } from "../db/mailbox.js";
import { initializeSchema } from "../db/schema.js";
import { createSlackStore } from "../db/slack.js";
import type { SlackAdapter } from "../lib/slack-adapter.js";
import type { GoogleApiClient } from "./google-adapter.js";
import { syncProviderConnection } from "./provider-sync.js";

function database(pluginId: string) {
  const host = createFakePluginHost({ pluginId });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return {
    host,
    db,
    connections: createConnectionStore(db),
    contacts: createContactStore(db),
    mailbox: createMailboxStore(db),
    slackStore: createSlackStore(db),
  };
}

describe("provider sync orchestration", () => {
  it("backfills bounded Gmail and Calendar data into matched CRM activity", async () => {
    const deps = database("provider-sync-google-test");
    try {
      const contact = deps.contacts.create({ firstName: "Ada", email: "ada@example.com" });
      const connection = deps.connections.upsert({ provider: "GOOGLE", status: "CONNECTED" });
      const google = {
        profile: async () => ({ ok: true, value: { emailAddress: "sales@example.com", historyId: "h2" } }),
        listMessages: async () => ({ ok: true, value: { messages: [{ id: "g1" }] } }),
        getMessage: async () => ({ ok: true, value: {
          id: "g1", threadId: "gt1", internalDate: String(Date.parse("2026-08-25T14:00:00.000Z")),
          payload: { mimeType: "text/plain", headers: [
            { name: "From", value: "Ada <ada@example.com>" },
            { name: "To", value: "Sales <sales@example.com>" },
            { name: "Message-ID", value: "<g1@example.com>" },
            { name: "Subject", value: "Google recap" },
          ], body: { data: Buffer.from("Decisions from today.").toString("base64url") } },
        } }),
        listEvents: async () => ({ ok: true, value: { items: [{
          id: "event-1", iCalUID: "ical-1", summary: "Discovery call", status: "confirmed",
          start: { dateTime: "2026-08-26T14:00:00.000Z" }, end: { dateTime: "2026-08-26T15:00:00.000Z" },
          organizer: { email: "sales@example.com", self: true }, attendees: [{ email: "ada@example.com", displayName: "Ada" }],
        }], nextSyncToken: "cal-2" } }),
      } as unknown as GoogleApiClient;

      const result = await syncProviderConnection({ ...deps, google, now: () => new Date("2026-08-26T16:00:00.000Z") }, connection.id, { googleAccessToken: "token" });
      expect(result).toMatchObject({ provider: "GOOGLE", emailMessages: 1, calendarEvents: 1 });
      expect(deps.connections.getSyncCursor(connection.id, "gmail")?.cursor).toBe("h2");
      expect(deps.connections.getSyncCursor(connection.id, "google-calendar")?.cursor).toBe("cal-2");
      const timeline = createActivityStore(deps.db).timeline({ contactId: contact.id, filter: "all", limit: 20 });
      expect(timeline.entries.map((entry) => entry.type)).toEqual(expect.arrayContaining(["EMAIL", "MEETING"]));
    } finally {
      await deps.host.harness.lifecycle.dispose();
    }
  });

  it("persists Slack channel inventory and exact-email matches without persisting tokens", async () => {
    const deps = database("provider-sync-slack-test");
    try {
      deps.contacts.create({ firstName: "Ada", email: "ada@example.com" });
      const connection = deps.connections.upsert({ provider: "SLACK", status: "CONNECTED" });
      const slack = {
        listVisibleChannels: async () => [{ id: "C1", name: "sales", is_member: true, is_private: false }],
        listMembers: async () => [{ id: "U1", name: "ada", profile: { email: "ada@example.com" } }],
      } as unknown as SlackAdapter;
      const result = await syncProviderConnection({ ...deps, slack, now: () => new Date("2026-08-26T16:00:00.000Z") }, connection.id, { slackBotToken: "xoxb-secret" });
      expect(result).toMatchObject({ channels: 1, people: 1, matchedPeople: 1 });
      expect(deps.slackStore.listMatches(connection.id)[0]).toMatchObject({ matched: true, slackHandle: "@ada" });
      expect(JSON.stringify(deps.connections.getRequired(connection.id))).not.toContain("xoxb-secret");
    } finally {
      await deps.host.harness.lifecycle.dispose();
    }
  });
});
