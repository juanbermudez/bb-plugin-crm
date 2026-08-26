# CRM parity matrix

Baseline: `trycompai/crm` release commit
`6d4793dd6d7aeea91aa6a034e00b17d7408a2d08`.

Status meanings:

- `done`: implemented and covered by an automated or live check.
- `adapted`: the source outcome is implemented, with an explicit privacy or
  host boundary that prevents a one-for-one claim.
- `building`: active implementation exists but the source workflow is incomplete.
- `planned`: mapped to a phase and not implemented.
- `host-owned`: BB supplies the equivalent application responsibility.
- `gap`: BB lacks a required public surface. The row includes the chosen fallback.

## Storage and query semantics

| Source capability | BB extension target | Status | Phase |
| --- | --- | --- | --- |
| Append-only schema evolution | SQLite migrations through `CRM_SCHEMA_VERSION = 12`; migration 12 adds normalized mail/calendar records plus Slack inventory/matches | done | 1/7/8 |
| Contextual facet counts | Counts use the current search and active/archived scope; selecting one facet does not collapse the other facet counts | done | 5 |
| Activity facets | 7/30/90-day recency windows; multiple windows use the widest selected window | done | 5 |
| Custom-field facet identity | Strict `field:<key>` keys shared by server output and list controls | done | 5 |
| Relation count sorting | Company contact and deal counts use SQL relation counts across active and archived relations, matching the source list semantics | done | 2/4 |
| Null-last list ordering | Nullable list and related-record sorts use source-compatible null-last ordering with deterministic name/ID ties | done | 2–4 |
| Owner relation sorting | Stable installation-local owner-ID sorting; BB exposes no plugin identity directory for display-name sorting | adapted | 2–5 |

## Host and shell

| Source capability | BB extension target | Status | Phase |
| --- | --- | --- | --- |
| Marketing landing | GitHub README and marketplace detail | host-owned | 10 |
| Sign-in | BB application session | host-owned | 0 |
| Grant mailbox access | BB secret settings accept operator-provisioned access tokens; OAuth callback/refresh custody remains host-owned because plugins cannot write secret settings | adapted | 7 |
| Workspace onboarding | Persisted first-open CRM checklist modal with title-bar progress ring | done | 8 |
| Research onboarding | Explicit live/deployed BB research-agent selection; provider credentials stay with that agent's tools | done | 8 |
| Organization slug routing | Installed CRM plugin identity | host-owned | 0 |
| Desktop icon rail | One first-class CRM sidebar row with a contact-record mark; BB-styled tabs are centered in the text-only host title row because nested groups are unavailable in SDK 0.4.x | adapted | 1 |
| Responsive navigation | Centered CRM tabs fall back to a horizontally scrollable row at the top of the panel below 1280px | adapted | 1 |
| Global app header | BB host title bar | host-owned | 1 |
| CRM header actions | BB nav-panel `headerContent`; expandable search, enrichment, checklist progress, and New use one compact ghost-icon style with top tooltips and precede the host right-panel toggle without overlap | done | 1 |
| Global create menu | Keyboard-accessible routes for company, contact, deal, agent, note, and task creation; notes/tasks require an existing CRM record | done | 5 |
| Quick switcher | Cross-record CRM search and deep links | done | 5 |
| Deep links | BB `subPath` routes | done | 1 |
| Browser back/forward | `useBbNavigate` panel history | done | 1 |
| Global record sheet host | Responsive CRM drawer and nested record stack | done | 2–5 |

## Dashboard

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Me/everyone scope | Dashboard scope control; Me uses the installation-local owner because BB exposes no current-user identity | done | 4 |
| Closed won comparison | Dashboard metric | done | 4 |
| Open pipeline | Dashboard metric | done | 4 |
| Win rate | Dashboard metric | done | 4 |
| Average deal value | Dashboard metric | done | 4 |
| Average cycle | Dashboard metric | done | 4 |
| Largest open deals | Ranked dashboard list | done | 4 |
| Overdue tasks | Dashboard task list | done | 4 |
| Recent activity | Dashboard activity list | done | 4 |
| Closing window | Dashboard closing summary | done | 4 |
| Six-month trend | BB-tokenized chart | done | 4 |
| Stage distribution | BB-tokenized chart | done | 4 |
| Unconverted warning | Currency disclosure | done | 4 |
| Runtime status | Foundation dashboard | done | 1 |

## Companies

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Company list | Paginated CRM table | done | 2 |
| Search name/domain | Typed list query | done | 2 |
| Sort and pagination | Typed list state with deterministic null-last date ordering and relation count sorting | done | 2 |
| Owner, industry, enrichment facets | Filter bar | done | 2 |
| Activity and custom-field facets | Contextual filter-bar counts in current search/archive scope; 7/30/90-day activity windows and `field:<key>` custom-field keys | done | 5 |
| Saved views | Saved-view rows and installation default | done | 5 |
| Compact list controls | One non-wrapping table toolbar: search/filter left; sort, saved views, columns, and archive right; one icon size/style with top tooltips; no redundant result count | done | 2/5 |
| Column preferences | Persisted standard/custom table columns and ordering | done | 5 |
| Row selection | Table selection | done | 2 |
| Bulk owner | Bulk RPC and CLI | done | 2 |
| Bulk enrichment | Provider-gated bulk RPC and list action | done | 2/6 |
| Bulk archive/restore/purge | Bulk RPC and CLI | done | 2 |
| Create company | Wide responsive drawer | done | 2 |
| Company favicon | Deterministic `https://<normalized-domain>/favicon.ico` URL, retained as a remote reference because BB has no blob API | done | 2 |
| Company record header | Shared record drawer | done | 2 |
| Company overview | Record tab | done | 2 |
| Related contacts | Source-shaped contact objects including archived rows, ordered by last name/first name | done | 2 |
| Related deals | Source-shaped deal objects including archived rows, stage/expected-close ordering, amount and frozen `baseAmountCents` | done | 2/4 |
| Company activity | Record tab | done | 5 |
| Company Agent tab | Plugin-spawned linked BB thread and `ThreadChat` | done | 6 |
| Primary contact | Dedicated relation mutation and source-shaped `primaryContact` object; contact must exist and belong to the company on create/update | done | 2 |
| Company relation counts | Detail counts include all contacts and all non-closed deals, including archived relations; list count sorting uses the same semantics | done | 2/4 |
| Company enrichment/research | Provider-gated BB agent run, sourced update tool, and explicit skipped state | done | 3/6 |

## Contacts and evidence

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Contact list | Paginated CRM table | done | 3 |
| Search identity and company fields | Typed list query includes associated company name | done | 3 |
| Company/owner/title facets | Contextual filter-bar counts in current search/archive scope | done | 3 |
| Seniority/persona/activity facets | Activity recency windows are 7/30/90 days; counts remain contextual | done | 3 |
| Dynamic-field facets | Filter bar using strict `field:<key>` facet keys | done | 5 |
| Bulk owner/company/enrich | Bulk owner/company RPC plus provider-gated enrichment action | done | 3/6 |
| Bulk archive/restore/purge | Bulk RPC and CLI | done | 3 |
| Create contact | Wide responsive drawer | done | 3 |
| Work-email auto-company | Reuse or create an active company for eligible non-free, non-machine-generated domains when no company is supplied | done | 3 |
| Contact suppression | Purge writes a normalized email tombstone; explicit recreation clears it before insertion | done | 3/8 |
| Contact overview | Record tab | done | 3 |
| Attached deals and roles | Record tab | done | 3/4 |
| Contact activity | Record tab | done | 5 |
| Contact Agent tab | Plugin-spawned linked BB thread and `ThreadChat` | done | 6 |
| Applied facts | Evidence ledger and contact projection | done | 3 |
| Proposed fact decision | Accept/dismiss review actions | done | 3 |
| Dismiss/supersede | Evidence state transitions | done | 3 |
| Background brief | Versioned brief display/create/history | done | 3 |
| Email/meeting relationship summary | Synced mail/calendar rows match contacts and project into the unified timeline | done | 7 |
| Social lookup and work history | Provider-gated research runs plus evidence-backed fact/work-history tools | done | 3/6 |
| Contact portrait | HTTPS source portrait in list/drawer, inline URL editing, and initials/error fallback | done | 3 |

Portrait binary mirroring is intentionally omitted because BB has no plugin
blob API. The source outcome is retained with a validated HTTPS reference and
deterministic fallback; the plugin never fetches an arbitrary portrait URL on
the server.

## Deals and currency

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Deal list | Paginated CRM table | done | 4 |
| Open/closed tabs | List scope control | done | 4 |
| Search and sort | Typed list query includes associated company search, source stage/expected-close order, and explicit null-last dates | done | 4 |
| Owner/stage/closing facets | Contextual filter-bar counts; custom fields use `field:<key>` | done | 4/5 |
| Inline stage change | Table and record controls | done | 4 |
| Close-reason dialog | Responsive confirmation dialog | done | 4 |
| Bulk owner/stage/archive | Bulk RPC and CLI | done | 4 |
| Create deal | Wide responsive drawer | done | 4 |
| Deal overview and stats | Record tab | done | 4 |
| Stage stepper | BB-tokenized accessible stage control | done | 4 |
| Attached contacts and roles | Record tab with archived relationship visibility and deterministic contact ordering | done | 4 |
| Deal activity | Record tab | done | 5 |
| Deal Agent tab | Plugin-spawned linked BB thread and `ThreadChat` | done | 6 |
| Source amount/currency | Integer minor units and code | done | 4 |
| Frozen base amount | Stored converted minor units | done | 4 |
| Manual rates | Currency settings | done | 4/8 |
| Fetched rates | Trusted provider-labelled ingestion boundary | done | 4/7 |
| Explicit re-rate | Admin operation | done | 4 |
| Unconverted disclosure | Lists and dashboard warning | done | 4 |

## Records, fields, views, and activity

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Nested record stack | Company relation drawer stack with Back navigation | done | 2–5 |
| Record back/close | Drawer navigation | done | 2–5 |
| Record deep link | `subPath` record ID | done | 1 |
| Inline field edit | Optimistic typed mutation with rollback | done | 2–5 |
| Company/contact/deal custom fields | Typed field system | done | 5 |
| Standard field visibility/order | Persisted table-column visibility/order | done | 5 |
| Field archive/restore/delete | Field operations | done | 5 |
| Agent-filled field instructions | Field agent metadata | done | 5/6 |
| Field coverage and fill-rest | Bounded missing-record query and idempotent evidence-only research runs | done | 5/6 |
| Saved filter/sort/columns | Versioned saved-view JSON, including ordered/hidden dynamic columns | done | 5 |
| Contextual list facets | Search/archive-scoped standard, activity, and `field:<key>` custom-field counts | done | 5 |
| Timeline All/Notes/Email/Meetings | Unified timeline | done | 5/7 |
| Timeline Upcoming/Done | Task filters | done | 5 |
| Note/call/email/meeting/task composer | Activity composer | done | 5 |
| Task completion | Activity mutation | done | 5 |
| Sticky day groups | Sticky timeline day headers | done | 5 |
| Infinite older history | Cursor pagination with observer-driven loading and button fallback | done | 5 |
| Stage/enrichment rows | Transactional stage/enrichment activity rows | done | 4/5 |
| Email thread expansion | Lazy typed thread detail with provider link | done | 7 |
| Meeting attendee and join details | Lazy typed attendee/location/conference detail | done | 7 |
| Website activity | Privacy-filtered site/path/source/medium aggregates and visitor-days; no anonymous CRM-record attribution | adapted | 7 |

## Agent workspace

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| CRM operating skill | Plugin `crm` skill | done | 6 |
| Search/read/update native tools | `bb.agents.registerTool` | done | 6 |
| Pipeline and outstanding-work tools | Source-named `list_deals` cursor workflow and `list_outstanding_work`, without a hidden 1,000-record ceiling | done | 6 |
| Field management tools | Source-named list/manage/archive tools; agent writes refuse fields marked manual-only | done | 5/6 |
| History/job-change/recheck tools | Local source-named contact/company/deal history, stored work history, job-change note, and durable recheck task workflows; connected message/calendar bodies stay provider-gated | adapted | 6/7 |
| Evidence and identity rules | Skill references and tool validation | done | 6 |
| Due-task leasing | Opt-in CRM-local CAS leases, bounded retries, and one explicit live-agent policy | done | 6 |
| Aggregate enrichment queue | Shell queue for persisted local agent runs, field backfills, due tasks, and scheduled work with record context and local-status wording | done | 6 |
| Durable worker | Hidden BB thread and `crm-agent-dispatcher` service | done | 6 |
| Record conversation | Idempotent plugin-spawned linked BB thread | done | 6 |
| Transcript and tools | Host `ThreadChat` for linked record threads | done | 6 |
| Clarification question | Strict `ask_question` pending interaction and native BB input renderer | done | 6 |
| Builder home/chat | Modal `Build with BB` composer, CRM Agents list, definition/version editor, runs, durable BUILDER thread history, explicit new/delete conversation actions, assistant-message draft transfer, and host `ThreadChat` | done | 6 |
| Builder attachments | Bounded upload/read/copy through resolved BB project attachment APIs | done | 6 |
| Agent definitions and versions | Plugin tables and editor | done | 6 |
| Delete agent definition | Durable DELETED fence, trigger shutdown, active-run cancellation, and hidden-worker cleanup with retained history | done | 6 |
| Draft validation/deploy | Version state machine | done | 6 |
| Manual trigger | Run-now action and durable queue | done | 6 |
| Schedule trigger | BB background service plus stored trigger | done | 6 |
| CRM event trigger | Transactional CRM outbox and idempotent event dispatcher | done | 6 |
| Webhook trigger | Trigger-scoped, signed, replay-bounded public HTTP boundary | done | 6 |
| Run/action/audit history | Plugin tables and drawer | done | 6 |
| Approval | Durable approve/deny actions and run UI | done | 6 |
| Retry/cancel | Auditable retry plus linked-thread cancel cleanup | done | 6 |
| Share read-only builder chat | Not claimed: BB SDK exposes no public share relay; BB Connect or an external relay is required | gap | 6 |
| Slack message action | Idempotent channel/user delivery RPC and CRM agent tool backed by the live Slack adapter | done | 6/7 |

Builder chat is available through visible plugin-spawned BUILDER links and the
host `ThreadChat`. An assistant-message action can copy exact visible text into
the version editor and retain the selected BB thread id as
`sourceConversationId` provenance, but saving, validating, and deploying remain
explicit user actions.
Public sharing remains a gap: the public BB SDK exposes no share relay, so a
publicly reachable share requires BB Connect or an external relay.

## Connections, tracking, and settings

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Connection health overview | BB Settings → Plugins → CRM | done | 7 |
| Google mail/calendar | Bounded Gmail/Calendar adapter, 30-day initial mail backfill, incremental cursors, normalized storage, manual/background sync | adapted | 7 |
| Microsoft mail | Bounded Graph/Outlook adapter, incremental cursor, normalized storage, manual/background sync | adapted | 7 |
| Slack authorization and scopes | BB secret bot/user settings and scope-drift adapter; OAuth callback remains host-owned | adapted | 7 |
| Slack channels and creation | Durable inventory plus public/private join and create controls | done | 7 |
| Slack people matching | Durable exact-email CRM-contact match review | done | 7 |
| HubSpot/Linear coming-soon rows | Omitted until supported | host-owned | 7 |
| Intake endpoint | Source route explicitly says unavailable; no endpoint or unused intake credential is exposed | host-owned | 7 |
| Tracking loader and script | Fixed `GET /tracking/loader.js` route | done | 7 |
| Anonymous tracking collector | Domain/token/privacy-validated HTTP collector | done | 7 |
| Tracking privacy rules | Boundary sanitizer rejects query strings/fragments and sensitive/card-shaped properties; raw identifiers are hashed | done | 7 |
| Allowed domains and scopes | Tracking settings with cross-domain linking, domain limits, cookie scope/secure/DNT controls, and bounded cookie lifetime | done | 7 |
| Site confirm/pause/rotate | Observed allowed PAGE_VIEW evidence plus token-and-Origin authorization; deleting evidence returns verification to pending | done | 7 |
| Attribution and sources | Daily anonymous source/medium rollups with event counts and per-day distinct-visitor `visitorDays` | adapted | 7 |
| Retention rollup | Bounded rollup/prune RPCs | done | 7 |
| Workspace name | Plugin setting | done | 1 |
| Workspace website/profile | Schema-12 workspace settings store normalized website identity and an optional factual company profile; BB owns the installation name | done | 8 |
| Reporting currency | Plugin setting | done | 1 |
| Research agent | Optional live/deployed BB agent selector; provider credentials remain in that agent's tools | done | 1/6 |
| Archive retention | Bounded setting, prune RPC, and background service | done | 8 |
| Agent model | Strict provider/model/reasoning settings forwarded to BB | done | 8 |
| API keys | No general-purpose keys are issued; BB exposes no safe current-user/RBAC authority | gap | 8 |
| Members and role changes | Installation-local owner IDs; no BB identity directory or plugin RBAC API | gap | 8 |
| SSO providers | BB authentication settings | host-owned | 8 |
| Record export/import | Versioned JSON and CSV CLI for documented record columns; not a whole-database backup | done | 5/8 |
| Diagnostics | `bb crm status` and doctor | done | 1/8 |

The collector uses a rotatable site-scoped token that has no authority outside
tracking ingestion. The fixed loader never embeds the BB plugin token or a
provisioned site token; an administrator supplies the one-time site token as a
script data attribute on the authorized site.

Fallback for API keys: no general-purpose key is issued. The declared compatibility
floor, BB SDK `0.4.8`, exposes
the installation plugin token but no current-user/RBAC authority or identity
directory, so delegating that token would grant unsafe installation-wide
authority. Owner facets and sorting therefore use stable local owner IDs rather
than a BB display-name directory.

Fallback for members: the first marketplace release operates as one
installation-wide CRM. The BB SDK `0.4.8` compatibility floor exposes no current-user identity, identity
directory, or RBAC API, so role changes and per-user authorization are not
implemented. Dashboard “Me” therefore filters by that installation-local owner
rather than a BB user identity.

### Remaining true boundaries

The following boundaries are intentional and remain release notes rather than
parity claims:

- The BB SDK `0.4.8` compatibility floor has no plugin blob API; portraits and favicons are retained as
  validated HTTPS source URLs and other binary assets are not claimed as a
  hosted plugin capability.
- Live Google Gmail/Calendar, Microsoft Outlook mail, and Slack inventory/action
  paths are implemented with bounded adapters, durable cursors, and BB secret
  settings. OAuth/device callbacks and refresh-token writes remain host-owned;
  operators must provision or rotate provider secrets outside the plugin UI.
- The dispatcher can request a thread stop, but BB exposes no public
  cancellation lifecycle for a thread that reports `stopping`; the linked run
  remains pending until an unambiguous idle, failed, or deleted signal (or an
  explicit cancellation signal from an integration).
- CRM domain-event triggers are emitted transactionally for supported company,
  contact, and deal writes. Webhook triggers expose a strict HMAC boundary but
  still require an external producer; the plugin does not invent one.
- Tracking events intentionally remain privacy-filtered site/path/source/medium
  aggregates. Traffic reports expose event counts and per-day distinct visitor
  sums (`visitorDays`); the public intake contract has no verified CRM record
  identifier, so website events are not attributed to a company/contact/deal by
  heuristic.
- Email/meeting relationship summaries, full thread expansion, attendees, and
  conference links are available whenever the corresponding provider secret is configured.
- CRM due-task dispatch is opt-in and installation-local. It leases ordinary
  CRM timeline TASK rows and starts a manual hidden agent run for one explicitly
  configured live/deployed agent; it never infers the activity author as an
  assignee and does not create or claim a host-visible BB Task.
- Agent attachments use bounded bytes and BB-resolved project-relative paths.
  Arbitrary filesystem paths, traversal, oversized payloads, and unscoped
  project access are rejected.
- A plugin record can be linked atomically to a thread the plugin spawns. The
  SDK has no callback for attaching an arbitrary pre-existing user-composed BB
  thread, so that path is not claimed.
- Builder chat is bundled as visible plugin-spawned BUILDER threads rendered by
  host `ThreadChat`; public sharing is not claimed because BB exposes no public
  share relay. A local redacted export or BB Connect/external relay remains the
  feasible sharing fallback.

## Release and distribution

| Deliverable | Status |
| --- | --- |
| Standalone repository | done |
| Public GitHub repository | done |
| Manifest and custom icon | done |
| MIT license and attribution | done |
| CI workflow | done |
| Detailed phased plan | done |
| Marketplace entry draft | done |
| Marketplace PR body draft | done |
| Production release tag | planned |
| Fresh public-tag install test | planned |
| Browser parity QA | done for the release candidate; packaged-BB smoke covers dashboard, list controls, nested records/Agent tabs, builder home, enrichment controls, deal stage stepper, settings, tracking token flow, compact layouts, dark/light/custom palettes, and focused keyboard paths |
| Electron parity QA | planned |
| Marketplace PR submission | planned |
