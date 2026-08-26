import { z } from "zod";

const SECOND_MS = 1_000;
const MAX_RETRY_AFTER_MS = 30 * SECOND_MS;

export const SLACK_ADAPTER = {
  apiBaseUrl: "https://slack.com/api",
  oauthAuthorizationUrl: "https://slack.com/oauth/v2/authorize",
  oauthTokenUrl: "https://slack.com/api/oauth.v2.access",
  request: {
    timeoutMs: 15 * SECOND_MS,
    maxAttempts: 3,
    retryUnitMs: SECOND_MS,
  },
  inventory: {
    pageSize: 200,
    maxPages: 100,
    channelTypes: "public_channel,private_channel",
  },
} as const;

export type SlackScopeGroup = "people" | "read" | "send" | "change";

export type SlackScope = {
  scope: string;
  group?: SlackScopeGroup;
  grant: string;
  sensitive: boolean;
};

export const SLACK_SCOPES: readonly SlackScope[] = [
  {
    scope: "users:read",
    group: "people",
    grant: "See the people in your workspace",
    sensitive: false,
  },
  {
    scope: "users:read.email",
    group: "people",
    grant: "See their email addresses, so it can match them to CRM records",
    sensitive: true,
  },
  {
    scope: "channels:read",
    group: "read",
    grant: "See the name and topic of every public channel",
    sensitive: false,
  },
  {
    scope: "groups:read",
    group: "read",
    grant: "See private channels it has been added to",
    sensitive: false,
  },
  {
    scope: "channels:history",
    group: "read",
    grant: "Read messages in public channels it has been added to",
    sensitive: true,
  },
  {
    scope: "groups:history",
    group: "read",
    grant: "Read messages in private channels it has been added to",
    sensitive: false,
  },
  {
    scope: "chat:write",
    group: "send",
    grant: "Post messages as the app",
    sensitive: false,
  },
  {
    scope: "chat:write.public",
    group: "send",
    grant: "Post to any public channel, including ones it has not joined",
    sensitive: true,
  },
  {
    scope: "im:write",
    group: "send",
    grant: "Open a direct message with a person",
    sensitive: false,
  },
  {
    scope: "channels:join",
    group: "change",
    grant: "Join a public channel by itself",
    sensitive: true,
  },
  {
    scope: "channels:manage",
    group: "change",
    grant: "Create public channels, and rename or archive ones it is in",
    sensitive: true,
  },
  {
    scope: "groups:write",
    group: "change",
    grant: "Create private channels, and rename or archive ones it is in",
    sensitive: true,
  },
  {
    scope: "channels:write.invites",
    group: "change",
    grant: "Invite people to a public channel",
    sensitive: true,
  },
  {
    scope: "groups:write.invites",
    group: "change",
    grant: "Invite people to a private channel",
    sensitive: true,
  },
  {
    scope: "conversations.connect:write",
    group: "change",
    grant: "Send and accept Slack Connect invitations",
    sensitive: true,
  },
  {
    scope: "links:write",
    group: "send",
    grant: "Show a preview under a link it posts",
    sensitive: false,
  },
];

export const SLACK_REQUESTED_SCOPES = SLACK_SCOPES.map((entry) => entry.scope);

export const SLACK_USER_SCOPES = [
  "channels:read",
  "channels:write",
  "groups:read",
  "groups:write",
] as const;

export const SLACK_USER_GRANT = {
  scope: "slack:user-invite",
  grant: "Add itself to a private channel on your behalf",
  sensitive: true,
} as const satisfies SlackScope;

export const SLACK_SCOPE_GROUPS: ReadonlyArray<{
  id: SlackScopeGroup;
  label: string;
  summary: string;
}> = [
  {
    id: "people",
    label: "People",
    summary:
      "Names and email addresses, so it can match a Slack account to a CRM record.",
  },
  {
    id: "read",
    label: "Channels it can read",
    summary:
      "Names and topics of public channels, and the messages in any channel it has been added to.",
  },
  {
    id: "send",
    label: "Messages it can send",
    summary:
      "Post as the app, open a direct message, and preview a link it posts.",
  },
  {
    id: "change",
    label: "Channels it can change",
    summary: "Join, create, rename, archive, and invite people to channels.",
  },
];

export type SlackScopeSummary = {
  id: SlackScopeGroup;
  label: string;
  summary: string;
  total: number;
  broad: number;
};

export type SlackScopeDrift = {
  extra: SlackScope[];
  missing: SlackScope[];
};

export function describeSlackScopes(granted: readonly string[]): SlackScope[] {
  const known = new Map(SLACK_SCOPES.map((entry) => [entry.scope, entry]));
  return granted.map(
    (scope) =>
      known.get(scope) ?? {
        scope,
        grant: `An undocumented permission named ${scope}`,
        sensitive: true,
      },
  );
}

export function summariseSlackScopes(
  granted: readonly string[],
): SlackScopeSummary[] {
  const held = describeSlackScopes(granted);
  return SLACK_SCOPE_GROUPS.map((group) => {
    const inGroup = held.filter((entry) => entry.group === group.id);
    return {
      ...group,
      total: inGroup.length,
      broad: inGroup.filter((entry) => entry.sensitive).length,
    };
  }).filter((group) => group.total > 0);
}

export function slackScopeDrift(granted: readonly string[]): SlackScopeDrift {
  const held = new Set(granted);
  return {
    extra: describeSlackScopes(
      granted.filter((scope) => !SLACK_REQUESTED_SCOPES.includes(scope)),
    ),
    missing: SLACK_SCOPES.filter((entry) => !held.has(entry.scope)),
  };
}

export type SlackCredentials = {
  botToken?: string | null;
  userToken?: string | null;
};

export type SlackFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SlackChannelState = {
  isPrivate: boolean;
  isMember: boolean;
};

export type SlackJoinResult =
  | { joined: true; already: boolean; state: SlackChannelState }
  | {
      joined: false;
      reason: string;
      needsHuman: boolean;
      state: SlackChannelState;
    };

export type SlackCrmMember = {
  id: string;
  name: string;
  email: string;
};

export type SlackMemberMatch = {
  slackUserId: string;
  slackHandle: string;
  slackEmail: string;
};

export type SlackMemberMatchRow = SlackCrmMember & {
  match: SlackMemberMatch | null;
};

export class SlackAdapterError extends Error {
  readonly name = "SlackAdapterError";

  constructor(
    readonly method: string,
    readonly code: string,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

const responseMetadataSchema = z
  .object({ next_cursor: z.string().max(2_048).nullish() })
  .nullish();

const replySchema = z.object({
  ok: z.boolean(),
  error: nonEmptyText(128).optional(),
});

const memberSchema = z.object({
  id: nonEmptyText(128),
  name: nonEmptyText(256).optional(),
  profile: z
    .object({ email: nonEmptyText(320).nullish() })
    .nullish(),
  deleted: z.boolean().optional(),
  is_bot: z.boolean().optional(),
});

const channelSchema = z.object({
  id: nonEmptyText(128),
  name: nonEmptyText(256),
  num_members: z.number().int().nonnegative().nullish(),
  is_member: z.boolean().optional(),
  is_archived: z.boolean().optional(),
  is_private: z.boolean().optional(),
});

const memberPageSchema = replySchema.extend({
  members: z.array(memberSchema).default([]),
  response_metadata: responseMetadataSchema,
});

const channelPageSchema = replySchema.extend({
  channels: z.array(channelSchema).default([]),
  response_metadata: responseMetadataSchema,
});

const channelInfoSchema = replySchema.extend({
  channel: z
    .object({
      is_private: z.boolean().optional(),
      is_member: z.boolean().optional(),
    })
    .nullish(),
});

const authTestSchema = replySchema.extend({
  user_id: nonEmptyText(128).optional(),
});

const createChannelReplySchema = replySchema.extend({
  channel: z
    .object({ id: nonEmptyText(128), name: nonEmptyText(256) })
    .nullish(),
});

const openedConversationSchema = replySchema.extend({
  channel: z.object({ id: nonEmptyText(128) }).nullish(),
});

const postedMessageSchema = replySchema.extend({
  channel: nonEmptyText(128).optional(),
  ts: nonEmptyText(128).optional(),
});

const oauthGrantSchema = z.object({
  ok: z.boolean(),
  error: nonEmptyText(128).optional(),
  access_token: nonEmptyText(4_096).optional(),
  token_type: nonEmptyText(64).optional(),
  scope: z.string().max(4_096).optional(),
  team: z
    .object({ id: nonEmptyText(128), name: nonEmptyText(256).optional() })
    .nullish(),
  authed_user: z
    .object({
      id: nonEmptyText(128),
      access_token: nonEmptyText(4_096).optional(),
      scope: z.string().max(4_096).optional(),
    })
    .nullish(),
});

export type SlackMember = z.infer<typeof memberSchema>;
export type SlackChannel = z.infer<typeof channelSchema>;
export type SlackOAuthGrant = z.infer<typeof oauthGrantSchema>;

const redirectUriSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    ) && !url.username && !url.password && !url.hash;
  }, "The Slack redirect URI must use HTTPS or a local HTTP host.");

const oauthStartInputSchema = z.object({
  clientId: nonEmptyText(256),
  redirectUri: redirectUriSchema,
  state: nonEmptyText(512).min(16),
});

const oauthExchangeInputSchema = oauthStartInputSchema.omit({ state: true }).extend({
  code: nonEmptyText(1_024),
});

export function buildSlackAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const values = oauthStartInputSchema.parse(input);
  const url = new URL(SLACK_ADAPTER.oauthAuthorizationUrl);
  url.search = new URLSearchParams({
    client_id: values.clientId,
    redirect_uri: values.redirectUri,
    state: values.state,
    scope: SLACK_REQUESTED_SCOPES.join(","),
    user_scope: SLACK_USER_SCOPES.join(","),
  }).toString();
  return url.toString();
}

export async function exchangeSlackOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetcher?: SlackFetch;
  timeoutMs?: number;
}): Promise<SlackOAuthGrant> {
  const values = oauthExchangeInputSchema.parse(input);
  const clientSecret = z.string().trim().min(1).max(4_096).parse(input.clientSecret);
  const fetcher = input.fetcher ?? fetch;
  const timeoutMs = boundedPositive(input.timeoutMs, SLACK_ADAPTER.request.timeoutMs);
  let response: Response;

  try {
    response = await fetcher(SLACK_ADAPTER.oauthTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: values.clientId,
        client_secret: clientSecret,
        code: values.code,
        redirect_uri: values.redirectUri,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new SlackAdapterError(
      "oauth.v2.access",
      "network_error",
      "Slack authorization could not be reached.",
    );
  }

  const payload = await response.json().catch(() => null);
  const grant = oauthGrantSchema.safeParse(payload);
  if (!grant.success) {
    throw new SlackAdapterError(
      "oauth.v2.access",
      "invalid_response",
      "Slack authorization returned an unreadable response.",
      response.status,
    );
  }
  if (!response.ok || !grant.data.ok || !grant.data.access_token) {
    throw new SlackAdapterError(
      "oauth.v2.access",
      safeErrorCode(grant.data.error),
      "Slack authorization was rejected.",
      response.status,
    );
  }
  return grant.data;
}

export function filterVisibleSlackChannels(
  channels: readonly SlackChannel[],
  canInviteItself: boolean,
): SlackChannel[] {
  const unique = new Map<string, SlackChannel>();
  for (const channel of channels) {
    if (channel.is_archived) continue;
    if (!(channel.is_member || !channel.is_private || canInviteItself)) continue;
    if (unique.has(channel.id)) continue;
    unique.set(channel.id, channel);
  }
  return [...unique.values()];
}

export function matchSlackMembers(
  crmMembers: readonly SlackCrmMember[],
  slackMembers: readonly SlackMember[],
): SlackMemberMatchRow[] {
  const byEmail = new Map<string, SlackMember[]>();
  for (const member of slackMembers) {
    if (member.deleted || member.is_bot) continue;
    const email = normalizeEmail(member.profile?.email);
    if (!email) continue;
    const entries = byEmail.get(email) ?? [];
    entries.push(member);
    byEmail.set(email, entries);
  }

  return crmMembers.map((member) => {
    const matches = byEmail.get(normalizeEmail(member.email)) ?? [];
    const match = matches.length === 1 ? matches[0] : undefined;
    return {
      ...member,
      match: match
        ? {
            slackUserId: match.id,
            slackHandle: `@${match.name ?? match.id}`,
            slackEmail: match.profile?.email ?? "",
          }
        : null,
    };
  });
}

export class SlackAdapter {
  private readonly fetcher: SlackFetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryUnitMs: number;
  private readonly maxPages: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly botToken: string | null;
  private readonly userToken: string | null;

  constructor(credentials: SlackCredentials, options: SlackAdapterOptions = {}) {
    this.botToken = optionalToken(credentials.botToken);
    this.userToken = optionalToken(credentials.userToken);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = boundedPositive(
      options.timeoutMs,
      SLACK_ADAPTER.request.timeoutMs,
    );
    this.maxAttempts = boundedInteger(
      options.maxAttempts,
      SLACK_ADAPTER.request.maxAttempts,
    );
    this.retryUnitMs = boundedPositive(
      options.retryUnitMs,
      SLACK_ADAPTER.request.retryUnitMs,
    );
    this.maxPages = boundedInteger(options.maxPages, SLACK_ADAPTER.inventory.maxPages);
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  get canInviteItself(): boolean {
    return this.userToken !== null;
  }

  async listMembers(signal?: AbortSignal): Promise<SlackMember[]> {
    const members: SlackMember[] = [];
    let cursor = "";
    const cursors = new Set<string>();

    for (let page = 0; page < this.maxPages; page += 1) {
      const result = await this.request(
        "users.list",
        this.botToken,
        {
          query: {
            limit: String(SLACK_ADAPTER.inventory.pageSize),
            ...(cursor ? { cursor } : {}),
          },
          signal,
        },
        memberPageSchema,
      );
      members.push(...result.members);
      const next = result.response_metadata?.next_cursor?.trim() ?? "";
      if (!next) return members;
      if (cursors.has(next)) {
        throw new SlackAdapterError(
          "users.list",
          "invalid_pagination",
          "Slack returned a repeated people cursor.",
        );
      }
      cursors.add(next);
      cursor = next;
    }

    throw new SlackAdapterError(
      "users.list",
      "pagination_limit",
      "Slack returned too many people pages.",
    );
  }

  async listChannels(
    tokenKind: "bot" | "user" = "bot",
    signal?: AbortSignal,
  ): Promise<SlackChannel[]> {
    const token = tokenKind === "user" ? this.userToken : this.botToken;
    const channels: SlackChannel[] = [];
    let cursor = "";
    const cursors = new Set<string>();

    for (let page = 0; page < this.maxPages; page += 1) {
      const result = await this.request(
        "conversations.list",
        token,
        {
          query: {
            limit: String(SLACK_ADAPTER.inventory.pageSize),
            exclude_archived: "true",
            types: SLACK_ADAPTER.inventory.channelTypes,
            ...(cursor ? { cursor } : {}),
          },
          signal,
        },
        channelPageSchema,
      );
      channels.push(...result.channels);
      const next = result.response_metadata?.next_cursor?.trim() ?? "";
      if (!next) return channels;
      if (cursors.has(next)) {
        throw new SlackAdapterError(
          "conversations.list",
          "invalid_pagination",
          "Slack returned a repeated channel cursor.",
        );
      }
      cursors.add(next);
      cursor = next;
    }

    throw new SlackAdapterError(
      "conversations.list",
      "pagination_limit",
      "Slack returned too many channel pages.",
    );
  }

  async listVisibleChannels(signal?: AbortSignal): Promise<SlackChannel[]> {
    const fromBot = await this.listChannels("bot", signal);
    if (!this.userToken) return fromBot;

    const fromUser = await this.listChannels("user", signal).catch(() => []);
    const merged = new Map(fromBot.map((channel) => [channel.id, channel]));
    for (const channel of fromUser) {
      if (merged.has(channel.id)) continue;
      merged.set(channel.id, { ...channel, is_member: false });
    }
    return filterVisibleSlackChannels([...merged.values()], this.canInviteItself);
  }

  async inspectChannel(
    channelId: string,
    signal?: AbortSignal,
  ): Promise<SlackChannelState | null> {
    const id = nonEmptyText(128).parse(channelId);
    try {
      const result = await this.request(
        "conversations.info",
        this.botToken,
        { query: { channel: id }, signal },
        channelInfoSchema,
      );
      if (!result.channel) return null;
      return {
        isPrivate: result.channel.is_private ?? false,
        isMember: result.channel.is_member ?? false,
      };
    } catch (error) {
      if (error instanceof SlackAdapterError && error.code === "channel_not_found") {
        return { isPrivate: true, isMember: false };
      }
      return null;
    }
  }

  async joinChannel(
    channelId: string,
    cached: SlackChannelState = { isPrivate: true, isMember: false },
    signal?: AbortSignal,
  ): Promise<SlackJoinResult> {
    const id = nonEmptyText(128).parse(channelId);
    if (!this.botToken) {
      return {
        joined: false,
        reason: "missing_bot_token",
        needsHuman: true,
        state: cached,
      };
    }

    const state = (await this.inspectChannel(id, signal)) ?? cached;
    if (state.isMember) return { joined: true, already: true, state };

    try {
      if (state.isPrivate) {
        if (!this.userToken) {
          return {
            joined: false,
            reason: "no_user_grant",
            needsHuman: true,
            state,
          };
        }
        const botId = await this.botUserId(signal);
        if (!botId) {
          return {
            joined: false,
            reason: "unknown_bot_user",
            needsHuman: true,
            state,
          };
        }
        await this.request(
          "conversations.invite",
          this.userToken,
          { body: { channel: id, users: botId }, signal },
          replySchema,
        );
      } else {
        await this.request(
          "conversations.join",
          this.botToken,
          { body: { channel: id }, signal },
          replySchema,
        );
      }
      return {
        joined: true,
        already: false,
        state: { ...state, isMember: true },
      };
    } catch (error) {
      const reason = error instanceof SlackAdapterError ? error.code : "provider_error";
      if (reason === "already_in_channel") {
        return {
          joined: true,
          already: true,
          state: { ...state, isMember: true },
        };
      }
      return {
        joined: false,
        reason,
        needsHuman: HUMAN_ACTION_ERRORS.has(reason),
        state,
      };
    }
  }

  async createChannel(
    name: string,
    isPrivate: boolean,
    signal?: AbortSignal,
  ): Promise<{ id: string; name: string }> {
    const channelName = z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-_]+$/u)
      .parse(name);
    const token = isPrivate ? this.userToken : (this.userToken ?? this.botToken);
    const result = await this.request(
      "conversations.create",
      token,
      { body: { name: channelName, is_private: isPrivate }, signal },
      createChannelReplySchema,
    );
    if (!result.channel) {
      throw new SlackAdapterError(
        "conversations.create",
        "incomplete_response",
        "Slack returned an incomplete channel receipt.",
      );
    }
    return result.channel;
  }

  async postMessage(
    destination: { kind: "channel" | "user"; id: string },
    text: string,
    clientMessageId: string,
    signal?: AbortSignal,
  ): Promise<{ channel: string; ts: string }> {
    const destinationId = nonEmptyText(128).parse(destination.id);
    const message = z.string().trim().min(1).max(4_000).parse(text);
    const replayId = nonEmptyText(256).parse(clientMessageId);
    let channel = destinationId;

    if (destination.kind === "user") {
      const opened = await this.request(
        "conversations.open",
        this.botToken,
        { body: { users: destinationId, return_im: true }, signal },
        openedConversationSchema,
      );
      if (!opened.channel?.id) {
        throw new SlackAdapterError(
          "conversations.open",
          "incomplete_response",
          "Slack did not return a direct-message channel.",
        );
      }
      channel = opened.channel.id;
    }

    const posted = await this.request(
      "chat.postMessage",
      this.botToken,
      {
        body: { channel, text: message, client_msg_id: replayId },
        signal,
      },
      postedMessageSchema,
    );
    if (!posted.channel || !posted.ts) {
      throw new SlackAdapterError(
        "chat.postMessage",
        "incomplete_response",
        "Slack returned an incomplete message receipt.",
      );
    }
    return { channel: posted.channel, ts: posted.ts };
  }

  private async botUserId(signal?: AbortSignal): Promise<string | null> {
    try {
      const result = await this.request(
        "auth.test",
        this.botToken,
        { signal },
        authTestSchema,
      );
      return result.user_id ?? null;
    } catch {
      return null;
    }
  }

  private async request<Schema extends z.ZodTypeAny>(
    method: string,
    token: string | null,
    options: {
      body?: Record<string, string | boolean | number>;
      query?: Record<string, string>;
      signal?: AbortSignal;
    },
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    if (!token) {
      throw new SlackAdapterError(
        method,
        "missing_token",
        "Slack credentials are not configured.",
      );
    }

    const url = new URL(`${SLACK_ADAPTER.apiBaseUrl}/${method}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: options.body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(options.body
              ? { "Content-Type": "application/json; charset=utf-8" }
              : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
          signal: combineSignals(options.signal, this.timeoutMs),
        });
      } catch {
        throw new SlackAdapterError(
          method,
          "network_error",
          "Slack request failed before it returned a response.",
        );
      }

      const payload = await response.json().catch(() => null);
      const reply = replySchema.safeParse(payload);
      if (!reply.success) {
        throw new SlackAdapterError(
          method,
          "invalid_response",
          "Slack returned an unreadable response.",
          response.status,
        );
      }

      const retryable = response.status === 429 || reply.data.error === "ratelimited";
      if (retryable && attempt < this.maxAttempts) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        const seconds = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : 1;
        await this.sleep(Math.min(seconds * this.retryUnitMs, MAX_RETRY_AFTER_MS));
        continue;
      }

      if (!response.ok || !reply.data.ok) {
        throw new SlackAdapterError(
          method,
          safeErrorCode(reply.data.error),
          `Slack rejected ${method}.`,
          response.status,
        );
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new SlackAdapterError(
          method,
          "invalid_response",
          "Slack returned a response with an unexpected shape.",
          response.status,
        );
      }
      return parsed.data;
    }

    throw new SlackAdapterError(
      method,
      "rate_limited",
      `Slack kept ${method} rate limited.`,
    );
  }
}

export interface SlackAdapterOptions {
  fetcher?: SlackFetch;
  timeoutMs?: number;
  maxAttempts?: number;
  retryUnitMs?: number;
  maxPages?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const HUMAN_ACTION_ERRORS = new Set([
  "channel_not_found",
  "invalid_auth",
  "is_archived",
  "missing_scope",
  "no_user_grant",
  "not_in_channel",
  "token_revoked",
]);

function optionalToken(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const token = value.trim();
  return token ? token : null;
}

function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function safeErrorCode(value: string | undefined): string {
  const code = value?.trim().toLowerCase() ?? "provider_error";
  return /^[a-z0-9][a-z0-9_-]{0,127}$/u.test(code) ? code : "provider_error";
}

function boundedPositive(value: number | undefined, fallback: number): number {
  return value === undefined && Number.isFinite(fallback) && fallback > 0
    ? fallback
    : Number.isFinite(value) && value !== undefined && value > 0
      ? Math.min(Math.floor(value), 300_000)
      : fallback;
}

function boundedInteger(value: number | undefined, fallback: number): number {
  return value === undefined && Number.isSafeInteger(fallback) && fallback > 0
    ? fallback
    : Number.isSafeInteger(value) && value !== undefined && value > 0
      ? Math.min(value, 1_000)
      : fallback;
}

function combineSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}
