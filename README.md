# CRM for BB

A local-first, agent-native CRM workspace that runs as a BB extension.

This project ports the MIT-licensed [Comp AI CRM](https://github.com/trycompai/crm)
into BB. It preserves the source product's table-first company, contact, deal,
activity, enrichment, integration, and agent workflows. The interface uses BB
theme tokens and version-matched vendored components.

The core CRM workspace is implemented; source parity and release validation
remain tracked explicitly. The full parity contract and phased task breakdown
live in [docs/PORT_PLAN.md](docs/PORT_PLAN.md). Track exact source
capabilities in [docs/PARITY_MATRIX.md](docs/PARITY_MATRIX.md) and checks that
have actually run in [docs/QA.md](docs/QA.md).

Currently working end to end:

- BB-native shell and source-shaped dashboard with Me (the installation-local
  owner)/Everyone scope,
  pipeline, performance, six-month trend, closing totals, overdue work, and
  recent activity
- append-only SQLite storage for companies, contacts, deals, activities,
  saved views, custom fields, agent lifecycles, connection health, and tracking
  sites/events
- company, contact, and deal tables with search, pagination, sorting and
  direction, standard/custom facets, saved-view restore/defaults, row
  selection, and bulk owner/company/stage/archive/restore/purge operations
  where applicable, plus persistent column visibility/order, deep-linked wide
  drawers, nested relationship navigation, primary-contact assignment, and
  realtime invalidation
- persisted first-open onboarding, CRM header actions, and cross-record global
  search for companies, contacts, and deals
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
- connection health/diagnostics boundaries for Google, Microsoft, and Slack;
  tracking-site operator confirmation, pause/rotate/revoke, a fixed loader and public
  domain/token/privacy-validated collector, daily rollups, archive/event
  retention services, and one-time token display
- strict company/contact/deal/activity/currency/field/saved-view wire contracts

The current BB SDK does not provide plugin RBAC/current-user identity or a
plugin blob API. Contact portraits therefore retain an HTTPS source URL rather
than copying remote bytes into plugin storage. Provider OAuth, provider
authorization, and live mail/calendar/Slack sync require externally supplied
provider/agent-tool credentials and host authorization; none is bundled.
Connections remain metadata/health boundaries until that flow is configured.
Agent thread cancellation can remain pending while BB reports a thread as
stopping. External webhook triggers require a producer, and a public share
relay is not included. General-purpose API keys are not issued
because BB exposes no safe current-user/RBAC authority for them. These limits
and the remaining source gaps are recorded in
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
bb crm add-activity '{"type":"NOTE","companyId":"<company-id>","body":"Called"}' --json
bb crm tasks upcoming --json
bb crm export company --format csv
bb crm import company '<versioned-json-or-csv>' --format json --json
```

`export` writes versioned JSON (`{version, entity, records}`) or CSV to
stdout. Imports accept that JSON document, a JSON array, or CSV inline in the
CLI argument. The CLI never reads or prints secret plugin settings.

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
from BB's registry and keep runtime-shimmed dependencies in `devDependencies`.

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
