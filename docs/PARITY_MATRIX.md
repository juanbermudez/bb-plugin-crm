# CRM parity matrix

Baseline: `trycompai/crm` release commit
`6d4793dd6d7aeea91aa6a034e00b17d7408a2d08`.

Status meanings:

- `done`: implemented and covered by an automated or live check.
- `building`: active implementation exists but the source workflow is incomplete.
- `planned`: mapped to a phase and not implemented.
- `host-owned`: BB supplies the equivalent application responsibility.
- `gap`: BB lacks a required public surface. The row includes the chosen fallback.

## Host and shell

| Source capability | BB extension target | Status | Phase |
| --- | --- | --- | --- |
| Marketing landing | GitHub README and marketplace detail | host-owned | 10 |
| Sign-in | BB application session | host-owned | 0 |
| Grant mailbox access | CRM connection authorization boundary | building | 7 |
| Workspace onboarding | First-open CRM checklist | planned | 8 |
| Research onboarding | Secret research-key setting | done | 8 |
| Organization slug routing | Installed CRM plugin identity | host-owned | 0 |
| Desktop icon rail | Inner CRM rail inside BB nav panel | done | 1 |
| Mobile navigation | Compact CRM navigation row | done | 1 |
| Global app header | BB host title bar | host-owned | 1 |
| CRM header actions | BB nav-panel header content | planned | 1 |
| Quick switcher | CRM search and BB command palette action | planned | 5 |
| Deep links | BB `subPath` routes | done | 1 |
| Browser back/forward | `useBbNavigate` panel history | done | 1 |
| Global record sheet host | Responsive CRM drawer and record stack | building | 2–5 |

## Dashboard

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Me/everyone scope | Dashboard scope control | done | 4 |
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
| Sort and pagination | Typed list state | done | 2 |
| Owner, industry, enrichment facets | Filter bar | done | 2 |
| Activity and custom-field facets | Filter bar | done | 5 |
| Saved views | Saved-view rows and installation default | done | 5 |
| Column preferences | Client preference plus field definitions | planned | 5 |
| Row selection | Table selection | done | 2 |
| Bulk owner | Bulk RPC and CLI | done | 2 |
| Bulk enrichment | Bulk RPC and CLI | planned | 2 |
| Bulk archive/restore/purge | Bulk RPC and CLI | done | 2 |
| Create company | Wide responsive drawer | done | 2 |
| Company record header | Shared record drawer | done | 2 |
| Company overview | Record tab | done | 2 |
| Related contacts | Record tab | done | 2 |
| Related deals | Record tab | done | 2 |
| Company activity | Record tab | done | 5 |
| Company Agent tab | Linked BB thread | planned | 6 |
| Primary contact | Company relation operation | planned | 2 |
| Company enrichment/research | Optional integration and agent tools | planned | 3/6 |

## Contacts and evidence

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Contact list | Paginated CRM table | done | 3 |
| Search identity fields | Typed list query | done | 3 |
| Company/owner/title facets | Filter bar | done | 3 |
| Seniority/persona/activity facets | Filter bar | done | 3 |
| Dynamic-field facets | Filter bar | done | 5 |
| Bulk owner/company/enrich | Bulk owner/company RPC; enrichment remains planned | building | 3 |
| Bulk archive/restore/purge | Bulk RPC and CLI | done | 3 |
| Create contact | Wide responsive drawer | done | 3 |
| Contact overview | Record tab | done | 3 |
| Attached deals and roles | Record tab | done | 3/4 |
| Contact activity | Record tab | done | 5 |
| Contact Agent tab | Linked BB thread | planned | 6 |
| Applied facts | Evidence ledger and contact projection | building | 3 |
| Proposed fact decision | Review action | building | 3 |
| Dismiss/supersede | Evidence state transition | building | 3 |
| Background brief | Versioned brief | building | 3 |
| Email/meeting relationship summary | Timeline aggregate | planned | 7 |
| Social lookup and work history | Optional research tools | building | 3/6 |
| Contact portrait | Bounded plugin asset storage | gap | 3 |

Fallback for portraits: keep the source URL/reference only until a BB file or
blob surface exists; portrait binary storage and serving are not implemented.
BB has no plugin blob API.

## Deals and currency

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Deal list | Paginated CRM table | done | 4 |
| Open/closed tabs | List scope control | done | 4 |
| Owner/stage/closing facets | Filter bar | done | 4 |
| Inline stage change | Table and record controls | done | 4 |
| Close-reason dialog | Responsive confirmation dialog | done | 4 |
| Bulk owner/stage/archive | Bulk RPC and CLI | done | 4 |
| Create deal | Wide responsive drawer | done | 4 |
| Deal overview and stats | Record tab | done | 4 |
| Stage stepper | BB-tokenized stage control | building | 4 |
| Attached contacts and roles | Record tab | done | 4 |
| Deal activity | Record tab | done | 5 |
| Deal Agent tab | Linked BB thread | planned | 6 |
| Source amount/currency | Integer minor units and code | done | 4 |
| Frozen base amount | Stored converted minor units | done | 4 |
| Manual rates | Currency settings | done | 4/8 |
| Fetched rates | Scheduled optional service | building | 4 |
| Explicit re-rate | Admin operation | done | 4 |
| Unconverted disclosure | Lists and dashboard warning | done | 4 |

## Records, fields, views, and activity

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Nested record stack | Drawer stack state | planned | 2–5 |
| Record back/close | Drawer navigation | done | 2–5 |
| Record deep link | `subPath` record ID | done | 1 |
| Inline field edit | Optimistic typed mutation | building | 2–5 |
| Company/contact/deal custom fields | Typed field system | done | 5 |
| Standard field visibility/order | Field definition flags | planned | 5 |
| Field archive/restore/delete | Field operations | done | 5 |
| Agent-filled field instructions | Field agent metadata | done | 5/6 |
| Field coverage and fill-rest | Coverage RPC and agent task | building | 5/6 |
| Saved filter/sort/columns | Versioned saved-view JSON | building | 5 |
| Timeline All/Notes/Email/Meetings | Unified timeline | done | 5/7 |
| Timeline Upcoming/Done | Task filters | done | 5 |
| Note/call/email/meeting/task composer | Activity composer | done | 5 |
| Task completion | Activity mutation | done | 5 |
| Sticky day groups | Timeline UI | building | 5 |
| Infinite older history | Cursor pagination | building | 5 |
| Stage/enrichment rows | Timeline events | building | 4/5 |
| Email thread expansion | Integration-backed row | planned | 7 |
| Meeting attendee and join details | Integration-backed row | planned | 7 |
| Website activity | Tracking aggregate | planned | 7 |

## Agent workspace

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| CRM operating skill | Plugin `crm` skill | done | 6 |
| Search/read/update native tools | `bb.agents.registerTool` | done | 6 |
| Evidence and identity rules | Skill references and tool validation | done | 6 |
| Due-task leasing | SQLite transaction and dispatcher | planned | 6 |
| Durable worker | Hidden BB thread and `crm-agent-dispatcher` service | done | 6 |
| Record conversation | Linked BB thread | building | 6 |
| Transcript and tools | BB `ThreadChat` | planned | 6 |
| Clarification question | BB pending interaction | planned | 6 |
| Builder home/chat | CRM nav routes | planned | 6 |
| Builder attachments | BB project attachment inputs | planned | 6 |
| Agent definitions and versions | Plugin tables and editor | done | 6 |
| Draft validation/deploy | Version state machine | done | 6 |
| Manual trigger | Run-now action and durable queue | done | 6 |
| Schedule trigger | BB background service plus stored trigger | done | 6 |
| CRM event trigger | Domain-event dispatcher | planned | 6 |
| Webhook trigger | External producer boundary | gap | 6 |
| Run/action/audit history | Plugin tables and drawer | done | 6 |
| Approval | Pending interaction and durable state | building | 6 |
| Retry/cancel | Thread/run lifecycle operations | building | 6 |
| Share read-only builder chat | Local export only | gap | 6 |
| Slack message action | Optional Slack integration | planned | 6/7 |

Fallback for sharing: export a redacted conversation document. The public BB
SDK exposes no share relay; a publicly reachable share requires BB Connect or
an external relay.

## Connections, tracking, and settings

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Connection health overview | CRM settings route | done | 7 |
| Google mail/calendar | OAuth callback and forward sync | planned | 7 |
| Microsoft mail/calendar | OAuth/device flow and forward sync | planned | 7 |
| Slack authorization and scopes | OAuth callback and settings | planned | 7 |
| Slack channels and creation | Channel settings | planned | 7 |
| Slack people matching | Exact-email match plus review | planned | 7 |
| HubSpot/Linear coming-soon rows | Omitted until supported | host-owned | 7 |
| Intake endpoint | Token-provisioning boundary; producer remains external | gap | 7 |
| Tracking loader and script | Fixed plugin HTTP routes | planned | 7 |
| Anonymous tracking collector | Token-validated RPC ingestion; external producer required | gap | 7 |
| Tracking privacy rules | Boundary sanitizer and tests | done | 7 |
| Allowed domains and scopes | Tracking settings | done | 7 |
| Site verify/pause/rotate | Tracking operations | done | 7 |
| Attribution and sources | Tracking aggregates | done | 7 |
| Retention rollup | Bounded rollup/prune RPCs | done | 7 |
| Workspace name | Plugin setting | done | 1 |
| Reporting currency | Plugin setting | done | 1 |
| Research API key | Secret plugin setting | done | 1 |
| Archive retention | Plugin setting and prune schedule | planned | 8 |
| Agent model | BB provider/model picker | planned | 8 |
| API keys | Scoped plugin tokens | planned | 8 |
| Members and role changes | BB user identity | gap | 8 |
| SSO providers | BB authentication settings | host-owned | 8 |
| Backup/export/import | Versioned JSON and CSV CLI | done | 5/8 |
| Diagnostics | `bb crm status` and doctor | done | 1/8 |

Fallback for the collector: issue a rotatable site-scoped token that has no
authority outside tracking ingestion. The loader/producer is external to the
plugin, and the BB plugin token is never embedded.

Fallback for members: the first marketplace release operates as one
installation-wide CRM. BB SDK `0.4.8` exposes no current-user identity or RBAC
API, so role changes and per-user authorization are not implemented.

The following boundaries are intentional and remain release notes rather than
parity claims:

- BB SDK `0.4.8` has no plugin blob API; portraits and other binary assets are
  not claimed as a hosted plugin capability.
- Provider connection cards and health/metadata persistence are implemented,
  but real OAuth credentials and authorization flows are not bundled. A host-
  authorized provider flow is required before mailbox, calendar, or Slack
  sync can run.
- The dispatcher can request a thread stop, but BB exposes no public
  cancellation lifecycle for a thread that reports `stopping`; the linked run
  remains pending until an unambiguous idle, failed, or deleted signal (or an
  explicit cancellation signal from an integration).
- Event and webhook triggers have a strict persisted boundary, but require an
  external event/webhook producer. The plugin does not invent or bundle those
  producers.
- Builder sharing is local export only. BB exposes no public share relay, so a
  public share requires BB Connect or an external relay.

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
| Browser parity QA | building; packaged-BB smoke covers dashboard, list controls, agent creation, settings empty states, tracking token flow, and focused compact dark-theme layout |
| Electron parity QA | planned |
| Marketplace PR submission | planned |
