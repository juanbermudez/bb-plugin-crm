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
| Grant mailbox access | CRM connection authorization view | planned | 7 |
| Workspace onboarding | First-open CRM checklist | planned | 8 |
| Research onboarding | Secret research-key setting | building | 8 |
| Organization slug routing | Installed CRM plugin identity | host-owned | 0 |
| Desktop icon rail | Inner CRM rail inside BB nav panel | done | 1 |
| Mobile navigation | Compact CRM navigation row | done | 1 |
| Global app header | BB host title bar | host-owned | 1 |
| CRM header actions | BB nav-panel header content | planned | 1 |
| Quick switcher | CRM search and BB command palette action | planned | 5 |
| Deep links | BB `subPath` routes | done | 1 |
| Browser back/forward | `useBbNavigate` panel history | done | 1 |
| Global record sheet host | Responsive CRM drawer and record stack | planned | 2–5 |

## Dashboard

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Me/everyone scope | Dashboard scope control | planned | 4 |
| Closed won comparison | Dashboard metric | planned | 4 |
| Open pipeline | Dashboard metric | planned | 4 |
| Win rate | Dashboard metric | planned | 4 |
| Average deal value | Dashboard metric | planned | 4 |
| Average cycle | Dashboard metric | planned | 4 |
| Largest open deals | Ranked dashboard list | planned | 4 |
| Overdue tasks | Dashboard task list | planned | 4 |
| Recent activity | Dashboard activity list | planned | 4 |
| Closing window | Dashboard closing list | planned | 4 |
| Six-month trend | BB-tokenized chart | planned | 4 |
| Stage distribution | BB-tokenized chart | planned | 4 |
| Unconverted warning | Currency disclosure | planned | 4 |
| Runtime status | Foundation dashboard | done | 1 |

## Companies

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Company list | Paginated CRM table | done | 2 |
| Search name/domain | Typed list query | done | 2 |
| Sort and pagination | Typed list state | building | 2 |
| Owner, industry, enrichment facets | Filter bar | planned | 2 |
| Activity and custom-field facets | Filter bar | planned | 5 |
| Saved views | Saved-view rows | planned | 5 |
| Column preferences | Client preference plus field definitions | planned | 5 |
| Row selection | Table selection | planned | 2 |
| Bulk owner | Bulk RPC and CLI | building | 2 |
| Bulk enrichment | Bulk RPC and CLI | planned | 2 |
| Bulk archive/restore/purge | Bulk RPC and CLI | building | 2 |
| Create company | Wide responsive drawer | done | 2 |
| Company record header | Shared record drawer | done | 2 |
| Company overview | Record tab | done | 2 |
| Related contacts | Record tab | planned | 2 |
| Related deals | Record tab | planned | 2 |
| Company activity | Record tab | planned | 5 |
| Company Agent tab | Linked BB thread | planned | 6 |
| Primary contact | Company relation operation | planned | 2 |
| Company enrichment/research | Optional integration and agent tools | planned | 3/6 |

## Contacts and evidence

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Contact list | Paginated CRM table | done | 3 |
| Search identity fields | Typed list query | done | 3 |
| Company/owner/title facets | Filter bar | planned | 3 |
| Seniority/persona/activity facets | Filter bar | planned | 3 |
| Dynamic-field facets | Filter bar | planned | 5 |
| Bulk owner/company/enrich | Bulk RPC and CLI | building | 3 |
| Bulk archive/restore/purge | Bulk RPC and CLI | building | 3 |
| Create contact | Wide responsive drawer | done | 3 |
| Contact overview | Record tab | done | 3 |
| Attached deals and roles | Record tab | planned | 3/4 |
| Contact activity | Record tab | planned | 5 |
| Contact Agent tab | Linked BB thread | planned | 6 |
| Applied facts | Evidence ledger | building | 3 |
| Proposed fact decision | Review action | building | 3 |
| Dismiss/supersede | Evidence state transition | building | 3 |
| Background brief | Versioned brief | building | 3 |
| Email/meeting relationship summary | Timeline aggregate | planned | 7 |
| Social lookup and work history | Optional research tools | building | 3/6 |
| Contact portrait | Bounded plugin asset storage | gap | 3 |

Fallback for portraits: store bounded downloaded images in the plugin database
and serve them through a local authenticated plugin route. BB has no plugin blob API.

## Deals and currency

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Deal list | Paginated CRM table | done | 4 |
| Open/closed tabs | List scope control | done | 4 |
| Owner/stage/closing facets | Filter bar | planned | 4 |
| Inline stage change | Table and record controls | building | 4 |
| Close-reason dialog | Responsive confirmation dialog | done | 4 |
| Bulk owner/stage/archive | Bulk RPC and CLI | building | 4 |
| Create deal | Wide responsive drawer | done | 4 |
| Deal overview and stats | Record tab | done | 4 |
| Stage stepper | BB-tokenized stepper | planned | 4 |
| Attached contacts and roles | Record tab | planned | 4 |
| Deal activity | Record tab | planned | 5 |
| Deal Agent tab | Linked BB thread | planned | 6 |
| Source amount/currency | Integer minor units and code | done | 4 |
| Frozen base amount | Stored converted minor units | done | 4 |
| Manual rates | Currency settings | building | 4/8 |
| Fetched rates | Scheduled optional service | building | 4 |
| Explicit re-rate | Admin operation | building | 4 |
| Unconverted disclosure | Lists and dashboard warning | done | 4 |

## Records, fields, views, and activity

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Nested record stack | Drawer stack state | planned | 2–5 |
| Record back/close | Drawer navigation | planned | 2–5 |
| Record deep link | `subPath` record ID | done | 1 |
| Inline field edit | Optimistic typed mutation | planned | 2–5 |
| Company/contact/deal custom fields | Typed field system | planned | 5 |
| Standard field visibility/order | Field definition flags | planned | 5 |
| Field archive/restore/delete | Field operations | planned | 5 |
| Agent-filled field instructions | Field agent metadata | planned | 5/6 |
| Field coverage and fill-rest | Coverage RPC and agent task | planned | 5/6 |
| Saved filter/sort/columns | Versioned saved-view JSON | planned | 5 |
| Timeline All/Notes/Email/Meetings | Unified timeline | planned | 5/7 |
| Timeline Upcoming/Done | Task filters | planned | 5 |
| Note/call/email/meeting/task composer | Activity composer | planned | 5 |
| Task completion | Activity mutation | planned | 5 |
| Sticky day groups | Timeline UI | planned | 5 |
| Infinite older history | Cursor pagination | planned | 5 |
| Stage/enrichment rows | Timeline events | planned | 4/5 |
| Email thread expansion | Integration-backed row | planned | 7 |
| Meeting attendee and join details | Integration-backed row | planned | 7 |
| Website activity | Tracking aggregate | planned | 7 |

## Agent workspace

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| CRM operating skill | Plugin `crm` skill | building | 6 |
| Search/read/update native tools | `bb.agents.registerTool` | planned | 6 |
| Evidence and identity rules | Skill references and tool validation | planned | 6 |
| Due-task leasing | SQLite transaction and dispatcher | planned | 6 |
| Durable worker | Hidden BB thread | planned | 6 |
| Record conversation | Linked BB thread | planned | 6 |
| Transcript and tools | BB `ThreadChat` | planned | 6 |
| Clarification question | BB pending interaction | planned | 6 |
| Builder home/chat | CRM nav routes | planned | 6 |
| Builder attachments | BB project attachment inputs | planned | 6 |
| Agent definitions and versions | Plugin tables and editor | planned | 6 |
| Draft validation/deploy | Version state machine | planned | 6 |
| Manual trigger | Run-now action | planned | 6 |
| Schedule trigger | BB schedule plus stored trigger | planned | 6 |
| CRM event trigger | Domain-event dispatcher | planned | 6 |
| Webhook trigger | Signed plugin HTTP route | planned | 6 |
| Run/action/audit history | Plugin tables and drawer | planned | 6 |
| Approval | Pending interaction and durable state | planned | 6 |
| Retry/cancel | Thread/run lifecycle operations | planned | 6 |
| Share read-only builder chat | Signed local link or export | gap | 6 |
| Slack message action | Optional Slack integration | planned | 6/7 |

Fallback for sharing: export a redacted conversation document. A publicly
reachable share requires BB Connect or an external relay.

## Connections, tracking, and settings

| Source capability | Target | Status | Phase |
| --- | --- | --- | --- |
| Connection health overview | CRM settings route | planned | 7 |
| Google mail/calendar | OAuth callback and forward sync | planned | 7 |
| Microsoft mail/calendar | OAuth/device flow and forward sync | planned | 7 |
| Slack authorization and scopes | OAuth callback and settings | planned | 7 |
| Slack channels and creation | Channel settings | planned | 7 |
| Slack people matching | Exact-email match plus review | planned | 7 |
| HubSpot/Linear coming-soon rows | Omitted until supported | host-owned | 7 |
| Intake endpoint | Token or signed HTTP route | planned | 7 |
| Tracking loader and script | Fixed plugin HTTP routes | planned | 7 |
| Anonymous tracking collector | Signed site token | gap | 7 |
| Tracking privacy rules | Boundary sanitizer and tests | planned | 7 |
| Allowed domains and scopes | Tracking settings | planned | 7 |
| Site verify/pause/rotate | Tracking operations | planned | 7 |
| Attribution and sources | Tracking aggregates | planned | 7 |
| Retention rollup | Scheduled bounded service | planned | 7 |
| Workspace name | Plugin setting | done | 1 |
| Reporting currency | Plugin setting | done | 1 |
| Research API key | Secret plugin setting | done | 1 |
| Archive retention | Plugin setting and prune schedule | planned | 8 |
| Agent model | BB provider/model picker | planned | 8 |
| API keys | Scoped plugin tokens | planned | 8 |
| Members and role changes | BB user identity | gap | 8 |
| SSO providers | BB authentication settings | host-owned | 8 |
| Backup/export/import | Versioned JSON and CSV | planned | 5/8 |
| Diagnostics | `bb crm status` and doctor | building | 1/8 |

Fallback for the collector: issue a rotatable site-scoped signature that has
no authority outside tracking ingestion. Never embed the BB plugin token.

Fallback for members: the first marketplace release operates as one
installation-wide CRM. BB SDK `0.4.8` exposes no current-user identity or RBAC API.

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
| Browser parity QA | building; company/contact/deal lifecycle smoke passed |
| Electron parity QA | planned |
| Marketplace PR submission | planned |
