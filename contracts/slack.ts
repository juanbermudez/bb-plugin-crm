import { z } from "zod";

import { idSchema } from "./core.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const slackChannelSchema = z.object({
  id: idSchema,
  slackChannelId: text(128),
  name: text(256),
  isPrivate: z.boolean(),
  isMember: z.boolean(),
  memberCount: z.number().int().finite().min(0).nullable(),
}).strict();
export type SlackChannelRecord = z.infer<typeof slackChannelSchema>;

export const slackMemberMatchSchema = z.object({
  id: idSchema,
  contactId: idSchema,
  contactName: text(512),
  contactEmail: z.email().max(320),
  slackUserId: nullableText(128),
  slackHandle: nullableText(256),
  slackEmail: z.email().max(320).nullable(),
  matched: z.boolean(),
}).strict();
export type SlackMemberMatchRecord = z.infer<typeof slackMemberMatchSchema>;

export const slackConnectionInputSchema = z.object({ connectionId: idSchema }).strict();
export const slackJoinInputSchema = z.object({ connectionId: idSchema, channelId: idSchema }).strict();
export const slackCreateChannelInputSchema = z.object({
  connectionId: idSchema,
  name: z.string().trim().min(1).max(80).regex(/^[a-z0-9-_]+$/u),
  isPrivate: z.boolean().default(false),
}).strict();
export const slackJoinOutputSchema = z.object({ joined: z.boolean(), already: z.boolean(), reason: nullableText(128) }).strict();
export const slackCreateChannelOutputSchema = z.object({ id: text(128), name: text(256) }).strict();
export const slackMessagePostInputSchema = z.object({
  connectionId: idSchema,
  destination: z.object({ kind: z.enum(["channel", "user"]), id: text(128) }).strict(),
  text: z.string().trim().min(1).max(4_000),
  clientMessageId: text(256),
}).strict();
export const slackMessagePostOutputSchema = z.object({ channel: text(128), ts: text(128) }).strict();
