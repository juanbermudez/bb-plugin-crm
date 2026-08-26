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

- BB-native shell and source-shaped dashboard with Me/Everyone scope,
  pipeline, performance, six-month trend, closing totals, overdue work, and
  recent activity
- append-only SQLite storage for companies, contacts, deals, activities,
  saved views, custom fields, agent lifecycles, connection health, and tracking
  sites/events
- company, contact, and deal tables with search, pagination, sorting and
  direction, standard/custom facets, saved-view restore/defaults, row
  selection, and bulk owner/company/stage/archive/restore/purge operations
  where applicable, plus deep-linked wide drawers, relationships, and realtime
  invalidation
- shared record timelines with note/call/email/meeting/task composition,
  cursor pagination, and task completion/reopen
- eleven-currency source amounts, frozen reporting money, manual rate
  administration, audit history, missing-rate disclosure, and explicit re-rate
- custom-field administration, typed record editing, coverage, ordering,
  options, visibility flags, and agent instructions
- agent definitions, versions, validation/deployment, manual and scheduled
  triggers, durable runs/actions/audit history, hidden BB-thread dispatch, and
  the bundled `crm` operating skill with seven native CRM tools
- connection health/diagnostics boundaries for Google, Microsoft, and Slack;
  tracking-site verification, pause/rotate/revoke, privacy-safe ingestion,
  daily rollups, retention pruning, and one-time token display
- strict company/contact/deal/activity/currency/field/saved-view wire contracts

The current BB SDK does not provide plugin RBAC/current-user identity or a
plugin blob API. OAuth credentials and provider authorization are not bundled;
connections remain metadata/health boundaries until a host-authorized flow is
configured. Agent thread cancellation can remain pending while BB reports a
thread as stopping. Event/webhook triggers require an external producer, and a
public share relay is not included. These limits and the remaining source gaps
are recorded in [docs/PARITY_MATRIX.md](docs/PARITY_MATRIX.md).

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
  connection/tracking and other CRM domain stores live under `db/`.
- `app/` and `views/` own the BB-native interface.
- `skills/crm/SKILL.md` teaches BB agents the CRM workflow.
- `docs/PORT_PLAN.md` is the parity contract and delivery plan.

## License and attribution

This repository is MIT licensed. The product model and ported behavior derive
from `trycompai/crm`, which is MIT licensed. BB is MIT licensed.
