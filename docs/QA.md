# QA evidence

This log records checks that have actually run. Planned checks remain in the
port plan and marketplace draft and are not treated as passing evidence.

## Current integrated release-candidate checks

Verified on 2026-08-26 against the integrated release-candidate working tree,
with CRM schema version 10, BB `0.39.0`, and plugin SDK `0.4.8`. These
checks are local working-tree evidence; they do not claim a public release,
tag, or marketplace submission.

- `npm test`: 50 test files and 257 tests passed.
- `npm run typecheck`: passed.
- `./node_modules/.bin/bb plugin types --check .`: passed.
- `npm run build`: passed and emitted identity-checked server/app bundles and
  metadata.
- `git diff --check`: passed.
- Release-boundary audit passed for the manifest, runtime dependencies, SDK
  imports, generated metadata, package contents, icon, migrations, security
  boundaries, and checked-in release claims. Public-tag installation and
  marketplace validation remain release-gated.
- A final managed-install rehearsal exposed that the published BB `0.39.0`
  builder does not provide the newer `class-variance-authority`, `clsx`, and
  `tailwind-merge` host shims. A local compatibility package now supplies
  exact pins to the older managed builder, while current BB keeps the imports
  type-only and externalizes them to its host runtime. The corrected public
  release-candidate commit then completed the managed Git-install and browser
  smoke below.
- BB `0.40.0` main's type-sync surface was audited at commit `7dc6756e`; its
  advertised SDK `0.4.22` was not yet available from npm, so this release
  remains pinned to the latest published `0.4.8` declarations while carrying
  the 0.40 host-shim declarations as dev-only forward compatibility.

The build metadata reports plugin id `crm`, plugin version `0.1.0`, SDK
`0.4.8`, and BB `0.39.0`. The automated suites use real temporary SQLite
databases for migrations and persistence. They cover:

- BB app registration, routing, dashboard Me (the installation-local owner)/Everyone scope, core record
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
  tracking property, source, and medium values.
- Persisted onboarding/columns, cross-record search, nested company relations,
  record-linked Agent tabs, evidence decisions/brief history, run retry/cancel,
  approval resolution, agent execution settings, fixed tracking HTTP routes,
  and dependency-safe archive retention.
- Provider-gated company/contact enrichment and bulk enrichment, focused
  company/contact research, sourced evidence/finalization, fetched-rate
  ingestion, stage/enrichment timeline rows, sticky day headers, and automatic
  cursor pagination with an explicit fallback.
- Transactional company/contact/deal event outbox delivery, event-trigger run
  idempotency, trigger-scoped webhook credential hashing/rotation, exact-body
  HMAC verification, replay-window checks, and webhook run deduplication.
- Optimistic company/contact/deal inline edits with rollback, bounded
  custom-field fill-rest queues, contact portrait URL validation/fallback,
  native clarification rendering, bounded BB project attachments, and
  provider-native clarification capability gating.
- Due-task lease fencing, retry bounds, deterministic run idempotency, explicit
  live-agent selection, strict `CRM_DUE_TASK` snapshots, completion/reopen
  tooling, global activity creation, the shell enrichment queue, the rule that
  activity authors are never inferred as assignees, and persisted schema-9 to
  schema-10 migration upgrades.

## Final release-candidate managed Git-install / packaged-BB smoke

A managed Git install and packaged-BB `0.39.0` smoke was run from the corrected
exact public release-candidate commit after the integrated parity work. The
exact SHA and package measurements are kept in the release/marketplace PR body
rather than this packaged evidence file. A public `v0.1.0` tag install remains
approval-gated and must still be checked after the tag is created. No secret,
one-time credential, or token value is recorded here.

The final release-candidate smoke loaded the plugin successfully; both
`crm-agent-dispatcher` and `crm-archive-retention` background services were
running, schema version 10 matched, SQLite integrity was `ok`, no foreign-key
violations were found, the managed source resolved to the requested public
commit, and the browser console reported zero errors.

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
- The refreshed packaged panel rendered the persisted onboarding checklist,
  CRM header actions, cross-record search results, accessible column controls,
  and the company record Agent tab. With no deployed live agent, the tab
  correctly disabled thread creation and explained the empty state.
- In the pre-final reload, the company drawer rendered the provider-backed
  enrichment/research controls and the deal drawer rendered all seven stages
  as an accessible stepper with the persisted current stage selected.
- The Contacts table rendered a BB-tokenized portrait with initials fallback;
  the contact drawer repeated that portrait and exposed inline HTTPS Photo URL
  editing.
- The public fixed tracking loader returned JavaScript with `PAGE_VIEW` and
  `crmTrack`, cross-origin resource policy, and no site-token-shaped value.
- At a 1280×720 browser viewport, a company drawer stayed within the viewport
  at 896×720; its tab strip remained on-screen.
- Switching the company drawer from Overview to Contacts updated the BB URL to
  `/companies/<id>/contacts`; a full browser reload retained both that URL and
  the selected tab. Browser console error output was empty.
- `Cmd/Ctrl+Shift+K` focused CRM search without taking BB's reserved plain
  `Cmd/Ctrl+K` thread-search shortcut. Searching `Live` returned one company,
  contact, and deal; ArrowDown + Enter opened the contact drawer through its
  deep link.
- The relationship entity picker exposed only real records and supported
  ArrowDown + Enter. The live test linked the existing contact to the existing
  company and the table/drawer refreshed to the persisted relationship.
- The live Agents drawer exposed Overview, Conversation, Versions, Triggers,
  Run history, and Audit. Conversation deep-linked and reloaded correctly.
  Starting a builder conversation reached BB's real visible-thread spawn path
  and failed closed with HTTP 503 because this disposable host could not
  resolve the Codex default model; no builder link or phantom conversation was
  persisted. The server tests separately cover successful spawn/link,
  idempotent reopen, explicit new conversation, deletion ordering, permission
  mode, and version ownership.
- The deal table opened its BB-styled inline stage menu with all seven source
  stages. Choosing Closed lost opened a required-reason dialog with Save stage
  disabled until a reason is entered; the smoke cancelled without changing the
  record.
- Saved-view and currency removal actions opened BB AlertDialogs and were
  cancelled, proving the browser-native confirmation replacements without
  deleting live-smoke data.
- The final corrected-commit smoke also opened the New menu and verified all
  six creation actions (company, contact, deal, note, task, and agent), opened
  the enrichment queue empty state, exercised Escape dismissal, and loaded
  Settings/Tracking at its deep link.

## Release-gated or not run

The following are not claimed as passing evidence in this log:

- full light/custom-theme and every remaining source-workflow sweep; compact
  dark-theme and focused keyboard paths are covered by the smokes above, but a
  complete keyboard-only audit was not run;
- Electron-specific smoke (no Electron QA was run for this update);
- final production release tag creation, public-tag installation, or
  marketplace submission. No final tag, marketplace check, or PR is claimed.
- Marketplace draft schema/build-contract audit is documented in
  [docs/MARKETPLACE_DRAFT.md](MARKETPLACE_DRAFT.md). A temporary concrete
  `entries/crm.json` plus icon passed `npm ci` and `npm run build` against the
  audited marketplace checkout (83 entries); `npm run check` stopped only at
  the expected Git-liveness failure because no approved `v0.1.0` tag exists.

The public SDK limitations are part of the parity record: BB provides no
current-user/RBAC API or plugin blob API; provider OAuth and live
mail/calendar/Slack sync require external provider/agent-tool credentials and
host authorization and are not bundled; the source's intake route is explicitly
unavailable; tracking ingestion requires operator-confirmed site authority; an
external producer is required for webhook triggers; a thread reported as
`stopping` can remain pending because BB exposes no public cancellation
lifecycle; natural-language builder chat is implemented with visible BB
threads, history, explicit new/delete, and reviewed message-to-draft transfer;
no public share relay is included. See
[docs/PARITY_MATRIX.md](PARITY_MATRIX.md) for the chosen fallbacks and
remaining gaps.
