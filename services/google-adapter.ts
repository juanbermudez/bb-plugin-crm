/**
 * Credential-in/credential-out Google mailbox and calendar adapter.
 *
 * This module deliberately does not own OAuth, token storage, CRM persistence,
 * or background scheduling. The host/core layer supplies an access token for
 * each call and decides how normalized records are matched and stored.
 */

export const GOOGLE_GMAIL_BASE_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me" as const;
export const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events" as const;

export const GOOGLE_SYNC_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

export const WORK_MAIL_QUERY =
  "-in:chats -category:promotions -category:social -category:forums" as const;

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const HARD_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ACCESS_TOKEN_LENGTH = 8_192;
const MAX_HISTORY_RECORDS = 500;
const MAX_MESSAGES_PER_HISTORY_RECORD = 1_000;
const MAX_PAGE_ITEMS = 2_500;
const MAX_PARTS = 2_000;
const MAX_MIME_DEPTH = 32;
const MAX_MESSAGE_BODY_CHARS = 200_000;
const MAX_HEADER_VALUE_LENGTH = 8_192;
const MAX_TEXT_LENGTH = 100_000;
const MAX_ID_LENGTH = 512;
const MAX_CALENDAR_ATTENDEES = 500;
const CALENDAR_HORIZON_MS = 180 * 24 * 60 * 60 * 1_000;
const RATE_LIMIT_MIN_MS = 30_000;
const RATE_LIMIT_MAX_MS = 15 * 60_000;

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue>;

export type GoogleFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type GoogleFailureKind =
  | "cursor-invalid"
  | "unauthorized"
  | "rate-limited"
  | "failed";

export interface GoogleApiFailure {
  ok: false;
  kind: GoogleFailureKind;
  code: string;
  message: string;
  status: number | null;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface GoogleApiSuccess<T> {
  ok: true;
  value: T;
}

export type GoogleApiResult<T> = GoogleApiSuccess<T> | GoogleApiFailure;

export interface GoogleAdapterOptions {
  /** Injected in tests; production uses the host's global fetch. */
  fetch?: GoogleFetch;
  timeoutMs?: number;
  /** This can lower the cap, but never raise the hard response limit. */
  maxResponseBytes?: number;
  now?: () => Date;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  historyId?: string;
  payload?: GmailPart;
}

export interface GmailProfile {
  emailAddress?: string;
  historyId?: string;
}

export interface GmailMessageListItem {
  id: string;
  threadId?: string;
}

export interface GmailMessageList {
  messages: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailHistoryMessage {
  id: string;
  threadId?: string;
}

export interface GmailHistoryRecord {
  id?: string;
  messagesAdded: GmailHistoryMessage[];
}

export interface GmailHistoryPage {
  history: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId?: string;
}

export interface GmailHistoryOptions extends RequestOptions {
  startHistoryId: string;
  pageToken?: string;
  maxResults?: number;
}

export interface GmailListMessagesOptions extends RequestOptions {
  after: Date;
  before: Date;
  pageToken?: string;
  maxResults?: number;
}

export interface GoogleEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleEventPerson {
  email?: string;
  displayName?: string;
  self?: boolean;
}

export interface GoogleEventAttendee extends GoogleEventPerson {
  responseStatus?: string;
  organizer?: boolean;
  resource?: boolean;
}

export interface GoogleEvent {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  htmlLink?: string;
  recurringEventId?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  originalStartTime?: GoogleEventTime;
  organizer?: GoogleEventPerson;
  creator?: GoogleEventPerson;
  attendees?: GoogleEventAttendee[];
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
}

export interface GoogleCalendarPage {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GoogleCalendarListOptions extends RequestOptions {
  syncToken?: string;
  timeMin?: string | Date;
  timeMax?: string | Date;
  pageToken?: string;
  maxResults?: number;
}

export interface Participant {
  email: string;
  name: string | null;
}

export interface GmailRecipient extends Participant {
  kind: "to" | "cc";
}

export type EmailDirection = "INBOUND" | "OUTBOUND" | "UNKNOWN";

export interface NormalizedGmailMessage {
  providerMessageId: string;
  providerThreadId: string | null;
  rfcMessageId: string;
  rootMessageId: string;
  references: string[];
  inReplyTo: string | null;
  subject: string | null;
  from: Participant;
  recipients: GmailRecipient[];
  body: string;
  snippet: string | null;
  sentAt: string;
  direction: EmailDirection;
  gmailUrl: string;
}

export type CalendarEventStatus =
  | "CONFIRMED"
  | "TENTATIVE"
  | "CANCELLED"
  | "UNKNOWN";

export interface CalendarParticipant extends Participant {
  responseStatus: string | null;
  organizer: boolean;
  self: boolean;
  resource: boolean;
}

export interface NormalizedCalendarEvent {
  providerEventId: string;
  iCalUID: string;
  recurringEventId: string | null;
  originalStartAt: string | null;
  originalStartAllDay: boolean | null;
  title: string | null;
  description: string | null;
  location: string | null;
  conferenceUrl: string | null;
  googleUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  status: CalendarEventStatus;
  organizer: CalendarParticipant | null;
  attendees: CalendarParticipant[];
}

interface ReadBodyResult {
  text?: string;
  tooLarge?: boolean;
}

function failure(
  kind: GoogleFailureKind,
  code: string,
  message: string,
  options: Partial<Pick<GoogleApiFailure, "status" | "retryable" | "retryAfterMs">> = {},
): GoogleApiFailure {
  return {
    ok: false,
    kind,
    code,
    message,
    status: options.status ?? null,
    retryable: options.retryable ?? false,
    ...(options.retryAfterMs === undefined
      ? {}
      : { retryAfterMs: options.retryAfterMs }),
  };
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.length <= max ? value : value.slice(0, max);
}

function requiredId(value: unknown): string | null {
  const id = boundedString(value, MAX_ID_LENGTH)?.trim();
  return id ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normaliseQueryString(value: string | undefined): string | undefined {
  if (!value || value.length > MAX_TEXT_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    return undefined;
  }
  return value;
}

function withQuery(base: string, query: Query): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function clampInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value as number)));
}

function parseJson(text: string): unknown | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function redactProviderText(value: string, secret?: string): string {
  const withoutSecret =
    secret && secret.length >= 3 ? value.split(secret).join("[redacted]") : value;
  return withoutSecret
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /(access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function providerErrorDetails(value: unknown): {
  message: string | null;
  reason: string | null;
} {
  if (!isRecord(value)) return { message: null, reason: null };
  const error = isRecord(value.error) ? value.error : value;
  const message =
    boundedString(error.message, 300) ?? boundedString(value.message, 300) ?? null;
  const errors = Array.isArray(error.errors) ? error.errors : [];
  const first = isRecord(errors[0]) ? errors[0] : null;
  const reason =
    boundedString(first?.reason, 128) ?? boundedString(error.reason, 128) ?? null;
  return {
    message: message ? redactProviderText(message) : null,
    reason: reason?.toLowerCase() ?? null,
  };
}

function retryAfterMs(value: string | null, now: Date): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(
      RATE_LIMIT_MAX_MS,
      Math.max(RATE_LIMIT_MIN_MS, Math.round(seconds * 1_000)),
    );
  }

  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.min(
    RATE_LIMIT_MAX_MS,
    Math.max(RATE_LIMIT_MIN_MS, at - now.getTime()),
  );
}

async function readBody(response: Response, maxBytes: number): Promise<ReadBodyResult> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { tooLarge: true };
  }

  if (!response.body) {
    const text = await response.text();
    return text.length > maxBytes ? { tooLarge: true } : { text };
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
        return { tooLarge: true };
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return { text: chunks.join("") };
  } finally {
    reader.releaseLock();
  }
}

function parseHeader(value: unknown): GmailHeader | null {
  if (!isRecord(value)) return null;
  const name = boundedString(value.name, 128)?.trim();
  const headerValue = boundedString(value.value, MAX_HEADER_VALUE_LENGTH)?.trim();
  if (!name || headerValue === undefined) return null;
  return { name, value: headerValue };
}

function parseHeaders(value: unknown): GmailHeader[] {
  if (!Array.isArray(value)) return [];
  const headers: GmailHeader[] = [];
  for (const entry of value.slice(0, 500)) {
    const parsed = parseHeader(entry);
    if (parsed) headers.push(parsed);
  }
  return headers;
}

function parseGmailPart(value: unknown, depth = 0): GmailPart | null {
  if (!isRecord(value) || depth > MAX_MIME_DEPTH) return null;

  const bodyValue = isRecord(value.body) ? value.body : null;
  const data = boundedString(bodyValue?.data, DEFAULT_MAX_RESPONSE_BYTES);
  const size = asFiniteNumber(bodyValue?.size);
  const attachmentId = boundedString(bodyValue?.attachmentId, MAX_ID_LENGTH);
  const body =
    data !== undefined || size !== undefined || attachmentId !== undefined
      ? {
          ...(data === undefined ? {} : { data }),
          ...(size === undefined ? {} : { size }),
          ...(attachmentId === undefined ? {} : { attachmentId }),
        }
      : undefined;

  const rawParts = Array.isArray(value.parts) ? value.parts : [];
  const parts: GmailPart[] = [];
  for (const child of rawParts.slice(0, MAX_PARTS)) {
    const parsed = parseGmailPart(child, depth + 1);
    if (parsed) parts.push(parsed);
  }

  return {
    ...(boundedString(value.mimeType, 128) === undefined
      ? {}
      : { mimeType: boundedString(value.mimeType, 128) }),
    ...(boundedString(value.filename, MAX_TEXT_LENGTH) === undefined
      ? {}
      : { filename: boundedString(value.filename, MAX_TEXT_LENGTH) }),
    headers: parseHeaders(value.headers),
    ...(body === undefined ? {} : { body }),
    parts,
  };
}

function parseGmailProfile(value: unknown): GmailProfile | null {
  if (!isRecord(value)) return null;
  return {
    ...(boundedString(value.emailAddress, 320) === undefined
      ? {}
      : { emailAddress: boundedString(value.emailAddress, 320) }),
    ...(boundedString(value.historyId, MAX_ID_LENGTH) === undefined
      ? {}
      : { historyId: boundedString(value.historyId, MAX_ID_LENGTH) }),
  };
}

function parseGmailMessageResponse(value: unknown): GmailMessage | null {
  if (!isRecord(value)) return null;
  let payload: GmailPart | undefined;
  if (value.payload !== undefined) {
    const parsedPayload = parseGmailPart(value.payload);
    if (parsedPayload === null) return null;
    payload = parsedPayload;
  }

  const labels = Array.isArray(value.labelIds)
    ? value.labelIds
        .slice(0, 100)
        .map((label) => boundedString(label, 128))
        .filter((label): label is string => label !== undefined)
    : [];

  const internalDate =
    typeof value.internalDate === "number" && Number.isFinite(value.internalDate)
      ? String(value.internalDate)
      : boundedString(value.internalDate, 32);

  return {
    ...(requiredId(value.id) === null ? {} : { id: requiredId(value.id) as string }),
    ...(requiredId(value.threadId) === null
      ? {}
      : { threadId: requiredId(value.threadId) as string }),
    labelIds: labels,
    ...(boundedString(value.snippet, 2_000) === undefined
      ? {}
      : { snippet: boundedString(value.snippet, 2_000) }),
    ...(internalDate === undefined ? {} : { internalDate }),
    ...(boundedString(value.historyId, MAX_ID_LENGTH) === undefined
      ? {}
      : { historyId: boundedString(value.historyId, MAX_ID_LENGTH) }),
    ...(payload === undefined ? {} : { payload }),
  };
}

function parseGmailMessageList(value: unknown): GmailMessageList | null {
  if (!isRecord(value)) return null;
  const messages: GmailMessageListItem[] = [];
  if (Array.isArray(value.messages)) {
    for (const item of value.messages.slice(0, MAX_PAGE_ITEMS)) {
      if (!isRecord(item)) continue;
      const id = requiredId(item.id);
      if (!id) continue;
      const threadId = requiredId(item.threadId);
      messages.push({ ...(threadId ? { threadId } : {}), id });
    }
  }

  const resultSizeEstimate = asFiniteNumber(value.resultSizeEstimate);
  return {
    messages,
    ...(boundedString(value.nextPageToken, MAX_ID_LENGTH) === undefined
      ? {}
      : { nextPageToken: boundedString(value.nextPageToken, MAX_ID_LENGTH) }),
    ...(resultSizeEstimate === undefined ? {} : { resultSizeEstimate }),
  };
}

function parseGmailHistory(value: unknown): GmailHistoryPage | null {
  if (!isRecord(value)) return null;
  const history: GmailHistoryRecord[] = [];
  if (Array.isArray(value.history)) {
    for (const rawRecord of value.history.slice(0, MAX_HISTORY_RECORDS)) {
      if (!isRecord(rawRecord)) continue;
      const messagesAdded: GmailHistoryMessage[] = [];
      if (Array.isArray(rawRecord.messagesAdded)) {
        for (const rawMessage of rawRecord.messagesAdded.slice(
          0,
          MAX_MESSAGES_PER_HISTORY_RECORD,
        )) {
          if (!isRecord(rawMessage) || !isRecord(rawMessage.message)) continue;
          const id = requiredId(rawMessage.message.id);
          if (!id) continue;
          const threadId = requiredId(rawMessage.message.threadId);
          messagesAdded.push({ ...(threadId ? { threadId } : {}), id });
        }
      }
      const id = requiredId(rawRecord.id);
      history.push({ ...(id ? { id } : {}), messagesAdded });
    }
  }

  return {
    history,
    ...(boundedString(value.nextPageToken, MAX_ID_LENGTH) === undefined
      ? {}
      : { nextPageToken: boundedString(value.nextPageToken, MAX_ID_LENGTH) }),
    ...(boundedString(value.historyId, MAX_ID_LENGTH) === undefined
      ? {}
      : { historyId: boundedString(value.historyId, MAX_ID_LENGTH) }),
  };
}

function parseEventTime(value: unknown): GoogleEventTime | undefined {
  if (!isRecord(value)) return undefined;
  const dateTime = boundedString(value.dateTime, 128);
  const date = boundedString(value.date, 32);
  const timeZone = boundedString(value.timeZone, 128);
  if (dateTime === undefined && date === undefined) return undefined;
  return {
    ...(dateTime === undefined ? {} : { dateTime }),
    ...(date === undefined ? {} : { date }),
    ...(timeZone === undefined ? {} : { timeZone }),
  };
}

function parseEventPerson(value: unknown): GoogleEventPerson | undefined {
  if (!isRecord(value)) return undefined;
  const email = boundedString(value.email, 320);
  const displayName = boundedString(value.displayName, 512);
  if (email === undefined && displayName === undefined) return undefined;
  return {
    ...(email === undefined ? {} : { email }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(value.self === true ? { self: true } : {}),
  };
}

function parseEventAttendee(value: unknown): GoogleEventAttendee | undefined {
  if (!isRecord(value)) return undefined;
  const person = parseEventPerson(value);
  if (!person) return undefined;
  const responseStatus = boundedString(value.responseStatus, 64);
  return {
    ...person,
    ...(responseStatus === undefined ? {} : { responseStatus }),
    ...(value.organizer === true ? { organizer: true } : {}),
    ...(value.resource === true ? { resource: true } : {}),
  };
}

function parseGoogleEvent(value: unknown): GoogleEvent | null {
  if (!isRecord(value)) return null;
  const id = requiredId(value.id);
  if (!id) return null;

  const attendees: GoogleEventAttendee[] = [];
  if (Array.isArray(value.attendees)) {
    for (const rawAttendee of value.attendees.slice(0, MAX_CALENDAR_ATTENDEES)) {
      const attendee = parseEventAttendee(rawAttendee);
      if (attendee) attendees.push(attendee);
    }
  }

  let conferenceData: GoogleEvent["conferenceData"];
  if (isRecord(value.conferenceData) && Array.isArray(value.conferenceData.entryPoints)) {
    const entryPoints = value.conferenceData.entryPoints
      .slice(0, 50)
      .filter(isRecord)
      .map((entry) => ({
        ...(boundedString(entry.entryPointType, 64) === undefined
          ? {}
          : { entryPointType: boundedString(entry.entryPointType, 64) }),
        ...(boundedString(entry.uri, 2_048) === undefined
          ? {}
          : { uri: boundedString(entry.uri, 2_048) }),
      }));
    conferenceData = { entryPoints };
  }

  return {
    id,
    ...(requiredId(value.iCalUID) === null
      ? {}
      : { iCalUID: requiredId(value.iCalUID) as string }),
    ...(boundedString(value.status, 32) === undefined
      ? {}
      : { status: boundedString(value.status, 32) }),
    ...(boundedString(value.summary, MAX_TEXT_LENGTH) === undefined
      ? {}
      : { summary: boundedString(value.summary, MAX_TEXT_LENGTH) }),
    ...(boundedString(value.description, MAX_TEXT_LENGTH) === undefined
      ? {}
      : { description: boundedString(value.description, MAX_TEXT_LENGTH) }),
    ...(boundedString(value.location, 2_048) === undefined
      ? {}
      : { location: boundedString(value.location, 2_048) }),
    ...(boundedString(value.hangoutLink, 2_048) === undefined
      ? {}
      : { hangoutLink: boundedString(value.hangoutLink, 2_048) }),
    ...(boundedString(value.htmlLink, 2_048) === undefined
      ? {}
      : { htmlLink: boundedString(value.htmlLink, 2_048) }),
    ...(requiredId(value.recurringEventId) === null
      ? {}
      : { recurringEventId: requiredId(value.recurringEventId) as string }),
    ...(parseEventTime(value.start) === undefined
      ? {}
      : { start: parseEventTime(value.start) }),
    ...(parseEventTime(value.end) === undefined
      ? {}
      : { end: parseEventTime(value.end) }),
    ...(parseEventTime(value.originalStartTime) === undefined
      ? {}
      : { originalStartTime: parseEventTime(value.originalStartTime) }),
    ...(parseEventPerson(value.organizer) === undefined
      ? {}
      : { organizer: parseEventPerson(value.organizer) }),
    ...(parseEventPerson(value.creator) === undefined
      ? {}
      : { creator: parseEventPerson(value.creator) }),
    attendees,
    ...(conferenceData === undefined ? {} : { conferenceData }),
  };
}

function parseCalendarPage(value: unknown): GoogleCalendarPage | null {
  if (!isRecord(value)) return null;
  const items: GoogleEvent[] = [];
  if (Array.isArray(value.items)) {
    for (const rawEvent of value.items.slice(0, MAX_PAGE_ITEMS)) {
      const event = parseGoogleEvent(rawEvent);
      if (event) items.push(event);
    }
  }
  return {
    items,
    ...(boundedString(value.nextPageToken, MAX_ID_LENGTH) === undefined
      ? {}
      : { nextPageToken: boundedString(value.nextPageToken, MAX_ID_LENGTH) }),
    ...(boundedString(value.nextSyncToken, MAX_ID_LENGTH) === undefined
      ? {}
      : { nextSyncToken: boundedString(value.nextSyncToken, MAX_ID_LENGTH) }),
  };
}

function normaliseDateQuery(value: string | Date | undefined): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  const normalised = normaliseQueryString(value);
  if (!normalised || Number.isNaN(Date.parse(normalised))) return undefined;
  return normalised;
}

function validAccessToken(value: string): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (
    token.length === 0 ||
    token.length > MAX_ACCESS_TOKEN_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(token)
  ) {
    return null;
  }
  return token;
}

function decodeBase64Url(data: string): string {
  if (
    data.length > DEFAULT_MAX_RESPONSE_BYTES ||
    !/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)
  ) {
    return "";
  }
  const normalised = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    "=",
  );
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const QUOTE_MARKERS: RegExp[] = [
  /^\s*On .+ wrote:\s*$/m,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*_{5,}\s*$/m,
  /^\s*From:\s.+$/m,
  /^\s*Begin forwarded message:\s*$/im,
  /^\s*-{3,}\s*Forwarded message\s*-{3,}\s*$/im,
];

export function stripQuotedHistory(body: string): string {
  let cut = body.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(body);
    if (match && match.index < cut) cut = match.index;
  }

  const lines = body.slice(0, cut).split("\n");
  while (lines.length > 0 && /^\s*>/.test(lines[lines.length - 1] ?? "")) {
    lines.pop();
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isAttachment(part: GmailPart): boolean {
  if (part.filename) return true;
  return (
    header(part.headers, "content-disposition")?.toLowerCase().startsWith("attachment") ??
    false
  );
}

function findMimePart(part: GmailPart, mimeType: string): GmailPart | null {
  if (
    part.mimeType?.toLowerCase() === mimeType &&
    !part.filename &&
    part.body?.data
  ) {
    return part;
  }

  for (const child of part.parts ?? []) {
    if (isAttachment(child)) continue;
    const found = findMimePart(child, mimeType);
    if (found) return found;
  }
  return null;
}

export function header(headers: readonly GmailHeader[] | undefined, name: string): string | null {
  const wanted = name.toLowerCase();
  const found = headers?.find((entry) => entry.name.toLowerCase() === wanted);
  const value = found?.value.trim();
  return value ? value.slice(0, MAX_HEADER_VALUE_LENGTH) : null;
}

export function plainTextBody(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const plain = findMimePart(payload, "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = findMimePart(payload, "text/html");
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  if (payload.body?.data && !payload.filename) return decodeBase64Url(payload.body.data);
  return "";
}

export function firstMessageId(value: string): string | null {
  const found = value.match(/<[^<>]+>|[^\s<>]+/);
  return found ? normalizeMessageId(found[0]) : null;
}

export function messageIds(value: string | null): string[] {
  if (!value) return [];
  const matches = value.match(/<[^<>]+>|[^\s<>]+/g) ?? [];
  return [...new Set(matches.map(normalizeMessageId).filter(Boolean))];
}

export function normalizeMessageId(value: string): string {
  return value.trim().replace(/^</, "").replace(/>$/, "").toLowerCase();
}

/** British spelling retained as an import-friendly alias for the upstream adapter. */
export const normaliseMessageId = normalizeMessageId;

export function rootMessageId(headers: readonly GmailHeader[] | undefined): string | null {
  const references = header(headers, "references");
  if (references) {
    const first = firstMessageId(references);
    if (first) return first;
  }
  const inReplyTo = header(headers, "in-reply-to");
  if (inReplyTo) {
    const first = firstMessageId(inReplyTo);
    if (first) return first;
  }
  const messageId = header(headers, "message-id");
  return messageId ? normalizeMessageId(messageId) : null;
}

function snippetOf(body: string, limit = 200): string | null {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseAddress(input: string): Participant | null {
  const trimmed = input.slice(0, MAX_HEADER_VALUE_LENGTH).trim();
  if (!trimmed) return null;
  const angled = trimmed.match(/^(.*)<([^<>]+)>\s*$/);
  const rawEmail = (angled?.[2] ?? trimmed).trim().toLowerCase();
  if (!isEmailish(rawEmail)) return null;
  const rawName = angled?.[1]?.trim() ?? "";
  const name = rawName.replace(/^"(.*)"$/, "$1").trim();
  return { email: rawEmail, name: name || null };
}

export function parseAddressList(value: string | null | undefined): Participant[] {
  if (!value) return [];
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngles = false;
  for (const char of value) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === "<") inAngles = true;
    if (char === ">") inAngles = false;
    if (char === "," && !inQuotes && !inAngles) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  const seen = new Set<string>();
  const participants: Participant[] = [];
  for (const part of parts) {
    const parsed = parseAddress(part);
    if (!parsed || seen.has(parsed.email)) continue;
    seen.add(parsed.email);
    participants.push(parsed);
  }
  return participants;
}

function participantFromPerson(person: GoogleEventPerson | undefined): Participant | null {
  const email = boundedString(person?.email, 320)?.trim().toLowerCase();
  if (!email || !isEmailish(email)) return null;
  const name = boundedString(person?.displayName, 512)?.trim() || null;
  return { email, name };
}

function safeHttpsUrl(value: string | undefined): string | null {
  const candidate = boundedString(value, 2_048);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function truncateText(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function sentAtForMessage(message: GmailMessage, headers: readonly GmailHeader[] | undefined): Date | null {
  if (message.internalDate) {
    const timestamp = Number(message.internalDate);
    if (Number.isFinite(timestamp)) {
      const at = new Date(timestamp);
      if (!Number.isNaN(at.getTime())) return at;
    }
  }
  const raw = header(headers, "date");
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

function mergeRecipients(
  to: readonly Participant[],
  cc: readonly Participant[],
): GmailRecipient[] {
  const seen = new Set<string>();
  const recipients: GmailRecipient[] = [];
  for (const [kind, entries] of [
    ["to", to],
    ["cc", cc],
  ] as const) {
    for (const entry of entries) {
      if (seen.has(entry.email)) continue;
      seen.add(entry.email);
      recipients.push({ ...entry, kind });
    }
  }
  return recipients;
}

export function normalizeGmailMessage(
  message: GmailMessage,
  options: { mailboxEmail?: string | null } = {},
): NormalizedGmailMessage | null {
  const providerMessageId = requiredId(message.id);
  const headers = message.payload?.headers;
  const rawMessageId = header(headers, "message-id");
  const from = parseAddress(header(headers, "from") ?? "");
  const sentAt = sentAtForMessage(message, headers);
  if (!providerMessageId || !rawMessageId || !from || !sentAt) return null;

  const body = truncateText(
    stripQuotedHistory(plainTextBody(message.payload)),
    MAX_MESSAGE_BODY_CHARS,
  );
  const snippet = snippetOf(body) ?? snippetOf(message.snippet ?? "");
  const mailboxEmail = options.mailboxEmail?.trim().toLowerCase();
  const direction: EmailDirection =
    mailboxEmail && isEmailish(mailboxEmail)
      ? from.email === mailboxEmail
        ? "OUTBOUND"
        : "INBOUND"
      : "UNKNOWN";
  const references = messageIds(header(headers, "references"));
  const inReplyTo = firstMessageId(header(headers, "in-reply-to") ?? "");

  return {
    providerMessageId,
    providerThreadId: requiredId(message.threadId),
    rfcMessageId: normalizeMessageId(rawMessageId),
    rootMessageId: rootMessageId(headers) ?? normalizeMessageId(rawMessageId),
    references,
    inReplyTo,
    subject: header(headers, "subject"),
    from,
    recipients: mergeRecipients(
      parseAddressList(header(headers, "to")),
      parseAddressList(header(headers, "cc")),
    ),
    body,
    snippet,
    sentAt: sentAt.toISOString(),
    direction,
    gmailUrl: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(providerMessageId)}`,
  };
}

/** Alias matching the Outlook adapter's provider-parser naming. */
export const parseGmailMessage = normalizeGmailMessage;

export function extractGmailMessageIds(page: GmailHistoryPage): string[] {
  const ids = new Set<string>();
  for (const record of page.history) {
    for (const message of record.messagesAdded) ids.add(message.id);
  }
  return [...ids];
}

export function conferenceUrl(event: GoogleEvent): string | null {
  const hangout = safeHttpsUrl(event.hangoutLink);
  if (hangout) return hangout;
  const entry = event.conferenceData?.entryPoints?.find(
    (point) => point.entryPointType === "video" && point.uri,
  );
  return safeHttpsUrl(entry?.uri);
}

export function eventTime(
  time: GoogleEventTime | undefined,
): { at: Date; isAllDay: boolean } | null {
  if (time?.dateTime) {
    const at = new Date(time.dateTime);
    return Number.isNaN(at.getTime()) ? null : { at, isAllDay: false };
  }
  if (time?.date && /^\d{4}-\d{2}-\d{2}$/.test(time.date)) {
    const at = new Date(`${time.date}T00:00:00.000Z`);
    if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== time.date) {
      return null;
    }
    return { at, isAllDay: true };
  }
  return null;
}

function calendarParticipant(
  person: GoogleEventPerson | GoogleEventAttendee | undefined,
  defaults: Partial<Pick<CalendarParticipant, "organizer" | "self" | "resource">> = {},
): CalendarParticipant | null {
  const participant = participantFromPerson(person);
  if (!participant) return null;
  const attendee = person as GoogleEventAttendee | undefined;
  const responseStatus =
    typeof attendee?.responseStatus === "string"
      ? attendee.responseStatus.toLowerCase()
      : null;
  return {
    ...participant,
    responseStatus,
    organizer: attendee?.organizer === true || defaults.organizer === true,
    self: person?.self === true || defaults.self === true,
    resource: attendee?.resource === true || defaults.resource === true,
  };
}

export function normalizeCalendarEvent(event: GoogleEvent): NormalizedCalendarEvent | null {
  const providerEventId = requiredId(event.id);
  const iCalUID = requiredId(event.iCalUID);
  if (!providerEventId || !iCalUID) return null;

  const rawStatus = event.status?.trim().toUpperCase();
  const status: CalendarEventStatus =
    rawStatus === "CONFIRMED" || rawStatus === "TENTATIVE" || rawStatus === "CANCELLED"
      ? rawStatus
      : "UNKNOWN";
  const start = eventTime(event.start);
  const end = eventTime(event.end);
  if (status !== "CANCELLED" && (!start || !end || end.at < start.at)) return null;

  const originalStart = eventTime(event.originalStartTime);
  const organizer = calendarParticipant(event.organizer, { organizer: true });
  const attendees: CalendarParticipant[] = [];
  const seen = new Set<string>();
  for (const attendee of event.attendees ?? []) {
    const parsed = calendarParticipant(attendee);
    if (!parsed || seen.has(parsed.email)) continue;
    seen.add(parsed.email);
    attendees.push(parsed);
  }

  return {
    providerEventId,
    iCalUID,
    recurringEventId: requiredId(event.recurringEventId),
    originalStartAt: originalStart?.at.toISOString() ?? null,
    originalStartAllDay: originalStart?.isAllDay ?? null,
    title: boundedString(event.summary, MAX_TEXT_LENGTH)?.trim() || null,
    description: boundedString(event.description, MAX_TEXT_LENGTH)?.trim() || null,
    location: boundedString(event.location, 2_048)?.trim() || null,
    conferenceUrl: conferenceUrl(event),
    googleUrl: safeHttpsUrl(event.htmlLink),
    startsAt: start?.at.toISOString() ?? null,
    endsAt: end?.at.toISOString() ?? null,
    allDay: start?.isAllDay ?? false,
    status,
    organizer,
    attendees,
  };
}

export class GoogleApiClient {
  private readonly fetchImpl: GoogleFetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly now: () => Date;

  constructor(options: GoogleAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(options.timeoutMs as number)))
      : DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = Number.isFinite(options.maxResponseBytes)
      ? Math.min(
          HARD_MAX_RESPONSE_BYTES,
          Math.max(1_024, Math.floor(options.maxResponseBytes as number)),
        )
      : DEFAULT_MAX_RESPONSE_BYTES;
    this.now = options.now ?? (() => new Date());
  }

  private async get<T>(
    url: string,
    accessToken: string,
    query: Query,
    parse: (value: unknown) => T | null,
    options: RequestOptions = {},
  ): Promise<GoogleApiResult<T>> {
    const token = validAccessToken(accessToken);
    if (!token) {
      return failure("failed", "INVALID_ACCESS_TOKEN", "A Google access token is required.");
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort("timeout");
    }, this.timeoutMs);
    const onAbort = () => controller.abort(options.signal?.reason);

    if (options.signal?.aborted) {
      clearTimeout(timeout);
      return failure("failed", "ABORTED", "The Google API request was cancelled.");
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await this.fetchImpl(withQuery(url, query), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      const body = await readBody(response, this.maxResponseBytes);
      if (body.tooLarge) {
        return failure(
          "failed",
          "RESPONSE_TOO_LARGE",
          "Google returned a response larger than the configured safety limit.",
          { status: response.status, retryable: false },
        );
      }

      const parsedBody = parseJson(body.text ?? "");
      if (!response.ok) {
        const details = providerErrorDetails(parsedBody);
        const status = response.status;
        const retry = retryAfterMs(response.headers.get("retry-after"), this.now());
        if (status === 401) {
          return failure("unauthorized", "UNAUTHORIZED", "Google authorization is no longer valid.", {
            status,
            retryable: false,
          });
        }
        if (status === 404 || status === 410) {
          return failure("cursor-invalid", "CURSOR_INVALID", "Google no longer accepts this sync cursor.", {
            status,
            retryable: false,
          });
        }
        const isQuota =
          status === 429 ||
          (status === 403 &&
            (details.reason?.includes("quota") === true ||
              details.reason?.includes("ratelimit") === true ||
              details.reason?.includes("rate_limit") === true ||
              details.reason?.includes("dailylimit") === true));
        if (isQuota) {
          return failure("rate-limited", "RATE_LIMITED", "Google temporarily rate-limited this request.", {
            status,
            retryable: true,
            retryAfterMs: retry ?? 60_000,
          });
        }

        return failure(
          "failed",
          status >= 500 ? "UPSTREAM_UNAVAILABLE" : "GOOGLE_API_ERROR",
          details.message
            ? redactProviderText(details.message, token)
            : "Google rejected the request.",
          { status, retryable: status >= 500, ...(retry === undefined ? {} : { retryAfterMs: retry }) },
        );
      }

      const value = parse(parsedBody);
      if (value === null) {
        return failure("failed", "INVALID_RESPONSE", "Google returned an unexpected response.", {
          status: response.status,
          retryable: false,
        });
      }
      return { ok: true, value };
    } catch (error) {
      if (timedOut) {
        return failure("failed", "TIMEOUT", "The Google API request timed out.", {
          retryable: true,
        });
      }
      if (options.signal?.aborted) {
        return failure("failed", "ABORTED", "The Google API request was cancelled.");
      }
      const message =
        error instanceof Error
          ? redactProviderText(error.message, token)
          : "Network request failed.";
      return failure("failed", "NETWORK_ERROR", message || "Network request failed.", {
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  async profile(
    accessToken: string,
    options: RequestOptions = {},
  ): Promise<GoogleApiResult<GmailProfile>> {
    return this.get(
      `${GOOGLE_GMAIL_BASE_URL}/profile`,
      accessToken,
      {},
      parseGmailProfile,
      options,
    );
  }

  async listMessages(
    accessToken: string,
    options: GmailListMessagesOptions,
  ): Promise<GoogleApiResult<GmailMessageList>> {
    const after = Math.floor(options.after.getTime() / 1_000);
    const before = Math.ceil(options.before.getTime() / 1_000);
    if (!Number.isFinite(after) || !Number.isFinite(before) || after >= before) {
      return failure("failed", "INVALID_TIME_RANGE", "Gmail message bounds are invalid.");
    }
    return this.get(
      `${GOOGLE_GMAIL_BASE_URL}/messages`,
      accessToken,
      {
        q: `${WORK_MAIL_QUERY} after:${after} before:${before}`,
        maxResults: clampInteger(options.maxResults, 100, 100),
        pageToken: normaliseQueryString(options.pageToken),
      },
      parseGmailMessageList,
      options,
    );
  }

  async listHistory(
    accessToken: string,
    options: GmailHistoryOptions,
  ): Promise<GoogleApiResult<GmailHistoryPage>> {
    const startHistoryId = normaliseQueryString(options.startHistoryId);
    if (!startHistoryId) {
      return failure("failed", "INVALID_HISTORY_ID", "A Gmail history cursor is required.");
    }
    return this.get(
      `${GOOGLE_GMAIL_BASE_URL}/history`,
      accessToken,
      {
        startHistoryId,
        historyTypes: "messageAdded",
        maxResults: clampInteger(options.maxResults, 500, 500),
        pageToken: normaliseQueryString(options.pageToken),
      },
      parseGmailHistory,
      options,
    );
  }

  async getMessage(
    accessToken: string,
    id: string,
    options: RequestOptions = {},
  ): Promise<GoogleApiResult<GmailMessage>> {
    const messageId = requiredId(id);
    if (!messageId) return failure("failed", "INVALID_MESSAGE_ID", "A Gmail message id is required.");
    return this.get(
      `${GOOGLE_GMAIL_BASE_URL}/messages/${encodeURIComponent(messageId)}`,
      accessToken,
      { format: "full" },
      parseGmailMessageResponse,
      options,
    );
  }

  async listEvents(
    accessToken: string,
    options: GoogleCalendarListOptions = {},
  ): Promise<GoogleApiResult<GoogleCalendarPage>> {
    const syncToken = normaliseQueryString(options.syncToken);
    const pageToken = normaliseQueryString(options.pageToken);
    const query: Query = {
      singleEvents: true,
      showDeleted: true,
      maxResults: clampInteger(options.maxResults, 250, MAX_PAGE_ITEMS),
      syncToken,
      pageToken,
    };

    if (!syncToken) {
      const now = this.now();
      if (Number.isNaN(now.getTime())) {
        return failure("failed", "INVALID_TIME_RANGE", "Calendar time bounds are invalid.");
      }
      const requestedTimeMin = normaliseDateQuery(options.timeMin);
      const requestedTimeMax = normaliseDateQuery(options.timeMax);
      if (
        (options.timeMin !== undefined && !requestedTimeMin) ||
        (options.timeMax !== undefined && !requestedTimeMax)
      ) {
        return failure("failed", "INVALID_TIME_RANGE", "Calendar time bounds are invalid.");
      }
      const timeMin = requestedTimeMin ?? now.toISOString();
      const timeMax =
        requestedTimeMax ?? new Date(now.getTime() + CALENDAR_HORIZON_MS).toISOString();
      if (!timeMin || !timeMax) {
        return failure("failed", "INVALID_TIME_RANGE", "Calendar time bounds are invalid.");
      }
      query.timeMin = timeMin;
      query.timeMax = timeMax;
    }

    return this.get(
      GOOGLE_CALENDAR_EVENTS_URL,
      accessToken,
      query,
      parseCalendarPage,
      options,
    );
  }
}

/** Naming alias for callers that treat this client as the provider adapter. */
export { GoogleApiClient as GoogleAdapter };
