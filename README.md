# CRM for BB

A local-first, agent-native CRM workspace that runs as a BB extension.

This project ports the MIT-licensed [Comp AI CRM](https://github.com/trycompai/crm)
into BB. It preserves the source product's table-first company, contact, deal,
activity, enrichment, integration, and agent workflows. The interface uses BB
theme tokens and version-matched vendored components.

The implementation is in progress. The full parity contract and phased task
breakdown live in [docs/PORT_PLAN.md](docs/PORT_PLAN.md). Track exact source
capabilities in [docs/PARITY_MATRIX.md](docs/PARITY_MATRIX.md) and checks that
have actually run in [docs/QA.md](docs/QA.md).

Currently working end to end:

- source-shaped dashboard with personal/team scope, pipeline, performance,
  six-month trend, closing totals, overdue work, and recent activity
- append-only SQLite storage for companies, contacts, deals, activities,
  saved views, and custom fields
- company, contact, and deal tables with search, pagination, saved views,
  dynamic-field filtering, deep-linked wide drawers, relationships, archive,
  restore, purge, bulk RPC, and realtime invalidation
- shared record timelines with note/call/email/meeting/task composition,
  cursor pagination, and task completion/reopen
- eleven-currency source amounts, frozen reporting money, manual rate
  administration, audit history, missing-rate disclosure, and explicit re-rate
- custom-field administration, typed record editing, coverage, ordering,
  options, visibility flags, and agent instructions
- seven native BB agent tools for CRM search, record reads/creates/updates,
  activities, tasks, and custom fields, plus the bundled `crm` operating skill
- strict company/contact/deal/activity/currency/field/saved-view wire contracts

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
- `services/` owns CRM domain behavior and integrations.
- `app/` and `views/` own the BB-native interface.
- `skills/crm/SKILL.md` teaches BB agents the CRM workflow.
- `docs/PORT_PLAN.md` is the parity contract and delivery plan.

## License and attribution

This repository is MIT licensed. The product model and ported behavior derive
from `trycompai/crm`, which is MIT licensed. BB is MIT licensed.
