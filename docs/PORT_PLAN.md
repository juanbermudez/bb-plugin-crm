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
| Better Auth sessions | BB's authenticated local application session |
| Members and invitations | BB user/host context; compatibility page explains ownership |
| SSO provider management | BB authentication settings; CRM stores no second identity system |
| Next.js routing | One BB `navPanel` with `subPath` routing |
| Nest tRPC | BB plugin `defineRpcContract` and `useRpc` |
| Postgres and Prisma | Plugin-owned SQLite with append-only migrations |
| Eve sessions | BB hidden and visible threads with CRM agent tools and skills |
| Vercel cron | `bb.background.schedule` and abort-aware services |
| Vercel Blob | BB file APIs or plugin-local persisted files |
| URL query state | Encoded BB panel `subPath` plus client preferences |
| Next.js record routes | Persistent, stack-aware BB responsive drawers |

These substitutions remove duplicate host responsibilities. They do not remove
CRM records, workflows, integrations, automation, or agent behavior.

## Extension architecture

### Runtime boundaries

- `server.ts` wires settings, storage, RPC, realtime, CLI, tools, skills,
  mentions, schedules, HTTP callbacks, and cleanup.
- `db/` owns migrations, prepared statements, transactions, and domain stores.
- `contracts/` owns Zod schemas shared by RPC inputs and outputs.
- `services/` owns currency conversion, search, enrichment, tracking,
  mailbox/calendar ingestion, and agent orchestration.
- `app.tsx` only registers BB frontend surfaces.
- `app/` owns routing, shell, query state, view data hooks, and dialogs.
- `views/` owns dashboard, table, record, agent, and settings UI.
- `components/ui/` contains vendored BB registry components.
- `skills/crm/SKILL.md` teaches BB agents how to use CRM tools and `bb crm`.

### BB surfaces

- One `navPanel` named CRM owns `/plugins/crm/crm/*`.
- One settings section shows data, integration, and migration health.
- One thread panel action links a BB thread to a CRM record.
- One message action files selected text as a note or fact.
- Mention providers expose contacts, companies, and deals to the BB composer.
- Native agent tools expose search, read, create, update, activity, fact,
  research, and follow-up actions.
- `bb crm` exposes list, show, create, update, import, export, activity,
  research, sync, and diagnostics commands.
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
- Text, number, boolean, date, URL, select, and multi-select field types.
- Field options, archive, ordering, required state, and validation.
- Table column integration and record field editing.
- Saved filters, sort, columns, ownership, default view, rename, and delete.

### Agent workspace

- Agent builder home and natural-language composer.
- Draft, validation, ready, deployed, live, paused, archived, and deleted states.
- Agent capability summary and generated definition review.
- Trigger configuration for manual, schedule, event, and webhook runs.
- Run history drawer with queued, running, approval, success, failure,
  and cancellation states.
- Builder chat history, share metadata, delete, and result views.
- Record Agent tab with transcript, questions, citations, tool steps,
  follow-up schedule, feedback, and new-conversation action.
- BB threads replace Eve durability. CRM rows store thread links and summaries.

### Settings and connections

- General workspace name and reporting currency.
- Agent provider/model/reasoning and research-key settings.
- Archive retention policy.
- Connections overview with liveness and last-sync state.
- Google mail/calendar connection and sync state.
- Microsoft mail/calendar connection and sync state.
- Slack authorization, scopes, channels, people matching, and disconnect.
- Intake endpoint and connection instructions.
- Tracking site status, allowed domains, script, cookies, rules,
  traffic sources, verification, pause, and site-id rotation.
- API key creation, one-time secret display, list, last-used state, and revoke.
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

### Mail, calendar, and conversations

- OAuth or device authorization uses secret plugin settings and local callbacks.
- Forward-only mailbox cursors prevent accidental historical bulk import.
- Normalize participants, threads, messages, attachments, meetings, and attendees.
- Match records without inventing identities.
- Missing integration configuration disables only that capability.

### Slack

- Store installation and workspace grants in secret settings or encrypted files.
- Sync channel and member catalogs.
- Match CRM users and Slack members by exact email with manual correction.
- Surface missing scopes and stale grants before agent actions run.

### Tracking

- Serve a small loader and per-site tracker through plugin HTTP routes.
- Validate origin, site ID, visitor ID, event shape, batch size, and rate.
- Remove query strings, sensitive fields, card-shaped values, files, and passwords.
- Convert form submissions into contacts through the same suppression rules.
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
- Add company mention provider and agent read/update tools.

Exit criteria:

- Users complete every source company workflow inside BB.
- Reload and deep-link navigation preserve list and record state.

### Phase 3: contacts and evidence

Tasks:

- Implement contact schema, store, contracts, RPC, CLI, and UI.
- Implement contact list, facets, saved views, bulk actions, and record drawer.
- Implement fact ledger, brief, suggestions, dismissal, supersession, and citations.
- Implement contact-to-company links, social links, work history, photos, and enrichment state.
- Add contact mention provider and research/fact agent tools.

Exit criteria:

- Identity updates remain evidence-backed and auditable.
- Ambiguous facts never overwrite a record automatically.

### Phase 4: deals, pipeline, and dashboard

Tasks:

- Implement deals, stages, deal contacts, activities, and closing-window logic.
- Implement currency rates, frozen conversion, unconverted disclosures, and re-rate controls.
- Implement deal list, bulk actions, create/edit drawer, and stage stepper.
- Implement dashboard aggregates, trends, stage charts, and recent work.
- Add deal mention provider and agent deal tools.

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
- Complete BB message action for filing selected text.

Exit criteria:

- Companies, contacts, and deals share consistent field, view, and activity behavior.
- Data can leave and re-enter the plugin without information loss.

### Phase 6: CRM agents and builder

Tasks:

- Port CRM agent knowledge into `skills/crm/SKILL.md` and focused references.
- Register native CRM tools with strict schemas and auditable presentations.
- Implement task leasing, schedules, run state, actions, audit events, and cancellation.
- Implement record Agent tab using linked BB threads.
- Implement agent builder, versions, triggers, approvals, run history, and sharing metadata.
- Stop and archive hidden worker threads after every terminal outcome.

Exit criteria:

- Agents operate the same records users operate.
- Every automatic write has an audit event and visible source.
- A missing optional integration never crashes the dispatcher.

### Phase 7: connections and tracking

Tasks:

- Implement Google and Microsoft authorization, forward sync, health, and disconnect.
- Implement Slack authorization, scopes, channels, member matching, and delivery checks.
- Implement intake endpoint and token rotation.
- Implement tracking loader, tracker config, event collector, filing, verification,
  daily aggregation, retention, pause, and site-id rotation.
- Add integration diagnostics to `bb crm doctor`.

Exit criteria:

- Integration pages lead with liveness and actionable failures.
- Tracking respects origin, privacy, limits, pause, and retention contracts.

### Phase 8: administration and hardening

Tasks:

- Implement API keys, reporting currency, retention, model, and research settings.
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
- Record remaining parity gaps in the matrix. No hidden omissions remain.

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
14. Tracking and intake.
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
