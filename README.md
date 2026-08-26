# CRM for BB

A local-first, agent-native CRM workspace that runs as a BB extension.

This project ports the MIT-licensed [Comp AI CRM](https://github.com/trycompai/crm)
into BB. It preserves the source product's table-first company, contact, deal,
activity, enrichment, integration, and agent workflows. The interface uses BB
theme tokens and version-matched vendored components.

The core CRM workspace is implemented against the locked CRM release baseline;
the current append-only storage schema is version 11. Source parity and release
validation remain tracked explicitly. The full parity contract and phased task
breakdown live in [docs/PORT_PLAN.md](docs/PORT_PLAN.md). Track exact source
capabilities in [docs/PARITY_MATRIX.md](docs/PARITY_MATRIX.md) and checks that
have actually run in [docs/QA.md](docs/QA.md).

Currently working end to end:

- one BB-native CRM sidebar destination; Overview, Companies, Contacts, Deals,
  and Agents are centered in the host-owned title row on wide desktop and fall back to a
  compact in-panel row below 1280px; BB Settings owns CRM configuration
- source-shaped dashboard with Me (the installation-local
  owner)/Everyone scope,
  pipeline, performance, six-month trend, closing totals, overdue work, and
  recent activity
- append-only SQLite storage (schema 12) for companies, contacts, deals,
  activities, saved views, custom fields, agent lifecycles, connection health,
  tracking sites/events, daily traffic-source rollups, and the installation's
  website/optional company profile
- company, contact, deal, and agent tables with a compact single-row command
  bar; company/contact/deal search and filtering stay grouped on the left,
  while sorting, saved views, columns, and archive scope stay grouped on the
  right. BB-native facet popovers add search when option volume merits it,
  while icon-only save-view, sort-direction, columns, and archive controls use
  one ghost-button style and expose accessible top tooltips; pagination,
  standard/custom facets, saved-view restore/defaults, row
  selection, and bulk owner/company/stage/archive/restore/purge operations
  where applicable, plus persistent column visibility/order, deep-linked wide
  drawers, nested relationship navigation, primary-contact assignment with a
  same-company invariant, source-shaped related-record payloads including
  archived relationships, deterministic favicon URLs, and realtime invalidation
- contextual facet counts scoped to the current search/archive view (including
  7/30/90-day activity windows and `field:<key>` custom-field facets),
  associated-company search for contacts/deals, and company contact/all-deal
  count sorting; owner sorting remains stable local owner-ID sorting because BB
  exposes no plugin identity directory
- work-email auto-company resolution for eligible domains and normalized
  contact-email suppression tombstones on purge, cleared only by explicit
  recreation
- persisted first-open onboarding in a modal with a visually legible title-bar
  progress ring; uniform ghost icon actions for expandable search, enrichment,
  checklist, and New; and cross-record global search for companies,
  contacts, and deals; a keyboard-accessible global New
  menu for company/contact/deal/agent plus record-attached note/task creation
- a shell-level enrichment queue for persisted local agent runs, field
  backfills, due tasks, and scheduled work, with record context and explicit
  local-status wording rather than provider-delivery claims
- shared record timelines with note/call/email/meeting/task composition,
  sticky day groups, automatic cursor pagination, readable stage/enrichment
  transitions, task completion/reopen, and opt-in leased dispatch of due tasks
  to one explicitly configured live BB agent
- eleven-currency source amounts, frozen reporting money, manual and trusted
  provider-labelled rate ingestion, audit history, missing-rate disclosure,
  and explicit re-rate
- optimistic inline editing with rollback across company, contact, and deal
  drawers; HTTPS contact portraits with initials fallback; and custom-field
  administration, typed record editing, coverage, bounded evidence-only
  fill-rest runs, ordering, options, visibility flags, and agent instructions
- agent definitions, versions, validation/deployment, manual, scheduled,
  transactional CRM-event, and signed external-webhook triggers; durable
  runs/actions/audit history; safe agent deletion with hidden BB-worker cleanup;
  hidden BB-thread dispatch; and the bundled `crm`
  operating skill with evidence-backed enrichment tools; record Agent tabs
  render plugin-spawned linked BB threads through host `ThreadChat`; manual
  runs accept bounded BB project attachments, and agents can ask a strict
  native clarification question when the selected provider does not already
  supply that capability
- evidence review for proposed facts/work history, immutable background brief
  versions, approval resolution, auditable run retry, and linked-thread cancel
- live bounded Google Gmail/Calendar and Microsoft Outlook sync with durable
  cursors, normalized threads/events, contact matching, timeline projection,
  inline detail, manual refresh, and a background worker; live Slack channel
  and people inventory with exact-email matches plus join/create controls;
  tracking-site allowed-domain and cross-domain configuration, cookie controls,
  privacy rules, observed-page-view verification evidence, pause/rotate/revoke,
  a fixed loader and public domain/token/privacy-validated collector, daily
  source/medium rollups with visitor-days, archive/event retention services,
  and one-time token display
- strict company/contact/deal/activity/currency/field/saved-view wire contracts
  plus source-named deal, outstanding-work, field-management, history,
  job-change, and recheck agent workflows

The current BB SDK does not provide plugin RBAC/current-user identity, a plugin
identity directory, or a plugin blob API. CRM owner facets and sorting therefore
use stable installation-local owner IDs; roles, per-user authorization, and
general-purpose API keys are not issued. Contact portraits and company favicons
retain validated HTTPS source URLs rather than copying remote bytes into plugin
storage. Provider tokens are stored only in BB server-side secret settings.
OAuth/device callbacks and refresh-token writes require a host relay or
operator-managed rotation because the plugin SDK cannot update secret settings;
live sync runs once those secrets are configured. Agent thread cancellation can remain pending while
BB reports a thread as stopping. External webhook triggers require a producer,
and a public builder-share relay plus unrelated global BB thread-panel/mention
surfaces are not included. Tracking reports anonymous site/path/source/medium
aggregates and visitor-days; without a verified identity contract it does not
attribute anonymous visitors to CRM records or claim source-level Website
Activity. These limits and the remaining source boundaries are recorded in
[docs/PARITY_MATRIX.md](docs/PARITY_MATRIX.md).

## CLI

The plugin exposes repeatable record operations through `bb crm`. JSON
payloads may be passed as one positional argument or with `--data`; payloads
are validated against the same strict contracts used by RPC and agent tools.

```sh
bb crm help
bb crm status --json
bb crm doctor --json
bb crm list company --q acme --json
bb crm show contact <contact-id> --json
bb crm create company '{"name":"Acme","domain":"acme.example"}' --json
bb crm update company <company-id> '{"industry":"Software"}' --json
bb crm archive deal <deal-id> --json
bb crm restore deal <deal-id> --json
bb crm bulk deal set-stage --ids <deal-id>,<deal-id> --stage CONTRACT_SENT --json
bb crm purge contact <contact-id> --json
bb crm add-activity '{"type":"NOTE","companyId":"<company-id>","body":"Called"}' --json
bb crm tasks upcoming --json
bb crm export company --format csv
bb crm import company '<versioned-json-or-csv>' --format json --json
```

`export` writes versioned JSON (`{version, entity, records}`) or CSV to
stdout. Imports accept that JSON document, a JSON array, or CSV inline in the
CLI argument. This is bounded CRM-record interchange, not a lossless database
backup: activities, saved views, agents, connections, tracking data, and other
related tables are intentionally excluded. The CLI never reads or prints
secret plugin settings.

## Install

From a local clone:

```sh
npm install
bb plugin install . --yes
bb plugin dev
```

From the public Git repository:

```sh
bb plugin install https://github.com/juanbermudez/bb-plugin-crm
```

## Development

```sh
npm run typecheck
npm test
npm run build
```

The BB SDK surface is pinned in `devDependencies`. Sync it to a different BB
release before changing plugin APIs:

```sh
bb plugin types
```

Vendored UI source lives in `components/ui`. Add version-matched components
from BB's registry. `@radix-ui/react-dialog` is host-shimmed and type-only.
BB-shimmed packages remain type-only `devDependencies`, as required by
`bb plugin types`. Development declarations are pinned to the current
published SDK (`0.4.22`), while the declared compatibility floor remains SDK
`0.4.8` / BB `0.39` and is verified through a managed old-host install. The local
`@bb-crm/bb-039-ui-runtime` compatibility package
supplies exact `class-variance-authority`, `clsx`, and `tailwind-merge` pins to
managed Git builds on that declared BB `0.39` minimum, whose published builder
predates those shims. Current BB externalizes the same imports, so the
compatibility package does not duplicate them in the extension bundle.

## Architecture

- `server.ts` wires the plugin server surfaces.
- `app.tsx` registers the CRM application inside BB.
- `db/` owns SQLite migrations and record stores.
- `contracts/` owns strict RPC boundary schemas.
- `agent-dispatch.ts` owns BB-thread dispatch and lifecycle reconciliation;
  `agent-attachments.ts` owns bounded BB project attachment operations;
  connection/tracking and other CRM domain stores live under `db/`.
- `app/` and `views/` own the BB-native interface.
- `skills/crm/SKILL.md` teaches BB agents the CRM workflow.
- `docs/PORT_PLAN.md` is the parity contract and delivery plan.

## License and attribution

This repository is MIT licensed. The product model and ported behavior derive
from `trycompai/crm`, which is MIT licensed. BB is MIT licensed.
