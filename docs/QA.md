# QA evidence

This log records checks that have actually run. Planned checks remain in the
port plan and marketplace draft and are not treated as passing evidence.

## Clean local gate

Verified on 2026-08-25 at main revision `1bd16e2` (the source tree was clean
before this documentation-only update), against BB `0.39.0` and plugin SDK
`0.4.8`:

- `npm test -- --run`: 29 test files and 146 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed and emitted the server/app bundles and metadata.
- `git diff --check`: passed.

The build metadata reports plugin id `crm`, plugin version `0.1.0`, SDK
`0.4.8`, and BB `0.39.0`. The automated suites use real temporary SQLite
databases for migrations and persistence. They cover:

- BB app registration, routing, dashboard Me/Everyone scope, core record
  tables/drawers, relationships, list sorting/pagination, standard and custom
  facets, row selection/bulk actions, saved views/defaults, activity timeline
  and task lifecycle, custom fields, currency settings, agent workspace,
  connections, and tracking settings.
- Strict RPC contracts, core CRUD/archive/restore/purge, contact evidence and
  briefs, frozen currency conversion and audit history, versioned JSON/CSV
  import/export, connection health, privacy-safe tracking ingestion/rollups,
  agent definitions/triggers/runs/actions/audit rows, and dispatcher thread
  lifecycle.
- Agent dispatcher behavior for one queued claim, hidden BB-thread linking,
  reload reconciliation, stale unlinked-claim recovery with lease fencing,
  terminal lifecycle signals, best-effort cleanup, and the `stopping`-thread
  pending case.
- Validated-only agent deployment, persistent disabling of invalid schedules,
  exports beyond 1,000 rows, and rejection of email- and payment-card-shaped
  tracking property values.

## Packaged BB reload smoke

The freshly built package was installed and reloaded in packaged BB `0.39.0`.
The plugin reported `running`; the reload exposed 83 registered handlers, and
the `crm-agent-dispatcher` background service was running. No secret, one-time
credential, or token value is recorded here.

Observed in the live CRM panel:

- Dashboard loaded in both `Me` and `Everyone` scope and refreshed the summary
  for the selected scope.
- A saved company view was created, selected, marked as the default, and
  restored from the persisted default state.
- Companies exposed the advanced controls used in the smoke: sorting and
  direction, standard and custom facets, row selection, and the selection
  action bar.
- The Agents route created an agent and opened its deep-linked detail drawer.
- Connections opened with the provider cards and empty-state copy; no provider
  credentials or authorization were assumed.
- Tracking opened with the `No tracking sites configured` empty state.
- Tracking site setup accepted an allowed domain and retention settings. A
  site-scoped one-time credential was provisioned and displayed only at
  creation; later token listing exposed metadata/hints without re-displaying
  the secret.
- `bb crm status --json`, `bb crm doctor --json`, and
  `bb crm list company --json` returned valid CLI responses with expected
  success/health/list behavior. CLI output did not include plugin secrets.
- A 390×844 compact dark-theme pass kept navigation, actions, saved views,
  search, sort controls, and the company table usable without catastrophic
  overflow. Wide tables retain intentional horizontal scrolling.

## Release-gated or not run

The following are not claimed as passing evidence in this log:

- full light/custom-theme, keyboard-only, and every remaining source-workflow
  sweep; compact dark-theme is covered only by the focused smoke above;
- Electron-specific smoke (no Electron QA was run for this update);
- production release tag creation, public-tag installation, or marketplace
  validation/submission.

The public SDK limitations are part of the parity record: BB provides no
current-user/RBAC API or plugin blob API; real OAuth credentials and provider
authorization are not bundled; an external producer is required for event and
webhook triggers; a thread reported as `stopping` can remain pending because
BB exposes no public cancellation lifecycle; and no public share relay is
included. See [docs/PARITY_MATRIX.md](PARITY_MATRIX.md) for the chosen
fallbacks and remaining gaps.
