import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createActivityStore } from "./activities.js";
import { createActivityTaskDispatchStore } from "./activity-task-dispatch.js";
import { createCompanyStore } from "./companies.js";
import { initializeSchema } from "./schema.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-activity-task-dispatch-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("CRM due activity task leasing", () => {
  it("claims due tasks once, fences stale workers, and stops at the retry bound", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompanyStore(db).create({ id: "cmp_due", name: "Due Co" });
      const activities = createActivityStore(db);
      const due = activities.create({
        id: "act_due",
        type: "TASK",
        subject: "Call the account",
        companyId: company.id,
        createdById: "local_user",
        dueAt: "2026-08-26T12:00:00.000Z",
      });
      const future = activities.create({
        id: "act_future",
        type: "TASK",
        subject: "Wait for next week",
        companyId: company.id,
        createdById: "local_user",
        dueAt: "2026-08-27T12:00:00.000Z",
      });
      const dispatch = createActivityTaskDispatchStore(db);
      const first = dispatch.claimDue(100, {
        now: "2026-08-26T12:00:00.000Z",
        leaseMs: 1_000,
      });
      expect(first).toHaveLength(1);
      expect(first[0]?.activity.id).toBe(due.id);
      expect(first[0]?.dispatch).toMatchObject({
        activityId: due.id,
        status: "LEASED",
        attempts: 1,
        idempotencyKey: "crm-due-task:act_due",
      });
      expect(first[0]?.dispatch.leaseToken).toEqual(expect.any(String));
      expect(dispatch.claimDue(100, { now: "2026-08-26T12:00:00.500Z", leaseMs: 1_000 })).toEqual([]);

      db.prepare("UPDATE crm_activity_task_dispatches SET lease_until = ? WHERE activity_id = ?")
        .run("2026-08-26T11:59:59.000Z", due.id);
      const second = dispatch.claimDue(100, {
        now: "2026-08-26T12:00:01.000Z",
        leaseMs: 1_000,
      });
      expect(second[0]?.dispatch.attempts).toBe(2);
      db.prepare("UPDATE crm_activity_task_dispatches SET lease_until = ? WHERE activity_id = ?")
        .run("2026-08-26T11:59:59.000Z", due.id);
      expect(dispatch.claimDue(100, {
        now: "2026-08-26T12:00:02.000Z",
        leaseMs: 1_000,
      })[0]?.dispatch.attempts).toBe(3);
      db.prepare("UPDATE crm_activity_task_dispatches SET lease_until = ? WHERE activity_id = ?")
        .run("2026-08-26T11:59:59.000Z", due.id);
      expect(dispatch.claimDue(100, {
        now: "2026-08-26T12:00:03.000Z",
        leaseMs: 1_000,
      })).toEqual([]);
      expect(dispatch.get(future.id)).toBeNull();
    } finally {
      await lifecycle.dispose();
    }
  });

  it("marks completion and releases only the current lease", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompanyStore(db).create({ id: "cmp_complete", name: "Complete Co" });
      const activity = createActivityStore(db).create({
        id: "act_complete",
        type: "TASK",
        subject: "Complete me",
        companyId: company.id,
        createdById: "local_user",
        dueAt: "2026-08-26T12:00:00.000Z",
      });
      const dispatch = createActivityTaskDispatchStore(db);
      const claim = dispatch.claimDue(1, { now: "2026-08-26T12:00:00.000Z" })[0]!;
      expect(dispatch.releaseClaim(activity.id, "stale-token", "stale")).toBe(false);
      expect(dispatch.releaseClaim(activity.id, claim.dispatch.leaseToken!, "queue failed")).toBe(true);
      expect(dispatch.getRequired(activity.id)).toMatchObject({ status: "FAILED", attempts: 1, lastError: "queue failed" });
      const reclaimed = dispatch.claimDue(1, { now: "2026-08-26T12:00:00.000Z" })[0]!;
      expect(dispatch.markCompleted(activity.id)).toBe(true);
      expect(dispatch.getRequired(activity.id)).toMatchObject({ status: "COMPLETED", attempts: 2 });
      expect(dispatch.claimDue(1, { now: "2026-08-26T12:00:00.000Z" })).toEqual([]);
      expect(dispatch.markReopened(activity.id)).toBe(true);
      expect(dispatch.getRequired(activity.id).status).toBe("FAILED");
      expect(reclaimed.dispatch.attempts).toBe(2);
    } finally {
      await lifecycle.dispose();
    }
  });
});
