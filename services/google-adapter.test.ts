import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CALENDAR_EVENTS_URL,
  GOOGLE_GMAIL_BASE_URL,
  type GoogleFetch,
  GoogleApiClient,
  conferenceUrl,
  eventTime,
  normalizeCalendarEvent,
  normalizeGmailMessage,
  plainTextBody,
  type GmailMessage,
} from "./google-adapter.js";

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function queuedFetch(
  responses: Array<Response | Error>,
): { fetch: GoogleFetch; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch: GoogleFetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("test response queue exhausted");
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetch, calls };
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("Google API transport", () => {
  it("sends a bearer token without persisting it and parses Gmail history", async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({ emailAddress: "owner@example.com", historyId: "h-10" }),
      jsonResponse({
        historyId: "h-11",
        history: [
          {
            id: "h-11",
            messagesAdded: [
              { message: { id: "m-1", threadId: "t-1" } },
              { message: { id: "m-1", threadId: "t-1" } },
            ],
          },
        ],
      }),
    ]);
    const client = new GoogleApiClient({ fetch });

    const profile = await client.profile("access-token-value");
    const history = await client.listHistory("access-token-value", {
      startHistoryId: "h-10",
      pageToken: "page/1",
    });

    expect(profile).toEqual({
      ok: true,
      value: { emailAddress: "owner@example.com", historyId: "h-10" },
    });
    expect(history).toEqual({
      ok: true,
      value: {
        historyId: "h-11",
        history: [{ id: "h-11", messagesAdded: [{ id: "m-1", threadId: "t-1" }, { id: "m-1", threadId: "t-1" }] }],
      },
    });
    expect(calls[0]?.url).toBe(`${GOOGLE_GMAIL_BASE_URL}/profile`);
    const historyUrl = new URL(calls[1]?.url ?? "");
    expect(historyUrl.searchParams.get("startHistoryId")).toBe("h-10");
    expect(historyUrl.searchParams.get("historyTypes")).toBe("messageAdded");
    expect(historyUrl.searchParams.get("maxResults")).toBe("500");
    expect(historyUrl.searchParams.get("pageToken")).toBe("page/1");
    expect(calls[0]?.init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token-value",
    });
    expect(JSON.stringify(profile)).not.toContain("access-token-value");
  });

  it("maps authorization, expired cursor, quota, and upstream failures to safe outcomes", async () => {
    const cases: Array<{
      response: Response;
      expected: { kind: string; code: string; retryable: boolean; retryAfterMs?: number };
    }> = [
      {
        response: jsonResponse({ error: { message: "invalid token" } }, 401),
        expected: { kind: "unauthorized", code: "UNAUTHORIZED", retryable: false },
      },
      {
        response: jsonResponse({ error: { message: "history expired" } }, 410),
        expected: { kind: "cursor-invalid", code: "CURSOR_INVALID", retryable: false },
      },
      {
        response: jsonResponse(
          { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
          403,
          { "retry-after": "1" },
        ),
        expected: { kind: "rate-limited", code: "RATE_LIMITED", retryable: true, retryAfterMs: 30_000 },
      },
      {
        response: jsonResponse({ error: { message: "temporary outage" } }, 503),
        expected: { kind: "failed", code: "UPSTREAM_UNAVAILABLE", retryable: true },
      },
    ];

    for (const testCase of cases) {
      const { fetch } = queuedFetch([testCase.response]);
      const result = await new GoogleApiClient({ fetch }).profile("token");
      expect(result).toMatchObject({ ok: false, ...testCase.expected });
      expect(JSON.stringify(result)).not.toContain("token");
    }
  });

  it("times out a hung provider request and rejects oversized responses", async () => {
    const hungFetch: GoogleFetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    const timeoutResult = await new GoogleApiClient({ fetch: hungFetch, timeoutMs: 5 }).profile("token");
    expect(timeoutResult).toMatchObject({ ok: false, code: "TIMEOUT", retryable: true });

    const { fetch } = queuedFetch([
      new Response("x".repeat(1_100), {
        status: 200,
        headers: { "content-length": "1100" },
      }),
    ]);
    const largeResult = await new GoogleApiClient({ fetch, maxResponseBytes: 1_024 }).profile("token");
    expect(largeResult).toMatchObject({ ok: false, code: "RESPONSE_TOO_LARGE", retryable: false });
  });

  it("omits Calendar time bounds for incremental sync and applies a bounded initial window", async () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const { fetch, calls } = queuedFetch([
      jsonResponse({ items: [], nextSyncToken: "sync-1" }),
      jsonResponse({ items: [] }),
    ]);
    const client = new GoogleApiClient({ fetch, now: () => now });

    await client.listEvents("token", { syncToken: "sync-0", timeMin: "bad-but-ignored" });
    await client.listEvents("token");

    const incrementalUrl = new URL(calls[0]?.url ?? "");
    expect(incrementalUrl.origin + incrementalUrl.pathname).toBe(GOOGLE_CALENDAR_EVENTS_URL);
    expect(incrementalUrl.searchParams.get("syncToken")).toBe("sync-0");
    expect(incrementalUrl.searchParams.has("timeMin")).toBe(false);
    expect(incrementalUrl.searchParams.has("timeMax")).toBe(false);

    const initialUrl = new URL(calls[1]?.url ?? "");
    expect(initialUrl.searchParams.get("timeMin")).toBe("2026-08-26T12:00:00.000Z");
    expect(initialUrl.searchParams.get("timeMax")).toBe("2027-02-22T12:00:00.000Z");
    expect(initialUrl.searchParams.get("singleEvents")).toBe("true");
    expect(initialUrl.searchParams.get("showDeleted")).toBe("true");
  });
});

describe("Google normalization", () => {
  it("extracts a Gmail message body, root id, participants, direction, and safe link", () => {
    const message: GmailMessage = {
      id: "m/1",
      threadId: "thread-1",
      labelIds: ["INBOX"],
      internalDate: String(new Date("2026-08-26T16:00:00.000Z").getTime()),
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "Message-ID", value: "<Reply@Example.com>" },
          { name: "References", value: "<Root@Example.com> <Older@Example.com>" },
          { name: "From", value: '"Ada Lovelace" <ada@example.com>' },
          { name: "To", value: "Team <team@acme.test>, ada@example.com" },
          { name: "Cc", value: "Team <team@acme.test>, Grace <grace@example.com>" },
          { name: "Subject", value: "Project update" },
        ],
        parts: [
          {
            mimeType: "text/plain",
            headers: [],
            body: { data: base64url("Hello team\n\nOn yesterday wrote:\n> quoted history") },
            parts: [],
          },
          {
            mimeType: "text/plain",
            filename: "secret.txt",
            headers: [{ name: "Content-Disposition", value: "attachment" }],
            body: { data: base64url("do not index") },
            parts: [],
          },
        ],
      },
    };

    const normalized = normalizeGmailMessage(message, { mailboxEmail: "owner@example.com" });
    expect(normalized).toMatchObject({
      providerMessageId: "m/1",
      providerThreadId: "thread-1",
      rfcMessageId: "reply@example.com",
      rootMessageId: "root@example.com",
      subject: "Project update",
      body: "Hello team",
      snippet: "Hello team",
      sentAt: "2026-08-26T16:00:00.000Z",
      direction: "INBOUND",
      gmailUrl: "https://mail.google.com/mail/u/0/#all/m%2F1",
    });
    expect(normalized?.recipients).toEqual([
      { email: "team@acme.test", name: "Team", kind: "to" },
      { email: "ada@example.com", name: null, kind: "to" },
      { email: "grace@example.com", name: "Grace", kind: "cc" },
    ]);
  });

  it("prefers plain text, ignores attachments, and falls back to safe HTML text", () => {
    const htmlPayload = {
      mimeType: "multipart/mixed",
      headers: [],
      parts: [
        {
          mimeType: "text/plain",
          filename: "attachment.txt",
          headers: [{ name: "Content-Disposition", value: "attachment" }],
          body: { data: base64url("attachment") },
          parts: [],
        },
        {
          mimeType: "text/html",
          headers: [],
          body: { data: base64url("<style>bad</style><p>Hello &amp; welcome</p><script>bad</script>") },
          parts: [],
        },
      ],
    };
    expect(plainTextBody(htmlPayload)).toBe("Hello & welcome");
  });

  it("normalizes Calendar times, attendees, conference links, and cancellation tombstones", () => {
    const event = {
      id: "event-1",
      iCalUID: "event-uid@example.com",
      status: "confirmed",
      summary: "Customer call",
      description: "Discuss launch",
      location: "Online",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      htmlLink: "https://calendar.google.com/calendar/event?eid=event-1",
      start: { dateTime: "2026-08-27T13:00:00-04:00" },
      end: { dateTime: "2026-08-27T14:00:00-04:00" },
      organizer: { email: "owner@example.com", displayName: "Owner", self: true },
      attendees: [
        { email: "buyer@example.com", displayName: "Buyer", responseStatus: "accepted" },
        { email: "buyer@example.com", displayName: "Duplicate" },
        { email: "room@example.com", resource: true },
      ],
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "javascript:alert(1)" }],
      },
    };
    const normalized = normalizeCalendarEvent(event);
    expect(normalized).toMatchObject({
      providerEventId: "event-1",
      iCalUID: "event-uid@example.com",
      startsAt: "2026-08-27T17:00:00.000Z",
      endsAt: "2026-08-27T18:00:00.000Z",
      allDay: false,
      conferenceUrl: "https://meet.google.com/abc-defg-hij",
      googleUrl: "https://calendar.google.com/calendar/event?eid=event-1",
      status: "CONFIRMED",
    });
    expect(normalized?.organizer).toMatchObject({
      email: "owner@example.com",
      name: "Owner",
      organizer: true,
      self: true,
    });
    expect(normalized?.attendees).toEqual([
      {
        email: "buyer@example.com",
        name: "Buyer",
        responseStatus: "accepted",
        organizer: false,
        self: false,
        resource: false,
      },
      {
        email: "room@example.com",
        name: null,
        responseStatus: null,
        organizer: false,
        self: false,
        resource: true,
      },
    ]);
    expect(conferenceUrl({ ...event, hangoutLink: undefined })).toBe(null);

    const allDay = eventTime({ date: "2026-08-28" });
    expect(allDay?.isAllDay).toBe(true);
    expect(allDay?.at.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(eventTime({ date: "2026-02-30" })).toBe(null);

    expect(
      normalizeCalendarEvent({
        id: "cancelled-1",
        iCalUID: "cancelled@example.com",
        status: "cancelled",
        attendees: [],
      }),
    ).toMatchObject({
      providerEventId: "cancelled-1",
      status: "CANCELLED",
      startsAt: null,
      endsAt: null,
    });
  });

  it("rejects messages and events without durable provider identity or valid dates", () => {
    expect(
      normalizeGmailMessage({
        labelIds: [],
        payload: { headers: [], parts: [] },
      }),
    ).toBe(null);
    expect(
      normalizeCalendarEvent({ id: "event-1", iCalUID: "uid", attendees: [], start: { date: "bad" } }),
    ).toBe(null);
  });
});

describe("Google API input validation", () => {
  it("rejects invalid credentials, cursors, ids, and time ranges before fetch", async () => {
    const fetch = vi.fn<GoogleFetch>();
    const client = new GoogleApiClient({ fetch });

    expect(await client.profile(" ")).toMatchObject({ ok: false, code: "INVALID_ACCESS_TOKEN" });
    expect(await client.listHistory("token", { startHistoryId: "" })).toMatchObject({
      ok: false,
      code: "INVALID_HISTORY_ID",
    });
    expect(await client.getMessage("token", " ")).toMatchObject({
      ok: false,
      code: "INVALID_MESSAGE_ID",
    });
    expect(
      await client.listMessages("token", {
        after: new Date("2026-08-27T00:00:00.000Z"),
        before: new Date("2026-08-26T00:00:00.000Z"),
      }),
    ).toMatchObject({ ok: false, code: "INVALID_TIME_RANGE" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
