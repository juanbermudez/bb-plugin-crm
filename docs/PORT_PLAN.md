# CRM for BB: feature-parity port plan

## Objective

Port the MIT-licensed `trycompai/crm` product into a standalone BB extension.
The extension must preserve the source product's working layouts and behavior.
It must use BB theme tokens, vendored BB registry components, plugin storage,
typed RPC, CLI commands, agent tools, and BB threads.

Source baselines:

- BB: `get-bb/bb` at `2cfd2b5df57daeed51ea544b54a8869bbec1c478`.
- CRM: `trycompai/crm` release branch at `6d4793dd6d7aeea91aa6a034e00b17d7408a2d08`.
- BB application: `>=0.39`.
- BB plugin SDK: `>=0.4.8`.

## Implementation status for the `0.1.0` release candidate

Phases 0–6 core records, responsive BB-native views, inline editing,
saved/dynamic columns, unified activity, enrichment, CRM-event/webhook
automation, leased due-task dispatch, clarification prompts, bounded BB
project attachments, agent definition/run lifecycle, and the BB-native
natural-language builder conversation surface are implemented. Public builder
sharing and unrelated global BB thread-panel/mention surfaces are not claimed.
Phase 7 is implemented for
privacy-safe tracking plus
integration health boundaries; provider OAuth and live Google, Microsoft, and
Slack sync require externally supplied provider/agent-tool credentials and
host authorization and are not bundled. Phase 8 is implemented except for
general API keys and per-user roles, which cannot be issued safely without a
public BB current-user/RBAC authority. Phase 9 has automated coverage and a
focused packaged-browser smoke; Electron, complete keyboard, and full
light/custom-theme passes remain open. Phase 10 is prepared through the public
repository and marketplace draft, while the immutable tag and marketplace PR
remain release-gated.

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
- List filters, sorting, columns, page, and saved views survive navigation.
- Small fades and shared layout transitions clarify route, tab, and drawer changes.
- Keyboard access covers global search, create, close drawer, and list movement.

## Host-owned substitutions

The extension keeps feature outcomes while removing standalone-app shell work
that BB already owns.

| Source CRM surface | BB extension equivalent |
| --- | --- |
| Landing page and sign-in | Marketplace detail, README, and BB plugin install flow |
| Standalone onboarding | First-open checklist and plugin settings status |
| App organization slug | One installed plugin database per BB installation |
| Better Auth sessions | BB's authenticated local application session; CRM scope uses an installation-local owner because the public SDK exposes no current-user identity API |
| Members and invitations | BB user/host context; CRM uses an installation-local owner and does not implement plugin RBAC because the public SDK exposes no current-user/RBAC API |
| SSO provider management | BB authentication settings; CRM stores no second identity system |
| Next.js routing | One BB `navPanel` with `subPath` routing |
| Nest tRPC | BB plugin `defineRpcContract` and `useRpc` |
| Postgres and Prisma | Plugin-owned SQLite with append-only migrations |
| Eve sessions | BB hidden and visible threads with CRM agent tools and skills |
| Vercel cron | `bb.background.schedule` and abort-aware services |
| Vercel Blob | Validated HTTPS source references for portraits; bounded BB project attachments for agent inputs |
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

- One `navPanel` named CRM owns `/plugins/crm/crm/*`.
- One settings section shows data, integration, and migration health.
- Record Agent tabs render plugin-spawned linked BB threads through host
  `ThreadChat`; the builder uses a scoped `ThreadChat` assistant-message action
  for explicit draft transfer, but no global BB thread-panel/message-action
  slot or mention provider is registered.
- Native agent tools expose CRM search/read/write, activity/task, custom-field,
  evidence, and enrichment operations.
- `bb crm` exposes status, doctor, list, show, create, update, archive, restore,
  add-activity, tasks, import, and export commands.
- Realtime `changed` signals invalidate affected frontend queries.

### Storage rules

- UUID-like text IDs keep record types recognizable.
- Foreign keys remain enabled.
- Soft archive fields preserve CRM restore and suppression behavior.
- Money stores decimal minor-unit integers plus currency and frozen base values.
- Custom field values use typed columns and strict boundary schemas.
- Every migration is append-only and transactionally recorded.
- Imports run inside bounded transactions and report row-level errors.
- Export uses versioned JSON and CSV formats.

## View inventory and port mapping

### CRM shell

- Compact CRM mark and inner navigation rail.
- Dashboard, companies, contacts, deals, agents, and settings destinations.
- Global search and quick switcher.
- Create menu for company, contact, deal, note, task, and agent.
- Responsive compact navigation.
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
- Saved views and column preferences.
- Standard and custom field columns.
- Bulk selection, owner change, archive, enrichment, and export.
- Create-company drawer.
- Company record drawer with details, contacts, deals, activity,
  website history, enrichment, fields, and Agent tab.
- Primary contact, owner, social links, source, and enrichment status.

### Contacts

- Searchable, sortable, paginated table.
- Saved views, facets, standard fields, custom fields, and bulk actions.
- Create-contact drawer.
- Contact record drawer with identity, company, owner, facts, brief,
  deals, activity, website history, enrichment, and Agent tab.
- Fact review supports applied, proposed, dismissed, and superseded states.
- Social lookup, image, work history, and scheduled recheck controls.

### Deals

- Searchable, sortable, paginated table.
- Stage, owner, company, contact, currency, close-date, and value facets.
- Saved views, custom fields, bulk stage/owner/archive/export actions.
- Create-deal drawer.
- Deal record drawer with amount, frozen base amount, stage stepper,
  contacts, company, owner, activity, closing window, and Agent tab.
- Eleven supported currencies and missing-rate disclosure.

### Shared record drawer

- Wide desktop drawer and compact bottom drawer.
- Stack navigation between linked company, contact, and deal records.
- Inline editable fields with optimistic updates and rollback.
- Activity composer for notes, calls, email, meetings, tasks, and stage changes.
- Timeline merges activities, email threads, meetings, enrichment, and web activity.
- Archive, restore, delete, copy link, and related-record actions.
- Agent conversation remains mounted while switching record tabs.

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

- General workspace name and reporting currency.
- Agent provider/model/reasoning settings and an optional live BB research-agent selector; provider credentials stay with that agent's tools.
- Archive retention policy.
- Connections overview with liveness and last-sync metadata.
- Planned Google mail/calendar connection and sync state; live sync requires
  external provider/agent-tool credentials and host authorization.
- Planned Microsoft mail/calendar connection and sync state; live sync requires
  external provider/agent-tool credentials and host authorization.
- Planned Slack authorization, scopes, channels, people matching, and
  disconnect; live sync requires external provider/agent-tool credentials and
  host authorization.
- Source-compatible unavailable intake state and connection instructions.
- Tracking site status, allowed domains, script, cookies, rules,
  traffic sources, operator domain confirmation, pause, and site-id rotation.
- General-purpose API keys are not issued because BB exposes no safe plugin
  current-user/RBAC authority boundary.
- Compatibility information for members and SSO that BB owns.

## Backend capability inventory

### Core records

- Company, contact, deal, deal-contact, activity, archive, and search services.
- Duplicate detection and suppression for email and company domains.
- Dashboard aggregates and closing-window calculations.
- Full-text-style normalized search across core records and activities.

### Dynamic fields

- Field definitions, options, values, table facets, validation, and export.
- Record writes parse one discriminated value schema at the RPC boundary.

### Currency

- Store source amount and source currency unchanged.
- Store frozen base amount, base currency, rate, source, and rate timestamp.
- Sum and sort only compatible base amounts.
- Support manual and fetched rates with manual precedence.
- Re-rate only through an explicit operation.

### Planned mail, calendar, and conversations

This is the source-compatible target, not a bundled live-sync implementation.
OAuth/device authorization and sync require externally supplied
provider/agent-tool credentials and host authorization.

- OAuth or device authorization uses secret plugin settings and local callbacks.
- Forward-only mailbox cursors prevent accidental historical bulk import.
- Normalize participants, threads, messages, attachments, meetings, and attendees.
- Match records without inventing identities.
- Missing integration configuration disables only that capability.

### Planned Slack integration

This is release-gated until external provider/agent-tool credentials and host
authorization are available; no live Slack sync is bundled.

- Store installation and workspace grants in secret settings or encrypted files.
- Sync channel and member catalogs.
- Match CRM users and Slack members by exact email with manual correction.
- Surface missing scopes and stale grants before agent actions run.

### Tracking

- Serve a small loader and per-site tracker through plugin HTTP routes.
- Validate origin, site ID, visitor ID, event shape, batch size, and rate.
- Remove query strings, sensitive fields, card-shaped values, files, and passwords.
- Keep form submissions aggregate-only unless a future first-party signed
  identity contract supplies an exact CRM filing target; never infer identity
  from anonymous visitor properties.
- Aggregate daily page views before bounded event retention.
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
- Build append-only migration runner and initial schema.
- Build route parser, shell, navigation rail, BB header actions, and error boundary.
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
- Implement company list query, search, sort, page, columns, saved view, and bulk selection.
- Implement create, edit, archive, restore, delete, enrich, and export.
- Implement wide company record drawer with related contacts, deals, and timeline.

Exit criteria:

- Users complete every source company workflow inside BB.
- Reload and deep-link navigation preserve list and record state.

### Phase 3: contacts and evidence

Tasks:

- Implement contact schema, store, contracts, RPC, CLI, and UI.
- Implement contact list, facets, saved views, bulk actions, and record drawer.
- Implement fact ledger, brief, suggestions, dismissal, supersession, and citations.
- Implement contact-to-company links, social links, work history, photos, and enrichment state.

Exit criteria:

- Identity updates remain evidence-backed and auditable.
- Ambiguous facts never overwrite a record automatically.

### Phase 4: deals, pipeline, and dashboard

Tasks:

- Implement deals, stages, deal contacts, activities, and closing-window logic.
- Implement currency rates, frozen conversion, unconverted disclosures, and re-rate controls.
- Implement deal list, bulk actions, create/edit drawer, and stage stepper.
- Implement dashboard aggregates, trends, stage charts, and recent work.

Exit criteria:

- Dashboard totals use only compatible frozen base amounts.
- Every source deal stage and activity appears in list and detail views.

### Phase 5: shared productivity surfaces

Tasks:

- Complete dynamic fields and custom table columns.
- Complete saved views and filter serialization.
- Complete unified timeline and activity composer.
- Complete global search and quick switcher.
- Complete CSV import/export and versioned JSON backup/restore.

Exit criteria:

- Companies, contacts, and deals share consistent field, view, and activity behavior.
- Data can leave and re-enter the plugin without information loss.

### Phase 6: CRM agents and builder

Tasks:

- Port CRM agent knowledge into `skills/crm/SKILL.md` and focused references.
- Register native CRM tools with strict schemas and auditable presentations.
- Implement task leasing, schedules, run state, actions, audit events, and cancellation.
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

- Implement Google and Microsoft authorization, forward sync, health, and
  disconnect only when external provider/agent-tool credentials and host
  authorization are available.
- Implement Slack authorization, scopes, channels, member matching, and
  delivery checks only when external provider/agent-tool credentials and host
  authorization are available.
- Preserve the source's unavailable intake state; do not issue an unused
  credential until a real, authenticated intake contract exists.
- Implement tracking loader, tracker config, event collector, filing, operator confirmation,
  daily aggregation, retention, pause, and site-id rotation.
- Add integration diagnostics to `bb crm doctor`.

Exit criteria:

- Integration pages lead with liveness and actionable failures.
- Tracking respects origin, privacy, limits, pause, and retention contracts.

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
