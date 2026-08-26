import { describe, expect, it } from "vitest";
import { crmDueTaskRunInputSchema } from "./task-dispatch.js";

describe("CRM due-task run contract", () => {
  it("accepts a complete immutable task snapshot", () => {
    expect(crmDueTaskRunInputSchema.parse({
      kind: "CRM_DUE_TASK",
      activity: {
        id: "act_due",
        subject: "Call the account",
        body: null,
        occurredAt: "2026-08-25T12:00:00.000Z",
        dueAt: "2026-08-26T12:00:00.000Z",
        completedAt: null,
        companyId: "cmp_1",
        contactId: null,
        dealId: null,
        createdById: "local_user",
        meta: { source: "manual" },
      },
      requestedAt: "2026-08-26T12:00:00.000Z",
    })).toMatchObject({ kind: "CRM_DUE_TASK", activity: { id: "act_due" } });
  });

  it("rejects unknown fields instead of forwarding guessed routing data", () => {
    const result = crmDueTaskRunInputSchema.safeParse({
      kind: "CRM_DUE_TASK",
      activity: {
        id: "act_due",
        subject: "Call the account",
        body: null,
        occurredAt: null,
        dueAt: "2026-08-26T12:00:00.000Z",
        completedAt: null,
        companyId: "cmp_1",
        contactId: null,
        dealId: null,
        createdById: "local_user",
        meta: {},
        assigneeId: "guessed-user",
      },
      requestedAt: "2026-08-26T12:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

