import type { ProviderSyncOutput } from "../contracts/provider-sync.js";
import type { Connection, ConnectionStore } from "../db/connections.js";
import type { ContactStore } from "../db/contacts.js";
import type { MailboxStore } from "../db/mailbox.js";
import type { SlackStore } from "../db/slack.js";
import { GraphClient } from "../lib/microsoft-graph.js";
import { normalizeOutlookMessage } from "../lib/microsoft-outlook.js";
import { OutlookSyncAdapter } from "../lib/microsoft-outlook-sync.js";
import { matchSlackMembers, SlackAdapter } from "../lib/slack-adapter.js";
import {
  extractGmailMessageIds,
  GoogleApiClient,
  normalizeCalendarEvent,
  normalizeGmailMessage,
} from "./google-adapter.js";

const GOOGLE_GMAIL_STREAM = "gmail";
const GOOGLE_CALENDAR_STREAM = "google-calendar";
const MICROSOFT_MAIL_STREAM = "outlook";
const SLACK_INVENTORY_STREAM = "slack-inventory";
const GOOGLE_INITIAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_GOOGLE_PAGES = 5;
const MAX_GOOGLE_MESSAGES = 500;
const SYNC_ACTOR_ID = "local_user";

export interface ProviderCredentials {
  googleAccessToken?: string;
  microsoftAccessToken?: string;
  slackBotToken?: string;
  slackUserToken?: string;
}

export interface ProviderSyncDependencies {
  connections: ConnectionStore;
  contacts: ContactStore;
  mailbox: MailboxStore;
  slackStore: SlackStore;
  now?: () => Date;
  google?: GoogleApiClient;
  graph?: GraphClient;
  slack?: SlackAdapter;
}

function failureMessage(value: { code?: string; message: string }): Error {
  return new Error(value.code ? `${value.code}: ${value.message}` : value.message);
}

function baseResult(provider: Connection["provider"], connection: Connection): ProviderSyncOutput {
  return { provider, connection, emailMessages: 0, calendarEvents: 0, channels: 0, people: 0, matchedPeople: 0 };
}

function recordFailure(deps: ProviderSyncDependencies, connection: Connection, stream: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  deps.connections.recordSyncFailure(connection.id, {
    stream,
    errorCode: "PROVIDER_SYNC_FAILED",
    errorMessage: message,
  });
  throw error;
}

async function googleMessageIds(
  client: GoogleApiClient,
  token: string,
  cursor: string | null,
  now: Date,
  signal?: AbortSignal,
): Promise<{ ids: string[]; cursor: string }> {
  const profile = await client.profile(token, { signal });
  if (!profile.ok) throw failureMessage(profile);
  const ids = new Set<string>();

  if (cursor) {
    let pageToken: string | undefined;
    let nextCursor = profile.value.historyId ?? cursor;
    for (let page = 0; page < MAX_GOOGLE_PAGES; page += 1) {
      const result = await client.listHistory(token, { startHistoryId: cursor, pageToken, signal });
      if (!result.ok) {
        if (result.kind === "cursor-invalid") return googleMessageIds(client, token, null, now, signal);
        throw failureMessage(result);
      }
      extractGmailMessageIds(result.value).forEach((id) => ids.add(id));
      nextCursor = result.value.historyId ?? nextCursor;
      pageToken = result.value.nextPageToken;
      if (!pageToken || ids.size >= MAX_GOOGLE_MESSAGES) break;
    }
    return { ids: [...ids].slice(0, MAX_GOOGLE_MESSAGES), cursor: nextCursor };
  }

  let pageToken: string | undefined;
  for (let page = 0; page < MAX_GOOGLE_PAGES; page += 1) {
    const result = await client.listMessages(token, {
      after: new Date(now.getTime() - GOOGLE_INITIAL_LOOKBACK_MS),
      before: now,
      pageToken,
      signal,
    });
    if (!result.ok) throw failureMessage(result);
    result.value.messages.forEach((message) => ids.add(message.id));
    pageToken = result.value.nextPageToken;
    if (!pageToken || ids.size >= MAX_GOOGLE_MESSAGES) break;
  }
  return { ids: [...ids].slice(0, MAX_GOOGLE_MESSAGES), cursor: profile.value.historyId ?? now.toISOString() };
}

async function syncGoogle(
  deps: ProviderSyncDependencies,
  connection: Connection,
  token: string,
  signal?: AbortSignal,
): Promise<ProviderSyncOutput> {
  const client = deps.google ?? new GoogleApiClient({ now: deps.now });
  const now = deps.now?.() ?? new Date();
  const profile = await client.profile(token, { signal });
  if (!profile.ok) return recordFailure(deps, connection, GOOGLE_GMAIL_STREAM, failureMessage(profile));
  const mailboxEmail = profile.value.emailAddress ?? connection.externalAccountId;
  try {
    const gmailCursor = deps.connections.getSyncCursor(connection.id, GOOGLE_GMAIL_STREAM)?.cursor ?? null;
    const batch = await googleMessageIds(client, token, gmailCursor, now, signal);
    let emailMessages = 0;
    for (const id of batch.ids) {
      const response = await client.getMessage(token, id, { signal });
      if (!response.ok) {
        if (response.kind === "cursor-invalid") continue;
        throw failureMessage(response);
      }
      const message = normalizeGmailMessage(response.value, { mailboxEmail });
      if (!message) continue;
      deps.mailbox.ingestEmail({
        connectionId: connection.id,
        provider: "GOOGLE",
        providerMessageId: message.providerMessageId,
        providerThreadId: message.providerThreadId,
        rfcMessageId: message.rfcMessageId,
        references: message.references,
        inReplyTo: message.inReplyTo,
        direction: message.direction === "UNKNOWN" ? "INBOUND" : message.direction,
        from: message.from,
        recipients: message.recipients.map((recipient) => ({ ...recipient, kind: recipient.kind.toUpperCase() as "TO" | "CC" })),
        subject: message.subject,
        snippet: message.snippet,
        body: message.body,
        sentAt: message.sentAt,
        webLink: message.gmailUrl,
        mailboxName: mailboxEmail ?? null,
        mailboxUrl: null,
        companyId: null,
        contactId: null,
      }, SYNC_ACTOR_ID);
      emailMessages += 1;
    }
    deps.connections.recordSyncSuccess(connection.id, { stream: GOOGLE_GMAIL_STREAM, cursor: batch.cursor });

    const oldCalendarCursor = deps.connections.getSyncCursor(connection.id, GOOGLE_CALENDAR_STREAM)?.cursor ?? null;
    let pageToken: string | undefined;
    let calendarCursor = oldCalendarCursor;
    let calendarEvents = 0;
    for (let page = 0; page < MAX_GOOGLE_PAGES; page += 1) {
      let response = await client.listEvents(token, { syncToken: oldCalendarCursor ?? undefined, pageToken, signal });
      if (!response.ok && response.kind === "cursor-invalid" && oldCalendarCursor) {
        calendarCursor = null;
        pageToken = undefined;
        response = await client.listEvents(token, { signal });
      }
      if (!response.ok) throw failureMessage(response);
      for (const raw of response.value.items) {
        const event = normalizeCalendarEvent(raw);
        if (!event?.startsAt || !event.endsAt) continue;
        deps.mailbox.ingestCalendarEvent({
          connectionId: connection.id,
          provider: "GOOGLE",
          providerEventId: event.providerEventId,
          iCalUid: event.iCalUID,
          originalStartTime: event.originalStartAt ?? event.startsAt,
          recurringEventId: event.recurringEventId,
          title: event.title,
          description: event.description,
          location: event.location,
          conferenceUrl: event.conferenceUrl,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          isAllDay: event.allDay,
          status: event.status,
          organizerEmail: event.organizer?.email ?? null,
          companyId: null,
          contactId: null,
          attendees: event.attendees.map((attendee) => ({
            email: attendee.email,
            name: attendee.name,
            responseStatus: attendee.responseStatus,
            isOrganizer: attendee.organizer,
            contactId: null,
          })),
        }, SYNC_ACTOR_ID);
        calendarEvents += 1;
      }
      calendarCursor = response.value.nextSyncToken ?? calendarCursor;
      pageToken = response.value.nextPageToken;
      if (!pageToken) break;
    }
    deps.connections.recordSyncSuccess(connection.id, { stream: GOOGLE_CALENDAR_STREAM, cursor: calendarCursor });
    const next = deps.connections.upsert({
      id: connection.id,
      provider: "GOOGLE",
      externalAccountId: mailboxEmail ?? connection.externalAccountId,
      displayName: connection.displayName ?? mailboxEmail ?? "Google Workspace",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/calendar.readonly"],
      status: "CONNECTED",
    });
    return { ...baseResult("GOOGLE", next), emailMessages, calendarEvents };
  } catch (error) {
    return recordFailure(deps, connection, GOOGLE_GMAIL_STREAM, error);
  }
}

async function syncMicrosoft(
  deps: ProviderSyncDependencies,
  connection: Connection,
  token: string,
  signal?: AbortSignal,
): Promise<ProviderSyncOutput> {
  const cursor = deps.connections.getSyncCursor(connection.id, MICROSOFT_MAIL_STREAM)?.cursor ?? null;
  const adapter = new OutlookSyncAdapter(deps.graph ?? new GraphClient());
  try {
    const result = await adapter.sync({ accessToken: token, cursor, signal });
    if (result.status !== "synced") throw new Error(result.reason);
    let emailMessages = 0;
    for (const raw of result.messages) {
      const message = normalizeOutlookMessage(raw, { mailboxEmail: result.mailbox });
      deps.mailbox.ingestEmail({
        connectionId: connection.id,
        provider: "MICROSOFT",
        providerMessageId: message.providerMessageId,
        providerThreadId: message.providerThreadId,
        rfcMessageId: message.rfcMessageId,
        references: message.references,
        inReplyTo: message.inReplyTo,
        direction: message.direction === "UNKNOWN" ? "INBOUND" : message.direction,
        from: message.from,
        recipients: message.recipients.map((recipient) => ({ ...recipient, kind: recipient.kind.toUpperCase() as "TO" | "CC" })),
        subject: message.subject,
        snippet: message.snippet,
        body: message.body,
        sentAt: message.sentAt,
        webLink: message.outlookUrl,
        mailboxName: result.mailbox,
        mailboxUrl: null,
        companyId: null,
        contactId: null,
      }, SYNC_ACTOR_ID);
      emailMessages += 1;
    }
    deps.connections.recordSyncSuccess(connection.id, { stream: MICROSOFT_MAIL_STREAM, cursor: result.cursor });
    const next = deps.connections.upsert({
      id: connection.id,
      provider: "MICROSOFT",
      externalAccountId: result.mailbox,
      displayName: connection.displayName ?? result.mailbox,
      scopes: ["Mail.Read"],
      status: "CONNECTED",
    });
    return { ...baseResult("MICROSOFT", next), emailMessages };
  } catch (error) {
    return recordFailure(deps, connection, MICROSOFT_MAIL_STREAM, error);
  }
}

async function syncSlack(
  deps: ProviderSyncDependencies,
  connection: Connection,
  credentials: ProviderCredentials,
  signal?: AbortSignal,
): Promise<ProviderSyncOutput> {
  const adapter = deps.slack ?? new SlackAdapter({ botToken: credentials.slackBotToken, userToken: credentials.slackUserToken });
  try {
    const [channels, people] = await Promise.all([adapter.listVisibleChannels(signal), adapter.listMembers(signal)]);
    const crmPeople = deps.contacts.list({ limit: 1_000 }).flatMap((contact) => contact.email ? [{
      id: contact.id,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
      email: contact.email,
    }] : []);
    const matches = matchSlackMembers(crmPeople, people);
    deps.slackStore.replaceInventory(connection.id, channels, matches);
    const matchedPeople = matches.filter((row) => row.match !== null).length;
    const checkedAt = (deps.now?.() ?? new Date()).toISOString();
    deps.connections.recordSyncSuccess(connection.id, { stream: SLACK_INVENTORY_STREAM, cursor: checkedAt });
    const next = deps.connections.upsert({
      id: connection.id,
      provider: "SLACK",
      configuration: { channelCount: channels.length, peopleCount: people.length, matchedPeopleCount: matchedPeople, lastInventoryAt: checkedAt },
      scopes: connection.scopes,
      status: "CONNECTED",
    });
    return { ...baseResult("SLACK", next), channels: channels.length, people: people.length, matchedPeople };
  } catch (error) {
    return recordFailure(deps, connection, SLACK_INVENTORY_STREAM, error);
  }
}

export async function syncProviderConnection(
  deps: ProviderSyncDependencies,
  connectionId: string,
  credentials: ProviderCredentials,
  signal?: AbortSignal,
): Promise<ProviderSyncOutput> {
  const connection = deps.connections.getRequired(connectionId);
  if (!connection.enabled) throw new Error("Cannot sync a disabled connection.");
  if (connection.provider === "GOOGLE") {
    if (!credentials.googleAccessToken?.trim()) throw new Error("Google access token is not configured in BB secret settings.");
    return syncGoogle(deps, connection, credentials.googleAccessToken, signal);
  }
  if (connection.provider === "MICROSOFT") {
    if (!credentials.microsoftAccessToken?.trim()) throw new Error("Microsoft access token is not configured in BB secret settings.");
    return syncMicrosoft(deps, connection, credentials.microsoftAccessToken, signal);
  }
  if (!credentials.slackBotToken?.trim()) throw new Error("Slack bot token is not configured in BB secret settings.");
  return syncSlack(deps, connection, credentials, signal);
}
