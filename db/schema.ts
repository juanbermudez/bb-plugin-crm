import type { BbPluginApi } from "@get-bb/plugin-sdk";

type PluginDatabase = ReturnType<BbPluginApi["storage"]["database"]>;

export const CRM_SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  `
    CREATE TABLE IF NOT EXISTS crm_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
];

export function initializeSchema(bb: BbPluginApi, db: PluginDatabase): void {
  db.pragma("foreign_keys = ON");
  bb.storage.migrate(db, MIGRATIONS);
}
