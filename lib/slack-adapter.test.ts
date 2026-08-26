import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSlackAuthorizationUrl,
  exchangeSlackOAuthCode,
  filterVisibleSlackChannels,
  matchSlackMembers,
  SlackAdapter,
  SlackAdapterError,
  slackScopeDrift,
  summariseSlackScopes,
  SLACK_REQUESTED_SCOPES,
  SLACK_USER_SCOPES,
} from "./slack-adapter.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("Slack OAuth adapter", () => {
  it("builds a v2 authorization URL with bot and user scopes", () => {
    const url = new URL(
      buildSlackAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "https://bb.example.test/slack/callback",
        state: "state-value-123456",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bb.example.test/slack/callback",
    );
    expect(url.searchParams.get("scope")?.split(",")).toEqual(SLACK_REQUESTED_SCOPES);
    expect(url.searchParams.get("user_scope")?.split(",")).toEqual([...SLACK_USER_SCOPES]);
  });

  it("rejects an external HTTP redirect", () => {
    expect(() =>
      buildSlackAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "http://bb.example.test/slack/callback",
        state: "state-value-123456",
      }),
    ).toThrow("HTTPS or a local HTTP host");
  });

  it("rejects redirect URIs with credentials or fragments", () => {
    for (const redirectUri of [
      "https://client:secret@bb.example.test/slack/callback",
      "https://bb.example.test/slack/callback#fragment",
    ]) {
      expect(() =>
        buildSlackAuthorizationUrl({
          clientId: "client-id",
          redirectUri,
          state: "state-value-123456",
        }),
      ).toThrow();
    }
  });

  it("summarises granted scopes and reports missing and extra permissions", () => {
    expect(summariseSlackScopes(["users:read", "chat:write.public"])).toEqual([
      {
        id: "people",
        label: "People",
        summary:
          "Names and email addresses, so it can match a Slack account to a CRM record.",
        total: 1,
        broad: 0,
      },
      {
        id: "send",
        label: "Messages it can send",
        summary:
          "Post as the app, open a direct message, and preview a link it posts.",
        total: 1,
        broad: 1,
      },
    ]);

    expect(slackScopeDrift(["users:read", "unknown:scope"])).toEqual({
      extra: [
        {
          scope: "unknown:scope",
          grant: "An undocumented permission named unknown:scope",
          sensitive: true,
        },
      ],
      missing: expect.arrayContaining([
        expect.objectContaining({ scope: "users:read.email" }),
        expect.objectContaining({ scope: "chat:write" }),
      ]),
    });
  });

  it("exchanges a code without exposing the client secret in errors", async () => {
    const fetcher = vi.fn(async () =>
      response({
        ok: true,
        access_token: "xoxb-bot",
        token_type: "bot",
        scope: "chat:write",
        team: { id: "T1", name: "Acme" },
        authed_user: { id: "U1", access_token: "xoxp-user", scope: "groups:write" },
      }),
    );

    const grant = await exchangeSlackOAuthCode({
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "oauth-code",
      redirectUri: "https://bb.example.test/slack/callback",
      fetcher,
    });

    expect(grant.team?.id).toBe("T1");
    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/oauth.v2.access",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("turns a rejected exchange into a safe provider error", async () => {
    await expect(
      exchangeSlackOAuthCode({
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "oauth-code",
        redirectUri: "https://bb.example.test/slack/callback",
        fetcher: async () => response({ ok: false, error: "invalid_code" }, 400),
      }),
    ).rejects.toMatchObject({
      method: "oauth.v2.access",
      code: "invalid_code",
      message: "Slack authorization was rejected.",
    });
  });
});

describe("Slack channel and identity adapter", () => {
  it("filters archived and inaccessible channels without guessing", () => {
    const channels = [
      { id: "C1", name: "public", is_member: false, is_private: false },
      { id: "C2", name: "private", is_member: false, is_private: true },
      { id: "C3", name: "joined", is_member: true, is_private: true },
      { id: "C4", name: "archived", is_member: true, is_archived: true },
      { id: "C1", name: "duplicate", is_member: false, is_private: false },
    ];

    expect(filterVisibleSlackChannels(channels, false).map((channel) => channel.id)).toEqual([
      "C1",
      "C3",
    ]);
    expect(filterVisibleSlackChannels(channels, true).map((channel) => channel.id)).toEqual([
      "C1",
      "C2",
      "C3",
    ]);
  });

  it("keeps an accessible duplicate when an earlier row is stale", () => {
    const channels = [
      { id: "C1", name: "private", is_member: false, is_private: true },
      { id: "C1", name: "public", is_member: false, is_private: false },
    ];

    expect(filterVisibleSlackChannels(channels, false)).toEqual([
      { id: "C1", name: "public", is_member: false, is_private: false },
    ]);
  });

  it("matches one active Slack person by exact normalized email", () => {
    const rows = matchSlackMembers(
      [
        { id: "crm-1", name: "Ada", email: " ADA@EXAMPLE.COM " },
        { id: "crm-2", name: "Bob", email: "bob@example.com" },
      ],
      [
        {
          id: "U1",
          name: "ada",
          profile: { email: "ada@example.com" },
        },
        {
          id: "U2",
          name: "bot",
          is_bot: true,
          profile: { email: "bob@example.com" },
        },
        {
          id: "U3",
          name: "deleted",
          deleted: true,
          profile: { email: "missing@example.com" },
        },
      ],
    );

    expect(rows).toEqual([
      {
        id: "crm-1",
        name: "Ada",
        email: " ADA@EXAMPLE.COM ",
        match: {
          slackUserId: "U1",
          slackHandle: "@ada",
          slackEmail: "ada@example.com",
        },
      },
      { id: "crm-2", name: "Bob", email: "bob@example.com", match: null },
    ]);
  });

  it("does not choose between duplicate exact-email Slack users", () => {
    const rows = matchSlackMembers(
      [{ id: "crm-1", name: "Ada", email: "ada@example.com" }],
      [
        { id: "U1", name: "ada-one", profile: { email: "ada@example.com" } },
        { id: "U2", name: "ada-two", profile: { email: "ADA@example.com" } },
      ],
    );

    expect(rows[0]?.match).toBeNull();
  });

  it("paginates members and sends no credentials in URLs", async () => {
    const requested: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = new SlackAdapter(
      { botToken: "xoxb-secret" },
      {
        fetcher: async (input, init) => {
          requested.push({ url: String(input), init });
          const url = new URL(String(input));
          return url.searchParams.get("cursor")
            ? response({ ok: true, members: [{ id: "U2" }], response_metadata: { next_cursor: "" } })
            : response({ ok: true, members: [{ id: "U1" }], response_metadata: { next_cursor: "next" } });
        },
      },
    );

    await expect(adapter.listMembers()).resolves.toHaveLength(2);
    expect(requested).toHaveLength(2);
    expect(requested.every(({ url }) => !url.includes("xoxb-secret"))).toBe(true);
    expect(requested[0]?.init?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer xoxb-secret" }),
    );
  });

  it("reports missing bot credentials without calling Slack", async () => {
    const fetcher = vi.fn();
    const adapter = new SlackAdapter({}, { fetcher });

    await expect(adapter.listMembers()).rejects.toMatchObject({
      method: "users.list",
      code: "missing_token",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("merges bot and user channel views before applying visibility rules", async () => {
    const adapter = new SlackAdapter(
      { botToken: "xoxb-bot", userToken: "xoxp-user" },
      {
        fetcher: async (_input, init) => {
          const token = new Headers(init?.headers).get("authorization");
          return token === "Bearer xoxb-bot"
            ? response({
                ok: true,
                channels: [
                  { id: "C1", name: "public", is_private: false },
                  { id: "C2", name: "private", is_private: true, is_member: false },
                  { id: "C3", name: "archived", is_archived: true },
                ],
              })
            : response({
                ok: true,
                channels: [
                  { id: "C2", name: "private", is_private: true, is_member: true },
                  { id: "C4", name: "user-private", is_private: true, is_member: false },
                ],
              });
        },
      },
    );

    await expect(adapter.listVisibleChannels()).resolves.toEqual([
      { id: "C1", name: "public", is_private: false },
      { id: "C2", name: "private", is_private: true, is_member: false },
      { id: "C4", name: "user-private", is_private: true, is_member: false },
    ]);
  });

  it("retries rate limits with a bounded delay", async () => {
    let attempts = 0;
    const sleep = vi.fn(async () => undefined);
    const adapter = new SlackAdapter(
      { botToken: "xoxb-secret" },
      {
        sleep,
        fetcher: async () => {
          attempts += 1;
          return attempts === 1
            ? response({ ok: false, error: "ratelimited" }, 429, { "retry-after": "2" })
            : response({ ok: true, members: [] });
        },
      },
    );

    await expect(adapter.listMembers()).resolves.toEqual([]);
    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("uses live channel state and a user grant for private invites", async () => {
    const requested: string[] = [];
    const adapter = new SlackAdapter(
      { botToken: "xoxb-bot", userToken: "xoxp-user" },
      {
        fetcher: async (input, init) => {
          const url = String(input);
          requested.push(url);
          if (url.includes("conversations.info")) {
            return response({ ok: true, channel: { is_private: true, is_member: false } });
          }
          if (url.includes("auth.test")) return response({ ok: true, user_id: "U-BOT" });
          return response({ ok: true });
        },
      },
    );

    await expect(adapter.joinChannel("C1", { isPrivate: false, isMember: false })).resolves.toEqual({
      joined: true,
      already: false,
      state: { isPrivate: true, isMember: true },
    });
    expect(requested.some((url) => url.includes("conversations.invite"))).toBe(true);
    expect(requested.some((url) => url.includes("conversations.join"))).toBe(false);
  });

  it("fails closed when a private channel has no user grant", async () => {
    const adapter = new SlackAdapter(
      { botToken: "xoxb-bot" },
      {
        fetcher: async () => response({ ok: false, error: "channel_not_found" }),
      },
    );

    await expect(adapter.joinChannel("C1", { isPrivate: false, isMember: false })).resolves.toEqual({
      joined: false,
      reason: "no_user_grant",
      needsHuman: true,
      state: { isPrivate: true, isMember: false },
    });
  });

  it("treats Slack's already-in-channel reply as success", async () => {
    const adapter = new SlackAdapter(
      { botToken: "xoxb-bot" },
      {
        fetcher: async (input) =>
          String(input).includes("conversations.info")
            ? response({ ok: true, channel: { is_private: false, is_member: false } })
            : response({ ok: false, error: "already_in_channel" }),
      },
    );

    await expect(adapter.joinChannel("C1")).resolves.toEqual({
      joined: true,
      already: true,
      state: { isPrivate: false, isMember: true },
    });
  });

  it("creates channels with the user grant when one exists", async () => {
    let authorization = "";
    let body = "";
    const adapter = new SlackAdapter(
      { botToken: "xoxb-bot", userToken: "xoxp-user" },
      {
        fetcher: async (_input, init) => {
          authorization = String(new Headers(init?.headers).get("authorization"));
          body = String(init?.body ?? "");
          return response({ ok: true, channel: { id: "C1", name: "new-channel" } });
        },
      },
    );

    await expect(adapter.createChannel("new-channel", false)).resolves.toEqual({
      id: "C1",
      name: "new-channel",
    });
    expect(authorization).toBe("Bearer xoxp-user");
    expect(body).toContain('"is_private":false');
  });

  it("opens a direct message and carries the replay key", async () => {
    const requests: Array<{ method: string; body: string }> = [];
    const adapter = new SlackAdapter(
      { botToken: "xoxb-bot" },
      {
        fetcher: async (input, init) => {
          requests.push({ method: String(input), body: String(init?.body ?? "") });
          return String(input).includes("conversations.open")
            ? response({ ok: true, channel: { id: "D1" } })
            : response({ ok: true, channel: "D1", ts: "123.456" });
        },
      },
    );

    await expect(
      adapter.postMessage({ kind: "user", id: "U1" }, "Hello", "run-1:call-1"),
    ).resolves.toEqual({ channel: "D1", ts: "123.456" });
    expect(requests[1]?.body).toContain('"client_msg_id":"run-1:call-1"');
  });

  it("does not leak a token in provider errors", async () => {
    const adapter = new SlackAdapter(
      { botToken: "xoxb-secret" },
      { fetcher: async () => response({ ok: false, error: "invalid_auth" }) },
    );

    const error = await adapter.listMembers().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SlackAdapterError);
    expect(String(error)).not.toContain("xoxb-secret");
  });
});
