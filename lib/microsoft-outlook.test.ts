import { describe, expect, it } from "vitest";
import type { GraphMessage } from "./microsoft-graph.js";
import {
  firstMessageId,
  MICROSOFT_PROVIDER_ID,
  MICROSOFT_SYNC_SCOPES,
  normaliseMessageId,
  normalizeOutlookMessage,
  OUTLOOK_MAIL_SCOPE,
  parseOutlookMessage,
  rootMessageIdFrom,
  stripHtml,
  stripQuotedHistory,
} from "./microsoft-outlook.js";

function message(overrides: Partial<GraphMessage> = {}): GraphMessage {
  return {
    id: "graph-1",
    internetMessageId: "<message-1@acme.example>",
    conversationId: "conversation-1",
    subject: " Pricing ",
    from: { emailAddress: { name: "Jane Doe", address: "JANE@ACME.EXAMPLE" } },
    toRecipients: [
      { emailAddress: { name: "Rep", address: "rep@example.com" } },
      { emailAddress: { name: "Rep", address: "REP@example.com" } },
    ],
    ccRecipients: [{ emailAddress: { address: "ops@example.com" } }],
    receivedDateTime: "2026-08-25T12:00:00.000Z",
    sentDateTime: "2026-08-25T11:59:00.000Z",
    body: { contentType: "text", content: "Hello" },
    bodyPreview: "Preview",
    internetMessageHeaders: [],
    parentFolderId: "inbox",
    webLink: "https://outlook.office.com/mail/inbox/id-1",
    ...overrides,
  };
}

describe("parseOutlookMessage", () => {
  it("keeps the upstream Microsoft grant limited to Outlook mail", () => {
    expect(MICROSOFT_PROVIDER_ID).toBe("microsoft");
    expect(OUTLOOK_MAIL_SCOPE).toBe("Mail.Read");
    expect(MICROSOFT_SYNC_SCOPES).toEqual(["Mail.Read"]);
  });

  it("normalizes participants, dates, body text, and provider links", () => {
    const parsed = parseOutlookMessage(message({
      body: {
        contentType: "html",
        content: "<p>Hello<br/>there</p><div>From: old@example.com</div>",
      },
    }));

    expect(parsed).toEqual({
      rfcMessageId: "message-1@acme.example",
      rootId: "outlook-conversation:conversation-1",
      references: [],
      inReplyTo: null,
      subject: "Pricing",
      from: { email: "jane@acme.example", name: "Jane Doe" },
      recipients: [
        { email: "rep@example.com", name: "Rep", kind: "to" },
        { email: "ops@example.com", name: null, kind: "cc" },
      ],
      body: "Hello\nthere",
      snippet: "Hello there",
      sentAt: "2026-08-25T11:59:00.000Z",
      receivedAt: "2026-08-25T12:00:00.000Z",
      outlookMessageId: "graph-1",
      outlookWebLink: "https://outlook.office.com/mail/inbox/id-1",
      conversationId: "conversation-1",
      providerThreadId: "conversation-1",
    });
  });

  it("projects a parsed message into the provider-neutral mailbox shape", () => {
    const parsed = parseOutlookMessage(message({
      internetMessageHeaders: [
        { name: "References", value: "<root@acme.example> <reply@acme.example>" },
        { name: "In-Reply-To", value: "<reply@acme.example>" },
      ],
    }));
    if (!parsed) throw new Error("expected fixture to parse");

    expect(normalizeOutlookMessage(parsed, { mailboxEmail: "REP@EXAMPLE.COM" })).toEqual({
      providerMessageId: "graph-1",
      providerThreadId: "conversation-1",
      rfcMessageId: "message-1@acme.example",
      rootMessageId: "root@acme.example",
      references: ["root@acme.example", "reply@acme.example"],
      inReplyTo: "reply@acme.example",
      subject: "Pricing",
      from: { email: "jane@acme.example", name: "Jane Doe" },
      recipients: [
        { email: "rep@example.com", name: "Rep", kind: "to" },
        { email: "ops@example.com", name: null, kind: "cc" },
      ],
      body: "Hello",
      snippet: "Hello",
      sentAt: "2026-08-25T11:59:00.000Z",
      direction: "INBOUND",
      outlookUrl: "https://outlook.office.com/mail/inbox/id-1",
    });

    expect(normalizeOutlookMessage(parsed, { mailboxEmail: "jane@acme.example" }).direction).toBe(
      "OUTBOUND",
    );
    expect(normalizeOutlookMessage(parsed).direction).toBe("UNKNOWN");
  });

  it("prefers References and In-Reply-To before the Outlook conversation id", () => {
    expect(parseOutlookMessage(message({
      internetMessageHeaders: [
        { name: "References", value: "<root@acme.example> <other@acme.example>" },
      ],
    }))?.rootId).toBe("root@acme.example");

    expect(parseOutlookMessage(message({
      internetMessageHeaders: [
        { name: "in-reply-to", value: "<reply-root@acme.example>" },
      ],
    }))?.rootId).toBe("reply-root@acme.example");
  });

  it("falls back to the own message id when no conversation id exists", () => {
    expect(parseOutlookMessage(message({ conversationId: undefined }))?.rootId).toBe(
      "message-1@acme.example",
    );
  });

  it("ignores messages without a usable id, sender, or timestamp", () => {
    expect(parseOutlookMessage(message({ internetMessageId: undefined }))).toBeNull();
    expect(parseOutlookMessage(message({ from: undefined, sender: undefined }))).toBeNull();
    expect(parseOutlookMessage(message({ sentDateTime: "not-a-date", receivedDateTime: "not-a-date" }))).toBeNull();
  });

  it("drops unsafe Outlook links instead of returning executable URLs", () => {
    expect(parseOutlookMessage(message({ webLink: "javascript:alert(1)" }))?.outlookWebLink).toBeNull();
    expect(parseOutlookMessage(message({ webLink: "https://outlook.office.com/mail/id" }))?.outlookWebLink).toBe(
      "https://outlook.office.com/mail/id",
    );
  });
});

describe("Outlook message text helpers", () => {
  it("strips markup and decodes the entities used by Graph bodies", () => {
    expect(stripHtml("<style>bad</style><p>A &amp; B</p><br><script>bad</script>")).toBe("A & B");
  });

  it("removes quoted and forwarded history", () => {
    expect(stripQuotedHistory("Reply\n\nOn Tue, Jane wrote:\n> old reply")).toBe("Reply");
    expect(stripQuotedHistory("Reply\n-----Original Message-----\nFrom: old@example.com")).toBe("Reply");
  });

  it("normalizes message ids and takes the first id from header lists", () => {
    expect(normaliseMessageId(" <ROOT@EXAMPLE.COM> ")).toBe("root@example.com");
    expect(firstMessageId("<root@example.com> <next@example.com>")).toBe("root@example.com");
    expect(rootMessageIdFrom({ references: null, inReplyTo: "<reply@example.com>", messageId: "<self@example.com>" })).toBe(
      "reply@example.com",
    );
  });
});
