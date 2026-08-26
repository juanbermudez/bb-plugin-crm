import {
  calendarAttendeeSchema,
  calendarEventIngestSchema,
  calendarEventSchema,
  emailMessageIngestSchema,
  emailRecipientSchema,
  emailThreadSchema,
  type CalendarEvent,
  type CalendarEventIngest,
  type EmailMessageIngest,
  type EmailRecipient,
  type EmailThread,
} from "../contracts/mailbox.js";
import { newRecordId, normalizeEmail, nowIso, requiredText, type Db } from "./types.js";

type RecordLink = { contactId: string | null; companyId: string | null };

function nullable(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next === "" ? null : next;
}

function booleanValue(value: unknown): boolean {
  return value === 1 || value === true;
}

function normalizedMessageId(value: string | null | undefined): string | null {
  const next = nullable(value)?.toLowerCase();
  return next ?? null;
}

function threadRoot(input: EmailMessageIngest): string {
  const reference = input.references
    .map(normalizedMessageId)
    .find((value): value is string => value !== null);
  return reference
    ?? normalizedMessageId(input.inReplyTo)
    ?? normalizedMessageId(input.rfcMessageId)
    ?? `${input.provider.toLowerCase()}:${input.providerThreadId ?? input.providerMessageId}`;
}

function parseRecipients(value: unknown): EmailRecipient[] {
  if (typeof value !== "string") throw new Error("Email recipients are missing.");
  return emailRecipientSchema.array().parse(JSON.parse(value) as unknown);
}

function assertConnection(db: Db, id: string, provider: "GOOGLE" | "MICROSOFT"): void {
  const row = db.prepare(
    "SELECT provider, enabled FROM connections WHERE id = ?",
  ).get(id) as { provider?: string; enabled?: number } | undefined;
  if (!row) throw new Error(`No connection with id ${id}.`);
  if (row.provider !== provider) throw new Error(`Connection ${id} is not ${provider}.`);
  if (row.enabled !== 1) throw new Error(`Connection ${id} is disabled.`);
}

function recordLink(
  db: Db,
  contactId: string | null,
  companyId: string | null,
  emails: readonly string[],
): RecordLink {
  if (contactId !== null) {
    const contact = db.prepare(
      "SELECT id, company_id AS companyId FROM contacts WHERE id = ? AND archived_at IS NULL",
    ).get(contactId) as { id?: string; companyId?: string | null } | undefined;
    if (!contact) throw new Error(`No active contact with id ${contactId}.`);
    return { contactId, companyId: companyId ?? contact.companyId ?? null };
  }

  const seen = new Set<string>();
  for (const candidate of emails) {
    const email = normalizeEmail(candidate);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const contact = db.prepare(
      `SELECT id, company_id AS companyId
       FROM contacts
       WHERE email = ? COLLATE NOCASE AND archived_at IS NULL
       ORDER BY created_at, id
       LIMIT 1`,
    ).get(email) as { id?: string; companyId?: string | null } | undefined;
    if (contact?.id) {
      return { contactId: contact.id, companyId: companyId ?? contact.companyId ?? null };
    }
  }

  if (companyId !== null) {
    const company = db.prepare(
      "SELECT id FROM companies WHERE id = ? AND archived_at IS NULL",
    ).get(companyId) as { id?: string } | undefined;
    if (!company) throw new Error(`No active company with id ${companyId}.`);
  }
  return { contactId: null, companyId };
}

function stampRecord(db: Db, link: RecordLink, at: string): void {
  const update = (table: "companies" | "contacts", id: string): void => {
    db.prepare(
      `UPDATE ${table}
       SET last_activity_at = CASE
         WHEN last_activity_at IS NULL OR last_activity_at < @at THEN @at
         ELSE last_activity_at
       END
       WHERE id = @id`,
    ).run({ id, at });
  };
  if (link.companyId) update("companies", link.companyId);
  if (link.contactId) update("contacts", link.contactId);
}

export class MailboxStore {
  constructor(private readonly db: Db) {}

  ingestEmail(raw: EmailMessageIngest, actorId: string): EmailThread {
    const input = emailMessageIngestSchema.parse(raw);
    const createdById = requiredText(actorId, "Mailbox activity author");
    assertConnection(this.db, input.connectionId, input.provider);

    const threadId = this.db.transaction(() => {
      const existing = this.db.prepare(
        `SELECT thread_id AS threadId
         FROM email_messages
         WHERE (provider = @provider AND provider_message_id = @providerMessageId)
            OR (@rfcMessageId IS NOT NULL AND rfc_message_id = @rfcMessageId COLLATE NOCASE)
         ORDER BY CASE WHEN provider = @provider AND provider_message_id = @providerMessageId THEN 0 ELSE 1 END
         LIMIT 1`,
      ).get({
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        rfcMessageId: normalizedMessageId(input.rfcMessageId),
      }) as { threadId?: string } | undefined;
      if (existing?.threadId) return existing.threadId;

      const emails = [input.from.email, ...input.recipients.map((recipient) => recipient.email)];
      const link = recordLink(this.db, input.contactId, input.companyId, emails);
      const rootMessageId = threadRoot(input);
      let thread = this.db.prepare(
        "SELECT id FROM email_threads WHERE root_message_id = ? COLLATE NOCASE",
      ).get(rootMessageId) as { id?: string } | undefined;
      if (!thread?.id) {
        const id = newRecordId("email_thread");
        this.db.prepare(
          `INSERT INTO email_threads (
             id, root_message_id, subject, company_id, contact_id,
             first_message_at, last_message_at, message_count, created_at, updated_at
           ) VALUES (
             @id, @rootMessageId, @subject, @companyId, @contactId,
             @sentAt, @sentAt, 0, @createdAt, @createdAt
           )`,
        ).run({
          id,
          rootMessageId,
          subject: input.subject,
          companyId: link.companyId,
          contactId: link.contactId,
          sentAt: input.sentAt,
          createdAt: nowIso(),
        });
        thread = { id };
      } else {
        this.db.prepare(
          `UPDATE email_threads
           SET subject = COALESCE(subject, @subject),
               company_id = COALESCE(company_id, @companyId),
               contact_id = COALESCE(contact_id, @contactId),
               updated_at = @updatedAt
           WHERE id = @id`,
        ).run({
          id: thread.id,
          subject: input.subject,
          companyId: link.companyId,
          contactId: link.contactId,
          updatedAt: nowIso(),
        });
      }

      const messageId = newRecordId("email_message");
      this.db.prepare(
        `INSERT INTO email_messages (
           id, thread_id, connection_id, provider, provider_message_id,
           provider_thread_id, rfc_message_id, direction, from_email, from_name,
           recipients, subject, snippet, body, sent_at, web_link, mailbox_name,
           mailbox_url, created_at
         ) VALUES (
           @id, @threadId, @connectionId, @provider, @providerMessageId,
           @providerThreadId, @rfcMessageId, @direction, @fromEmail, @fromName,
           @recipients, @subject, @snippet, @body, @sentAt, @webLink, @mailboxName,
           @mailboxUrl, @createdAt
         )`,
      ).run({
        id: messageId,
        threadId: thread.id,
        connectionId: input.connectionId,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        providerThreadId: input.providerThreadId,
        rfcMessageId: normalizedMessageId(input.rfcMessageId),
        direction: input.direction,
        fromEmail: input.from.email,
        fromName: input.from.name,
        recipients: JSON.stringify(input.recipients),
        subject: input.subject,
        snippet: input.snippet,
        body: input.body,
        sentAt: input.sentAt,
        webLink: input.webLink,
        mailboxName: input.mailboxName,
        mailboxUrl: input.mailboxUrl,
        createdAt: nowIso(),
      });

      this.db.prepare(
        `UPDATE email_threads
         SET first_message_at = (SELECT MIN(sent_at) FROM email_messages WHERE thread_id = @threadId),
             last_message_at = (SELECT MAX(sent_at) FROM email_messages WHERE thread_id = @threadId),
             message_count = (SELECT COUNT(*) FROM email_messages WHERE thread_id = @threadId),
             subject = COALESCE(subject, @subject),
             updated_at = @updatedAt
         WHERE id = @threadId`,
      ).run({ threadId: thread.id, subject: input.subject, updatedAt: nowIso() });

      const activity = this.db.prepare(
        "SELECT id FROM activities WHERE email_thread_id = ?",
      ).get(thread.id) as { id?: string } | undefined;
      const activityMeta = JSON.stringify({
        provider: input.provider,
        direction: input.direction,
        mailboxName: input.mailboxName,
        mailboxUrl: input.mailboxUrl,
      });
      if (activity?.id) {
        this.db.prepare(
          `UPDATE activities
           SET subject = COALESCE(subject, @subject), body = @body,
               occurred_at = @occurredAt, company_id = COALESCE(company_id, @companyId),
               contact_id = COALESCE(contact_id, @contactId), meta = @meta,
               updated_at = @updatedAt
           WHERE id = @id`,
        ).run({
          id: activity.id,
          subject: input.subject,
          body: input.snippet ?? input.body,
          occurredAt: input.sentAt,
          companyId: link.companyId,
          contactId: link.contactId,
          meta: activityMeta,
          updatedAt: nowIso(),
        });
      } else {
        const timestamp = nowIso();
        this.db.prepare(
          `INSERT INTO activities (
             id, type, subject, body, occurred_at, company_id, contact_id,
             created_by_id, meta, email_thread_id, created_at, updated_at
           ) VALUES (
             @id, 'EMAIL', @subject, @body, @occurredAt, @companyId, @contactId,
             @createdById, @meta, @threadId, @createdAt, @createdAt
           )`,
        ).run({
          id: newRecordId("act"),
          subject: input.subject,
          body: input.snippet ?? input.body,
          occurredAt: input.sentAt,
          companyId: link.companyId,
          contactId: link.contactId,
          createdById,
          meta: activityMeta,
          threadId: thread.id,
          createdAt: timestamp,
        });
      }
      stampRecord(this.db, link, input.sentAt);
      if (!thread.id) throw new Error("Email thread creation failed.");
      return thread.id;
    })();

    return this.getEmailThread(threadId);
  }

  getEmailThread(id: string): EmailThread {
    const row = this.db.prepare(
      `SELECT
         t.id, t.subject, t.message_count AS messageCount,
         t.first_message_at AS firstMessageAt, t.last_message_at AS lastMessageAt,
         c.id AS companyId, c.name AS companyName,
         p.id AS contactId, p.first_name AS contactFirstName,
         p.last_name AS contactLastName
       FROM email_threads AS t
       LEFT JOIN companies AS c ON c.id = t.company_id
       LEFT JOIN contacts AS p ON p.id = t.contact_id
       WHERE t.id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`No email thread with id ${id}.`);
    const messages = this.db.prepare(
      `SELECT
         id, direction, from_email AS fromEmail, from_name AS fromName,
         recipients, subject, body, snippet, sent_at AS sentAt, provider,
         provider_message_id AS providerMessageId, web_link AS webLink,
         mailbox_name AS mailboxName, mailbox_url AS mailboxUrl
       FROM email_messages
       WHERE thread_id = ?
       ORDER BY sent_at, id`,
    ).all(id) as Array<Record<string, unknown>>;

    return emailThreadSchema.parse({
      id: row.id,
      subject: nullable(row.subject),
      messageCount: Number(row.messageCount),
      firstMessageAt: row.firstMessageAt,
      lastMessageAt: row.lastMessageAt,
      company: row.companyId
        ? { id: row.companyId, name: row.companyName }
        : null,
      contact: row.contactId
        ? {
            id: row.contactId,
            firstName: row.contactFirstName,
            lastName: nullable(row.contactLastName),
          }
        : null,
      messages: messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        fromEmail: message.fromEmail,
        fromName: nullable(message.fromName),
        recipients: parseRecipients(message.recipients),
        subject: nullable(message.subject),
        body: nullable(message.body),
        snippet: nullable(message.snippet),
        sentAt: message.sentAt,
        provider: message.provider,
        providerMessageId: message.providerMessageId,
        webLink: nullable(message.webLink),
        mailboxName: nullable(message.mailboxName),
        mailboxUrl: nullable(message.mailboxUrl),
      })),
    });
  }

  ingestCalendarEvent(raw: CalendarEventIngest, actorId: string): CalendarEvent {
    const input = calendarEventIngestSchema.parse(raw);
    const createdById = requiredText(actorId, "Calendar activity author");
    assertConnection(this.db, input.connectionId, input.provider);

    const eventId = this.db.transaction(() => {
      const emails = [
        ...(input.organizerEmail ? [input.organizerEmail] : []),
        ...input.attendees.map((attendee) => attendee.email),
      ];
      const link = recordLink(this.db, input.contactId, input.companyId, emails);
      const existing = this.db.prepare(
        `SELECT id FROM calendar_events
         WHERE (provider = @provider AND provider_event_id = @providerEventId)
            OR (ical_uid = @iCalUid AND original_start_time = @originalStartTime)
         ORDER BY CASE WHEN provider = @provider AND provider_event_id = @providerEventId THEN 0 ELSE 1 END
         LIMIT 1`,
      ).get({
        provider: input.provider,
        providerEventId: input.providerEventId,
        iCalUid: input.iCalUid,
        originalStartTime: input.originalStartTime,
      }) as { id?: string } | undefined;
      const id = existing?.id ?? newRecordId("calendar_event");
      const timestamp = nowIso();
      this.db.prepare(
        `INSERT INTO calendar_events (
           id, connection_id, provider, provider_event_id, ical_uid,
           original_start_time, recurring_event_id, title, description, location,
           conference_url, starts_at, ends_at, is_all_day, status,
           organizer_email, company_id, contact_id, created_at, updated_at
         ) VALUES (
           @id, @connectionId, @provider, @providerEventId, @iCalUid,
           @originalStartTime, @recurringEventId, @title, @description, @location,
           @conferenceUrl, @startsAt, @endsAt, @isAllDay, @status,
           @organizerEmail, @companyId, @contactId, @createdAt, @updatedAt
         ) ON CONFLICT(id) DO UPDATE SET
           connection_id = excluded.connection_id,
           provider = excluded.provider,
           provider_event_id = excluded.provider_event_id,
           recurring_event_id = excluded.recurring_event_id,
           title = excluded.title,
           description = excluded.description,
           location = excluded.location,
           conference_url = excluded.conference_url,
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           is_all_day = excluded.is_all_day,
           status = excluded.status,
           organizer_email = excluded.organizer_email,
           company_id = COALESCE(excluded.company_id, calendar_events.company_id),
           contact_id = COALESCE(excluded.contact_id, calendar_events.contact_id),
           updated_at = excluded.updated_at`,
      ).run({
        id,
        connectionId: input.connectionId,
        provider: input.provider,
        providerEventId: input.providerEventId,
        iCalUid: input.iCalUid,
        originalStartTime: input.originalStartTime,
        recurringEventId: input.recurringEventId,
        title: input.title,
        description: input.description,
        location: input.location,
        conferenceUrl: input.conferenceUrl,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isAllDay: input.isAllDay ? 1 : 0,
        status: input.status,
        organizerEmail: input.organizerEmail,
        companyId: link.companyId,
        contactId: link.contactId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      this.db.prepare("DELETE FROM calendar_attendees WHERE event_id = ?").run(id);
      const attendeeInsert = this.db.prepare(
        `INSERT INTO calendar_attendees (
           id, event_id, email, name, response_status, is_organizer, contact_id
         ) VALUES (
           @id, @eventId, @email, @name, @responseStatus, @isOrganizer, @contactId
         )`,
      );
      for (const attendee of input.attendees) {
        const attendeeLink = recordLink(
          this.db,
          attendee.contactId,
          null,
          [attendee.email],
        );
        attendeeInsert.run({
          id: newRecordId("calendar_attendee"),
          eventId: id,
          email: attendee.email,
          name: attendee.name,
          responseStatus: attendee.responseStatus,
          isOrganizer: attendee.isOrganizer ? 1 : 0,
          contactId: attendeeLink.contactId,
        });
      }

      const activity = this.db.prepare(
        "SELECT id FROM activities WHERE calendar_event_id = ?",
      ).get(id) as { id?: string } | undefined;
      const activityMeta = JSON.stringify({
        provider: input.provider,
        location: input.location,
        conferenceUrl: input.conferenceUrl,
        attendeeCount: input.attendees.length,
        status: input.status,
      });
      if (activity?.id) {
        this.db.prepare(
          `UPDATE activities
           SET subject = @subject, body = @body, occurred_at = @occurredAt,
               company_id = COALESCE(@companyId, company_id),
               contact_id = COALESCE(@contactId, contact_id),
               meta = @meta, updated_at = @updatedAt
           WHERE id = @id`,
        ).run({
          id: activity.id,
          subject: input.title,
          body: input.description,
          occurredAt: input.startsAt,
          companyId: link.companyId,
          contactId: link.contactId,
          meta: activityMeta,
          updatedAt: timestamp,
        });
      } else {
        this.db.prepare(
          `INSERT INTO activities (
             id, type, subject, body, occurred_at, company_id, contact_id,
             created_by_id, meta, calendar_event_id, created_at, updated_at
           ) VALUES (
             @id, 'MEETING', @subject, @body, @occurredAt, @companyId, @contactId,
             @createdById, @meta, @eventId, @createdAt, @createdAt
           )`,
        ).run({
          id: newRecordId("act"),
          subject: input.title,
          body: input.description,
          occurredAt: input.startsAt,
          companyId: link.companyId,
          contactId: link.contactId,
          createdById,
          meta: activityMeta,
          eventId: id,
          createdAt: timestamp,
        });
      }
      stampRecord(this.db, link, input.startsAt);
      return id;
    })();

    return this.getCalendarEvent(eventId);
  }

  getCalendarEvent(id: string): CalendarEvent {
    const row = this.db.prepare(
      `SELECT
         e.id, e.title, e.description, e.location, e.conference_url AS conferenceUrl,
         e.starts_at AS startsAt, e.ends_at AS endsAt, e.is_all_day AS isAllDay,
         e.status, e.organizer_email AS organizerEmail,
         c.id AS companyId, c.name AS companyName,
         p.id AS contactId, p.first_name AS contactFirstName,
         p.last_name AS contactLastName
       FROM calendar_events AS e
       LEFT JOIN companies AS c ON c.id = e.company_id
       LEFT JOIN contacts AS p ON p.id = e.contact_id
       WHERE e.id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`No calendar event with id ${id}.`);
    const attendees = this.db.prepare(
      `SELECT
         a.id, a.email, a.name, a.response_status AS responseStatus,
         a.is_organizer AS isOrganizer, a.contact_id AS contactId,
         c.image_url AS imageUrl
       FROM calendar_attendees AS a
       LEFT JOIN contacts AS c ON c.id = a.contact_id
       WHERE a.event_id = ?
       ORDER BY a.is_organizer DESC, a.name COLLATE NOCASE, a.email COLLATE NOCASE`,
    ).all(id) as Array<Record<string, unknown>>;
    return calendarEventSchema.parse({
      id: row.id,
      title: nullable(row.title),
      description: nullable(row.description),
      location: nullable(row.location),
      conferenceUrl: nullable(row.conferenceUrl),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      isAllDay: booleanValue(row.isAllDay),
      status: row.status,
      organizerEmail: nullable(row.organizerEmail),
      company: row.companyId
        ? { id: row.companyId, name: row.companyName }
        : null,
      contact: row.contactId
        ? {
            id: row.contactId,
            firstName: row.contactFirstName,
            lastName: nullable(row.contactLastName),
          }
        : null,
      attendees: attendees.map((attendee) =>
        calendarAttendeeSchema.parse({
          id: attendee.id,
          email: attendee.email,
          name: nullable(attendee.name),
          responseStatus: nullable(attendee.responseStatus),
          isOrganizer: booleanValue(attendee.isOrganizer),
          contactId: nullable(attendee.contactId),
          imageUrl: nullable(attendee.imageUrl),
        }),
      ),
    });
  }

  purgeConnection(connectionId: string): { purged: number } {
    const id = requiredText(connectionId, "Connection id");
    return this.db.transaction(() => {
      const threadRows = this.db.prepare(
        "SELECT DISTINCT thread_id AS id FROM email_messages WHERE connection_id = ?",
      ).all(id) as Array<{ id: string }>;
      const eventRows = this.db.prepare(
        "SELECT id FROM calendar_events WHERE connection_id = ?",
      ).all(id) as Array<{ id: string }>;
      let purged = Number(
        (this.db.prepare("SELECT COUNT(*) AS count FROM email_messages WHERE connection_id = ?").get(id) as { count: number }).count,
      ) + eventRows.length;
      for (const event of eventRows) {
        this.db.prepare("DELETE FROM activities WHERE calendar_event_id = ?").run(event.id);
      }
      this.db.prepare("DELETE FROM calendar_events WHERE connection_id = ?").run(id);
      this.db.prepare("DELETE FROM email_messages WHERE connection_id = ?").run(id);
      for (const thread of threadRows) {
        const count = Number(
          (this.db.prepare("SELECT COUNT(*) AS count FROM email_messages WHERE thread_id = ?").get(thread.id) as { count: number }).count,
        );
        if (count === 0) {
          this.db.prepare("DELETE FROM activities WHERE email_thread_id = ?").run(thread.id);
          this.db.prepare("DELETE FROM email_threads WHERE id = ?").run(thread.id);
          continue;
        }
        this.db.prepare(
          `UPDATE email_threads
           SET first_message_at = (SELECT MIN(sent_at) FROM email_messages WHERE thread_id = @id),
               last_message_at = (SELECT MAX(sent_at) FROM email_messages WHERE thread_id = @id),
               message_count = @count,
               updated_at = @updatedAt
           WHERE id = @id`,
        ).run({ id: thread.id, count, updatedAt: nowIso() });
      }
      if (!Number.isSafeInteger(purged) || purged < 0) purged = 0;
      return { purged };
    })();
  }
}

export function createMailboxStore(db: Db): MailboxStore {
  return new MailboxStore(db);
}
