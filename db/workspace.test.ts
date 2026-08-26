import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { initializeSchema } from "./schema.js";
import { createWorkspaceIdentityStore } from "./workspace.js";

describe("workspace identity persistence", () => {
  it("normalizes and replaces the installation website and short profile", async () => {
    const host = createFakePluginHost({ pluginId: "crm-workspace-test" });
    const db = host.bb.storage.database();
    initializeSchema(host.bb, db);
    const store = createWorkspaceIdentityStore(db);
    try {
      expect(store.get()).toEqual({ website: null, profile: null });
      const saved = store.update({
        website: "acme.example/",
        narrative: "Acme sells compliance automation to growing software companies.",
        sells: "  Compliance automation  ",
        sellsTo: "Growing software companies",
        edge: "Fast evidence collection",
        sourceUrl: "https://acme.example/about/",
      });
      expect(saved).toMatchObject({
        website: "https://acme.example",
        profile: {
          website: "https://acme.example",
          sells: "Compliance automation",
          sourceUrl: "https://acme.example/about",
        },
      });
      expect(store.get()).toEqual(saved);
      expect(store.update({ website: "plain.acme.example", narrative: "" })).toEqual({
        website: "https://plain.acme.example",
        profile: null,
      });
      expect(() => store.update({
        website: "localhost",
        narrative: "Acme sells compliance automation to growing software companies.",
      })).toThrow("public hostname");
    } finally {
      await host.harness.lifecycle.dispose();
    }
  });
});
