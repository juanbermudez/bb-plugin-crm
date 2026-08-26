import { slackChannelSchema, slackMemberMatchSchema } from "../contracts/slack.js";
import type { SlackChannel, SlackMemberMatchRow } from "../lib/slack-adapter.js";
import { newRecordId, nowIso, requiredText, type Db } from "./types.js";

export class SlackStore {
  constructor(private readonly db: Db) {}

  replaceInventory(connectionId: string, channels: readonly SlackChannel[], matches: readonly SlackMemberMatchRow[]): void {
    const id = requiredText(connectionId, "Slack connection id");
    const updatedAt = nowIso();
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM slack_channels WHERE connection_id = ?").run(id);
      this.db.prepare("DELETE FROM slack_member_matches WHERE connection_id = ?").run(id);
      const channelInsert = this.db.prepare(`INSERT INTO slack_channels (
        id, connection_id, slack_channel_id, name, is_private, is_member, member_count, updated_at
      ) VALUES (@id, @connectionId, @slackChannelId, @name, @isPrivate, @isMember, @memberCount, @updatedAt)`);
      for (const channel of channels) channelInsert.run({
        id: newRecordId("slack_channel"), connectionId: id, slackChannelId: channel.id,
        name: channel.name, isPrivate: channel.is_private ? 1 : 0,
        isMember: channel.is_member ? 1 : 0, memberCount: channel.num_members ?? null, updatedAt,
      });
      const matchInsert = this.db.prepare(`INSERT INTO slack_member_matches (
        id, connection_id, contact_id, slack_user_id, slack_handle, slack_email, matched, updated_at
      ) VALUES (@id, @connectionId, @contactId, @slackUserId, @slackHandle, @slackEmail, @matched, @updatedAt)`);
      for (const row of matches) matchInsert.run({
        id: newRecordId("slack_match"), connectionId: id, contactId: row.id,
        slackUserId: row.match?.slackUserId ?? null, slackHandle: row.match?.slackHandle ?? null,
        slackEmail: row.match?.slackEmail.toLowerCase() ?? null, matched: row.match ? 1 : 0, updatedAt,
      });
    })();
  }

  listChannels(connectionId: string) {
    return this.db.prepare(`SELECT id, slack_channel_id AS slackChannelId, name,
      is_private AS isPrivate, is_member AS isMember, member_count AS memberCount
      FROM slack_channels WHERE connection_id = ? ORDER BY name, id`).all(requiredText(connectionId, "Slack connection id")).map((row) => {
        const value = row as Record<string, unknown>;
        return slackChannelSchema.parse({ ...value, isPrivate: value.isPrivate === 1, isMember: value.isMember === 1 });
      });
  }

  listMatches(connectionId: string) {
    return this.db.prepare(`SELECT sm.id, sm.contact_id AS contactId,
      trim(c.first_name || ' ' || coalesce(c.last_name, '')) AS contactName,
      c.email AS contactEmail, sm.slack_user_id AS slackUserId,
      sm.slack_handle AS slackHandle, sm.slack_email AS slackEmail, sm.matched
      FROM slack_member_matches sm JOIN contacts c ON c.id = sm.contact_id
      WHERE sm.connection_id = ? ORDER BY sm.matched DESC, c.first_name, c.last_name, c.id`).all(requiredText(connectionId, "Slack connection id")).map((row) => {
        const value = row as Record<string, unknown>;
        return slackMemberMatchSchema.parse({ ...value, matched: value.matched === 1 });
      });
  }
}

export function createSlackStore(db: Db): SlackStore { return new SlackStore(db); }
