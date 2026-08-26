import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { createConnectionStore } from "./connections.js";
import { createContactStore } from "./contacts.js";
import { initializeSchema } from "./schema.js";
import { createSlackStore } from "./slack.js";

describe("Slack inventory persistence", () => {
  it("atomically replaces channels and exact-email contact matches", async () => {
    const host = createFakePluginHost({ pluginId: "crm-slack-store-test" });
    const db = host.bb.storage.database();
    initializeSchema(host.bb, db);
    try {
      const connection = createConnectionStore(db).upsert({ provider: "SLACK", status: "CONNECTED" });
      const contact = createContactStore(db).create({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" });
      const store = createSlackStore(db);
      store.replaceInventory(connection.id, [{ id: "C1", name: "sales", is_member: false, is_private: false, num_members: 14 }], [{
        id: contact.id, name: "Ada Lovelace", email: "ada@example.com",
        match: { slackUserId: "U1", slackHandle: "@ada", slackEmail: "ada@example.com" },
      }]);

      expect(store.listChannels(connection.id)).toEqual([expect.objectContaining({ name: "sales", isMember: false, memberCount: 14 })]);
      expect(store.listMatches(connection.id)).toEqual([expect.objectContaining({ contactName: "Ada Lovelace", matched: true, slackHandle: "@ada" })]);
      store.replaceInventory(connection.id, [], [{ id: contact.id, name: "Ada Lovelace", email: "ada@example.com", match: null }]);
      expect(store.listChannels(connection.id)).toEqual([]);
      expect(store.listMatches(connection.id)[0]).toMatchObject({ matched: false, slackUserId: null });
    } finally {
      await host.harness.lifecycle.dispose();
    }
  });
});
