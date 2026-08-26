import type { GraphAddress, GraphHeader, GraphMessage } from "./microsoft-graph.js";

export const MICROSOFT_PROVIDER_ID = "microsoft" as const;
export const OUTLOOK_MAIL_SCOPE = "Mail.Read" as const;
export const MICROSOFT_SYNC_SCOPES = [OUTLOOK_MAIL_SCOPE] as const;

export type OutlookParticipant = {
  email: string;
  name: string | null;
};

export type OutlookRecipient = OutlookParticipant & {
  kind: "to" | "cc";
};

export type OutlookIncomingMessage = {
  rfcMessageId: string;
  rootId: string;
  references: string[];
  inReplyTo: string | null;
  subject: string | null;
  from: OutlookParticipant;
  recipients: OutlookRecipient[];
  body: string;
  snippet: string | null;
  sentAt: string;
  receivedAt: string | null;
  outlookMessageId: string | null;
  outlookWebLink: string | null;
  conversationId: string | null;
  providerThreadId: string | null;
};

export type OutlookEmailDirection = "INBOUND" | "OUTBOUND" | "UNKNOWN";

/**
 * Provider-neutral projection consumed by the mailbox core.
 *
 * The sync adapter keeps the provider-shaped row above so callers can retain
 * the Graph identifiers and header-derived threading data. This projection
 * is deliberately pure and does not persist anything or infer CRM matches.
 */
export type NormalizedOutlookMessage = {
  providerMessageId: string;
  providerThreadId: string | null;
  rfcMessageId: string;
  rootMessageId: string;
  references: string[];
  inReplyTo: string | null;
  subject: string | null;
  from: OutlookParticipant;
  recipients: OutlookRecipient[];
  body: string;
  snippet: string | null;
  sentAt: string;
  direction: OutlookEmailDirection;
  outlookUrl: string | null;
};

const CONVERSATION_ROOT_PREFIX = "outlook-conversation:";

const QUOTE_MARKERS: RegExp[] = [
  /^\s*On .+ wrote:\s*$/m,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*_{5,}\s*$/m,
  /^\s*From:\s.+$/m,
  /^\s*Begin forwarded message:\s*$/im,
  /^\s*-{3,}\s*Forwarded message\s*-{3,}\s*$/im,
];

export function parseOutlookMessage(
  message: GraphMessage,
): OutlookIncomingMessage | null {
  const internetMessageId = message.internetMessageId?.trim();
  if (!internetMessageId) return null;

  const from = participantOf(message.from ?? message.sender);
  if (!from) return null;

  const sentAt = sentAtOf(message);
  if (!sentAt) return null;

  const rootId = rootIdOf(message, internetMessageId);
  const headers = message.internetMessageHeaders ?? [];
  const references = headerValue(headers, "references");
  const inReplyTo = headerValue(headers, "in-reply-to");
  const to = addressList(message.toRecipients, "to");
  const cc = addressList(message.ccRecipients, "cc");
  const rawBody = message.body?.content ?? message.bodyPreview ?? "";
  const body =
    message.body?.contentType?.toLowerCase() === "html"
      ? stripHtml(rawBody)
      : rawBody;

  const cleanBody = stripQuotedHistory(body);

  return {
    rfcMessageId: normaliseMessageId(internetMessageId),
    rootId,
    references: messageIds(references),
    inReplyTo: firstMessageId(inReplyTo ?? ""),
    subject: cleanOptionalText(message.subject),
    from,
    recipients: [...to, ...cc],
    body: cleanBody,
    snippet: snippetOf(cleanBody),
    sentAt,
    receivedAt: dateOf(message.receivedDateTime),
    outlookMessageId: cleanOptionalText(message.id),
    outlookWebLink: safeOutlookWebLink(message.webLink),
    conversationId: cleanOptionalText(message.conversationId),
    providerThreadId: cleanOptionalText(message.conversationId),
  };
}

export function normalizeOutlookMessage(
  message: OutlookIncomingMessage,
  options: { mailboxEmail?: string | null } = {},
): NormalizedOutlookMessage {
  const mailboxEmail = options.mailboxEmail?.trim().toLowerCase();
  const direction: OutlookEmailDirection =
    mailboxEmail && isEmailish(mailboxEmail)
      ? message.from.email === mailboxEmail
        ? "OUTBOUND"
        : "INBOUND"
      : "UNKNOWN";

  return {
    providerMessageId: message.outlookMessageId ?? message.rfcMessageId,
    providerThreadId: message.providerThreadId,
    rfcMessageId: message.rfcMessageId,
    rootMessageId: message.rootId,
    references: [...message.references],
    inReplyTo: message.inReplyTo,
    subject: message.subject,
    from: message.from,
    recipients: message.recipients.map((recipient) => ({ ...recipient })),
    body: message.body,
    snippet: message.snippet,
    sentAt: message.sentAt,
    direction,
    outlookUrl: message.outlookWebLink,
  };
}

export const normaliseOutlookMessage = normalizeOutlookMessage;

export function rootIdOf(message: GraphMessage, internetMessageId: string): string {
  const headers = message.internetMessageHeaders ?? [];
  const references = headerValue(headers, "references");
  const inReplyTo = headerValue(headers, "in-reply-to");
  if (references || inReplyTo) {
    const root = rootMessageIdFrom({ references, inReplyTo, messageId: internetMessageId });
    if (root) return root;
  }

  const conversationId = cleanOptionalText(message.conversationId);
  if (conversationId) return `${CONVERSATION_ROOT_PREFIX}${conversationId}`;
  return normaliseMessageId(internetMessageId);
}

export function rootMessageIdFrom(headers: {
  references: string | null;
  inReplyTo: string | null;
  messageId: string | null;
}): string | null {
  if (headers.references) {
    const first = firstMessageId(headers.references);
    if (first) return first;
  }
  if (headers.inReplyTo) {
    const first = firstMessageId(headers.inReplyTo);
    if (first) return first;
  }
  return headers.messageId ? normaliseMessageId(headers.messageId) : null;
}

export function firstMessageId(value: string): string | null {
  const found = value.match(/<[^<>]+>|[^\s<>]+/);
  return found ? normaliseMessageId(found[0]) : null;
}

export function messageIds(value: string | null): string[] {
  if (!value) return [];
  const matches = value.match(/<[^<>]+>|[^\s<>]+/g) ?? [];
  return [...new Set(matches.map(normaliseMessageId).filter(Boolean))];
}

export function normaliseMessageId(value: string): string {
  return value.trim().replace(/^</u, "").replace(/>$/u, "").toLowerCase();
}

export const normalizeMessageId = normaliseMessageId;

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/giu, "")
    .replace(/<script[\s\S]*?<\/script>/giu, "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function stripQuotedHistory(body: string): string {
  let cut = body.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(body);
    if (match && match.index < cut) cut = match.index;
  }

  const lines = body.slice(0, cut).split("\n");
  while (lines.length > 0 && /^\s*>/u.test(lines[lines.length - 1] ?? "")) {
    lines.pop();
  }
  return lines.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function participantOf(entry: GraphAddress | null | undefined): OutlookParticipant | null {
  const address = cleanOptionalText(entry?.emailAddress?.address)?.toLowerCase();
  if (!address || !isEmailish(address)) return null;

  const name = cleanOptionalText(entry?.emailAddress?.name);
  return { email: address, name };
}

function headerValue(headers: readonly GraphHeader[], name: string): string | null {
  const wanted = name.toLowerCase();
  const found = headers.find((entry) => entry.name?.toLowerCase() === wanted);
  return cleanOptionalText(found?.value);
}

function addressList(
  entries: GraphAddress[] | null | undefined,
  kind: "to" | "cc",
): OutlookRecipient[] {
  const seen = new Set<string>();
  const people: OutlookRecipient[] = [];
  for (const entry of entries ?? []) {
    const person = participantOf(entry);
    if (!person || seen.has(person.email)) continue;
    seen.add(person.email);
    people.push({ ...person, kind });
  }
  return people;
}

function sentAtOf(message: GraphMessage): string | null {
  for (const value of [message.sentDateTime, message.receivedDateTime]) {
    const date = dateOf(value);
    if (date) return date;
  }
  return null;
}

function dateOf(value: string | null | undefined): string | null {
  const raw = cleanOptionalText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  return normalized ? normalized : null;
}

function safeOutlookWebLink(value: string | null | undefined): string | null {
  const raw = cleanOptionalText(value);
  if (!raw || raw.length > 4_096) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function snippetOf(body: string, limit = 200): string | null {
  const flat = body.replace(/\s+/gu, " ").trim();
  if (!flat) return null;
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

export type OutlookGraphHeaders = Pick<GraphHeader, "name" | "value">;
