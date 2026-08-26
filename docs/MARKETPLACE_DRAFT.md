# BB Community marketplace draft

This is the proposed listing and release checklist for the CRM extension. The
marketplace contains metadata only; the plugin source remains in the public
Git repository.

## Baseline and current release inputs

- Marketplace repository: `https://github.com/get-bb/marketplace`
- Marketplace default branch: `main`
- Audited marketplace baseline: `a683caa2ffb502cdc26926c48c88a45a8579970a`
- Local audit clone: `../marketplace-upstream`
- Plugin repository: `https://github.com/juanbermudez/bb-plugin-crm.git`
- Plugin package name: `bb-plugin-crm`
- Derived plugin id: `crm`
- Current manifest package version (release approval still pending): `0.1.0`
- Proposed immutable tag: `v0.1.0`
- Proposed marketplace source range: `^0.1.0`
- Declared engines: BB `>=0.39`; plugin SDK `>=0.4.8`
- Current plugin icon: `assets/icon.svg` (784 bytes, SHA-256
  `f1ddd8a46e88b19777e38d4a2cbc0fe222a4497d64f5b163248a3d78b91a61b1`)
- Proposed vendored marketplace icon: copy `assets/icon.svg` to
  `icons/crm-f1ddd8a4.svg` in the marketplace repository. The entry must
  reference only that copied file, never the plugin repository or a remote URL.

The release commit and remote-mutating release commands remain placeholders
until explicit release approval. The proposed version, immutable tag, and
source range are concrete so this entry is ready for review. No production tag
or public-tag install is claimed by this draft.

## Proposed `entries/crm.json`

After copying the icon into the marketplace repository, add exactly one entry
file with this shape. Update the description, tags, and release range only if
the final plugin manifest or verified feature set changes. The audited
marketplace schema does not accept an `engines` field on individual entries;
compatibility remains authoritative in the plugin manifest.

```json
{
  "id": "crm",
  "displayName": "CRM",
  "description": "Manage companies, contacts, deals, activities, custom fields, agent automation, connection health, and privacy-safe site tracking inside BB.",
  "icon": {
    "url": "./icons/crm-f1ddd8a4.svg"
  },
  "tags": [
    "crm",
    "companies",
    "contacts",
    "deals",
    "sales",
    "pipeline",
    "enrichment",
    "agents",
    "custom-fields",
    "tracking"
  ],
  "author": {
    "name": "Juan Bermudez",
    "github": "juanbermudez",
    "url": "https://github.com/juanbermudez"
  },
  "source": {
    "git": {
      "url": "https://github.com/juanbermudez/bb-plugin-crm.git",
      "range": "^0.1.0"
    }
  }
}
```

The source is a repository-root plugin, so `subdir` and `tagPrefix` are not
included. The proposed range becomes live only after the public repository has
the approved `v0.1.0` tag. If the release is intentionally pinned, replace
`range` with an immutable `ref` and document that choice in the PR.

## Marketplace PR body template

Replace all angle-bracket placeholders with evidence from the approved
release; do not claim a release check passed until it has run against the
approved release tag.

```md
## What the plugin does

CRM brings the CRM workspace into BB as a native extension for managing
companies, contacts, deals, activities, saved views, custom fields, currency
reporting, agent definitions/runs, connection health, and privacy-safe site
tracking. The current build includes persisted onboarding/columns, linked
record Agent threads, evidence review, provider-gated enrichment/research,
transactional CRM event triggers, signed external webhook triggers, fixed
tracking loader/collector routes, inline record editing, contact portrait URL
fallbacks, bounded custom-field fill-rest, due-task leasing, native agent
clarification, BB project attachments, archive retention, a BB-thread
dispatcher, global activity creation, a shell-level enrichment queue, and the
installation CLI for status, doctor, lists, CRUD, add-activity, tasks, and
versioned import/export. Natural-language builder chat includes durable
visible-thread history, explicit new/delete actions, and reviewed
assistant-message transfer into a version draft. Public sharing is not
included because BB exposes no public plugin share relay. The
source's intake route remains unavailable; tracking ingestion uses
operator-confirmed site authority.

## Source release

- Repository: `https://github.com/juanbermudez/bb-plugin-crm.git`
- Release: `v0.1.0` → `<approved-release-commit>`
- Marketplace range: `^0.1.0`
- Plugin id: `crm`, derived from `bb-plugin-crm`
- Repository layout: root plugin; no `subdir` or `tagPrefix`

## Plugin checks

- Integrated release-candidate checks in the local working tree (schema
  version 10): `npm test` passed with 50 test files / 256 tests;
  `npm run typecheck` passed; `./node_modules/.bin/bb plugin types --check .`
  passed; `npm run build` passed and emitted identity-checked metadata; and
  `git diff --check` passed.
- Release-boundary audit passed for the manifest, runtime dependencies, SDK
  imports, generated metadata, package contents, icon, migrations, security
  boundaries, and checked-in release claims. These are local working-tree
  checks and do not claim a public release.
- A managed Git install and packaged-BB `0.39.0` panel smoke passed from the
  corrected exact public release-candidate commit after the integrated parity
  work. It resolved the requested commit, reported schema 10, clean SQLite/FK
  health, both background services running, and zero browser-console errors.
  A public-tag install is still required after approval; none is claimed yet.
- The managed smoke covered Dashboard Me (installation-local owner)/Everyone,
  saved defaults, advanced Companies facets/selection, Agent creation,
  Connections/Tracking empty states, tracking-site one-time credentials, CLI
  status/doctor/list, onboarding, global search, column controls, record Agent
  empty-state behavior, provider-backed enrichment controls, the deal stage
  stepper, contact portraits/Photo URL editing, the fixed public tracking
  loader, bounded drawers, drawer-tab URL restoration, CRM keyboard search and
  entity selection, builder Conversation fail-closed behavior, closed-stage
  reasons, BB AlertDialogs, all six global creation actions, the enrichment
  queue empty state/Escape behavior, and the Settings/Tracking deep link.
- A complete keyboard-only sweep, light/custom-theme sweep, and
  Electron-specific QA were not run. Final clean-tag package and BB smoke
  evidence remains required.

## Marketplace checks

- `<approved marketplace install command>` remains release-gated and unrun.
- A temporary concrete entry/icon passed `npm ci` and `npm run build` at the
  audited marketplace baseline, producing 83 entries. Re-run the approved
  marketplace build command after release.
- The temporary `npm run check` reached the expected source-liveness gate and
  failed only because the approved release tag does not exist yet.
- The temporary build validated entry id `crm`, its repository-root source
  shape, and `icons/crm-f1ddd8a4.svg` against the strict schema.
- The audited source icon is 784 bytes with SHA-256
  `f1ddd8a46e88b19777e38d4a2cbc0fe222a4497d64f5b163248a3d78b91a61b1`.

### Schema/build audit status

The draft entry shape and repository-root source layout were manually checked
against the local marketplace checkout `../marketplace-upstream` at audited
baseline `a683caa2ffb502cdc26926c48c88a45a8579970a`, including
`schema/marketplace.schema.json` and `scripts/build.mjs`. The draft intentionally
omits per-entry `engines`, `subdir`, and `tagPrefix`. A temporary concrete
entry/icon passed `npm ci` and `npm run build` (83 entries); `npm run check`
failed only at the expected source-liveness gate because `v0.1.0` has not been
approved or created. No marketplace check or PR exists, and no full
marketplace pass is claimed before that tag.

## Permissions and security

- The plugin runs as full-trust BB extension code.
- CRM records, agent state, connection metadata/health, and tracking data are
  stored in the BB plugin SQLite database. Small plugin settings hold the
  workspace name, reporting currency, and optional research-agent id; provider
  credentials remain in that agent's configured tools. No broad filesystem API
  or direct provider credential store is bundled.
- BB threads/projects, realtime invalidation, background services, settings,
  and the plugin CLI are the host surfaces used by the implementation.
- Agent attachments are bounded, copied through resolved BB project APIs, and
  never accept an arbitrary local path. Due CRM task dispatch is installation-
  local, opt-in, lease-fenced, and does not create or claim host-visible BB
  Tasks.
- Provider authorization and OAuth credentials remain host-managed and are not
  bundled. Live mail/calendar/Slack sync additionally requires externally
  supplied provider/agent-tool credentials and host authorization. Tracking
  secrets are displayed once at provisioning and are not returned by list/read
  views; optional integrations fail closed and secrets are not returned to the
  frontend.
- BB SDK `0.4.8` exposes no plugin RBAC/current-user identity or blob API;
  contact photos therefore keep an HTTPS source URL with initials fallback.
  Webhook triggers require external producers, a thread reported as
  `stopping` may remain pending because there is no public cancellation
  lifecycle, and no public share relay is included.
- MIT license and upstream attribution are included in the repository.
```

## Release checklist

### Plugin contract and source

- [ ] Confirm `package.json` still has `name: "bb-plugin-crm"`, the
  `<approved-version>`, `bb.name`, `bb.description`, `bb.branding`, `bb.server`,
  and `bb.app`.
- [ ] Run the official ID helper and confirm it returns `crm`:

  ```sh
  node /path/to/bb/apps/server/src/services/skills/builtin-skills/submit-a-plugin/scripts/derive-plugin-id.mjs package.json
  ```

- [ ] Keep the marketplace id, filename, and manifest-derived id identical.
- [ ] Run `./node_modules/.bin/bb plugin types --check .` against the BB
  version being released against;
  then run `npm install` and commit the intentional dependency/lockfile
  changes.
- [ ] Run the clean gate: `npm run typecheck`, `npm test`, `npm run build`, and
  `git diff --check`.
- [ ] Inspect every generated `dist/*.meta.json` for matching plugin id,
  plugin version, SDK major/version, artifact format, and build metadata.
- [ ] Verify runtime imports are resolvable after BB's managed
  `npm install --omit=dev`, SDK/type tooling and portal shims are exact
  `devDependencies`, and no private `@bb/*` package is imported. For the
  declared BB `0.39` minimum, keep the exact `class-variance-authority`,
  `clsx`, and `tailwind-merge` runtime pins: the published 0.39 builder does
  not yet provide their newer host shims.
- [ ] Run the frontend/backend SDK harness tests with real temporary SQLite;
  do not mock the database.
- [ ] Complete live BB panel QA for every implemented view, drawer, keyboard
  path, theme, compact layout, reload, and error/empty state. Electron-specific
  QA is a separate, still-open check.

### Public Git release

- [ ] Confirm the authenticated account is `juanbermudez`:

  ```sh
  gh auth status
  gh api user --jq .login
  ```

- [ ] Confirm `https://github.com/juanbermudez/bb-plugin-crm` is public and
  contains the reviewed source, license, attribution, tests, and docs.
- [ ] Inspect `<approved-release-commit>` and verify the package version is
  `<approved-version>`.
- [ ] Before the first release mutation, obtain explicit approval for these
  exact values: account, repository/remote, release commit, package/version,
  tag, source range, and commands below.
- [ ] After approval, create and push a new immutable annotated tag. Never
  move or replace a release tag:

  ```sh
  <approved immutable tag command>
  <approved push command>
  <approved remote-tag verification command>
  ```

- [ ] Clone `<approved-release-tag>` into a clean temporary directory, run the
  approved Git install/build path, and inspect `package.json`, `bb`, and all
  entry files.
- [ ] Record `<approved-release-commit>` for the marketplace PR body.

### Marketplace entry and PR

- [ ] Fork `get-bb/marketplace` as `juanbermudez`, or reuse the existing fork
  only after verifying its remote URL and branch state.
- [ ] Start `submit-crm` from the audited `upstream/main`; refresh it from
  current `get-bb/marketplace:main` immediately before editing.
- [ ] Copy `assets/icon.svg` to `icons/crm-f1ddd8a4.svg`; verify it is SVG,
  under 256 KB, content-hashed, monochrome/currentColor, and free of scripts,
  external references, and private data.
- [ ] Add only `entries/crm.json` and the vendored icon. Do not commit
  `dist/`, `node_modules/`, or unrelated marketplace changes.
- [ ] Run the marketplace checks from the marketplace clone:

  ```sh
  <approved marketplace install command>
  <approved marketplace build command>
  <approved marketplace check command>
  git status --short
  git diff --check
  git diff -- entries/crm.json icons/
  ```

- [ ] Confirm `<approved marketplace check command>` sees the public
  `<approved-release-tag>`, while separately verifying that tag contains the
  reviewed plugin. Marketplace liveness checks
  tag/ref existence but do not build or review plugin behavior.
- [ ] Confirm the plugin manifest still declares the audited engine floors,
  `author.github` is `juanbermudez`, and the description states observed user
  value in one concrete sentence. Do not add entry fields absent from the
  current strict marketplace schema.
- [ ] Commit only the entry/icon, push `submit-crm`, and open the PR against
  `get-bb/marketplace:main` after the final validation:

  ```sh
  <approved marketplace add/commit command>
  <approved marketplace push command>
  <approved marketplace PR command>
  ```

- [ ] Do not wait for merge unless monitoring is explicitly requested.

### Future releases

- [ ] Publish a new immutable `<approved-next-version>` tag within
  `<approved-source-range>` for compatible
  updates; no marketplace PR is needed for ordinary range-compatible releases.
- [ ] Open a new marketplace PR for source URL, branding, description, owner,
  subdirectory, tag prefix, or range changes.
- [ ] Use `bb plugin outdated` to preview a compatible update and
  `bb plugin update crm` to apply it manually; BB does not auto-install catalog
  updates.

## Local live-test loop

The official SDK test harness verifies registration, JSON/RPC boundaries,
storage behavior, and interaction logic. It does not reproduce BB layout/CSS,
persistence, routing, or multi-plugin arbitration, so live BB testing remains
required.

1. Start the BB source checkout with `scripts/bb-dev-app current` (or
   `pnpm dev:desktop`) and read actual ports with `pnpm dev:status`.
2. Point CLI commands at that instance:

   ```sh
   eval "$(scripts/bb-dev-app env)"
   ```

3. Install the plugin by path once:

   ```sh
   cd /path/to/bb-plugin-crm
   npm install
   bb plugin install . --yes
   ```

4. Run `bb plugin dev`. Save → readable frontend rebuild → plugin reload; an
   open CRM page should remount without a browser refresh. Build/reload errors
   must be fixed while the loop continues watching.
5. Observe runtime state with `bb plugin list --json` and
   `bb plugin logs crm -f`. Exercise each RPC directly with the plugin route
   when useful:

   ```sh
   curl -X POST \
     -H "content-type: application/json" \
     -d '<valid-json-input>' \
     "$BB_SERVER_URL/api/v1/plugins/crm/rpc/<method>"
   ```

6. In the live BB panel, verify the dashboard, company/contact/deal tables,
   filters, saved views, bulk actions, record drawers, timeline/activity
   composer, search, agent surfaces, settings, and connection/error states at
   wide and compact widths. Verify BB light/dark/custom themes and keyboard
   focus/escape behavior for wide drawers and compact overlays. Electron-
   specific QA remains a separate, unrun check.
7. After live QA, run the release commands again, create the clean release
   commit/tag, and repeat the public-tag install test before marketplace
   validation.
