import { z } from "zod";

import { connectionProviderSchema, connectionTimestampSchema } from "./connections.js";
import { idSchema } from "./core.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const optionalNullableText = (max: number) => nullableText(max).optional();
const email = z.email().max(320).transform((value) => value.toLowerCase());

export const emailDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export type EmailDirection = z.infer<typeof emailDirectionSchema>;

export const emailRecipientKindSchema = z.enum(["TO", "CC", "BCC"]);
export type EmailRecipientKind = z.infer<typeof emailRecipientKindSchema>;

export const emailRecipientSchema = z
  .object({
    email,
    name: optionalNullableText(256),
    kind: emailRecipientKindSchema,
  })
  .strict()
  .transform((value) => ({ ...value, name: value.name ?? null }));
export type EmailRecipient = z.infer<typeof emailRecipientSchema>;

export const mailboxAddressSchema = z
  .object({ email, name: optionalNullableText(256) })
  .strict()
  .transform((value) => ({ ...value, name: value.name ?? null }));
export type MailboxAddress = z.infer<typeof mailboxAddressSchema>;

export const emailMessageIngestSchema = z
  .object({
    connectionId: idSchema,
    provider: connectionProviderSchema.refine(
      (value) => value === "GOOGLE" || value === "MICROSOFT",
      "Email sync requires Google or Microsoft.",
    ),
    providerMessageId: text(512),
    providerThreadId: optionalNullableText(512),
    rfcMessageId: optionalNullableText(998),
    references: z.array(text(998)).max(256).default([]),
    inReplyTo: optionalNullableText(998),
    direction: emailDirectionSchema,
    from: mailboxAddressSchema,
    recipients: z.array(emailRecipientSchema).max(1_000),
    subject: optionalNullableText(998),
    snippet: optionalNullableText(8_192),
    body: optionalNullableText(2_000_000),
    sentAt: connectionTimestampSchema,
    webLink: optionalNullableText(4_096),
    mailboxName: optionalNullableText(256),
    mailboxUrl: optionalNullableText(4_096),
    companyId: idSchema.nullable().optional(),
    contactId: idSchema.nullable().optional(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    providerThreadId: value.providerThreadId ?? null,
    rfcMessageId: value.rfcMessageId ?? null,
    inReplyTo: value.inReplyTo ?? null,
    subject: value.subject ?? null,
    snippet: value.snippet ?? null,
    body: value.body ?? null,
    webLink: value.webLink ?? null,
    mailboxName: value.mailboxName ?? null,
    mailboxUrl: value.mailboxUrl ?? null,
    companyId: value.companyId ?? null,
    contactId: value.contactId ?? null,
  }));
export type EmailMessageIngest = z.infer<typeof emailMessageIngestSchema>;

export const emailMessageSchema = z
  .object({
    id: idSchema,
    direction: emailDirectionSchema,
    fromEmail: email,
    fromName: nullableText(256),
    recipients: z.array(emailRecipientSchema),
    subject: nullableText(998),
    body: nullableText(2_000_000),
    snippet: nullableText(8_192),
    sentAt: connectionTimestampSchema,
    provider: connectionProviderSchema,
    providerMessageId: text(512),
    webLink: nullableText(4_096),
    mailboxName: nullableText(256),
    mailboxUrl: nullableText(4_096),
  })
  .strict();
export type EmailMessage = z.infer<typeof emailMessageSchema>;

const companyRefSchema = z.object({ id: idSchema, name: text(512) }).strict();
const contactRefSchema = z
  .object({ id: idSchema, firstName: text(256), lastName: nullableText(256) })
  .strict();

export const emailThreadSchema = z
  .object({
    id: idSchema,
    subject: nullableText(998),
    messageCount: z.number().int().finite().min(0),
    firstMessageAt: connectionTimestampSchema,
    lastMessageAt: connectionTimestampSchema,
    company: companyRefSchema.nullable(),
    contact: contactRefSchema.nullable(),
    messages: z.array(emailMessageSchema).max(10_000),
  })
  .strict();
export type EmailThread = z.infer<typeof emailThreadSchema>;

export const calendarAttendeeSchema = z
  .object({
    id: idSchema,
    email,
    name: nullableText(256),
    responseStatus: nullableText(128),
    isOrganizer: z.boolean(),
    contactId: idSchema.nullable(),
    imageUrl: nullableText(4_096),
  })
  .strict();
export type CalendarAttendee = z.infer<typeof calendarAttendeeSchema>;

export const calendarAttendeeIngestSchema = z
  .object({
    email,
    name: optionalNullableText(256),
    responseStatus: optionalNullableText(128),
    isOrganizer: z.boolean().default(false),
    contactId: idSchema.nullable().optional(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    name: value.name ?? null,
    responseStatus: value.responseStatus ?? null,
    contactId: value.contactId ?? null,
  }));
export type CalendarAttendeeIngest = z.infer<typeof calendarAttendeeIngestSchema>;

export const calendarEventIngestSchema = z
  .object({
    connectionId: idSchema,
    provider: connectionProviderSchema.refine(
      (value) => value === "GOOGLE" || value === "MICROSOFT",
      "Calendar sync requires Google or Microsoft.",
    ),
    providerEventId: text(512),
    iCalUid: text(998),
    originalStartTime: connectionTimestampSchema,
    recurringEventId: optionalNullableText(512),
    title: optionalNullableText(998),
    description: optionalNullableText(2_000_000),
    location: optionalNullableText(2_048),
    conferenceUrl: optionalNullableText(4_096),
    startsAt: connectionTimestampSchema,
    endsAt: connectionTimestampSchema,
    isAllDay: z.boolean().default(false),
    status: text(128),
    organizerEmail: z.email().max(320).nullable().optional(),
    companyId: idSchema.nullable().optional(),
    contactId: idSchema.nullable().optional(),
    attendees: z.array(calendarAttendeeIngestSchema).max(5_000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Date.parse(value.endsAt) < Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Calendar end must not precede its start.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    recurringEventId: value.recurringEventId ?? null,
    title: value.title ?? null,
    description: value.description ?? null,
    location: value.location ?? null,
    conferenceUrl: value.conferenceUrl ?? null,
    organizerEmail: value.organizerEmail?.toLowerCase() ?? null,
    companyId: value.companyId ?? null,
    contactId: value.contactId ?? null,
  }));
export type CalendarEventIngest = z.infer<typeof calendarEventIngestSchema>;

export const calendarEventSchema = z
  .object({
    id: idSchema,
    title: nullableText(998),
    description: nullableText(2_000_000),
    location: nullableText(2_048),
    conferenceUrl: nullableText(4_096),
    startsAt: connectionTimestampSchema,
    endsAt: connectionTimestampSchema,
    isAllDay: z.boolean(),
    status: text(128),
    organizerEmail: z.email().max(320).nullable(),
    company: companyRefSchema.nullable(),
    contact: contactRefSchema.nullable(),
    attendees: z.array(calendarAttendeeSchema).max(5_000),
  })
  .strict();
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const mailboxRecordInputSchema = z.object({ id: idSchema }).strict();

export const mailboxPurgeInputSchema = z
  .object({ connectionId: idSchema })
  .strict();

export const mailboxPurgeOutputSchema = z
  .object({ purged: z.number().int().finite().min(0) })
  .strict();
