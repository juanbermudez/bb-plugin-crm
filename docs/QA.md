# QA evidence

This log records checks that have actually run. Planned checks remain in the
port plan and marketplace draft and are not treated as passing evidence.

## Automated foundation through agent persistence

Verified on 2026-08-25 against BB `0.39.0` and plugin SDK `0.4.8` at clean
pushed revision `8a1665b`:

- `npm test -- --run`: 22 files and 102 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed and emitted server/app bundles and metadata.
- Backend and agent-persistence harnesses use real temporary SQLite databases.
- Frontend harness covers plugin registration, RPC rendering, navigation,
  dashboard scope and summary, company/contact/deal tables and drawers,
  relationships, activity timeline/composer/task lifecycle, saved-view bar,
  custom-field settings/editor, and currency settings.
- Currency coverage uses real SQLite for manual/fetched precedence, audit
  history, exact minor-unit rounding, frozen deal money, and explicit re-rate
  behavior.
- Agent-persistence coverage verifies schema migration v5 plus definition and
  version state, triggers, runs, approvals, actions, thread links, audit rows,
  and terminal lifecycle guards.

## Live BB browser smoke

Environment:

- packaged BB `0.39.0`
- isolated data directory under `.work/bb-test-data`
- plugin installed by local path and reloaded after build
- local application at `http://127.0.0.1:38886`
- captured live database is schema version `4`; agent lifecycle schema version
  `5` is covered by the clean automated run above, not by this browser smoke

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
- Currency settings rendered the reporting basis, effective-rate table,
  explicit re-rate action, and audit ledger in the live BB panel.
- Adding a manual USD/EUR rate of `1.17` with provider `Live QA treasury`
  persisted, became the effective override, and immediately produced a matching
  append-only audit row.
- The company activity composer/timeline recorded a `Live activity note` on
  `Live QA Labs` with body `Verified in packaged BB after plugin reload.`.
- It also recorded a `Review live QA` task for that company; the stored task row
  has a completion timestamp, covering the create/complete path in the captured
  live plugin data.
- The Companies saved-view control created `Live accounts` with query `Live`,
  ascending name sort, active-only state, and persisted it as the COMPANY
  default in plugin metadata.

Still required before release:

- light, dark, and custom-theme sweep across every completed view
- compact viewport and keyboard-only sweep
- dynamic list-control parity sweep (sort/direction, standard/custom facets,
  columns, selection, and bulk actions); implementation remains `building`
- Electron smoke
- activity, agent, integration, and remaining settings parity QA beyond the
  timeline, saved-view, currency-setting, and automated agent-persistence
  coverage above
- clean public-tag installation and marketplace validation
