import {
  GraphClient,
  type GraphFolder,
  type GraphMessage,
  type MicrosoftGraphResult,
  type MessagePage,
} from "./microsoft-graph.js";
import {
  parseOutlookMessage,
  type OutlookIncomingMessage,
} from "./microsoft-outlook.js";

export const OUTLOOK_SYNC_SOURCE = "outlook" as const;
export const MICROSOFT_SYNC_SOURCES = [OUTLOOK_SYNC_SOURCE] as const;
export type MicrosoftSyncSource = (typeof MICROSOFT_SYNC_SOURCES)[number];
export const OUTLOOK_EXCLUDED_FOLDERS = ["junkemail", "deleteditems"] as const;
export const OUTLOOK_MAX_MESSAGES_PER_TICK = 120;
export const OUTLOOK_PAGE_SIZE = 50;
export const OUTLOOK_CURSOR_OVERLAP_MS = 1_000;

type OutlookFailure = Exclude<
  MicrosoftGraphResult<unknown>,
  { outcome: "ok" }
>;

export type OutlookSyncInput = {
  accessToken: string;
  cursor?: string | null;
  initializedAt?: Date;
  maxMessages?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export type OutlookGraphApi = Pick<
  GraphClient,
  "me" | "folder" | "listMessages" | "nextPage"
>;

export type OutlookSyncResult =
  | {
      source: typeof OUTLOOK_SYNC_SOURCE;
      status: "synced";
      mailbox: string;
      cursor: string;
      messages: OutlookIncomingMessage[];
      truncated: boolean;
      reason?: string;
    }
  | {
      source: typeof OUTLOOK_SYNC_SOURCE;
      status: "skipped";
      mailbox: string | null;
      messages: OutlookIncomingMessage[];
      reason: string;
    }
  | {
      source: typeof OUTLOOK_SYNC_SOURCE;
      status: "reconnect";
      mailbox: string | null;
      messages: OutlookIncomingMessage[];
      reason: string;
    }
  | {
      source: typeof OUTLOOK_SYNC_SOURCE;
      status: "rate-limited";
      mailbox: string | null;
      messages: OutlookIncomingMessage[];
      retryAfterMs: number;
      reason: string;
    }
  | {
      source: typeof OUTLOOK_SYNC_SOURCE;
      status: "failed";
      mailbox: string | null;
      messages: OutlookIncomingMessage[];
      retryable: boolean;
      reason: string;
    };

export class OutlookSyncAdapter {
  constructor(private readonly graph: OutlookGraphApi) {}

  async sync(input: OutlookSyncInput): Promise<OutlookSyncResult> {
    const initializedAt = input.initializedAt ?? new Date();
    const maxMessages = input.maxMessages ?? OUTLOOK_MAX_MESSAGES_PER_TICK;
    const pageSize = input.pageSize ?? OUTLOOK_PAGE_SIZE;
    const emptyMessages: OutlookIncomingMessage[] = [];

    if (!(initializedAt instanceof Date) || Number.isNaN(initializedAt.getTime())) {
      return {
        source: OUTLOOK_SYNC_SOURCE,
        status: "failed",
        mailbox: null,
        messages: emptyMessages,
        retryable: false,
        reason: "Outlook sync start time is invalid.",
      };
    }
    if (!input.accessToken.trim()) {
      return {
        source: OUTLOOK_SYNC_SOURCE,
        status: "skipped",
        mailbox: null,
        messages: emptyMessages,
        reason: "Microsoft access token is not configured.",
      };
    }
    if (!Number.isSafeInteger(maxMessages) || maxMessages < 1 || maxMessages > 1_000) {
      return {
        source: OUTLOOK_SYNC_SOURCE,
        status: "failed",
        mailbox: null,
        messages: emptyMessages,
        retryable: false,
        reason: "Outlook message budget must be between 1 and 1000.",
      };
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 999) {
      return {
        source: OUTLOOK_SYNC_SOURCE,
        status: "failed",
        mailbox: null,
        messages: emptyMessages,
        retryable: false,
        reason: "Outlook page size must be between 1 and 999.",
      };
    }

    const me = await this.graph.me(input.accessToken, input.signal);
    if (me.outcome !== "ok") return failureFor(me, null, emptyMessages);

    const mailbox = (me.data.mail ?? me.data.userPrincipalName ?? "")
      .trim()
      .toLowerCase();
    if (!mailbox) {
      return {
        source: OUTLOOK_SYNC_SOURCE,
        status: "failed",
        mailbox: null,
        messages: emptyMessages,
        retryable: false,
        reason: "Microsoft returned no mailbox address.",
      };
    }

    const cursor = input.cursor ?? null;
    if (!cursor) {
      return {
        source: OUTLOOK_SYNC_SOURCE,
        status: "synced",
        mailbox,
        cursor: initializedAt.toISOString(),
        messages: emptyMessages,
        truncated: false,
      };
    }

    const from = new Date(cursor);
    if (Number.isNaN(from.getTime())) {
      return {
        source: OUTLOOK_SYNC_SOURCE,
        status: "synced",
        mailbox,
        cursor: initializedAt.toISOString(),
        messages: emptyMessages,
        truncated: false,
        reason: "Cursor reset; resuming from now.",
      };
    }

    const excludedFolders = await this.excludedFolderIds(
      input.accessToken,
      input.signal,
    );
    if (excludedFolders.outcome !== "ok") {
      return failureFor(excludedFolders.failure, mailbox, emptyMessages);
    }

    const messages: OutlookIncomingMessage[] = [];
    let seen = 0;
    let furthest = from;
    let page = await this.graph.listMessages(input.accessToken, {
      after: new Date(from.getTime() - OUTLOOK_CURSOR_OVERLAP_MS),
      top: pageSize,
      signal: input.signal,
    });

    while (page.outcome === "ok") {
      const remaining = maxMessages - seen;
      const available = page.data.value ?? [];
      const current = available.slice(0, Math.max(remaining, 0));

      for (const message of current) {
        seen += 1;
        const receivedAt = parsedDate(message.receivedDateTime);
        if (receivedAt && receivedAt > furthest) furthest = receivedAt;
        if (message.parentFolderId && excludedFolders.ids.has(message.parentFolderId)) {
          continue;
        }

        const parsed = parseOutlookMessage(message);
        if (parsed) messages.push(parsed);
      }

      const nextLink = page.data["@odata.nextLink"];
      const hasUnprocessedMessages = current.length < available.length;
      const truncated = Boolean(nextLink || hasUnprocessedMessages);
      if (!nextLink || seen >= maxMessages) {
        return {
          source: OUTLOOK_SYNC_SOURCE,
          status: "synced",
          mailbox,
          cursor: furthest.toISOString(),
          messages,
          truncated,
          ...(truncated
            ? { reason: "Message budget reached; continuing next tick." }
            : {}),
        };
      }

      page = await this.graph.nextPage(input.accessToken, nextLink, input.signal);
    }

    return failureFor(page, mailbox, messages);
  }

  private async excludedFolderIds(
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<
    | { outcome: "ok"; ids: Set<string> }
    | { outcome: "failed"; failure: OutlookFailure }
  > {
    const ids = new Set<string>();
    for (const name of OUTLOOK_EXCLUDED_FOLDERS) {
      const folder = await this.graph.folder(accessToken, name, signal);
      if (folder.outcome === "ok") {
        const id = folder.data.id?.trim();
        if (id) ids.add(id);
        continue;
      }
      if (folder.outcome === "cursor-invalid") continue;
      return { outcome: "failed", failure: folder };
    }
    return { outcome: "ok", ids };
  }
}

export class MicrosoftOutlookAdapter extends OutlookSyncAdapter {}

type FailureResult =
  | MicrosoftGraphResult<GraphFolder>
  | MicrosoftGraphResult<MessagePage>;

function failureFor(
  result: Exclude<FailureResult, { outcome: "ok" }>,
  mailbox: string | null,
  messages: OutlookIncomingMessage[],
): Exclude<OutlookSyncResult, { status: "synced" }> {
  if (result.outcome === "unauthorized") {
    return {
      source: OUTLOOK_SYNC_SOURCE,
      status: "reconnect",
      mailbox,
      messages,
      reason: result.reason,
    };
  }
  if (result.outcome === "rate-limited") {
    return {
      source: OUTLOOK_SYNC_SOURCE,
      status: "rate-limited",
      mailbox,
      messages,
      retryAfterMs: result.retryAfterMs,
      reason: result.reason,
    };
  }
  if (result.outcome === "cursor-invalid") {
    return {
      source: OUTLOOK_SYNC_SOURCE,
      status: "failed",
      mailbox,
      messages,
      retryable: false,
      reason: result.reason,
    };
  }
  return {
    source: OUTLOOK_SYNC_SOURCE,
    status: "failed",
    mailbox,
    messages,
    retryable: result.retryable,
    reason: result.reason,
  };
}

function parsedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
