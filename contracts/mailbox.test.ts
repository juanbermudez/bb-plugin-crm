import { describe, expect, it } from "vitest";

import {
  calendarEventIngestSchema,
  emailMessageIngestSchema,
} from "./mailbox.js";

describe("mailbox wire contracts", () => {
  it("normalizes a bounded provider-neutral email message", () => {
    const message = emailMessageIngestSchema.parse({
      connectionId: "conn_google",
      provider: "GOOGLE",
      providerMessageId: "gmail_1",
      rfcMessageId: "<one@example.test>",
      direction: "INBOUND",
      from: { email: "ADA@EXAMPLE.TEST", name: "Ada" },
      recipients: [{ email: "REP@CRM.TEST", kind: "TO" }],
      sentAt: "2026-08-26T12:00:00.000Z",
    });

    expect(message.from.email).toBe("ada@example.test");
    expect(message.recipients[0]?.email).toBe("rep@crm.test");
    expect(message.references).toEqual([]);
    expect(message.providerThreadId).toBeNull();
  });

  it("rejects Slack as an email or calendar provider", () => {
    expect(
      emailMessageIngestSchema.safeParse({
        connectionId: "conn_slack",
        provider: "SLACK",
        providerMessageId: "message_1",
        direction: "INBOUND",
        from: { email: "ada@example.test" },
        recipients: [],
        sentAt: "2026-08-26T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires a calendar event to end at or after its start", () => {
    const input = {
      connectionId: "conn_google",
      provider: "GOOGLE" as const,
      providerEventId: "event_1",
      iCalUid: "ical_1",
      originalStartTime: "2026-08-26T12:00:00.000Z",
      startsAt: "2026-08-26T12:00:00.000Z",
      endsAt: "2026-08-26T11:00:00.000Z",
      status: "confirmed",
      attendees: [],
    };

    expect(calendarEventIngestSchema.safeParse(input).success).toBe(false);
  });

  it("normalizes attendee and organizer email addresses", () => {
    const event = calendarEventIngestSchema.parse({
      connectionId: "conn_microsoft",
      provider: "MICROSOFT",
      providerEventId: "event_1",
      iCalUid: "ical_1",
      originalStartTime: "2026-08-26T12:00:00.000Z",
      startsAt: "2026-08-26T12:00:00.000Z",
      endsAt: "2026-08-26T13:00:00.000Z",
      status: "confirmed",
      organizerEmail: "REP@CRM.TEST",
      attendees: [{ email: "ADA@EXAMPLE.TEST" }],
    });

    expect(event.organizerEmail).toBe("rep@crm.test");
    expect(event.attendees[0]?.email).toBe("ada@example.test");
  });
});
