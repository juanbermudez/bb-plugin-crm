import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { initializeSchema } from "./schema.js";
import {
  DEFAULT_SAVED_VIEW_FILTERS,
  SavedViewConflictError,
  SavedViewStore,
  createSavedView,
  deleteSavedView,
  getDefaultSavedViewFilters,
  getSavedView,
  listSavedViews,
  parseSavedViewFilters,
  updateSavedView,
} from "./saved-views.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-saved-views-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("CRM saved-view persistence", () => {
  it("normalizes the source default state and rejects non-strict filter JSON", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new SavedViewStore(db);
      expect(store.getDefault("COMPANY")).toEqual(DEFAULT_SAVED_VIEW_FILTERS);
      expect(getDefaultSavedViewFilters()).toEqual(DEFAULT_SAVED_VIEW_FILTERS);

      const normalized = parseSavedViewFilters({
        sort: "  name  ",
        dir: "desc",
        archived: true,
        filters: { owner: ["user_1", "user_2"] },
        columns: [" name ", "domain"],
      });
      expect(normalized).toEqual({
        q: "",
        sort: "name",
        dir: "desc",
        archived: true,
        filters: { owner: ["user_1", "user_2"] },
        columns: ["name", "domain"],
      });
      expect(parseSavedViewFilters({})).toEqual(DEFAULT_SAVED_VIEW_FILTERS);

      expect(() => parseSavedViewFilters({ unknown: true })).toThrow("unknown key");
      expect(() => parseSavedViewFilters({ filters: [] })).toThrow("filters must be an object");
      expect(() => parseSavedViewFilters({ filters: { owner: [1] } })).toThrow("must be a string");
      expect(() => parseSavedViewFilters({ columns: [" "] })).toThrow("is required");
      expect(() => parseSavedViewFilters({ dir: "sideways" })).toThrow("Invalid saved view sort direction");
      expect(() => parseSavedViewFilters({ archived: 1 })).toThrow("must be a boolean");
    } finally {
      await lifecycle.dispose();
    }
  });

  it("creates, reads, and lists private/shared views with owner semantics", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new SavedViewStore(db);
      const own = store.create(
        {
          id: "view_own",
          entity: "COMPANY",
          name: "  Open accounts  ",
          filters: { q: "acme", filters: { owner: ["user_1"] }, columns: ["name"] },
        },
        "user_1",
      );
      const shared = createSavedView(
        db,
        {
          id: "view_shared",
          entity: "COMPANY",
          name: "All renewals",
          shared: true,
          filters: {},
        },
        "user_2",
      );
      const privateOther = store.create(
        { id: "view_private_other", entity: "COMPANY", name: "Private", filters: {} },
        "user_2",
      );
      store.create({ id: "view_contact", entity: "CONTACT", name: "People", filters: {} }, "user_1");

      expect(own).toMatchObject({
        id: "view_own",
        name: "Open accounts",
        ownerId: "user_1",
        shared: false,
        mine: true,
        filters: {
          q: "acme",
          sort: "",
          dir: "asc",
          archived: false,
          filters: { owner: ["user_1"] },
          columns: ["name"],
        },
      });
      expect(store.get(own.id, "user_1")?.mine).toBe(true);
      expect(store.get(shared.id, "user_1")).toMatchObject({ ownerId: "user_2", mine: false });
      expect(store.get(privateOther.id, "user_1")).toBeNull();

      const visible = store.list({ entity: "COMPANY", ownerId: "user_1" });
      expect(visible.map((view) => view.name)).toEqual(["All renewals", "Open accounts"]);
      expect(visible.every((view) => view.mine === (view.ownerId === "user_1"))).toBe(true);
      expect(store.list("CONTACT", "user_1")).toHaveLength(1);
      expect(store.list({ entity: "COMPANY", ownerId: "user_1", includeShared: false }).map((view) => view.id)).toEqual([
        own.id,
      ]);
      expect(store.list({ entity: "COMPANY", ownerId: "user_1", mineOnly: true }).map((view) => view.id)).toEqual([
        own.id,
      ]);
      expect(store.list({ entity: "COMPANY" }).map((view) => view.id)).toEqual([
        shared.id,
        own.id,
        privateOther.id,
      ]);
      expect(listSavedViews(db, "COMPANY", "user_1").map((view) => view.id)).toEqual([
        shared.id,
        own.id,
      ]);
      expect(getSavedView(db, own.id, { ownerId: "user_1" })?.id).toBe(own.id);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("updates only owned views, preserves defaults, translates duplicate names, and deletes", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new SavedViewStore(db);
      const view = store.create(
        { id: "view_edit", entity: "DEAL", name: "Pipeline", filters: { q: "old" } },
        "user_1",
      );
      const updated = updateSavedView(
        db,
        view.id,
        {
          name: "  Active pipeline ",
          shared: true,
          filters: { columns: ["name", "amount"], filters: { stage: ["CLOSED_WON"] } },
        },
        "user_1",
      );
      expect(updated).toMatchObject({
        name: "Active pipeline",
        shared: true,
        filters: {
          q: "",
          sort: "",
          dir: "asc",
          archived: false,
          filters: { stage: ["CLOSED_WON"] },
          columns: ["name", "amount"],
        },
      });

      const wrapped = store.update(view.id, { data: { filters: {} } }, "user_1");
      expect(wrapped.filters).toEqual(DEFAULT_SAVED_VIEW_FILTERS);
      expect(() => store.update(view.id, { name: "x" }, "user_2")).toThrow("No saved view");
      expect(() => store.delete(view.id, "user_2")).toThrow("No saved view");

      store.create({ id: "view_same_name_other", entity: "DEAL", name: "Active pipeline", filters: {} }, "user_2");
      expect(() => store.create({ entity: "DEAL", name: "Active pipeline", filters: {} }, "user_1")).toThrow(
        SavedViewConflictError,
      );
      expect(() => store.create({ entity: "DEAL", name: "Active pipeline", filters: {} }, "user_2")).toThrow(
        SavedViewConflictError,
      );

      expect(deleteSavedView(db, view.id, "user_1")).toEqual({ id: view.id });
      expect(store.get(view.id)).toBeNull();
      expect(() => store.delete(view.id)).toThrow("No saved view");
      expect(() => store.create({ entity: "DEAL", name: "", filters: {} }, "user_1")).toThrow(
        "Saved view name is required",
      );
    } finally {
      await lifecycle.dispose();
    }
  });

  it("fails closed when a persisted filter payload is malformed", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      db.prepare(
        `INSERT INTO saved_views (id, entity, name, owner_id, filters)
         VALUES ('view_bad_json', 'CONTACT', 'Bad', 'user_1', '{"q":1}')`,
      ).run();
      const store = new SavedViewStore(db);
      expect(() => store.get("view_bad_json")).toThrow("Saved view query must be a string");

      db.prepare("UPDATE saved_views SET filters = '{bad json' WHERE id = 'view_bad_json'").run();
      expect(() => store.list({ entity: "CONTACT" })).toThrow("not valid JSON");
    } finally {
      await lifecycle.dispose();
    }
  });
});
