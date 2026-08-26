import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { getActivity } from "./activities.js";
import { createCompany } from "./companies.js";
import { createConnectionStore } from "./connections.js";
import { createContact } from "./contacts.js";
import { createMailboxStore } from "./mailbox.js";
import { initializeSchema } from "./schema.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-mailbox-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("provider-neutral mailbox persistence", () => {
  it("threads idempotent messages and projects one timeline activity", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompany(db, { id: "cmp_mail", name: "Mail Co" });
      const contact = createContact(db, {
        id: "con_mail",
        firstName: "Ada",
        email: "ada@example.test",
        companyId: company.id,
      });
      const connection = createConnectionStore(db).upsert({
        id: "conn_google",
        provider: "GOOGLE",
        enabled: true,
      });
      const store = createMailboxStore(db);
      const first = store.ingestEmail(
        {
          connectionId: connection.id,
          provider: "GOOGLE",
          providerMessageId: "gmail_1",
          rfcMessageId: "<root@example.test>",
          direction: "INBOUND",
          from: { email: contact.email ?? "ada@example.test", name: "Ada" },
          recipients: [{ email: "rep@crm.test", kind: "TO" }],
          subject: "Hello",
          snippet: "First note",
          sentAt: "2026-08-26T12:00:00.000Z",
        },
        "local_user",
      );
      const duplicate = store.ingestEmail(
        {
          connectionId: connection.id,
          provider: "GOOGLE",
          providerMessageId: "gmail_1",
          rfcMessageId: "<root@example.test>",
          direction: "INBOUND",
          from: { email: "ada@example.test" },
          recipients: [{ email: "rep@crm.test", kind: "TO" }],
          sentAt: "2026-08-26T12:00:00.000Z",
        },
        "local_user",
      );
      const reply = store.ingestEmail(
        {
          connectionId: connection.id,
          provider: "GOOGLE",
          providerMessageId: "gmail_2",
          rfcMessageId: "<reply@example.test>",
          references: ["<root@example.test>"],
          direction: "OUTBOUND",
          from: { email: "rep@crm.test" },
          recipients: [{ email: "ada@example.test", kind: "TO" }],
          subject: "Re: Hello",
          sentAt: "2026-08-26T12:05:00.000Z",
        },
        "local_user",
      );

      expect(duplicate.id).toBe(first.id);
      expect(reply.id).toBe(first.id);
      expect(reply.messageCount).toBe(2);
      expect(reply.contact?.id).toBe(contact.id);
      expect(reply.company?.id).toBe(company.id);
      expect(reply.messages.map((message) => message.direction)).toEqual([
        "INBOUND",
        "OUTBOUND",
      ]);
      expect(
        (db.prepare("SELECT COUNT(*) AS count FROM activities WHERE email_thread_id = ?").get(first.id) as { count: number }).count,
      ).toBe(1);
      const activity = db.prepare(
        "SELECT id FROM activities WHERE email_thread_id = ?",
      ).get(first.id) as { id: string };
      expect(getActivity(db, activity.id)?.emailThread).toEqual({
        id: first.id,
        messageCount: 2,
        lastMessageAt: "2026-08-26T12:05:00.000Z",
      });
    } finally {
      await lifecycle.dispose();
    }
  });

  it("upserts calendar events, matches attendees, and purges connection data", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompany(db, { id: "cmp_calendar", name: "Calendar Co" });
      const contact = createContact(db, {
        id: "con_calendar",
        firstName: "Grace",
        email: "grace@example.test",
        companyId: company.id,
      });
      const connection = createConnectionStore(db).upsert({
        id: "conn_microsoft",
        provider: "MICROSOFT",
        enabled: true,
      });
      const store = createMailboxStore(db);
      const event = store.ingestCalendarEvent(
        {
          connectionId: connection.id,
          provider: "MICROSOFT",
          providerEventId: "event_1",
          iCalUid: "ical_1",
          originalStartTime: "2026-08-27T12:00:00.000Z",
          title: "Discovery",
          startsAt: "2026-08-27T12:00:00.000Z",
          endsAt: "2026-08-27T13:00:00.000Z",
          status: "confirmed",
          attendees: [{ email: "grace@example.test", responseStatus: "accepted" }],
        },
        "local_user",
      );
      const updated = store.ingestCalendarEvent(
        {
          connectionId: connection.id,
          provider: "MICROSOFT",
          providerEventId: "event_1",
          iCalUid: "ical_1",
          originalStartTime: "2026-08-27T12:00:00.000Z",
          title: "Updated discovery",
          startsAt: "2026-08-27T12:00:00.000Z",
          endsAt: "2026-08-27T13:30:00.000Z",
          status: "confirmed",
          attendees: [{ email: "grace@example.test", responseStatus: "accepted" }],
        },
        "local_user",
      );

      expect(updated.id).toBe(event.id);
      expect(updated.title).toBe("Updated discovery");
      expect(updated.contact?.id).toBe(contact.id);
      expect(updated.company?.id).toBe(company.id);
      expect(updated.attendees[0]?.contactId).toBe(contact.id);
      const activity = db.prepare(
        "SELECT id FROM activities WHERE calendar_event_id = ?",
      ).get(event.id) as { id: string };
      expect(getActivity(db, activity.id)?.calendarEvent).toMatchObject({
        id: event.id,
        endsAt: "2026-08-27T13:30:00.000Z",
        attendeeCount: 1,
      });
      expect(store.purgeConnection(connection.id)).toEqual({ purged: 1 });
      expect(() => store.getCalendarEvent(event.id)).toThrow("No calendar event");
      expect(
        (db.prepare("SELECT COUNT(*) AS count FROM activities").get() as { count: number }).count,
      ).toBe(0);
    } finally {
      await lifecycle.dispose();
    }
  });
});
