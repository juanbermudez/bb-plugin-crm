import type { BbPluginApi } from "@get-bb/plugin-sdk";

type PluginDatabase = ReturnType<BbPluginApi["storage"]["database"]>;

export const CRM_SCHEMA_VERSION = 4;

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
  `
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      domain TEXT,
      website TEXT,
      description TEXT,

      logo_url TEXT,
      logo_dark_url TEXT,
      icon_url TEXT,
      icon_dark_url TEXT,
      icon_tone TEXT,
      brand_color TEXT,

      industry TEXT,
      sub_industry TEXT,
      city TEXT,
      state_code TEXT,
      country TEXT,
      country_code TEXT,

      phone TEXT,
      email TEXT,
      linkedin_url TEXT,
      twitter_url TEXT,
      github_url TEXT,
      pricing_url TEXT,
      careers_url TEXT,

      owner_id TEXT,
      primary_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,

      enrichment_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (enrichment_status IN ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED')),
      enriched_at TEXT,
      enrichment_error TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (source IN ('MANUAL', 'IMPORT', 'EMAIL', 'CALENDAR', 'TRACKING')),

      last_activity_at TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY NOT NULL,
      first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
      last_name TEXT,
      email TEXT,
      phone TEXT,
      title TEXT,
      seniority TEXT,
      function TEXT,
      linkedin_url TEXT,
      twitter_url TEXT,
      github_url TEXT,
      image_url TEXT,

      socials_checked_at TEXT,
      enrichment_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (enrichment_status IN ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED')),
      enriched_at TEXT,
      enrichment_error TEXT,

      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      owner_id TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (source IN ('MANUAL', 'IMPORT', 'EMAIL', 'CALENDAR', 'TRACKING')),

      last_activity_at TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      description TEXT,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) > 0),

      stage TEXT NOT NULL DEFAULT 'DEMO_BOOKED'
        CHECK (stage IN (
          'DEMO_BOOKED',
          'QUALIFIED_TO_BUY',
          'UNQUALIFIED_TO_BUY',
          'DECISION_MAKER_BOUGHT_IN',
          'CONTRACT_SENT',
          'CLOSED_WON',
          'CLOSED_LOST'
        )),
      stage_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) > 0),
      expected_close_date TEXT,
      closed_at TEXT,
      closed_reason TEXT,

      -- Base money is a frozen snapshot. Re-rating is an explicit future operation;
      -- ordinary record updates must never silently rewrite these columns.
      base_amount_cents INTEGER
        CHECK (base_amount_cents IS NULL OR base_amount_cents >= 0),
      base_currency TEXT,
      fx_rate REAL CHECK (fx_rate IS NULL OR fx_rate > 0),
      fx_rate_at TEXT,

      last_activity_at TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS deal_contacts (
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      role TEXT,
      PRIMARY KEY (deal_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL
        CHECK (type IN ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK', 'STAGE_CHANGE', 'ENRICHMENT')),
      subject TEXT,
      body TEXT,
      occurred_at TEXT,
      due_at TEXT,
      completed_at TEXT,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE,
      created_by_id TEXT NOT NULL CHECK (length(trim(created_by_id)) > 0),
      meta TEXT,
      email_thread_id TEXT UNIQUE,
      calendar_event_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS saved_views (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL CHECK (entity IN ('COMPANY', 'CONTACT', 'DEAL')),
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      shared INTEGER NOT NULL DEFAULT 0 CHECK (shared IN (0, 1)),
      filters TEXT NOT NULL DEFAULT '{}',
      owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) > 0),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (entity, owner_id, name)
    );

    CREATE TABLE IF NOT EXISTS field_definitions (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL CHECK (entity IN ('COMPANY', 'CONTACT', 'DEAL')),
      key TEXT NOT NULL CHECK (length(trim(key)) > 0),
      label TEXT NOT NULL CHECK (length(trim(label)) > 0),
      type TEXT NOT NULL CHECK (type IN (
        'TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT',
        'URL', 'EMAIL', 'PHONE', 'USER'
      )),
      agent_filled INTEGER NOT NULL DEFAULT 1 CHECK (agent_filled IN (0, 1)),
      agent_brief TEXT,
      required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
      show_on_sheet INTEGER NOT NULL DEFAULT 1 CHECK (show_on_sheet IN (0, 1)),
      show_on_table INTEGER NOT NULL DEFAULT 0 CHECK (show_on_table IN (0, 1)),
      show_on_filter INTEGER NOT NULL DEFAULT 0 CHECK (show_on_filter IN (0, 1)),
      position INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (entity, key)
    );

    CREATE TABLE IF NOT EXISTS field_options (
      id TEXT PRIMARY KEY NOT NULL,
      field_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
      label TEXT NOT NULL CHECK (length(trim(label)) > 0),
      position INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS field_values (
      id TEXT PRIMARY KEY NOT NULL,
      field_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE,
      text TEXT,
      number REAL,
      date TEXT,
      bool INTEGER CHECK (bool IS NULL OR bool IN (0, 1)),
      option_id TEXT REFERENCES field_options(id) ON DELETE SET NULL,
      user_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      CHECK ((company_id IS NOT NULL) + (contact_id IS NOT NULL) + (deal_id IS NOT NULL) = 1),
      UNIQUE (field_id, company_id),
      UNIQUE (field_id, contact_id),
      UNIQUE (field_id, deal_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS companies_domain_active_idx
      ON companies(domain COLLATE NOCASE)
      WHERE domain IS NOT NULL AND archived_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_active_idx
      ON contacts(email COLLATE NOCASE)
      WHERE email IS NOT NULL AND archived_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS companies_primary_contact_idx
      ON companies(primary_contact_id)
      WHERE primary_contact_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS companies_name_idx ON companies(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS companies_owner_idx ON companies(owner_id);
    CREATE INDEX IF NOT EXISTS companies_last_activity_idx ON companies(last_activity_at);
    CREATE INDEX IF NOT EXISTS companies_archived_idx ON companies(archived_at);
    CREATE INDEX IF NOT EXISTS contacts_name_idx ON contacts(last_name COLLATE NOCASE, first_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts(company_id);
    CREATE INDEX IF NOT EXISTS contacts_owner_idx ON contacts(owner_id);
    CREATE INDEX IF NOT EXISTS contacts_last_activity_idx ON contacts(last_activity_at);
    CREATE INDEX IF NOT EXISTS contacts_archived_idx ON contacts(archived_at);
    CREATE INDEX IF NOT EXISTS deals_company_idx ON deals(company_id);
    CREATE INDEX IF NOT EXISTS deals_owner_idx ON deals(owner_id);
    CREATE INDEX IF NOT EXISTS deals_stage_idx ON deals(stage);
    CREATE INDEX IF NOT EXISTS deals_expected_close_idx ON deals(expected_close_date);
    CREATE INDEX IF NOT EXISTS deals_last_activity_idx ON deals(last_activity_at);
    CREATE INDEX IF NOT EXISTS deals_base_amount_idx ON deals(base_amount_cents);
    CREATE INDEX IF NOT EXISTS deals_currency_idx ON deals(currency);
    CREATE INDEX IF NOT EXISTS deals_archived_idx ON deals(archived_at);
    CREATE INDEX IF NOT EXISTS deal_contacts_contact_idx ON deal_contacts(contact_id, deal_id);
    CREATE INDEX IF NOT EXISTS activities_company_created_idx ON activities(company_id, created_at);
    CREATE INDEX IF NOT EXISTS activities_contact_created_idx ON activities(contact_id, created_at);
    CREATE INDEX IF NOT EXISTS activities_deal_created_idx ON activities(deal_id, created_at);
    CREATE INDEX IF NOT EXISTS activities_due_idx ON activities(due_at);
    CREATE INDEX IF NOT EXISTS activities_created_by_idx ON activities(created_by_id);
    CREATE INDEX IF NOT EXISTS saved_views_entity_shared_idx ON saved_views(entity, shared);
    CREATE INDEX IF NOT EXISTS field_definitions_entity_position_idx
      ON field_definitions(entity, position);
    CREATE INDEX IF NOT EXISTS field_options_field_position_idx
      ON field_options(field_id, position);
    CREATE INDEX IF NOT EXISTS field_values_field_text_idx
      ON field_values(field_id, text);
    CREATE INDEX IF NOT EXISTS field_values_field_number_idx
      ON field_values(field_id, number);
    CREATE INDEX IF NOT EXISTS field_values_field_date_idx
      ON field_values(field_id, date);
    CREATE INDEX IF NOT EXISTS field_values_company_idx ON field_values(company_id);
    CREATE INDEX IF NOT EXISTS field_values_contact_idx ON field_values(contact_id);
    CREATE INDEX IF NOT EXISTS field_values_deal_idx ON field_values(deal_id);
    CREATE INDEX IF NOT EXISTS field_values_option_idx ON field_values(option_id);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    CREATE TABLE IF NOT EXISTS contact_facts (
      id TEXT PRIMARY KEY NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      field TEXT NOT NULL CHECK (length(trim(field)) > 0),
      value TEXT NOT NULL CHECK (length(trim(value)) > 0),
      score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
      band TEXT NOT NULL CHECK (band IN ('VERIFIED', 'PROBABLE', 'POSSIBLE')),
      evidence TEXT NOT NULL,
      method TEXT NOT NULL CHECK (length(trim(method)) > 0),
      source_url TEXT,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'PROPOSED'
        CHECK (status IN ('APPLIED', 'PROPOSED', 'DISMISSED', 'SUPERSEDED')),
      decided_by_id TEXT,
      decided_at TEXT,
      observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      superseded_at TEXT,
      supersedes_id TEXT REFERENCES contact_facts(id) ON DELETE SET NULL,
      superseded_by_id TEXT REFERENCES contact_facts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS contact_briefs (
      id TEXT PRIMARY KEY NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK (version > 0),
      narrative TEXT NOT NULL CHECK (length(trim(narrative)) > 0),
      sections TEXT NOT NULL,
      score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
      source_url TEXT,
      session_id TEXT,
      refreshed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (contact_id, version)
    );

    CREATE TABLE IF NOT EXISTS contact_work_history (
      id TEXT PRIMARY KEY NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      title TEXT,
      organization_name TEXT,
      organization_domain TEXT,
      start_date TEXT,
      end_date TEXT,
      location TEXT,
      description TEXT,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
      score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
      band TEXT NOT NULL CHECK (band IN ('VERIFIED', 'PROBABLE', 'POSSIBLE')),
      evidence TEXT NOT NULL,
      method TEXT NOT NULL CHECK (length(trim(method)) > 0),
      source_url TEXT,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'PROPOSED'
        CHECK (status IN ('APPLIED', 'PROPOSED', 'DISMISSED', 'SUPERSEDED')),
      decided_by_id TEXT,
      decided_at TEXT,
      observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      superseded_at TEXT,
      supersedes_id TEXT REFERENCES contact_work_history(id) ON DELETE SET NULL,
      superseded_by_id TEXT REFERENCES contact_work_history(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS contact_facts_contact_field_status_idx
      ON contact_facts(contact_id, field, status);
    CREATE INDEX IF NOT EXISTS contact_facts_status_observed_idx
      ON contact_facts(status, observed_at);
    CREATE INDEX IF NOT EXISTS contact_facts_supersedes_idx
      ON contact_facts(supersedes_id);
    CREATE INDEX IF NOT EXISTS contact_facts_superseded_by_idx
      ON contact_facts(superseded_by_id);
    CREATE INDEX IF NOT EXISTS contact_briefs_contact_version_idx
      ON contact_briefs(contact_id, version DESC);
    CREATE INDEX IF NOT EXISTS contact_briefs_contact_refreshed_idx
      ON contact_briefs(contact_id, refreshed_at DESC);
    CREATE INDEX IF NOT EXISTS contact_work_history_contact_status_idx
      ON contact_work_history(contact_id, status);
    CREATE INDEX IF NOT EXISTS contact_work_history_contact_dates_idx
      ON contact_work_history(contact_id, start_date DESC, end_date DESC);
    CREATE INDEX IF NOT EXISTS contact_work_history_supersedes_idx
      ON contact_work_history(supersedes_id);
    CREATE INDEX IF NOT EXISTS contact_work_history_superseded_by_idx
      ON contact_work_history(superseded_by_id);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '3', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY NOT NULL,
      base_currency TEXT NOT NULL CHECK (length(trim(base_currency)) = 3),
      quote_currency TEXT NOT NULL CHECK (length(trim(quote_currency)) = 3),
      rate REAL NOT NULL CHECK (rate > 0),
      as_of TEXT NOT NULL CHECK (length(trim(as_of)) > 0),
      source TEXT NOT NULL CHECK (source IN ('FETCHED', 'MANUAL')),
      provider TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (base_currency, quote_currency, source),
      CHECK (base_currency <> quote_currency)
    );

    CREATE TABLE IF NOT EXISTS exchange_rate_audit (
      id TEXT PRIMARY KEY NOT NULL,
      exchange_rate_id TEXT REFERENCES exchange_rates(id) ON DELETE SET NULL,
      base_currency TEXT NOT NULL CHECK (length(trim(base_currency)) = 3),
      quote_currency TEXT NOT NULL CHECK (length(trim(quote_currency)) = 3),
      source TEXT NOT NULL CHECK (source IN ('FETCHED', 'MANUAL')),
      action TEXT NOT NULL CHECK (action IN ('UPSERT', 'DELETE')),
      rate REAL CHECK (rate IS NULL OR rate > 0),
      as_of TEXT,
      provider TEXT,
      previous_rate REAL CHECK (previous_rate IS NULL OR previous_rate > 0),
      previous_as_of TEXT,
      previous_provider TEXT,
      actor_id TEXT,
      recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS exchange_rates_pair_idx
      ON exchange_rates(base_currency, quote_currency);
    CREATE INDEX IF NOT EXISTS exchange_rates_source_idx
      ON exchange_rates(source, updated_at DESC);
    CREATE INDEX IF NOT EXISTS exchange_rate_audit_pair_idx
      ON exchange_rate_audit(base_currency, quote_currency, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS exchange_rate_audit_rate_idx
      ON exchange_rate_audit(exchange_rate_id, recorded_at DESC);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '4', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
];

export function initializeSchema(bb: BbPluginApi, db: PluginDatabase): void {
  db.pragma("foreign_keys = ON");
  bb.storage.migrate(db, MIGRATIONS);
}
