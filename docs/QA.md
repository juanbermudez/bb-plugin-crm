# QA evidence

This log records checks that have actually run. Planned checks remain in the
port plan and marketplace draft and are not treated as passing evidence.

## Automated foundation through deals and currency

Verified on 2026-08-25 against BB `0.39.0` and plugin SDK `0.4.8`:

- `npm test`: 12 files and 44 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed and emitted server/app bundles and metadata.
- `git diff --check`: passed before the company-slice commit.
- Backend harness uses a real temporary SQLite database.
- Frontend harness covers plugin registration, RPC rendering, navigation,
  company/contact/deal tables, drawers, creation, stage changes, archive, and
  restore.
- Currency coverage uses real SQLite for manual/fetched precedence, audit
  history, exact minor-unit rounding, frozen deal money, and explicit re-rate
  behavior.

## Live BB browser smoke

Environment:

- packaged BB `0.39.0`
- isolated data directory under `.work/bb-test-data`
- plugin installed by local path and reloaded after build
- local application at `http://127.0.0.1:38886`

Observed:

- CRM plugin status was `running` with compatible app artifacts.
- Dashboard reported schema version `4` after the append-only currency migration.
- Companies navigation opened the seven-column source-shaped table.
- The empty state opened the create drawer.
- Creating `Live QA Labs` with `liveqa.example` persisted and refreshed the table.
- Opening the row produced a URL-shaped deep link at
  `/plugins/crm/crm/companies/<company-id>`.
- The wide record drawer rendered Overview, Contacts, Deals, Activity, and Agent tabs.
- Archive moved the record into the archived list and exposed Restore.
- Restore returned the record to active state.
- Browser history returned the drawer to the company list sub-path on close.
- Contacts navigation opened its seven-column table and accessible empty state.
- Creating `Ada Lovelace` with a normalized email and title persisted and refreshed the table.
- Opening the contact produced `/plugins/crm/crm/contacts/<contact-id>` and rendered
  the source Overview, Deals, Activity, and Agent tabs.
- Deals navigation opened its seven-column table and Open/Closed/All controls.
- Creating `Live QA Expansion` for `Live QA Labs` persisted a USD 125,000
  minor-unit source amount and displayed a frozen USD 1,250.00 pipeline total.
- Opening the deal produced `/plugins/crm/crm/deals/<deal-id>` and rendered the
  Overview, Contacts, Activity, and Agent tabs, stage control, source money,
  frozen base money, and archive action.

Still required before release:

- light, dark, and custom-theme sweep across every completed view
- compact viewport and keyboard-only sweep
- Electron smoke
- activity, agent, integration, and settings parity QA
- clean public-tag installation and marketplace validation
