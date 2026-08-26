import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./types.js";
import { newRecordId, nowIso } from "./types.js";

export interface AgentWebhookToken {
  id: string;
  triggerId: string;
  tokenHint: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ProvisionedAgentWebhookToken extends AgentWebhookToken {
  /** The raw credential is returned only by provision/rotate. */
  token: string;
}

const TOKEN_SELECT = `
  SELECT
    id,
    trigger_id AS triggerId,
    token_hint AS tokenHint,
    created_at AS createdAt,
    last_used_at AS lastUsedAt,
    revoked_at AS revokedAt
  FROM agent_webhook_tokens`;

const TOKEN_PATTERN = /^crm_wh_[A-Za-z0-9_-]{32,}$/u;

export function hashAgentWebhookToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeToken(value: unknown): string {
  if (typeof value !== "string") throw new Error("Webhook token must be a string.");
  const token = value.trim();
  if (!TOKEN_PATTERN.test(token) || token.length > 512) throw new Error("Webhook token is invalid.");
  return token;
}

function rowObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("Webhook token row is missing.");
  return value as Record<string, unknown>;
}

function stringValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Webhook token ${key} is invalid.`);
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return stringValue(row, key);
}

function normalizeTimestamp(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date.`);
  return parsed.toISOString();
}

function parseToken(value: unknown): AgentWebhookToken {
  const row = rowObject(value);
  return {
    id: stringValue(row, "id"),
    triggerId: stringValue(row, "triggerId"),
    tokenHint: stringValue(row, "tokenHint"),
    createdAt: stringValue(row, "createdAt"),
    lastUsedAt: nullableString(row, "lastUsedAt"),
    revokedAt: nullableString(row, "revokedAt"),
  };
}

export class AgentWebhookTokenStore {
  constructor(private readonly db: Db) {}

  list(triggerId?: string): AgentWebhookToken[] {
    const rows = triggerId === undefined
      ? this.db.prepare(`${TOKEN_SELECT} ORDER BY created_at DESC, id DESC`).all()
      : this.db.prepare(`${TOKEN_SELECT} WHERE trigger_id = ? ORDER BY created_at DESC, id DESC`).all(triggerId);
    return (rows as unknown[]).map(parseToken);
  }

  get(id: string): AgentWebhookToken | null {
    const row = this.db.prepare(`${TOKEN_SELECT} WHERE id = ?`).get(id);
    return row === undefined ? null : parseToken(row);
  }

  provision(triggerId: string, at = nowIso()): ProvisionedAgentWebhookToken {
    const token = `crm_wh_${randomBytes(32).toString("base64url")}`;
    const timestamp = normalizeTimestamp(at, "Webhook token timestamp");
    const tokenRow = {
      id: newRecordId("agent-webhook-token"),
      triggerId,
      tokenHint: token.slice(-8),
      createdAt: timestamp,
    };
    return this.db.transaction(() => {
      // A trigger has one active credential. Provisioning is safe to repeat,
      // and implicitly rotates any old credential that cannot be recovered.
      this.db.prepare(`
        UPDATE agent_webhook_tokens
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE trigger_id = ? AND revoked_at IS NULL
      `).run(timestamp, triggerId);
      this.db.prepare(`
        INSERT INTO agent_webhook_tokens (
          id, trigger_id, token_hash, token_hint, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        tokenRow.id,
        tokenRow.triggerId,
        hashAgentWebhookToken(token),
        tokenRow.tokenHint,
        tokenRow.createdAt,
      );
      return {
        ...parseToken(this.db.prepare(`${TOKEN_SELECT} WHERE id = ?`).get(tokenRow.id)),
        token,
      };
    })();
  }

  rotate(triggerId: string, at = nowIso()): ProvisionedAgentWebhookToken {
    return this.provision(triggerId, at);
  }

  revoke(id: string, at = nowIso()): AgentWebhookToken {
    const timestamp = normalizeTimestamp(at, "Webhook token timestamp");
    const result = this.db.prepare(`
      UPDATE agent_webhook_tokens
      SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id = ?
    `).run(timestamp, id);
    if (result.changes !== 1) throw new Error(`No webhook token with id ${id}.`);
    return this.get(id)!;
  }

  /** Return metadata only; callers cannot recover the raw token. */
  authenticate(triggerId: string, rawToken: string): AgentWebhookToken | null {
    let token: string;
    try {
      token = normalizeToken(rawToken);
    } catch {
      return null;
    }
    const row = this.db.prepare(`${TOKEN_SELECT}
      WHERE trigger_id = ?
        AND token_hash = ?
        AND revoked_at IS NULL
      LIMIT 1`).get(triggerId, hashAgentWebhookToken(token));
    return row === undefined ? null : parseToken(row);
  }

  markUsed(id: string, at = nowIso()): void {
    this.db.prepare(`
      UPDATE agent_webhook_tokens
      SET last_used_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(at, id);
  }
}

export function createAgentWebhookTokenStore(db: Db): AgentWebhookTokenStore {
  return new AgentWebhookTokenStore(db);
}
