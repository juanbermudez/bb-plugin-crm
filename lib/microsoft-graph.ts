import { z } from "zod";

export const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0/me";

export const OUTLOOK_MESSAGE_FIELDS = [
  "id",
  "internetMessageId",
  "conversationId",
  "subject",
  "from",
  "sender",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "sentDateTime",
  "body",
  "bodyPreview",
  "internetMessageHeaders",
  "parentFolderId",
  "webLink",
] as const;

const graphAddressSchema = z
  .object({
    emailAddress: z
      .object({
        name: z.string().max(256).nullish(),
        address: z.string().max(320).nullish(),
      })
      .nullish(),
  })
  .strip();

const graphHeaderSchema = z
  .object({
    name: z.string().max(128).nullish(),
    value: z.string().max(8_192).nullish(),
  })
  .strip();

const graphMessageSchema = z
  .object({
    id: z.string().max(512).nullish(),
    internetMessageId: z.string().max(998).nullish(),
    conversationId: z.string().max(512).nullish(),
    subject: z.string().max(998).nullable().optional(),
    from: graphAddressSchema.nullish(),
    sender: graphAddressSchema.nullish(),
    toRecipients: z.array(graphAddressSchema).nullish(),
    ccRecipients: z.array(graphAddressSchema).nullish(),
    receivedDateTime: z.string().nullish(),
    sentDateTime: z.string().nullish(),
    body: z
      .object({
        contentType: z.string().max(32).nullish(),
        content: z.string().max(2_000_000).nullish(),
      })
      .nullish(),
    bodyPreview: z.string().max(8_192).nullish(),
    internetMessageHeaders: z.array(graphHeaderSchema).nullish(),
    parentFolderId: z.string().max(512).nullish(),
    webLink: z.string().max(4_096).nullish(),
  })
  .strip();

const messagePageSchema = z
  .object({
    value: z.array(graphMessageSchema).nullish(),
    "@odata.nextLink": z.string().max(8_192).nullish(),
  })
  .strip();

const graphUserSchema = z
  .object({
    mail: z.string().max(320).nullable().optional(),
    userPrincipalName: z.string().max(320).nullable().optional(),
  })
  .strip();

const graphFolderSchema = z
  .object({ id: z.string().max(512).nullable().optional() })
  .strip();

const graphErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().max(256).optional(),
        message: z.string().max(2_048).optional(),
        status: z.string().max(256).optional(),
      })
      .optional(),
  })
  .strip();

export type GraphAddress = z.infer<typeof graphAddressSchema>;
export type GraphHeader = z.infer<typeof graphHeaderSchema>;
export type GraphMessage = z.infer<typeof graphMessageSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type GraphUser = z.infer<typeof graphUserSchema>;
export type GraphFolder = z.infer<typeof graphFolderSchema>;

export type MicrosoftGraphResult<T> =
  | { outcome: "ok"; data: T }
  | { outcome: "cursor-invalid"; reason: string }
  | { outcome: "unauthorized"; reason: string }
  | { outcome: "rate-limited"; reason: string; retryAfterMs: number }
  | { outcome: "failed"; reason: string; retryable: boolean };

export interface MicrosoftGraphClientOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /** Keep a malformed or unexpectedly large provider response bounded. */
  maxResponseBytes?: number;
}

export interface ListMessagesOptions {
  after: Date;
  top: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const HARD_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MIN_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const MAX_TOP = 999;

export class MicrosoftGraphClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: MicrosoftGraphClientOptions = {}) {
    const fetcher = options.fetcher ?? globalThis.fetch;
    if (typeof fetcher !== "function") {
      throw new Error("A fetch implementation is required for Microsoft Graph.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error(`Microsoft Graph timeout must be between 1 and ${MAX_TIMEOUT_MS}ms.`);
    }

    const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes < 1_024 ||
      maxResponseBytes > HARD_MAX_RESPONSE_BYTES
    ) {
      throw new Error(
        `Microsoft Graph response limit must be between 1024 and ${HARD_MAX_RESPONSE_BYTES} bytes.`,
      );
    }

    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
  }

  async me(
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<MicrosoftGraphResult<GraphUser>> {
    const target = new URL(MICROSOFT_GRAPH_BASE_URL);
    target.searchParams.set("$select", "mail,userPrincipalName");
    return this.get(
      target,
      accessToken,
      graphUserSchema,
      signal,
    );
  }

  async folder(
    accessToken: string,
    wellKnownName: string,
    signal?: AbortSignal,
  ): Promise<MicrosoftGraphResult<GraphFolder>> {
    if (!/^[a-z][a-z0-9-]{0,63}$/iu.test(wellKnownName)) {
      return {
        outcome: "failed",
        reason: "Microsoft Graph folder name is invalid.",
        retryable: false,
      };
    }

    const target = new URL(
      `${MICROSOFT_GRAPH_BASE_URL}/mailFolders/${encodeURIComponent(wellKnownName)}`,
    );
    target.searchParams.set("$select", "id");
    return this.get(target, accessToken, graphFolderSchema, signal);
  }

  async listMessages(
    accessToken: string,
    options: ListMessagesOptions,
  ): Promise<MicrosoftGraphResult<MessagePage>> {
    if (!(options.after instanceof Date) || Number.isNaN(options.after.getTime())) {
      return {
        outcome: "failed",
        reason: "Microsoft Graph message cursor is invalid.",
        retryable: false,
      };
    }
    if (!Number.isSafeInteger(options.top) || options.top < 1 || options.top > MAX_TOP) {
      return {
        outcome: "failed",
        reason: `Microsoft Graph page size must be between 1 and ${MAX_TOP}.`,
        retryable: false,
      };
    }

    const target = new URL(`${MICROSOFT_GRAPH_BASE_URL}/messages`);
    target.searchParams.set("$select", OUTLOOK_MESSAGE_FIELDS.join(","));
    target.searchParams.set(
      "$filter",
      `receivedDateTime gt ${options.after.toISOString()} and isDraft eq false`,
    );
    target.searchParams.set("$orderby", "receivedDateTime asc");
    target.searchParams.set("$top", String(options.top));

    return this.get(target, accessToken, messagePageSchema, options.signal);
  }

  async nextPage(
    accessToken: string,
    nextLink: string,
    signal?: AbortSignal,
  ): Promise<MicrosoftGraphResult<MessagePage>> {
    let target: URL;
    try {
      target = new URL(nextLink);
    } catch {
      return {
        outcome: "failed",
        reason: "Microsoft Graph returned an invalid next page URL.",
        retryable: false,
      };
    }

    if (!isMicrosoftGraphUrl(target)) {
      return {
        outcome: "failed",
        reason: "Microsoft Graph returned an unsafe next page URL.",
        retryable: false,
      };
    }

    return this.get(target, accessToken, messagePageSchema, signal);
  }

  private async get<T>(
    target: URL,
    accessToken: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<MicrosoftGraphResult<T>> {
    if (!isMicrosoftGraphUrl(target)) {
      return {
        outcome: "failed",
        reason: "Microsoft Graph URL is not allowed.",
        retryable: false,
      };
    }

    const token = validAccessToken(accessToken);
    if (!token) {
      return {
        outcome: "failed",
        reason: "A Microsoft access token is required.",
        retryable: false,
      };
    }

    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) {
      return {
        outcome: "failed",
        reason: "The Microsoft Graph request was cancelled.",
        retryable: false,
      };
    }
    signal?.addEventListener("abort", abort, { once: true });

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort("timeout");
    }, this.timeoutMs);

    try {
      const response = await this.fetcher(target, {
        headers: {
          Accept: "application/json",
          authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      const body = await readResponseBody(response, this.maxResponseBytes);
      if (body.tooLarge) {
        return {
          outcome: "failed",
          reason: "Microsoft returned a response larger than the configured safety limit.",
          retryable: false,
        };
      }

      if (!response.ok) {
        return this.interpretFailure(response, body.text);
      }

      const parsed = parseJson(body.text);
      if (parsed === null) {
        return {
          outcome: "failed",
          reason: "Microsoft returned an invalid JSON response.",
          retryable: false,
        };
      }

      const checked = schema.safeParse(parsed);
      if (!checked.success) {
        return {
          outcome: "failed",
          reason: "Microsoft returned an invalid Graph response.",
          retryable: false,
        };
      }

      return { outcome: "ok", data: checked.data };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        outcome: "failed",
        reason: timedOut
          ? `Timed out after ${this.timeoutMs}ms.`
          : aborted || signal?.aborted
            ? "The Microsoft Graph request was cancelled."
            : error instanceof Error
              ? safeReason(error.message)
              : "Microsoft Graph request failed.",
        retryable: timedOut || (!aborted && !signal?.aborted),
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private interpretFailure(
    response: Response,
    body: string,
  ): MicrosoftGraphResult<never> {
    const reason = graphReason(body, response.status);

    if (response.status === 401) {
      return { outcome: "unauthorized", reason };
    }
    if (response.status === 404 || response.status === 410) {
      return { outcome: "cursor-invalid", reason };
    }
    if (response.status === 429) {
      return {
        outcome: "rate-limited",
        reason,
        retryAfterMs: retryAfter(response.headers.get("retry-after")),
      };
    }
    if (response.status === 403 && /rate|quota|limit/i.test(reason)) {
      return {
        outcome: "rate-limited",
        reason,
        retryAfterMs: retryAfter(response.headers.get("retry-after")),
      };
    }

    return {
      outcome: "failed",
      reason,
      retryable: response.status >= 500,
    };
  }
}

export class GraphClient extends MicrosoftGraphClient {}

function isMicrosoftGraphUrl(value: URL): boolean {
  return (
    value.protocol === "https:" &&
    value.hostname.toLowerCase() === "graph.microsoft.com" &&
    (value.port === "" || value.port === "443") &&
    value.username === "" &&
    value.password === "" &&
    value.pathname.startsWith("/v1.0/") &&
    [...value.searchParams.keys()].every(
      (key) => !/(?:access|refresh)[_-]?token|authorization|client[_-]?secret/i.test(key),
    )
  );
}

function parseJson(value: string): unknown | null {
  if (!value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
}

type ResponseBody = { text: string; tooLarge: boolean };

async function readResponseBody(
  response: Response,
  maxBytes: number,
): Promise<ResponseBody> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { text: "", tooLarge: true };
  }

  if (!response.body) {
    const text = await response.text();
    return { text: text.slice(0, maxBytes), tooLarge: text.length > maxBytes };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return { text: "", tooLarge: true };
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return { text: chunks.join(""), tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

function validAccessToken(value: string): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token || token.length > 8_192 || /[\u0000-\u001f\u007f]/u.test(token)) {
    return null;
  }
  return token;
}

function graphReason(body: string, status: number): string {
  const parsed = parseJson(body);
  const checked = graphErrorSchema.safeParse(parsed);
  const message = checked.success
    ? checked.data.error?.message ?? checked.data.error?.status ?? checked.data.error?.code
    : undefined;
  return safeReason(message ?? `HTTP ${status}`);
}

function safeReason(value: string): string {
  return value
    .replace(/Bearer\s+[^\s,;]+/giu, "Bearer [redacted]")
    .replace(
      /(access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization)\s*[:=]\s*[^\s,;]+/giu,
      "$1=[redacted]",
    )
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, 1_024) || "Microsoft Graph request failed.";
}

function retryAfter(header: string | null): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return clampBackoff(seconds * 1_000);
    }

    const at = Date.parse(header);
    if (Number.isFinite(at)) {
      return clampBackoff(at - Date.now());
    }
  }

  return MIN_BACKOFF_MS;
}

function clampBackoff(value: number): number {
  return Math.min(Math.max(Math.ceil(value), MIN_BACKOFF_MS), MAX_BACKOFF_MS);
}
