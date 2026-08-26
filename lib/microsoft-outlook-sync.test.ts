import { describe, expect, it, vi } from "vitest";
import type {
  GraphFolder,
  GraphMessage,
  GraphUser,
  MessagePage,
  MicrosoftGraphResult,
} from "./microsoft-graph.js";
import {
  OutlookSyncAdapter,
  type OutlookGraphApi,
} from "./microsoft-outlook-sync.js";

const ok = <T>(data: T): MicrosoftGraphResult<T> => ({ outcome: "ok", data });

function message(overrides: Partial<GraphMessage> = {}): GraphMessage {
  return {
    id: "graph-1",
    internetMessageId: "<message-1@acme.example>",
    conversationId: "conversation-1",
    subject: "Pricing",
    from: { emailAddress: { name: "Jane", address: "jane@acme.example" } },
    toRecipients: [{ emailAddress: { address: "rep@example.com" } }],
    ccRecipients: [],
    receivedDateTime: "2026-08-25T12:01:00.000Z",
    sentDateTime: "2026-08-25T12:01:00.000Z",
    body: { contentType: "text", content: "Hello" },
    bodyPreview: "Hello",
    internetMessageHeaders: [],
    parentFolderId: "inbox",
    webLink: "https://outlook.office.com/mail/id-1",
    ...overrides,
  };
}

function graphHarness(options: {
  me?: MicrosoftGraphResult<GraphUser>;
  folders?: Record<string, MicrosoftGraphResult<GraphFolder>>;
  pages?: MicrosoftGraphResult<MessagePage>[];
}) {
  const me = vi.fn(async () => options.me ?? ok({ mail: "rep@example.com" }));
  const folder = vi.fn(async (_token: string, name: string) =>
    options.folders?.[name] ?? ok({ id: `folder-${name}` }),
  );
  let pageIndex = 0;
  const listMessages = vi.fn(async () => {
    pageIndex = 0;
    return options.pages?.[0] ?? ok({ value: [] });
  });
  const nextPage = vi.fn(async () => {
    pageIndex += 1;
    return options.pages?.[pageIndex] ?? ok({ value: [] });
  });
  const graph: OutlookGraphApi = { me, folder, listMessages, nextPage };
  return { adapter: new OutlookSyncAdapter(graph), me, folder, listMessages, nextPage };
}

describe("OutlookSyncAdapter", () => {
  it("watermarks a first run without importing historical mail", async () => {
    const kit = graphHarness({});

    const result = await kit.adapter.sync({
      accessToken: "token",
      initializedAt: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      source: "outlook",
      status: "synced",
      mailbox: "rep@example.com",
      cursor: "2026-08-25T12:00:00.000Z",
      messages: [],
      truncated: false,
    });
    expect(kit.me).toHaveBeenCalledOnce();
    expect(kit.folder).not.toHaveBeenCalled();
    expect(kit.listMessages).not.toHaveBeenCalled();
  });

  it("resets an invalid cursor without making a message request", async () => {
    const kit = graphHarness({});

    const result = await kit.adapter.sync({
      accessToken: "token",
      cursor: "not-a-date",
      initializedAt: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "synced",
      cursor: "2026-08-25T12:00:00.000Z",
      reason: "Cursor reset; resuming from now.",
    });
    expect(kit.listMessages).not.toHaveBeenCalled();
  });

  it("uses a one-second overlap, skips excluded folders, and advances to the furthest received time", async () => {
    const first = message({
      id: "first",
      internetMessageId: "<first@acme.example>",
      receivedDateTime: "2026-08-25T12:00:50.000Z",
      sentDateTime: "2026-08-25T12:00:50.000Z",
    });
    const deleted = message({
      id: "deleted",
      internetMessageId: "<deleted@acme.example>",
      parentFolderId: "folder-deleteditems",
      receivedDateTime: "2026-08-25T12:01:00.000Z",
    });
    const second = message({
      id: "second",
      internetMessageId: "<second@acme.example>",
      receivedDateTime: "2026-08-25T12:02:00.000Z",
      sentDateTime: "2026-08-25T12:02:00.000Z",
    });
    const pageOne: MessagePage = {
      value: [first, deleted],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next",
    };
    const pageTwo: MessagePage = { value: [second] };
    const kit = graphHarness({ pages: [ok(pageOne), ok(pageTwo)] });

    const result = await kit.adapter.sync({
      accessToken: "token",
      cursor: "2026-08-25T12:00:00.000Z",
    });

    expect(result.status).toBe("synced");
    if (result.status !== "synced") return;
    expect(result.messages.map((item) => item.rfcMessageId)).toEqual([
      "first@acme.example",
      "second@acme.example",
    ]);
    expect(result.cursor).toBe("2026-08-25T12:02:00.000Z");
    expect(result.truncated).toBe(false);
    expect(kit.folder).toHaveBeenNthCalledWith(1, "token", "junkemail", undefined);
    expect(kit.folder).toHaveBeenNthCalledWith(2, "token", "deleteditems", undefined);
    expect(kit.listMessages).toHaveBeenCalledWith("token", {
      after: new Date("2026-08-25T11:59:59.000Z"),
      top: 50,
      signal: undefined,
    });
    expect(kit.nextPage).toHaveBeenCalledWith(
      "token",
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next",
      undefined,
    );
  });

  it("enforces the per-tick message budget and retains the continuation", async () => {
    const pageOne: MessagePage = {
      value: [
        message({ id: "one", internetMessageId: "<one@acme.example>", receivedDateTime: "2026-08-25T12:01:00Z" }),
        message({ id: "two", internetMessageId: "<two@acme.example>", receivedDateTime: "2026-08-25T12:02:00Z" }),
      ],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next",
    };
    const pageTwo: MessagePage = {
      value: [
        message({ id: "three", internetMessageId: "<three@acme.example>", receivedDateTime: "2026-08-25T12:03:00Z" }),
        message({ id: "four", internetMessageId: "<four@acme.example>", receivedDateTime: "2026-08-25T12:04:00Z" }),
      ],
    };
    const kit = graphHarness({ pages: [ok(pageOne), ok(pageTwo)] });

    const result = await kit.adapter.sync({
      accessToken: "token",
      cursor: "2026-08-25T12:00:00.000Z",
      maxMessages: 3,
      pageSize: 2,
    });

    expect(result).toMatchObject({
      status: "synced",
      cursor: "2026-08-25T12:03:00.000Z",
      truncated: true,
      reason: "Message budget reached; continuing next tick.",
    });
    expect(result.messages).toHaveLength(3);
    expect(kit.nextPage).toHaveBeenCalledOnce();
  });

  it("returns reconnect and rate-limited outcomes before fetching messages", async () => {
    const reconnect = graphHarness({
      folders: {
        junkemail: { outcome: "unauthorized", reason: "Expired token" },
      },
    });
    expect(await reconnect.adapter.sync({ accessToken: "token", cursor: "2026-08-25T12:00:00Z" })).toMatchObject({
      status: "reconnect",
      reason: "Expired token",
    });
    expect(reconnect.listMessages).not.toHaveBeenCalled();

    const limited = graphHarness({
      folders: {
        junkemail: { outcome: "rate-limited", reason: "Too many requests", retryAfterMs: 30_000 },
      },
    });
    expect(await limited.adapter.sync({ accessToken: "token", cursor: "2026-08-25T12:00:00Z" })).toMatchObject({
      status: "rate-limited",
      retryAfterMs: 30_000,
    });
    expect(limited.listMessages).not.toHaveBeenCalled();
  });

  it("preserves parsed messages when a later page fails without advancing the cursor", async () => {
    const pageOne: MessagePage = {
      value: [message({ receivedDateTime: "2026-08-25T12:01:00Z" })],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next",
    };
    const kit = graphHarness({
      pages: [
        ok(pageOne),
        { outcome: "rate-limited", reason: "Quota", retryAfterMs: 45_000 },
      ],
    });

    const result = await kit.adapter.sync({ accessToken: "token", cursor: "2026-08-25T12:00:00Z" });

    expect(result).toMatchObject({ status: "rate-limited", retryAfterMs: 45_000 });
    expect(result.messages).toHaveLength(1);
    expect("cursor" in result).toBe(false);
  });

  it("skips cleanly when no access token exists and reports a missing mailbox", async () => {
    const skipped = graphHarness({});
    expect(await skipped.adapter.sync({ accessToken: "   " })).toMatchObject({
      status: "skipped",
      reason: "Microsoft access token is not configured.",
    });
    expect(skipped.me).not.toHaveBeenCalled();

    const missing = graphHarness({ me: ok({ mail: null, userPrincipalName: null }) });
    expect(await missing.adapter.sync({ accessToken: "token" })).toMatchObject({
      status: "failed",
      reason: "Microsoft returned no mailbox address.",
      retryable: false,
    });
  });
});
