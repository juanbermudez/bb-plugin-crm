import type { BbPluginApi } from "@get-bb/plugin-sdk";

type PluginDatabase = ReturnType<BbPluginApi["storage"]["database"]>;

export const CRM_SCHEMA_VERSION = 12;

export const CRM_SCHEMA_MIGRATIONS: string[] = [
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

      -- Base money is a frozen snapshot. Source amount/currency edits refresh
      -- it from the effective rate; unrelated edits leave it unchanged.
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
  `
    -- Agent definitions are soft-archived. Child rows use CASCADE so an
    -- explicit purge cannot leave an orphaned run or thread link behind.
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      description TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'DEPLOYING', 'LIVE', 'PAUSED', 'ARCHIVED', 'DELETED')),
      created_by_id TEXT NOT NULL CHECK (length(trim(created_by_id)) > 0),
      current_version_id TEXT,
      archived_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS agent_versions (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
      number INTEGER NOT NULL CHECK (number > 0),
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'VALIDATING', 'READY', 'DEPLOYED', 'REJECTED')),
      instructions TEXT NOT NULL,
      manifest TEXT NOT NULL CHECK (json_valid(manifest)),
      model_id TEXT NOT NULL CHECK (length(trim(model_id)) > 0),
      model_context_window_tokens INTEGER NOT NULL DEFAULT 1000000
        CHECK (model_context_window_tokens > 0),
      sandbox_policy TEXT NOT NULL CHECK (json_valid(sandbox_policy)),
      validation TEXT CHECK (validation IS NULL OR json_valid(validation)),
      source_conversation_id TEXT,
      created_by_id TEXT NOT NULL CHECK (length(trim(created_by_id)) > 0),
      deployment_id TEXT,
      approved_at TEXT,
      deployed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (agent_id, number),
      UNIQUE (id, agent_id)
    );

    -- SQLite cannot add a circular foreign key after both tables exist. This
    -- trigger gives current_version_id the same ownership guarantee while the
    -- composite child foreign keys below protect every other reference.
    CREATE TRIGGER IF NOT EXISTS agent_definition_current_version_guard
    BEFORE INSERT ON agent_definitions
    WHEN NEW.current_version_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agent_versions
        WHERE id = NEW.current_version_id AND agent_id = NEW.id
      )
    BEGIN
      SELECT RAISE(ABORT, 'agent current version must belong to the agent');
    END;

    CREATE TRIGGER IF NOT EXISTS agent_definition_current_version_update_guard
    BEFORE UPDATE OF current_version_id ON agent_definitions
    WHEN NEW.current_version_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agent_versions
        WHERE id = NEW.current_version_id AND agent_id = NEW.id
      )
    BEGIN
      SELECT RAISE(ABORT, 'agent current version must belong to the agent');
    END;

    CREATE TABLE IF NOT EXISTS agent_triggers (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
      version_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('MANUAL', 'SCHEDULE', 'EVENT', 'WEBHOOK')),
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      config TEXT NOT NULL CHECK (json_valid(config)),
      created_by_id TEXT NOT NULL CHECK (length(trim(created_by_id)) > 0),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      next_run_at TEXT,
      last_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (id, agent_id),
      FOREIGN KEY (version_id, agent_id)
        REFERENCES agent_versions(id, agent_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
      version_id TEXT NOT NULL,
      trigger_id TEXT,
      initiated_by_id TEXT,
      trigger_type TEXT NOT NULL CHECK (trigger_type IN ('MANUAL', 'SCHEDULE', 'EVENT', 'WEBHOOK')),
      status TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
      principal_id TEXT,
      session_id TEXT UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      correlation_id TEXT NOT NULL UNIQUE,
      input TEXT CHECK (input IS NULL OR json_valid(input)),
      result TEXT CHECK (result IS NULL OR json_valid(result)),
      summary TEXT,
      model_id TEXT,
      input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
      output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
      cost_usd REAL CHECK (cost_usd IS NULL OR cost_usd >= 0),
      error_code TEXT,
      error_message TEXT,
      approval_reason TEXT,
      approval_requested_at TEXT,
      approved_at TEXT,
      approved_by_id TEXT,
      next_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK (next_event_sequence >= 0),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      started_at TEXT,
      finished_at TEXT,
      cancel_requested_at TEXT,
      cancel_delivered_at TEXT,
      UNIQUE (id, agent_id),
      FOREIGN KEY (version_id, agent_id)
        REFERENCES agent_versions(id, agent_id) ON DELETE CASCADE,
      FOREIGN KEY (trigger_id, agent_id)
        REFERENCES agent_triggers(id, agent_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_run_events (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL CHECK (sequence >= 0),
      type TEXT NOT NULL CHECK (length(trim(type)) > 0),
      data TEXT NOT NULL CHECK (json_valid(data)),
      emitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (run_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS agent_actions (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (length(trim(type)) > 0),
      provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
      target_type TEXT,
      target_id TEXT,
      target_label TEXT,
      summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
      metadata TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
      status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
      idempotency_key TEXT NOT NULL UNIQUE,
      request_hash TEXT,
      external_id TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      error_code TEXT,
      error_message TEXT,
      planned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (run_id, agent_id)
        REFERENCES agent_runs(id, agent_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
      version_id TEXT,
      run_id TEXT,
      actor_user_id TEXT,
      actor_type TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (length(trim(actor_type)) > 0),
      actor_id TEXT,
      type TEXT NOT NULL CHECK (length(trim(type)) > 0),
      summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
      before TEXT CHECK (before IS NULL OR json_valid(before)),
      after TEXT CHECK (after IS NULL OR json_valid(after)),
      request_id TEXT,
      emitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (version_id, agent_id)
        REFERENCES agent_versions(id, agent_id) ON DELETE CASCADE,
      FOREIGN KEY (run_id, agent_id)
        REFERENCES agent_runs(id, agent_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_thread_links (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL CHECK (length(trim(thread_id)) > 0),
      kind TEXT NOT NULL DEFAULT 'RECORD'
        CHECK (kind IN ('RECORD', 'BUILDER', 'RUN')),
      run_id TEXT,
      version_id TEXT,
      record_type TEXT CHECK (record_type IS NULL OR record_type IN ('COMPANY', 'CONTACT', 'DEAL')),
      record_id TEXT,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (thread_id),
      FOREIGN KEY (run_id, agent_id)
        REFERENCES agent_runs(id, agent_id) ON DELETE CASCADE,
      FOREIGN KEY (version_id, agent_id)
        REFERENCES agent_versions(id, agent_id) ON DELETE CASCADE,
      CHECK ((record_type IS NULL) = (record_id IS NULL))
    );

    -- Version payload and provenance are append-only. Deployment metadata and
    -- status are intentionally mutable so a version can be promoted/demoted
    -- without ever rewriting the instructions or manifest it represents.
    CREATE TRIGGER IF NOT EXISTS agent_versions_immutable_content
    BEFORE UPDATE OF agent_id, number, instructions, manifest, model_id,
      model_context_window_tokens, sandbox_policy, validation,
      source_conversation_id, created_by_id, created_at ON agent_versions
    BEGIN
      SELECT RAISE(ABORT, 'agent versions are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS agent_definition_status_transition_guard
    BEFORE UPDATE OF status ON agent_definitions
    WHEN NOT (
      OLD.status = NEW.status OR
      (OLD.status = 'DRAFT' AND NEW.status IN ('DEPLOYING', 'LIVE')) OR
      (OLD.status = 'DEPLOYING' AND NEW.status IN ('DRAFT', 'LIVE')) OR
      (OLD.status = 'LIVE' AND NEW.status IN ('PAUSED', 'ARCHIVED')) OR
      (OLD.status = 'PAUSED' AND NEW.status IN ('LIVE', 'ARCHIVED')) OR
      (OLD.status = 'ARCHIVED' AND NEW.status = 'PAUSED') OR
      (NEW.status = 'DELETED')
    )
    BEGIN
      SELECT RAISE(ABORT, 'invalid agent definition status transition');
    END;

    CREATE TRIGGER IF NOT EXISTS agent_version_status_transition_guard
    BEFORE UPDATE OF status ON agent_versions
    WHEN NOT (
      OLD.status = NEW.status OR
      (OLD.status = 'DRAFT' AND NEW.status IN ('VALIDATING', 'READY', 'REJECTED', 'DEPLOYED')) OR
      (OLD.status = 'VALIDATING' AND NEW.status IN ('DRAFT', 'READY', 'REJECTED')) OR
      (OLD.status = 'READY' AND NEW.status IN ('DRAFT', 'DEPLOYED')) OR
      (OLD.status = 'DEPLOYED' AND NEW.status IN ('READY', 'REJECTED')) OR
      (OLD.status = 'REJECTED' AND NEW.status = 'DRAFT')
    )
    BEGIN
      SELECT RAISE(ABORT, 'invalid agent version status transition');
    END;

    CREATE TRIGGER IF NOT EXISTS agent_run_status_transition_guard
    BEFORE UPDATE OF status ON agent_runs
    WHEN NOT (
      OLD.status = NEW.status OR
      (OLD.status = 'QUEUED' AND NEW.status IN ('RUNNING', 'FAILED', 'CANCELLED')) OR
      (OLD.status = 'RUNNING' AND NEW.status IN ('WAITING_FOR_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED')) OR
      (OLD.status = 'WAITING_FOR_APPROVAL' AND NEW.status IN ('RUNNING', 'FAILED', 'CANCELLED'))
    )
    BEGIN
      SELECT RAISE(ABORT, 'invalid agent run status transition');
    END;

    CREATE TRIGGER IF NOT EXISTS agent_action_status_transition_guard
    BEFORE UPDATE OF status ON agent_actions
    WHEN NOT (
      OLD.status = NEW.status OR
      (OLD.status = 'PLANNED' AND NEW.status IN ('RUNNING', 'FAILED', 'CANCELLED')) OR
      (OLD.status = 'RUNNING' AND NEW.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED'))
    )
    BEGIN
      SELECT RAISE(ABORT, 'invalid agent action status transition');
    END;

    CREATE TRIGGER IF NOT EXISTS agent_definitions_updated_at
    AFTER UPDATE OF name, description, status, current_version_id, archived_at, deleted_at ON agent_definitions
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE agent_definitions
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS agent_triggers_updated_at
    AFTER UPDATE OF version_id, type, name, config, enabled, next_run_at, last_run_at ON agent_triggers
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE agent_triggers
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS agent_actions_updated_at
    AFTER UPDATE OF type, provider, target_type, target_id, target_label, summary,
      metadata, status, request_hash, external_id, attempt_count, error_code,
      error_message, started_at, completed_at ON agent_actions
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE agent_actions
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = NEW.id;
    END;

    CREATE INDEX IF NOT EXISTS agent_definitions_status_updated_idx
      ON agent_definitions(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS agent_definitions_created_by_idx
      ON agent_definitions(created_by_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_definitions_current_version_idx
      ON agent_definitions(current_version_id);

    CREATE INDEX IF NOT EXISTS agent_versions_agent_created_idx
      ON agent_versions(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_versions_agent_number_idx
      ON agent_versions(agent_id, number DESC);
    CREATE INDEX IF NOT EXISTS agent_versions_status_created_idx
      ON agent_versions(status, created_at DESC);

    CREATE INDEX IF NOT EXISTS agent_triggers_agent_enabled_idx
      ON agent_triggers(agent_id, enabled);
    CREATE INDEX IF NOT EXISTS agent_triggers_enabled_next_run_idx
      ON agent_triggers(enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS agent_triggers_version_idx
      ON agent_triggers(version_id);
    CREATE INDEX IF NOT EXISTS agent_triggers_type_idx
      ON agent_triggers(type, updated_at DESC);

    CREATE INDEX IF NOT EXISTS agent_runs_agent_created_idx
      ON agent_runs(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_runs_version_created_idx
      ON agent_runs(version_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_runs_status_created_idx
      ON agent_runs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_runs_trigger_created_idx
      ON agent_runs(trigger_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_runs_correlation_idx
      ON agent_runs(correlation_id);

    CREATE INDEX IF NOT EXISTS agent_run_events_run_emitted_idx
      ON agent_run_events(run_id, emitted_at, sequence);
    CREATE INDEX IF NOT EXISTS agent_actions_agent_planned_idx
      ON agent_actions(agent_id, planned_at DESC);
    CREATE INDEX IF NOT EXISTS agent_actions_run_planned_idx
      ON agent_actions(run_id, planned_at);
    CREATE INDEX IF NOT EXISTS agent_actions_provider_external_idx
      ON agent_actions(provider, external_id);
    CREATE INDEX IF NOT EXISTS agent_actions_status_planned_idx
      ON agent_actions(status, planned_at);

    CREATE INDEX IF NOT EXISTS agent_audit_agent_emitted_idx
      ON agent_audit_events(agent_id, emitted_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS agent_audit_version_emitted_idx
      ON agent_audit_events(version_id, emitted_at DESC);
    CREATE INDEX IF NOT EXISTS agent_audit_run_emitted_idx
      ON agent_audit_events(run_id, emitted_at DESC);
    CREATE INDEX IF NOT EXISTS agent_audit_actor_emitted_idx
      ON agent_audit_events(actor_id, emitted_at DESC);
    CREATE INDEX IF NOT EXISTS agent_audit_type_emitted_idx
      ON agent_audit_events(type, emitted_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS agent_audit_request_idx
      ON agent_audit_events(agent_id, type, request_id)
      WHERE request_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS agent_thread_links_agent_created_idx
      ON agent_thread_links(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_thread_links_run_idx
      ON agent_thread_links(run_id);
    CREATE INDEX IF NOT EXISTS agent_thread_links_record_idx
      ON agent_thread_links(record_type, record_id);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '5', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    -- Phase 7 integrations are deliberately split into configuration, health,
    -- and cursor rows. OAuth credentials are never part of these tables; the
    -- host/plugin secret store owns those values. Configuration is restricted
    -- to non-secret provider metadata by the connections store.
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL
        CHECK (provider IN ('GOOGLE', 'MICROSOFT', 'SLACK')),
      external_account_id TEXT,
      display_name TEXT,
      configuration TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(configuration)),
      scopes TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(scopes)),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (provider, external_account_id)
    );

    CREATE TABLE IF NOT EXISTS connection_health (
      connection_id TEXT PRIMARY KEY NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'DISCONNECTED'
        CHECK (status IN ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'DEGRADED', 'ERROR', 'DISABLED')),
      last_checked_at TEXT,
      last_success_at TEXT,
      last_failure_at TEXT,
      failure_code TEXT,
      failure_message TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS connection_sync_cursors (
      id TEXT PRIMARY KEY NOT NULL,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      stream TEXT NOT NULL CHECK (length(trim(stream)) > 0),
      cursor TEXT,
      last_success_at TEXT,
      last_failure_at TEXT,
      failure_code TEXT,
      failure_message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (connection_id, stream)
    );

    CREATE TABLE IF NOT EXISTS tracking_sites (
      id TEXT PRIMARY KEY NOT NULL,
      site_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      allowed_domains TEXT NOT NULL CHECK (json_valid(allowed_domains)),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
      verification_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (verification_status IN ('PENDING', 'VERIFIED')),
      verified_at TEXT,
      paused_at TEXT,
      rotated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      CHECK (json_type(allowed_domains) = 'array')
    );

    CREATE TABLE IF NOT EXISTS tracking_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT REFERENCES tracking_sites(id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK (scope IN ('INTAKE', 'TRACKING')),
      token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
      token_hint TEXT NOT NULL CHECK (length(token_hint) BETWEEN 4 AND 32),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_used_at TEXT,
      revoked_at TEXT,
      CHECK ((scope = 'TRACKING' AND site_id IS NOT NULL) OR
             (scope = 'INTAKE' AND site_id IS NULL))
    );

    CREATE TABLE IF NOT EXISTS tracking_retention (
      site_id TEXT PRIMARY KEY NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
      event_retention_days INTEGER NOT NULL DEFAULT 30
        CHECK (event_retention_days BETWEEN 1 AND 3650),
      aggregate_retention_days INTEGER NOT NULL DEFAULT 730
        CHECK (aggregate_retention_days BETWEEN 1 AND 3650),
      last_rollup_at TEXT,
      last_pruned_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tracking_events (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES tracking_tokens(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL CHECK (event_type IN ('PAGE_VIEW', 'FORM_SUBMIT', 'IDENTIFY', 'CUSTOM')),
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (length(trim(origin)) > 0),
      path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 2048),
      referrer_path TEXT CHECK (referrer_path IS NULL OR length(referrer_path) BETWEEN 1 AND 2048),
      visitor_hash TEXT CHECK (visitor_hash IS NULL OR length(visitor_hash) = 64),
      session_hash TEXT CHECK (session_hash IS NULL OR length(session_hash) = 64),
      source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 128),
      properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties) AND json_type(properties) = 'object'),
      event_key TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (site_id, event_key)
    );

    CREATE TABLE IF NOT EXISTS tracking_daily_aggregates (
      site_id TEXT NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
      day TEXT NOT NULL CHECK (length(day) = 10),
      event_type TEXT NOT NULL CHECK (event_type IN ('PAGE_VIEW', 'FORM_SUBMIT', 'IDENTIFY', 'CUSTOM')),
      path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 2048),
      source TEXT NOT NULL DEFAULT '',
      event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
      unique_visitors INTEGER NOT NULL DEFAULT 0 CHECK (unique_visitors >= 0),
      first_seen_at TEXT,
      last_seen_at TEXT,
      rolled_up_at TEXT NOT NULL,
      PRIMARY KEY (site_id, day, event_type, path, source)
    );

    CREATE INDEX IF NOT EXISTS connections_provider_enabled_idx
      ON connections(provider, enabled);
    CREATE INDEX IF NOT EXISTS connection_health_status_idx
      ON connection_health(status, last_checked_at);
    CREATE INDEX IF NOT EXISTS connection_sync_cursors_connection_idx
      ON connection_sync_cursors(connection_id, stream);
    CREATE INDEX IF NOT EXISTS tracking_sites_status_idx
      ON tracking_sites(status, verification_status);
    CREATE INDEX IF NOT EXISTS tracking_tokens_site_scope_idx
      ON tracking_tokens(site_id, scope, revoked_at);
    CREATE INDEX IF NOT EXISTS tracking_events_site_received_idx
      ON tracking_events(site_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS tracking_events_site_occurred_idx
      ON tracking_events(site_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS tracking_events_rollup_idx
      ON tracking_events(site_id, event_type, occurred_at, path);
    CREATE INDEX IF NOT EXISTS tracking_daily_aggregates_site_day_idx
      ON tracking_daily_aggregates(site_id, day DESC, event_type);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '6', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    -- CRM event rows are written by SQLite triggers so every supported domain
    -- mutation (RPC, CLI, native tool, or direct store use) produces one
    -- transactional event before its agent run is queued.
    CREATE TABLE IF NOT EXISTS crm_event_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK (type IN (
        'company.created',
        'contact.created',
        'deal.created',
        'deal.stage.changed',
        'deal.opened',
        'deal.closed'
      )),
      record_kind TEXT NOT NULL CHECK (record_kind IN ('company', 'contact', 'deal')),
      record_id TEXT NOT NULL CHECK (length(trim(record_id)) > 0),
      occurred_at TEXT NOT NULL CHECK (length(trim(occurred_at)) > 0),
      data TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(data) AND json_type(data) = 'object'),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      processed_at TEXT,
      CHECK (
        (type = 'company.created' AND record_kind = 'company') OR
        (type = 'contact.created' AND record_kind = 'contact') OR
        (type IN ('deal.created', 'deal.stage.changed', 'deal.opened', 'deal.closed')
          AND record_kind = 'deal')
      )
    );

    CREATE TABLE IF NOT EXISTS agent_webhook_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      trigger_id TEXT NOT NULL REFERENCES agent_triggers(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
      token_hint TEXT NOT NULL CHECK (length(token_hint) BETWEEN 4 AND 32),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_used_at TEXT,
      revoked_at TEXT
    );

    CREATE TRIGGER IF NOT EXISTS crm_company_created_event
    AFTER INSERT ON companies
    BEGIN
      INSERT INTO crm_event_outbox (
        id, type, record_kind, record_id, occurred_at, data
      ) VALUES (
        'crm-event-' || lower(hex(randomblob(16))),
        'company.created',
        'company',
        NEW.id,
        NEW.created_at,
        json_object(
          'name', NEW.name,
          'domain', NEW.domain
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS crm_contact_created_event
    AFTER INSERT ON contacts
    BEGIN
      INSERT INTO crm_event_outbox (
        id, type, record_kind, record_id, occurred_at, data
      ) VALUES (
        'crm-event-' || lower(hex(randomblob(16))),
        'contact.created',
        'contact',
        NEW.id,
        NEW.created_at,
        json_object(
          'firstName', NEW.first_name,
          'lastName', NEW.last_name,
          'email', NEW.email,
          'companyId', NEW.company_id
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS crm_deal_created_event
    AFTER INSERT ON deals
    BEGIN
      INSERT INTO crm_event_outbox (
        id, type, record_kind, record_id, occurred_at, data
      ) VALUES (
        'crm-event-' || lower(hex(randomblob(16))),
        'deal.created',
        'deal',
        NEW.id,
        NEW.created_at,
        json_object(
          'name', NEW.name,
          'companyId', NEW.company_id,
          'stage', NEW.stage
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS crm_deal_created_closed_event
    AFTER INSERT ON deals
    WHEN NEW.stage IN ('CLOSED_WON', 'CLOSED_LOST')
    BEGIN
      INSERT INTO crm_event_outbox (
        id, type, record_kind, record_id, occurred_at, data
      ) VALUES (
        'crm-event-' || lower(hex(randomblob(16))),
        'deal.closed',
        'deal',
        NEW.id,
        NEW.created_at,
        json_object(
          'companyId', NEW.company_id,
          'from', NULL,
          'to', NEW.stage
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS crm_deal_stage_changed_event
    AFTER UPDATE OF stage ON deals
    WHEN OLD.stage <> NEW.stage
    BEGIN
      INSERT INTO crm_event_outbox (
        id, type, record_kind, record_id, occurred_at, data
      ) VALUES (
        'crm-event-' || lower(hex(randomblob(16))),
        'deal.stage.changed',
        'deal',
        NEW.id,
        NEW.stage_changed_at,
        json_object(
          'from', OLD.stage,
          'to', NEW.stage,
          'companyId', NEW.company_id
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS crm_deal_opened_event
    AFTER UPDATE OF stage ON deals
    WHEN OLD.stage <> NEW.stage
      AND OLD.stage IN ('CLOSED_WON', 'CLOSED_LOST')
      AND NEW.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
    BEGIN
      INSERT INTO crm_event_outbox (
        id, type, record_kind, record_id, occurred_at, data
      ) VALUES (
        'crm-event-' || lower(hex(randomblob(16))),
        'deal.opened',
        'deal',
        NEW.id,
        NEW.stage_changed_at,
        json_object(
          'from', OLD.stage,
          'to', NEW.stage,
          'companyId', NEW.company_id
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS crm_deal_closed_event
    AFTER UPDATE OF stage ON deals
    WHEN OLD.stage <> NEW.stage
      AND OLD.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
      AND NEW.stage IN ('CLOSED_WON', 'CLOSED_LOST')
    BEGIN
      INSERT INTO crm_event_outbox (
        id, type, record_kind, record_id, occurred_at, data
      ) VALUES (
        'crm-event-' || lower(hex(randomblob(16))),
        'deal.closed',
        'deal',
        NEW.id,
        NEW.stage_changed_at,
        json_object(
          'from', OLD.stage,
          'to', NEW.stage,
          'companyId', NEW.company_id
        )
      );
    END;

    CREATE INDEX IF NOT EXISTS crm_event_outbox_pending_idx
      ON crm_event_outbox(processed_at, created_at, id);
    CREATE INDEX IF NOT EXISTS crm_event_outbox_record_idx
      ON crm_event_outbox(record_kind, record_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS crm_event_outbox_type_idx
      ON crm_event_outbox(type, processed_at, created_at);
    CREATE INDEX IF NOT EXISTS agent_webhook_tokens_trigger_active_idx
      ON agent_webhook_tokens(trigger_id, revoked_at, created_at DESC);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '7', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    -- Due timeline tasks are leased in their own table.  Keeping dispatch
    -- state separate from activities preserves the source-shaped activity
    -- model while allowing bounded retries and a compare-and-set lease fence.
    CREATE TABLE IF NOT EXISTS crm_activity_task_dispatches (
      activity_id TEXT PRIMARY KEY NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'LEASED'
        CHECK (status IN ('LEASED', 'QUEUED', 'DISPATCHED', 'COMPLETED', 'FAILED')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      lease_token TEXT,
      lease_until TEXT,
      run_id TEXT UNIQUE REFERENCES agent_runs(id) ON DELETE SET NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS crm_activity_task_dispatch_due_idx
      ON crm_activity_task_dispatches(status, lease_until, attempts, activity_id);
    CREATE INDEX IF NOT EXISTS crm_activity_task_dispatch_run_idx
      ON crm_activity_task_dispatches(run_id);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '8', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    -- Purging a contact leaves a durable, normalized tombstone so provider
    -- matching can ignore that address until an explicit write recreates it.
    CREATE TABLE IF NOT EXISTS suppressed_contacts (
      email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS suppressed_contacts_created_idx
      ON suppressed_contacts(created_at);

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '9', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    -- Tracking configuration is site-scoped.  The original tracking tables
    -- predate the cookie/rule controls and source rollups, so keep the
    -- migration additive for already-installed plugin databases.
    ALTER TABLE tracking_sites ADD COLUMN cross_domain INTEGER NOT NULL DEFAULT 1
      CHECK (cross_domain IN (0, 1));
    ALTER TABLE tracking_sites ADD COLUMN limit_to_domains INTEGER NOT NULL DEFAULT 1
      CHECK (limit_to_domains IN (0, 1));
    ALTER TABLE tracking_sites ADD COLUMN cookie_subdomains INTEGER NOT NULL DEFAULT 0
      CHECK (cookie_subdomains IN (0, 1));
    ALTER TABLE tracking_sites ADD COLUMN secure_cookies INTEGER NOT NULL DEFAULT 1
      CHECK (secure_cookies IN (0, 1));
    ALTER TABLE tracking_sites ADD COLUMN honour_dnt INTEGER NOT NULL DEFAULT 1
      CHECK (honour_dnt IN (0, 1));
    ALTER TABLE tracking_sites ADD COLUMN cookie_days INTEGER NOT NULL DEFAULT 395
      CHECK (cookie_days BETWEEN 0 AND 400);
    ALTER TABLE tracking_sites ADD COLUMN verification_event_id TEXT
      REFERENCES tracking_events(id) ON DELETE SET NULL;
    ALTER TABLE tracking_sites ADD COLUMN verification_domain TEXT;

    ALTER TABLE tracking_events ADD COLUMN medium TEXT
      CHECK (medium IS NULL OR length(medium) BETWEEN 1 AND 128);

    CREATE TABLE IF NOT EXISTS tracking_daily_traffic_sources (
      site_id TEXT NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
      day TEXT NOT NULL CHECK (length(day) = 10),
      source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 128),
      medium TEXT NOT NULL DEFAULT '',
      event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
      unique_visitors INTEGER NOT NULL DEFAULT 0 CHECK (unique_visitors >= 0),
      first_seen_at TEXT,
      last_seen_at TEXT,
      rolled_up_at TEXT NOT NULL,
      PRIMARY KEY (site_id, day, source, medium)
    );

    CREATE INDEX IF NOT EXISTS tracking_daily_traffic_sources_site_day_idx
      ON tracking_daily_traffic_sources(site_id, day DESC, source, medium);

    CREATE TRIGGER IF NOT EXISTS tracking_verification_evidence_deleted
    BEFORE DELETE ON tracking_events
    WHEN EXISTS (
      SELECT 1 FROM tracking_sites
      WHERE verification_event_id = OLD.id
    )
    BEGIN
      UPDATE tracking_sites
      SET verification_status = 'PENDING', verified_at = NULL,
          verification_event_id = NULL, verification_domain = NULL,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE verification_event_id = OLD.id;
    END;

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '10', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    -- Installation identity mirrors the upstream workspace website and its
    -- deliberately short, replaceable company profile. It is plugin-local
    -- because BB 0.39 exposes settings reads but no server-side settings write.
    CREATE TABLE IF NOT EXISTS workspace_identity (
      id TEXT PRIMARY KEY NOT NULL CHECK (id = 'workspace'),
      website TEXT NOT NULL,
      narrative TEXT CHECK (
        narrative IS NULL OR length(trim(narrative)) BETWEEN 40 AND 320
      ),
      sells TEXT CHECK (sells IS NULL OR length(sells) <= 140),
      sells_to TEXT CHECK (sells_to IS NULL OR length(sells_to) <= 140),
      edge TEXT CHECK (edge IS NULL OR length(edge) <= 140),
      source_url TEXT,
      refreshed_at TEXT NOT NULL
    );

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '11', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
  `
    CREATE TABLE IF NOT EXISTS email_threads (
      id TEXT PRIMARY KEY NOT NULL,
      root_message_id TEXT NOT NULL UNIQUE,
      subject TEXT,
      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      first_message_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS email_messages (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('GOOGLE', 'MICROSOFT')),
      provider_message_id TEXT NOT NULL,
      provider_thread_id TEXT,
      rfc_message_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
      from_email TEXT NOT NULL COLLATE NOCASE,
      from_name TEXT,
      recipients TEXT NOT NULL CHECK (json_valid(recipients)),
      subject TEXT,
      snippet TEXT,
      body TEXT,
      sent_at TEXT NOT NULL,
      web_link TEXT,
      mailbox_name TEXT,
      mailbox_url TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (provider, provider_message_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS email_messages_rfc_message_idx
      ON email_messages(rfc_message_id COLLATE NOCASE)
      WHERE rfc_message_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS email_messages_thread_sent_idx
      ON email_messages(thread_id, sent_at, id);
    CREATE INDEX IF NOT EXISTS email_messages_connection_idx
      ON email_messages(connection_id, sent_at, id);
    CREATE INDEX IF NOT EXISTS email_threads_company_last_idx
      ON email_threads(company_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS email_threads_contact_last_idx
      ON email_threads(contact_id, last_message_at DESC);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY NOT NULL,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('GOOGLE', 'MICROSOFT')),
      provider_event_id TEXT NOT NULL,
      ical_uid TEXT NOT NULL,
      original_start_time TEXT NOT NULL,
      recurring_event_id TEXT,
      title TEXT,
      description TEXT,
      location TEXT,
      conference_url TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      is_all_day INTEGER NOT NULL DEFAULT 0 CHECK (is_all_day IN (0, 1)),
      status TEXT NOT NULL,
      organizer_email TEXT COLLATE NOCASE,
      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (provider, provider_event_id),
      UNIQUE (ical_uid, original_start_time)
    );

    CREATE TABLE IF NOT EXISTS calendar_attendees (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE,
      name TEXT,
      response_status TEXT,
      is_organizer INTEGER NOT NULL DEFAULT 0 CHECK (is_organizer IN (0, 1)),
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      UNIQUE (event_id, email)
    );

    CREATE INDEX IF NOT EXISTS calendar_events_company_start_idx
      ON calendar_events(company_id, starts_at DESC);
    CREATE INDEX IF NOT EXISTS calendar_events_contact_start_idx
      ON calendar_events(contact_id, starts_at DESC);
    CREATE INDEX IF NOT EXISTS calendar_events_connection_idx
      ON calendar_events(connection_id, starts_at DESC);
    CREATE INDEX IF NOT EXISTS calendar_attendees_contact_idx
      ON calendar_attendees(contact_id, event_id);

    CREATE TABLE IF NOT EXISTS slack_channels (
      id TEXT PRIMARY KEY NOT NULL,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      slack_channel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
      is_member INTEGER NOT NULL DEFAULT 0 CHECK (is_member IN (0, 1)),
      member_count INTEGER CHECK (member_count IS NULL OR member_count >= 0),
      updated_at TEXT NOT NULL,
      UNIQUE (connection_id, slack_channel_id)
    );

    CREATE TABLE IF NOT EXISTS slack_member_matches (
      id TEXT PRIMARY KEY NOT NULL,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      slack_user_id TEXT,
      slack_handle TEXT,
      slack_email TEXT COLLATE NOCASE,
      matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0, 1)),
      updated_at TEXT NOT NULL,
      UNIQUE (connection_id, contact_id)
    );

    CREATE INDEX IF NOT EXISTS slack_channels_connection_name_idx
      ON slack_channels(connection_id, name);
    CREATE INDEX IF NOT EXISTS slack_member_matches_connection_match_idx
      ON slack_member_matches(connection_id, matched DESC, contact_id);

    CREATE TRIGGER IF NOT EXISTS activities_email_thread_insert_guard
    BEFORE INSERT ON activities
    WHEN NEW.email_thread_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM email_threads WHERE id = NEW.email_thread_id)
    BEGIN
      SELECT RAISE(ABORT, 'activity email thread does not exist');
    END;

    CREATE TRIGGER IF NOT EXISTS activities_email_thread_update_guard
    BEFORE UPDATE OF email_thread_id ON activities
    WHEN NEW.email_thread_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM email_threads WHERE id = NEW.email_thread_id)
    BEGIN
      SELECT RAISE(ABORT, 'activity email thread does not exist');
    END;

    CREATE TRIGGER IF NOT EXISTS activities_calendar_event_insert_guard
    BEFORE INSERT ON activities
    WHEN NEW.calendar_event_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM calendar_events WHERE id = NEW.calendar_event_id)
    BEGIN
      SELECT RAISE(ABORT, 'activity calendar event does not exist');
    END;

    CREATE TRIGGER IF NOT EXISTS activities_calendar_event_update_guard
    BEFORE UPDATE OF calendar_event_id ON activities
    WHEN NEW.calendar_event_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM calendar_events WHERE id = NEW.calendar_event_id)
    BEGIN
      SELECT RAISE(ABORT, 'activity calendar event does not exist');
    END;

    INSERT INTO crm_metadata (key, value, updated_at)
    VALUES ('schema_version', '12', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
  `,
];

export function initializeSchema(bb: BbPluginApi, db: PluginDatabase): void {
  db.pragma("foreign_keys = ON");
  bb.storage.migrate(db, CRM_SCHEMA_MIGRATIONS);
}
