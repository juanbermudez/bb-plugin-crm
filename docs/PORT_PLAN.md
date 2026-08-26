# CRM for BB: feature-parity port plan

## Objective

Port the MIT-licensed `trycompai/crm` product into a standalone BB extension.
The extension must preserve the source product's working layouts and behavior.
It must use BB theme tokens, vendored BB registry components, plugin storage,
typed RPC, CLI commands, agent tools, and BB threads.

Source baselines:

- BB: `get-bb/bb` current-main audit at `7dc6756e20ba749ad9d4d6d939b1dd7de363250b`.
- CRM: `trycompai/crm` release branch at `6d4793dd6d7aeea91aa6a034e00b17d7408a2d08`.
- BB application: `>=0.39`.
- BB plugin SDK: `>=0.4.8`.

## Implementation status for the `0.1.0` release candidate

Phases 0–6 core records, responsive BB-native views, inline editing,
saved/dynamic columns, unified activity, enrichment, CRM-event/webhook
automation, leased due-task dispatch, clarification prompts, bounded BB
project attachments, agent definition/run lifecycle, and the BB-native
natural-language builder conversation surface are implemented. The current
append-only storage schema is version 12. The post-baseline audit closeout also
covers contextual facets and activity windows, relation-aware search and count
sorting, suppression/auto-company behavior, an aggregate enrichment queue,
source-shaped related-record payloads, primary-contact validation, tracking
cookies/rules/evidence/traffic visitor-days, global create routes, and favicon
URLs. Public builder sharing and unrelated global BB thread-panel/mention
surfaces are not claimed.

Phase 7 now includes privacy-safe tracking, normalized Gmail/Calendar and
Outlook mail storage, durable provider cursors, timeline detail, Slack
inventory/matching/channel actions, manual sync, and a bounded background
worker. Provider OAuth/device callbacks and refresh-token writes remain
host-owned, so operators provision access/bot/user tokens through BB secret
settings. Phase 8 is implemented except for general API keys and
per-user roles, which cannot be issued safely without a public BB
current-user/RBAC authority or identity directory. Phase 9 has automated
coverage plus packaged-browser checks across wide/compact layouts, default
dark, forced light, a custom Catppuccin palette, nested record workflows, and
focused keyboard paths. Electron and an exhaustive keyboard-only/source-flow
replay remain open. Phase 10 is prepared through the public repository and
marketplace draft, while the immutable tag and marketplace PR remain
release-gated.

## Product and interaction thesis

Visual thesis: a dense, quiet sales workspace with a wide table canvas,
strong row hierarchy, and contextual record drawers. BB supplies the surface,
type, color, radius, overlay, and motion tokens.

Content plan:

1. CRM navigation and global search.
2. Operational dashboard and pipeline status.
3. Table-first company, contact, and deal workspaces.
4. Record drawers with fields, activity, website history, and agent context.
5. Agent builder and run history.
6. Extension settings and integration health.

Interaction thesis:

- Opening a row preserves list context and reveals a wide record drawer.
- Company, contact, deal, and agent workspaces use one non-wrapping command row
  directly above the table. High-volume facets use a searchable BB popover;
  compact icon actions expose top tooltips, and Save current view sits directly
  beside the filter controls.
- List filters, sorting, columns, page, and saved views survive navigation.
- The Agents list stays table-first; its native BB builder composer appears
  only in a modal launched from the page actions.
- Small fades and shared layout transitions clarify route, tab, and drawer changes.
- Keyboard access covers global search, create, close drawer, and list movement.

## Host-owned substitutions

The extension keeps feature outcomes while removing standalone-app shell work
that BB already owns.

| Source CRM surface | BB extension equivalent |
| --- | --- |
| Landing page and sign-in | Marketplace detail, README, and BB plugin install flow |
| Standalone onboarding | First-open checklist modal, title-bar progress ring, and plugin settings status |
| App organization slug | One installed plugin database per BB installation |
| Better Auth sessions | BB's authenticated local application session; CRM scope uses an installation-local owner because the public SDK exposes no current-user identity API or plugin identity directory |
| Members and invitations | BB user/host context; CRM uses an installation-local owner, and owner facets/sorting use stable local owner IDs because the public SDK exposes no current-user/RBAC API or identity directory |
| SSO provider management | BB authentication settings; CRM stores no second identity system |
| Next.js routing | One BB `navPanel` route for CRM with tab/list/record state encoded in `subPath` |
| Nest tRPC | BB plugin `defineRpcContract` and `useRpc` |
| Postgres and Prisma | Plugin-owned SQLite with append-only migrations |
| Eve sessions | BB hidden and visible threads with CRM agent tools and skills |
| Vercel cron | `bb.background.schedule` and abort-aware services |
| Vercel Blob | Validated HTTPS source references for portraits and deterministic company favicon URLs; bounded BB project attachments for agent inputs |
| URL query state | Encoded BB panel `subPath` plus client preferences |
| Next.js record routes | Persistent, stack-aware BB responsive drawers |

These substitutions remove duplicate host responsibilities. They do not remove
CRM records, workflows, integrations, automation, or agent behavior.

## Extension architecture

### Runtime boundaries

- `server.ts` wires settings, storage, RPC, realtime, CLI, tools, skills,
  schedules, HTTP callbacks, and cleanup.
- `db/` owns migrations, prepared statements, transactions, and domain stores.
- `contracts/` owns Zod schemas shared by RPC inputs and outputs.
- `services/` owns currency conversion, search, enrichment, tracking, and
  agent orchestration; provider mailbox/calendar ingestion remains planned and
  credential-gated.
- `app.tsx` only registers BB frontend surfaces.
- `app/` owns routing, shell, query state, view data hooks, and dialogs.
- `views/` owns dashboard, table, record, agent, and settings UI.
- `components/ui/` contains vendored BB registry components.
- `skills/crm/SKILL.md` teaches BB agents how to use CRM tools and `bb crm`.

### BB surfaces

- One first-class `navPanel` registration exposes CRM in BB's main sidebar.
  BB SDK 0.4.x has no nested/grouped nav-panel contract, so Overview,
  Companies, Contacts, Deals, and Agents are BB-styled tabs at the top of the
  CRM panel and retain deep-link state through `subPath`.
- One BB `settingsSection` owns workspace, currency, field, connection, and
  tracking configuration; settings is not advertised in CRM navigation.
- BB's host-owned title bar mounts compact CRM search, enrichment, a modal
  onboarding checklist trigger with a progress ring, and a
  keyboard-accessible New menu for company, contact,
  deal, note, task, and agent creation. Notes and tasks first select an
  existing company, contact, or deal and then create the activity through the
  same typed RPC as record drawers.
- Record Agent tabs render plugin-spawned linked BB threads through host
  `ThreadChat`; the builder uses a scoped `ThreadChat` assistant-message action
  for explicit draft transfer, but no global BB thread-panel/message-action
  slot or mention provider is registered.
- Native agent tools expose CRM search/read/write, activity/task, custom-field,
  evidence, and enrichment operations.
- `bb crm` exposes status, doctor, list, show, create, update, archive, restore,
  purge, typed bulk operations, add-activity, tasks, import, and export commands.
- Realtime `changed` signals invalidate affected frontend queries.

### Storage rules

- UUID-like text IDs keep record types recognizable.
- Foreign keys remain enabled.
- `CRM_SCHEMA_VERSION` is 11. Migration 10 adds site-scoped cookie/rule
  controls, observed tracking verification evidence, event medium storage, and
  daily source/medium rollups; migration 11 adds installation website/profile
  identity. Durable due-task dispatch was introduced in migration 8.
  Later closeout migrations are appended without rewriting prior migrations.
- Soft archive fields preserve CRM restore and suppression behavior.
- Money stores decimal minor-unit integers plus currency and frozen base values.
- Custom field values use typed columns and strict boundary schemas.
- Every migration is append-only and transactionally recorded.
- Imports run inside bounded transactions and report row-level errors.
- Export uses versioned JSON and CSV formats.
- Related company records preserve archived contact/deal rows for detail views;
  company counts include all contacts and all non-closed deals, including
  archived relations. Primary contacts must exist and belong to the company.

## View inventory and port mapping

### CRM shell

- No plugin-owned navigation rail or duplicate CRM breadcrumb/header.
- One CRM destination lives in BB's sidebar; Overview, Companies, Contacts,
  Deals, and Agents are top tabs inside that panel. Settings lives under BB
  Settings → Plugins → CRM.
- Global search and quick switcher mount in BB's host-owned title bar.
- Keyboard-accessible global New menu for company, contact, deal, note, task,
  and agent. Record-attached notes/tasks use a global picker and the existing
  activity contract rather than inventing an unscoped activity.
- The host's right-panel toggle remains BB-owned and follows the New action in
  the title bar. The public SDK cannot suppress the host CRM logo/title or
  register nested sidebar children; the internal tabs are the supported
  adaptation.
- Loading, empty, disconnected, and migration-error states.

### Dashboard

- Greeting and working scope.
- Open-pipeline total in reporting currency.
- Won and lost totals.
- Stage counts and stage values.
- Activity trend.
- Closing-window list.
- Unconverted-currency disclosure.
- Recent records and outstanding agent work.

### Companies

- Searchable, sortable, paginated table.
- One non-wrapping toolbar above the table contains search, saved view,
  searchable facet popover, sort/direction, columns, archived scope,
  tooltip-backed save-view icon, and result count.
- Saved views and column preferences.
- Standard and custom field columns, with contextual facet counts and 7/30/90-day
  activity facets; custom-field facet keys are `field:<key>`.
- Bulk selection, owner change, archive, enrichment, and export.
- Create-company drawer.
- Company record drawer with details, contacts, deals, activity,
  website history, enrichment, fields, and Agent tab.
- Primary contact, owner, social links, source, enrichment status, and a
  deterministic `https://<normalized-domain>/favicon.ico` URL when a domain is
  present. Company contact/open-deal count sorting uses source relation-count
  semantics across active and archived relations; owner
  sorting uses stable local IDs.
- Related contacts include archived rows ordered by last name/first name; related
  deals include archived rows ordered by source stage then expected close date,
  with source and frozen base amounts in the payload. The primary-contact
  object is returned with the source contact fields and cannot point to another
  company.

### Contacts

- Searchable, sortable, paginated table.
- One compact toolbar above the table contains search, saved view, filter,
  sort/direction, columns, archived scope, save-view icon, and result count.
- Saved views, contextual facets, standard fields, custom fields, and bulk
  actions. Activity facets use 7/30/90-day recency windows and custom-field
  keys use `field:<key>`.
- Create-contact drawer.
- Contact record drawer with identity, company, owner, facts, brief,
  deals, activity, website history, enrichment, and Agent tab.
- Fact review supports applied, proposed, dismissed, and superseded states.
- Social lookup, image, work history, and scheduled recheck controls.
- A work email can reuse or create an active company for its non-free,
  non-machine-generated domain when no explicit company is supplied. Purging a
  contact records a normalized email suppression tombstone until an explicit
  contact creation clears it. Contact/deal search includes associated company
  name, and owner sorting remains local owner-ID sorting.

### Deals

- Searchable, sortable, paginated table.
- One compact toolbar above the table contains search, saved view, status,
  filter, sort/direction, columns, archived scope, save-view icon, and result count.
- Stage, owner, company, contact, currency, close-date, and value facets;
  deal search includes associated company name and custom-field facets use
  `field:<key>`.
- Saved views, custom fields, bulk stage/owner/archive/export actions.
- Create-deal drawer.
- Deal record drawer with amount, frozen base amount, stage stepper,
  contacts, company, owner, activity, closing window, and Agent tab.
- Eleven supported currencies, source/frozen `baseAmountCents`, missing-rate
  disclosure, source stage/expected-close ordering in company relations, and
  archived relation visibility.

### Shared record drawer

- Wide desktop drawer and compact bottom drawer.
- Stack navigation between linked company, contact, and deal records.
- Inline editable fields with optimistic updates and rollback.
- Activity composer for notes, calls, email, meetings, tasks, and stage changes.
- Timeline merges activities, email threads, meetings, enrichment, and web activity.
- Archive, restore, delete, copy link, and related-record actions.
- Agent conversation remains mounted while switching record tabs.
- Related-record counts and payloads follow the source archive behavior; the
  detail response includes the primary-contact object and explicit empty
  relation arrays when relations are requested.

### Custom fields and saved views

- Field definitions for company, contact, and deal.
- Text, long text, number, boolean, date, URL, email, phone, select, and user field types.
- Field options, archive, ordering, required state, and validation.
- Table column integration and record field editing.
- Saved filters, sort, columns, ownership, default view, rename, and delete.

### Agent workspace

- Agent definitions home, version editor, run history, and a natural-language
  builder conversation tab backed by visible plugin-spawned BUILDER threads and
  host `ThreadChat`.
- The list page does not mount a persistent composer. `Build with BB` opens the
  native builder composer in a responsive modal; successful draft creation
  closes it and opens the new agent's Conversation drawer.
- Draft, validation, ready, deployed, live, paused, archived, and deleted states.
- Agent capability summary and generated definition review.
- Trigger configuration for manual, schedule, event, and webhook runs.
- Run history drawer with queued, running, approval, success, failure,
  and cancellation states.
- Builder conversation history, explicit New/delete conversation actions, and
  assistant-message draft transfer are available; a linked BB thread can
  retain `sourceConversationId` when a new draft version is saved. Transcript
  output is copied into the editor only as an unsaved suggestion for explicit
  review.
- Public builder sharing is not claimed because the BB SDK exposes no public
  share relay; BB Connect or an external relay is required.
- Record Agent tab renders linked record threads through host `ThreadChat`; the
  host owns transcript and interaction details.
- BB threads replace Eve durability. CRM rows store thread links and summaries.

### Settings and connections

- All CRM configuration renders inside BB's plugin settings page instead of a
  CRM sidebar route; legacy CRM settings links show a move notice.
- BB-managed workspace name, plugin-local normalized company website and
  optional factual profile, and reporting currency.
- Agent provider/model/reasoning settings and an optional live BB research-agent selector; provider credentials stay with that agent's tools.
- Archive retention policy.
- Connections overview with liveness and last-sync metadata.
- Live Google Gmail/Calendar connection state, manual/background sync, bounded
  initial backfill, incremental cursors, and normalized activity projection.
- Live Microsoft Outlook mail connection state, manual/background sync,
  incremental cursor, and normalized activity projection.
- Live Slack channel/member inventory, exact-email contact matches, public or
  user-granted private joins, channel creation, and diagnostics.
- Source-compatible unavailable intake state and connection instructions.
- Tracking site status, allowed domains, script, cross-domain/cookie rules,
  privacy sanitization, observed-page-view verification evidence, traffic
  source/medium visitor-day reporting, retention, pause, token revoke, and
  site-id rotation. Anonymous traffic remains aggregate-only.
- General-purpose API keys are not issued because BB exposes no safe plugin
  current-user/RBAC authority boundary.
- Compatibility information for members and SSO that BB owns.

## Backend capability inventory

### Core records

- Company, contact, deal, deal-contact, activity, archive, and search services.
- Duplicate detection and suppression for email and company domains. Purged
  contact emails remain suppressed until an explicit recreation, while a
  contact work email can reuse or auto-create a company for an eligible domain.
- Dashboard aggregates and closing-window calculations.
- Full-text-style normalized search across core records and activities,
  including associated company names for contacts and deals.

### List context and relation semantics

- Facet counts are calculated in the current query and active/archived scope;
  selecting one facet does not collapse the counts of the other facets.
- Activity facets use the source-compatible 7, 30, and 90-day windows, taking
  the widest selected window. Typed custom-field facets are returned under
  `field:<key>`.
- Company contact and deal count sorts use SQL relation counts across active
  and archived relations, matching the source list semantics. Detail
  `openDealCount` remains the source-shaped open-pipeline count. Null-last
  ordering is explicit for nullable list and related-record fields.
- Company/contact/deal owner values are installation-local IDs. There is no BB
  identity directory, so owner sorting is ID-based rather than display-name
  based.

### Aggregate enrichment queue

- The shell queue projects persisted local agent runs, field backfills, due CRM
  tasks, and scheduled work into typed rows with record context, status, and
  links back to the relevant drawer.
- Queue status describes local persistence (`queued`, `running`, `failed`)
  and deliberately does not claim that an external provider delivered or
  verified a result.

### Dynamic fields

- Field definitions, options, values, table facets, validation, and export.
- Record writes parse one discriminated value schema at the RPC boundary.

### Currency

- Store source amount and source currency unchanged.
- Store frozen base amount, base currency, rate, source, and rate timestamp;
  refresh the snapshot when source amount/currency changes and preserve it for
  unrelated edits.
- Sum and sort only compatible base amounts.
- Support manual and fetched rates with manual precedence.
- Re-rate only through an explicit operation.

### Planned mail, calendar, and conversations

Live sync is bundled; OAuth/device authorization and refresh-token persistence
are not. They require operator-provisioned BB secret settings or a host relay.

- OAuth or device authorization uses secret plugin settings and local callbacks.
- Forward-only mailbox cursors prevent accidental historical bulk import.
- Normalize participants, threads, messages, attachments, meetings, and attendees.
- Match records without inventing identities.
- Missing integration configuration disables only that capability.

### Slack integration

The adapter, inventory, matching, and channel actions are bundled. A host-owned
OAuth relay or operator-provisioned BB secrets supply bot/user grants.

- Store installation grants only in BB secret settings.
- Sync and persist bounded channel and member catalogs.
- Match CRM contacts and Slack members by exact email; ambiguous duplicates stay unmatched.
- Surface provider failures through connection health and cursor diagnostics.

### Tracking

- Serve a small loader and per-site tracker through plugin HTTP routes.
- Site settings control cross-domain linking, domain limits, cookie scope,
  secure-cookie behavior, Do Not Track honoring, and bounded cookie lifetime.
- Validate origin, site ID, visitor ID, event shape, batch size, and rate.
- Reject query strings/fragments in page paths, attribution values, and URL-like
  properties; remove or reject sensitive fields, card-shaped values, files,
  and passwords.
- Keep form submissions aggregate-only unless a future first-party signed
  identity contract supplies an exact CRM filing target; never infer identity
  from anonymous visitor properties.
- Verification succeeds only when an allowed PAGE_VIEW is observed and stored;
  the evidence event/domain is retained, caller timestamps cannot manufacture
  success, and deleting evidence returns the site to pending.
- Aggregate daily page views and source/medium traffic before bounded event
  retention. Traffic reports expose event counts and the sum of per-day
  distinct visitors (`visitorDays`), not unique people across the whole range.
- Make pause and site-id rotation effective within the documented cache window.

### Agents

- Native tools cover CRM search, record history, facts, briefs, fields,
  company/contact research, social resolution, outstanding work, and rechecks.
- A background dispatcher leases due agent tasks and spawns hidden BB threads.
- Each hidden thread uses the CRM skill and exact record context.
- Completion writes an auditable result and stops the hidden thread.
- Ambiguous identity changes become proposals or blocking questions.
- The plugin never asks a model to assign its own confidence score.

## Phased delivery plan

### Phase 0: source lock and parity contract

Tasks:

- Record upstream commit hashes and licenses.
- Complete the route, component, API, schema, integration, and agent inventory.
- Create `docs/PARITY_MATRIX.md` with one row per source capability.
- Mark each row as direct port, BB-native substitution, adapted, or blocked.
- Define fixture data that exercises every stage, status, and empty state.

Exit criteria:

- Every source route and major drawer/dialog maps to an extension view.
- Every backend module maps to plugin storage, BB SDK, integration code, or host ownership.

### Phase 1: extension foundation

Tasks:

- Finalize manifest, icon, license, repository metadata, and engine ranges.
- Build append-only migration runner and initial schema; current migrations
  advance through schema 12 without rewriting earlier versions.
- Build route parser, first-class BB panels, BB title-bar actions, and error boundary.
- Add shared query cache, realtime invalidation, and mutation error handling.
- Vendor required BB table, drawer, tabs, select, menu, badge, skeleton,
  tooltip, popover, textarea, switch, and command components.
- Add backend and frontend test harnesses.
- Add CI for typecheck, tests, plugin build, and clean generated artifacts.

Exit criteria:

- `npm run typecheck`, `npm test`, and `npm run build` pass.
- A path install opens the CRM nav panel in BB.
- Light, dark, and custom BB themes remain legible.

### Phase 2: companies vertical slice

Tasks:

- Implement company schema, store, contracts, RPC, CLI, and realtime events.
- Implement company list query, search, sort, page, columns, saved view, and bulk selection,
  including contextual activity/custom facets and relation count sorting.
- Implement create, edit, archive, restore, delete, enrich, and export.
- Implement wide company record drawer with source-shaped related contacts/deals,
  archived relation visibility, primary-contact invariant, favicon URL, and timeline.

Exit criteria:

- Users complete every source company workflow inside BB.
- Reload and deep-link navigation preserve list and record state.

### Phase 3: contacts and evidence

Tasks:

- Implement contact schema, store, contracts, RPC, CLI, and UI.
- Implement contact list, associated-company search, contextual facets, saved
  views, bulk actions, and record drawer.
- Implement fact ledger, brief, suggestions, dismissal, supersession, and citations.
- Implement contact-to-company links, eligible-domain auto-company creation,
  purge suppression tombstones, social links, work history, photos, and
  enrichment state.

Exit criteria:

- Identity updates remain evidence-backed and auditable.
- Ambiguous facts never overwrite a record automatically.

### Phase 4: deals, pipeline, and dashboard

Tasks:

- Implement deals, stages, deal contacts, activities, associated-company search,
  source relation ordering, and closing-window logic.
- Implement currency rates, frozen conversion, unconverted disclosures, and re-rate controls.
- Implement deal list, bulk actions, create/edit drawer, and stage stepper.
- Implement dashboard aggregates, trends, stage charts, and recent work.

Exit criteria:

- Dashboard totals use only compatible frozen base amounts.
- Every source deal stage and activity appears in list and detail views.

### Phase 5: shared productivity surfaces

Tasks:

- Complete dynamic fields and custom table columns.
- Complete saved views and filter serialization, including `field:<key>` facet
  keys and contextual counts.
- Complete unified timeline and activity composer, including global record-
  attached note/task creation from the CRM header.
- Complete global search and quick switcher.
- Complete CSV and versioned JSON record interchange for the supported company,
  contact, and deal columns. Do not describe this narrow format as a lossless
  database backup or restore.

Exit criteria:

- Companies, contacts, and deals share consistent field, view, and activity behavior.
- Data can leave and re-enter the plugin without information loss.

### Phase 6: CRM agents and builder

Tasks:

- Port CRM agent knowledge into `skills/crm/SKILL.md` and focused references.
- Register native CRM tools with strict schemas and auditable presentations.
- Implement task leasing, schedules, run state, actions, audit events, and cancellation.
- Surface persisted agent/field-backfill/task work in the aggregate shell
  enrichment queue without claiming provider completion.
- Implement record Agent tab using linked BB threads.
- Implement agent definitions, versions, triggers, approvals, run history,
  deletion lifecycle, and natural-language builder chat. Keep public sharing
  as an explicit BB/external integration gap.
- Stop and archive hidden worker threads after every terminal outcome.

Exit criteria:

- Agents operate the same records users operate.
- Every automatic write has an audit event and visible source.
- A missing optional integration never crashes the dispatcher.

### Phase 7: connections and tracking

Tasks:

- Implement bounded Google Gmail/Calendar and Microsoft Outlook mail sync,
  normalized storage, health, cursors, manual controls, and background refresh.
- Implement Slack scopes, inventory, exact-email member matching, join/create
  actions, and diagnostics using operator-provisioned BB secrets.
- Preserve the source's unavailable intake state; do not issue an unused
  credential until a real, authenticated intake contract exists.
- Implement tracking loader, tracker config, cookie/cross-domain rules, privacy
  sanitizer, observed-page-view verification evidence, event collector, filing,
  daily source/medium aggregation with visitor-days, retention, pause, and
  site-id/token rotation.
- Add integration diagnostics to `bb crm doctor`.

Exit criteria:

- Integration pages lead with liveness and actionable failures.
- Tracking respects origin, privacy, cookie/rule limits, observed verification,
  pause, retention, and aggregate-only identity boundaries.

### Phase 8: administration and hardening

Tasks:

- Implement reporting currency, retention, model, and research-agent settings;
  keep general-purpose API keys blocked until BB exposes a safe current-user/RBAC authority.
- Add BB-owned members/SSO compatibility information.
- Add database integrity check, repair guidance, backup, and migration status.
- Add rate limits, bounded pagination, abort handling, and structured logs.
- Audit secrets, public HTTP routes, external requests, SVG assets, and file paths.

Exit criteria:

- Plugin settings contain no secret values in frontend RPC output.
- Public routes validate their own signature or token.
- Large datasets remain paginated and responsive.

### Phase 9: live parity QA

Tasks:

- Run backend and frontend unit suites.
- Run typecheck and production plugin build.
- Install by local path into BB.
- Test Electron and browser clients.
- Test wide, narrow, compact, light, dark, and custom palette layouts.
- Test drawer focus, keyboard access, overlay stacking, and navigation history.
- Test reload during a running agent and during an integration sync.
- Test fresh install, upgrade, export/import, disable, enable, and uninstall recovery.
- Record remaining parity gaps in the matrix; do not close release while known
  public-sharing, provider-sync, or unsupported host-surface gaps remain.

Exit criteria:

- All critical and high parity rows pass.
- No console errors, failed plugin handlers, or build warnings remain.

### Phase 10: release and marketplace package

Tasks:

- Complete install, configuration, data, permissions, security, and troubleshooting docs.
- Create clean public release commit.
- Prepare immutable `v0.1.0` tag after explicit release approval.
- Validate Git installation from the public tag.
- Prepare marketplace icon, entry JSON, checks, and PR body.
- Prepare a draft marketplace PR against `get-bb/marketplace:main`.

Exit criteria:

- A new user installs the extension from the Git URL and completes first-run setup.
- Marketplace metadata points to the verified public release.

## Post-baseline audit closeout

The following implementation slices were added or verified after the locked
source comparison. They are part of the current parity target; they are not
future work hidden behind the phase headings above.

- Schema 10 is an append-only tracking migration: site cookie/cross-domain
  rules, domain limits, observed verification evidence, event medium, and
  daily source/medium rollups are persisted for existing installs.
- Schema 11 adds the normalized installation website and optional factual
  workspace profile used by the source workspace settings flow.
- Company, contact, and deal list queries now use contextual facet counts
  (current search plus active/archived scope), 7/30/90-day activity windows,
  and `field:<key>` custom-field keys. Contacts and deals search associated
  company names; company contact/open-deal count sorting and null-last list and
  related-record ordering are deterministic. Initial company/contact lists use
  `createdAt DESC`, and deals open with source status `all`.
- Contact purge suppression and eligible work-email auto-company resolution are
  persisted in SQLite. Explicit contact recreation clears the suppression
  tombstone; free-mail and machine-generated domains do not create companies.
- The shell enrichment queue aggregates persisted agent runs, field backfills,
  due tasks, and scheduled work with record context and local-status wording.
- Company detail returns a source-shaped primary-contact object, archived
  related contacts/deals, source stage/expected-close ordering, and frozen
  `baseAmountCents`; primary contacts are required to exist and belong to the
  company. Company domains yield deterministic HTTPS favicon URLs unless an
  explicit icon URL has been supplied.
- Tracking settings and collector behavior include cookie controls,
  cross-domain/domain rules, privacy rejection/sanitization, evidence-backed
  verification, and aggregate traffic source/medium reporting as visitor-days.
  Anonymous visitors are never heuristically attached to CRM records.
- The CRM header's global New menu routes company/contact/deal/agent creation
  and record-attached note/task creation through the typed views and RPCs.
- Source-named agent workflows cover pipeline pagination, outstanding
  research, field administration/manual-only enforcement, local CRM history,
  stored work history, job-change notes, and durable rechecks. Connected
  mailbox/calendar bodies remain an explicit provider boundary.

Implementation anchors for this closeout are `db/schema.ts`, `db/types.ts`,
`db/companies.ts`, `db/contacts.ts`, `db/connections.ts`,
`db/enrichment-queue.ts`, `server.ts`, `app/shell.tsx`,
`app/components/enrichment-queue.tsx`, and the corresponding focused tests in
`db/`, `server.test.ts`, `app/app.test.tsx`, and `app/components/`.

## Remaining true boundaries

These are deliberate limits or release gates, not stale parity omissions:

| Boundary | Current behavior and fallback |
| --- | --- |
| BB current-user identity, identity directory, and plugin RBAC | CRM uses an installation-local owner. Owner facets and sorting use stable owner IDs, not display-name order. Per-user roles, authorization, and general-purpose API keys are not exposed. |
| Google/Microsoft/Slack authorization | Live sync and actions use BB server-only secret settings. OAuth/device callbacks, refresh-token exchange, and programmatic secret writes require a host relay or operator rotation because the public plugin SDK is read-only for settings. |
| Email/meeting relationship details | Implemented for normalized provider data; availability is gated only by configured provider credentials. |
| Anonymous Website Activity attribution | Tracking stores privacy-filtered site/path/source/medium aggregates and visitor-days only. No anonymous visitor is attributed to a company/contact/deal without a verified first-party identity contract. |
| Plugin blob storage | Portraits and favicons remain validated HTTPS source URLs; arbitrary remote bytes are not fetched or mirrored into plugin storage. |
| Public builder sharing and unrelated global BB thread surfaces | Linked plugin-spawned threads and host `ThreadChat` are supported. Public share relay, global thread-panel/message-action slots, and mention providers require BB Connect, an external relay, or future BB APIs. |
| Thread cancellation lifecycle | The plugin requests cancellation and records the run; a BB thread reported as `stopping` may remain pending until BB emits an unambiguous terminal state. |
| Webhook producer | The trigger-scoped HMAC/replay boundary is implemented, but an external producer is required; the plugin does not invent one. |
| Host-visible task and assignee semantics | Due-task dispatch is opt-in and CRM-local; it leases timeline TASK rows for one configured live agent and does not create a host-visible BB Task or infer an activity author as assignee. |
| Agent attachment scope | Attachments are bounded bytes resolved through BB project-relative paths; arbitrary filesystem paths, traversal, oversized payloads, and unscoped projects are rejected. |
| Linking pre-existing BB threads | Plugin records link atomically to threads the plugin spawns; the SDK does not expose a callback for attaching an arbitrary user-composed thread. |
| Release-client QA and distribution | Automated coverage and packaged-browser checks cover wide/compact layouts, dark/light/custom palettes, nested record workflows, and focused keyboard paths. Electron, exhaustive keyboard/source-flow replay, immutable release tag, and marketplace PR remain release-gated. |

## Commit and push slices

Each slice contains implementation, focused tests, documentation, and a build.
Push after the slice passes its checks.

1. Scaffold and architecture.
2. Storage and contracts.
3. Shell and navigation.
4. Companies.
5. Contacts.
6. Evidence and enrichment.
7. Deals and currency.
8. Dashboard.
9. Fields, views, and timeline.
10. Agent tools and skill.
11. Agent builder and dispatcher.
12. Mail and calendar.
13. Slack.
14. Tracking and source-compatible unavailable intake state.
15. Settings, API keys, backup, and diagnostics.
16. Live QA fixes.
17. Release and marketplace draft.

## Verification gates

Every slice runs:

```text
npm run typecheck
npm test
npm run build
git diff --check
```

Risk-sensitive slices also run targeted live BB checks. Release preparation
also validates install from the public Git source and the marketplace schema.
