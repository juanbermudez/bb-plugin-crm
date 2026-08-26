# Upstream source inventory

This inventory reconciles the `trycompai/crm` release baseline
`6d4793dd6d7aeea91aa6a034e00b17d7408a2d08` with the BB extension. It is the
route-and-module index behind the detailed behavior rows in
`PARITY_MATRIX.md`. A mapped row does not override that matrix's status or the
verified evidence in `QA.md`.

## Application routes

| Upstream route source | Upstream surface | BB extension surface | Evidence/status |
| --- | --- | --- | --- |
| `apps/app/app/(landing)/page.tsx` | Marketing landing | GitHub README and marketplace listing | host-owned |
| `apps/app/app/(landing)/sign-in/page.tsx` | Sign in | BB application session | host-owned |
| `apps/app/app/(landing)/grant-access/page.tsx` | Mailbox access grant | Connections status plus operator-provisioned provider credentials | provider authorization boundary |
| `apps/app/app/(landing)/onboarding/page.tsx` | Workspace onboarding | Persisted CRM setup checklist and Workspace settings | done |
| `apps/app/app/(landing)/onboarding/research/page.tsx` | Research setup | Live BB research-agent selection | done |
| `apps/app/app/(app)/[slug]/page.tsx` | Dashboard | `dashboard` panel route | done |
| `apps/app/app/(app)/[slug]/companies/page.tsx` | Company table | `companies` panel route | done |
| `apps/app/app/(app)/[slug]/companies/[companyId]/page.tsx` | Company record sheet | Deep-linked wide BB drawer | done |
| `apps/app/app/(app)/[slug]/contacts/page.tsx` | Contact table | `contacts` panel route | done |
| `apps/app/app/(app)/[slug]/contacts/[contactId]/page.tsx` | Contact record sheet | Deep-linked wide BB drawer | done |
| `apps/app/app/(app)/[slug]/deals/page.tsx` | Deal table | `deals` panel route | done |
| `apps/app/app/(app)/[slug]/deals/[dealId]/page.tsx` | Deal record sheet | Deep-linked wide BB drawer | done |
| `apps/app/app/(app)/[slug]/(agent-builder)/agents/page.tsx` | Agent builder home | `agents` panel route with BB thread composer | done |
| `apps/app/app/(app)/[slug]/(agent-builder)/agents/[agentId]/page.tsx` | Agent detail | Deep-linked agent drawer | done |
| `apps/app/app/(app)/[slug]/(agent-builder)/chat/page.tsx` | New builder chat | BB-native builder home | done |
| `apps/app/app/(app)/[slug]/(agent-builder)/chat/[chatId]/page.tsx` | Builder conversation | Visible linked BB `ThreadChat` | done |
| `apps/app/app/(app)/[slug]/settings/page.tsx` | General workspace settings | Workspace, fields, currency, connections, and tracking sections | done |
| `apps/app/app/(app)/[slug]/settings/currencies/page.tsx` | Reporting currency and rates | Currency settings section | done |
| `apps/app/app/(app)/[slug]/settings/tracking/page.tsx` | Tracking setup | Tracking settings section and fixed loader/collector routes | done/adapted for privacy |
| `apps/app/app/(app)/[slug]/settings/connections/page.tsx` | Connection overview | Connections section with health, diagnostics, and provider metadata | done |
| `apps/app/app/(app)/[slug]/settings/connections/google/page.tsx` | Google connection and sync controls | Live Gmail/Calendar sync, cursors, health, manual/background sync | done with operator-provisioned BB secret; OAuth callback host-owned |
| `apps/app/app/(app)/[slug]/settings/connections/microsoft/page.tsx` | Microsoft mail connection and sync controls | Live Outlook mail sync, cursor, health, manual/background sync | done with operator-provisioned BB secret; OAuth/device flow host-owned |
| `apps/app/app/(app)/[slug]/settings/connections/slack/page.tsx` | Slack connection and channels | Live inventory, join/create actions, health, manual/background sync | done with operator-provisioned BB secrets; OAuth callback host-owned |
| `apps/app/app/(app)/[slug]/settings/connections/slack/people/page.tsx` | Slack identity matches | Durable exact-email CRM contact matches | done; BB user-directory/RBAC ownership remains host-owned |
| `apps/app/app/(app)/[slug]/settings/connections/intake/page.tsx` | Intake surface | Explicitly unavailable in the source baseline; no unused endpoint is exposed | host-owned |
| `apps/app/app/(app)/[slug]/settings/api-keys/page.tsx` | General API keys | No unsafe installation-token delegation | BB current-user/RBAC gap |
| `apps/app/app/(app)/[slug]/settings/members/page.tsx` | Workspace membership | Installation-local owner | BB identity/RBAC gap |
| `apps/app/app/(app)/[slug]/settings/sso/page.tsx` | SSO | BB authentication settings | host-owned |

## API and workflow modules

| Upstream module | BB extension owner | Status |
| --- | --- | --- |
| `activities` | `db/activities.ts`, activity RPC, timeline UI, CLI, agent tools | done |
| `agent` | `db/agents.ts`, dispatcher, tools, triggers, run/audit UI | done |
| `companies` | company store/contracts/RPC/CLI/table/drawer | done |
| `contacts` | contact store/contracts/RPC/CLI/table/drawer/evidence | done |
| `conversations` | BB thread links and host `ThreadChat` | done; public share relay unavailable |
| `currency` | currency store, frozen conversions, settings, dashboard disclosures | done |
| `dashboard` | dashboard query and BB-tokenized view | done |
| `deals` | deal store/contracts/RPC/CLI/table/drawer | done |
| `enrichment` | BB research-agent runs, evidence tools, aggregate queue | done/adapted |
| `fields` | typed definitions/options/values, columns, facets, fill-rest | done |
| `saved-views` | versioned saved views and installation defaults | done |
| `search` | global cross-record search and deep links | done |
| `settings` and `workspace` | plugin settings plus schema-12 workspace identity/provider state | done/adapted |
| `tracking` | site-scoped privacy-safe loader, collector, rollups, and settings | done/adapted |
| `archive` | retention setting, bounded prune service, purge invariants | done |
| `google`, `microsoft`, `mailbox`, and `sync` | bounded adapters, schema-12 normalized mailbox/calendar storage, cursors, activities, and manual/background sync | done with external authorization boundary |
| `slack` | bounded adapter, durable inventory/matches, join/create actions, settings UI, and manual/background sync | done with external authorization boundary |
| `api-keys`, `users`, and `sso` | BB host session/identity boundary | host-owned or unavailable through the public plugin SDK |
| `telemetry` | omitted | product telemetry is not a CRM user feature |

## Verification rule

A source route is complete only when its outcome is implemented or the BB host
owns the same responsibility. A source module is not complete merely because a
connection card or schema placeholder exists. Provider rows require normalized
storage, bounded sync, controls, and tests. The public SDK cannot complete an
OAuth callback or write refreshed secrets, so authorization and refresh-token
custody remain an explicit host/operator boundary rather than a local token store.
