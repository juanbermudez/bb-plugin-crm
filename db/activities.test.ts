import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createCompany, purgeCompany, updateCompany } from "./companies.js";
import { createContact, updateContact } from "./contacts.js";
import { createDeal, updateDeal } from "./deals.js";
import { initializeSchema } from "./schema.js";
import {
  ActivityStore,
  completeActivity,
  createActivity,
  getActivity,
  listActivities,
  updateActivity,
  type ActivityCreateInput,
} from "./activities.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-activities-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

function seedEntities(db: ReturnType<typeof withDatabase>["db"]) {
  const company = createCompany(db, { id: "cmp_activity", name: "Activity Co" });
  const contact = createContact(db, {
    id: "con_activity",
    firstName: "Ada",
    lastName: "Lovelace",
    companyId: company.id,
  });
  const deal = createDeal(db, {
    id: "deal_activity",
    name: "Activity renewal",
    companyId: company.id,
    ownerId: "user_1",
  });
  return { company, contact, deal };
}

describe("CRM activity persistence", () => {
  it("creates activities with validated anchors and hydrated entity relations", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const { company, contact, deal } = seedEntities(db);
      const store = new ActivityStore(db);
      const note = store.create(
        {
          id: "act_note",
          type: "NOTE",
          subject: "Discovery",
          body: "A useful note",
          occurredAt: "2026-08-10T10:00:00.000Z",
          contactId: contact.id,
          meta: { source: "manual", score: 1 },
        },
        "user_1",
      );
      const meeting = createActivity(db, {
        id: "act_meeting",
        type: "MEETING",
        occurredAt: "2026-08-10T11:00:00.000Z",
        companyId: company.id,
        dealId: deal.id,
        createdById: "user_2",
      });

      expect(note).toMatchObject({
        id: "act_note",
        type: "NOTE",
        subject: "Discovery",
        companyId: company.id,
        contactId: contact.id,
        dealId: null,
        createdById: "user_1",
        meta: { source: "manual", score: 1 },
        company: { id: company.id, name: "Activity Co" },
        contact: { id: contact.id, firstName: "Ada", lastName: "Lovelace" },
        deal: null,
        emailThread: null,
        calendarEvent: null,
      });
      expect(meeting.deal).toEqual({ id: deal.id, name: "Activity renewal" });
      expect(getActivity(db, note.id)?.id).toBe(note.id);

      expect(() => store.create({ type: "TASK", companyId: company.id, createdById: "user_1" })).toThrow(
        "A task needs a subject",
      );
      expect(() => store.create({ type: "NOTE", createdById: "user_1" })).toThrow(
        "An activity has to be about",
      );
      expect(() => store.create({
        type: "NOTE",
        companyId: company.id,
        createdById: "user_1",
        meta: { bad: Number.NaN },
      })).toThrow("non-finite");
      expect(() => store.create({
        type: "NOTE",
        companyId: "missing_company",
        createdById: "user_1",
      })).toThrow();
      expect(() => store.create({
        type: "NOT_AN_ACTIVITY" as ActivityCreateInput["type"],
        companyId: company.id,
        createdById: "user_1",
      })).toThrow("Invalid activity type");
    } finally {
      await lifecycle.dispose();
    }
  });

  it("supports source timeline filters and stable cursor pagination", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const { company, contact, deal } = seedEntities(db);
      const store = new ActivityStore(db);
      store.create({ id: "act_note", type: "NOTE", companyId: company.id, occurredAt: "2026-08-10T10:00:00Z", createdById: "user_1" });
      store.create({ id: "act_call", type: "CALL", contactId: contact.id, occurredAt: "2026-08-10T09:00:00Z", createdById: "user_1" });
      store.create({ id: "act_email", type: "EMAIL", dealId: deal.id, occurredAt: "2026-08-10T08:00:00Z", createdById: "user_1" });
      store.create({ id: "act_meeting", type: "MEETING", companyId: company.id, occurredAt: "2026-08-10T07:00:00Z", createdById: "user_1" });
      store.create({ id: "act_upcoming", type: "TASK", subject: "Follow up", companyId: company.id, dueAt: "2026-08-20T09:00:00Z", occurredAt: "2026-08-10T06:00:00Z", createdById: "user_1" });
      store.create({ id: "act_done", type: "TASK", subject: "Send recap", companyId: company.id, completedAt: "2026-08-10T05:30:00Z", occurredAt: "2026-08-10T05:00:00Z", createdById: "user_1" });
      store.create({ id: "act_stage", type: "STAGE_CHANGE", companyId: company.id, occurredAt: "2026-08-10T04:00:00Z", createdById: "user_1" });

      const ids = (filter: "all" | "history" | "notes" | "upcoming" | "done" | "email" | "meetings") =>
        store.list({ companyId: company.id, filter, limit: 100 }).entries.map((entry) => entry.id);
      expect(ids("all")).toEqual(["act_note", "act_call", "act_email", "act_meeting", "act_upcoming", "act_done", "act_stage"]);
      expect(ids("notes")).toEqual(["act_note", "act_call", "act_email", "act_meeting"]);
      expect(ids("history")).toEqual(["act_note", "act_call", "act_email", "act_meeting", "act_done", "act_stage"]);
      expect(ids("upcoming")).toEqual(["act_upcoming"]);
      expect(ids("done")).toEqual(["act_done"]);
      expect(ids("email")).toEqual(["act_email"]);
      expect(ids("meetings")).toEqual(["act_meeting"]);

      const first = listActivities(db, { companyId: company.id, limit: 3 });
      expect(first.entries.map((entry) => entry.id)).toEqual(["act_note", "act_call", "act_email"]);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = listActivities(db, { companyId: company.id, limit: 3, cursor: first.nextCursor! });
      expect(second.entries.map((entry) => entry.id)).toEqual(["act_meeting", "act_upcoming", "act_done"]);
      expect(second.nextCursor).toEqual(expect.any(String));
      const third = listActivities(db, { companyId: company.id, limit: 3, cursor: second.nextCursor! });
      expect(third.entries.map((entry) => entry.id)).toEqual(["act_stage"]);
      expect(third.nextCursor).toBeNull();
      expect(new Set([...first.entries, ...second.entries, ...third.entries].map((entry) => entry.id)).size).toBe(7);

      expect(store.counts({ companyId: company.id })).toEqual({
        all: 7,
        notes: 4,
        upcoming: 1,
        done: 1,
        email: 1,
        meetings: 1,
      });
      expect(
        store.myTasks({
          actorId: "user_1",
          window: "upcoming",
          now: "2026-08-15T00:00:00.000Z",
        }).map((entry) => entry.id),
      ).toEqual(["act_upcoming"]);
      expect(
        store.myTasks({
          actorId: "user_1",
          window: "overdue",
          now: "2026-08-25T00:00:00.000Z",
        }).map((entry) => entry.id),
      ).toEqual(["act_upcoming"]);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("updates tasks, completes and reopens them, and cascades with entities", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const { company } = seedEntities(db);
      const store = new ActivityStore(db);
      const task = store.create({
        id: "act_task",
        type: "TASK",
        subject: "Prepare proposal",
        companyId: company.id,
        dueAt: "2026-08-20T09:00:00Z",
        createdById: "user_1",
      });
      const updated = updateActivity(db, task.id, {
        subject: "Prepare revised proposal",
        body: "Include pricing appendix",
        meta: { priority: "high" },
      });
      expect(updated).toMatchObject({
        subject: "Prepare revised proposal",
        body: "Include pricing appendix",
        dueAt: "2026-08-20T09:00:00.000Z",
        meta: { priority: "high" },
      });

      const completed = completeActivity(db, task.id);
      expect(completed.completedAt).toEqual(expect.any(String));
      expect(store.list({ companyId: company.id, filter: "done" }).entries.map((entry) => entry.id)).toEqual([task.id]);
      const reopened = store.completeTask(task.id, false);
      expect(reopened.completedAt).toBeNull();
      expect(() => store.complete("not_a_task")).toThrow("No activity");

      const note = store.create({ id: "act_non_task", type: "NOTE", companyId: company.id, createdById: "user_1" });
      expect(() => store.complete(note.id)).toThrow("Only tasks can be completed");
      expect(() => store.update(note.id, { completed: true })).toThrow("Only tasks can be completed");

      purgeCompany(db, company.id);
      expect(getActivity(db, task.id)).toBeNull();
      expect(getActivity(db, note.id)).toBeNull();
    } finally {
      await lifecycle.dispose();
    }
  });

  it("records deal stage and enrichment transitions on the anchored timelines", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const { company, contact, deal } = seedEntities(db);
      const store = new ActivityStore(db);

      const updatedDeal = updateDeal(db, deal.id, { stage: "QUALIFIED_TO_BUY" });
      expect(updatedDeal.lastActivityAt).toEqual(expect.any(String));
      const dealEntries = store.list({ dealId: deal.id }).entries;
      expect(dealEntries).toHaveLength(1);
      expect(dealEntries[0]).toMatchObject({
        type: "STAGE_CHANGE",
        subject: "Stage changed",
        body: null,
        companyId: company.id,
        dealId: deal.id,
        createdById: "local_user",
        meta: { from: "DEMO_BOOKED", to: "QUALIFIED_TO_BUY" },
      });

      // Re-applying the same stage is an idempotent update, not another event.
      updateDeal(db, deal.id, { stage: "QUALIFIED_TO_BUY" });
      expect(store.list({ dealId: deal.id }).entries).toHaveLength(1);

      updateCompany(db, company.id, { enrichmentStatus: "RUNNING" });
      updateCompany(db, company.id, { enrichmentStatus: "COMPLETE" });
      updateContact(db, contact.id, { enrichmentStatus: "RUNNING" });
      updateContact(db, contact.id, { enrichmentStatus: "FAILED", enrichmentError: "Provider timeout" });

      const companyEnrichment = store
        .list({ companyId: company.id })
        .entries.filter((entry) => entry.type === "ENRICHMENT" && entry.companyId === company.id && entry.contactId === null);
      expect(companyEnrichment).toHaveLength(2);
      expect(companyEnrichment.map((entry) => entry.meta)).toEqual(
        expect.arrayContaining([
          { from: "RUNNING", to: "COMPLETE" },
          { from: "PENDING", to: "RUNNING" },
        ]),
      );
      expect(companyEnrichment[0]?.createdById).toBe("local_user");

      const contactEnrichment = store
        .list({ contactId: contact.id })
        .entries.filter((entry) => entry.type === "ENRICHMENT");
      expect(contactEnrichment).toHaveLength(2);
      expect(contactEnrichment[0]).toMatchObject({
        contactId: contact.id,
        companyId: company.id,
        createdById: "local_user",
      });
      expect(contactEnrichment.map((entry) => entry.meta)).toEqual(
        expect.arrayContaining([
          { from: "RUNNING", to: "FAILED" },
          { from: "PENDING", to: "RUNNING" },
        ]),
      );
      expect(
        contactEnrichment.find((entry) => entry.meta.to === "FAILED"),
      ).toMatchObject({ body: "Provider timeout" });
      expect(getActivity(db, contactEnrichment[0]!.id)?.id).toBe(contactEnrichment[0]!.id);
    } finally {
      await lifecycle.dispose();
    }
  });
});
