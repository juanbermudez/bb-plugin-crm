# QA evidence

This log records checks that have actually run. Planned checks remain in the
port plan and marketplace draft and are not treated as passing evidence.

## Automated foundation and company slice

Verified on 2026-08-25 against BB `0.39.0` and plugin SDK `0.4.8`:

- `npm test`: 8 files and 26 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed and emitted server/app bundles and metadata.
- `git diff --check`: passed before the company-slice commit.
- Backend harness uses a real temporary SQLite database.
- Frontend harness covers plugin registration, RPC rendering, navigation,
  semantic table behavior, drawers, create, archive, and restore.

## Live BB browser smoke

Environment:

- packaged BB `0.39.0`
- isolated data directory under `.work/bb-test-data`
- plugin installed by local path and reloaded after build
- local application at `http://127.0.0.1:38886`

Observed:

- CRM plugin status was `running` with compatible app artifacts.
- Dashboard reported schema version `2` after the append-only core migration.
- Companies navigation opened the seven-column source-shaped table.
- The empty state opened the create drawer.
- Creating `Live QA Labs` with `liveqa.example` persisted and refreshed the table.
- Opening the row produced a URL-shaped deep link at
  `/plugins/crm/crm/companies/<company-id>`.
- The wide record drawer rendered Overview, Contacts, Deals, Activity, and Agent tabs.
- Archive moved the record into the archived list and exposed Restore.
- Restore returned the record to active state.
- Browser history returned the drawer to the company list sub-path on close.

Still required before release:

- light, dark, and custom-theme sweep across every completed view
- compact viewport and keyboard-only sweep
- Electron smoke
- contacts, deals, activity, agent, integration, and settings parity QA
- clean public-tag installation and marketplace validation
