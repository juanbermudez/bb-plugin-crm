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
- Current package version: `0.1.0`
- Declared engines: BB `>=0.39`; plugin SDK `>=0.4.8`
- Current plugin icon: `assets/icon.svg` (784 bytes, SHA-256
  `f1ddd8a46e88b19777e38d4a2cbc0fe222a4497d64f5b163248a3d78b91a61b1`)
- Proposed vendored marketplace icon: copy `assets/icon.svg` to
  `icons/crm-f1ddd8a4.svg` in the marketplace repository. The entry must
  reference only that copied file, never the plugin repository or a remote URL.

The release commit and tag are intentionally left open until parity work and
live QA finish. The proposed first Git release is an immutable `v0.1.0` tag.

## Proposed `entries/crm.json`

After copying the icon into the marketplace repository, add exactly one entry
file with this shape. Update the description, tags, engine floors, and release
range only if the final plugin manifest or verified feature set changes.

```json
{
  "id": "crm",
  "displayName": "CRM",
  "description": "Manage companies, contacts, deals, activities, and agent-driven research inside BB.",
  "icon": {
    "url": "./icons/crm-f1ddd8a4.svg"
  },
  "tags": [
    "crm",
    "companies",
    "contacts",
    "deals",
    "activities",
    "sales",
    "pipeline",
    "enrichment",
    "agents",
    "interface"
  ],
  "author": {
    "name": "Juan Bermudez",
    "github": "juanbermudez",
    "url": "https://github.com/juanbermudez"
  },
  "engines": {
    "bb": ">=0.39",
    "bbPluginSdk": ">=0.4.8"
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
included. The range is valid only after the public repository has a
`v0.1.0` tag. If the release is intentionally pinned, replace `range` with an
immutable `ref` and document that choice in the PR.

## Marketplace PR body template

Replace all angle-bracket placeholders with evidence from the final release;
do not claim a check passed until it has run against the release tag.

```md
## What the plugin does

CRM brings the CRM workspace into BB as a native extension for managing
companies, contacts, deals, activities, saved views, enrichment, and
agent-driven research.

## Source release

- Repository: `https://github.com/juanbermudez/bb-plugin-crm.git`
- Release: `v0.1.0` → `<full-release-commit>`
- Marketplace range: `^0.1.0`
- Plugin id: `crm`, derived from `bb-plugin-crm`
- Repository layout: root plugin; no `subdir` or `tagPrefix`

## Plugin checks

- `<test count>` tests passed with `npm test`
- `npm run typecheck` passed
- `bb plugin types --check` passed against the release BB SDK
- `bb plugin build` passed and emitted identity-checked metadata
- Fresh public-tag install/build passed with `npm install --omit=dev`
- Live BB browser/Electron parity smoke test passed

## Marketplace checks

- `npm ci --ignore-scripts` passed
- `npm run build` passed (`<entry count>` entries composed)
- `npm run check` passed; liveness confirmed `v0.1.0`
- Entry id matches `entries/crm.json` and the plugin manifest-derived id
- Icon vendored at `icons/crm-f1ddd8a4.svg` (`<bytes>` bytes, SHA-256
  `<hash>`, no scripts or remote resources)

## Permissions and security

- The plugin runs as full-trust BB extension code.
- `<describe exact BB storage, filesystem, network, credentials, and host
  access used by the final implementation>`
- `<confirm integrations are optional/fail-safe and secrets are not returned
  to the frontend>`
- MIT license and upstream attribution are included in the repository.
```

## Release checklist

### Plugin contract and source

- [ ] Confirm `package.json` still has `name: "bb-plugin-crm"`, the final
  semver version, `bb.name`, `bb.description`, `bb.branding`, `bb.server`, and
  `bb.app`.
- [ ] Run the official ID helper and confirm it returns `crm`:

  ```sh
  node /path/to/bb/apps/server/src/services/skills/builtin-skills/submit-a-plugin/scripts/derive-plugin-id.mjs package.json
  ```

- [ ] Keep the marketplace id, filename, and manifest-derived id identical.
- [ ] Run `bb plugin types` against the BB version being released against;
  then run `npm install` and commit the intentional dependency/lockfile
  changes.
- [ ] Run `npm run typecheck`, `npm test`, `npm run build`, and
  `git diff --check`.
- [ ] Inspect every generated `dist/*.meta.json` for matching plugin id,
  plugin version, SDK major/version, artifact format, and build metadata.
- [ ] Verify runtime imports are in `dependencies`, BB-shimmed packages and
  SDK/type tooling are in exact `devDependencies`, and no private `@bb/*`
  package is imported.
- [ ] Run the frontend/backend SDK harness tests with real temporary SQLite;
  do not mock the database.
- [ ] Complete live browser/Electron QA for every implemented view, drawer,
  keyboard path, theme, compact layout, reload, and error/empty state.

### Public Git release

- [ ] Confirm the authenticated account is `juanbermudez`:

  ```sh
  gh auth status
  gh api user --jq .login
  ```

- [ ] Confirm `https://github.com/juanbermudez/bb-plugin-crm` is public and
  contains the reviewed source, license, attribution, tests, and docs.
- [ ] Inspect the exact release commit and verify the package version is
  `0.1.0`.
- [ ] Before the first release mutation, obtain explicit approval for these
  exact values: account, repository/remote, release commit, package/version,
  tag, source range, and commands below.
- [ ] After approval, create and push a new immutable annotated tag. Never
  move or replace a release tag:

  ```sh
  git tag -a v0.1.0 -m "Release v0.1.0"
  git push origin HEAD
  git push origin v0.1.0
  git ls-remote --tags https://github.com/juanbermudez/bb-plugin-crm.git
  ```

- [ ] Clone the public tag into a clean temporary directory, run the Git
  install/build path, and inspect `package.json`, `bb`, and all entry files.
- [ ] Record the full tag commit for the marketplace PR body.

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
  npm ci --ignore-scripts
  npm run build
  npm run check
  git status --short
  git diff --check
  git diff -- entries/crm.json icons/
  ```

- [ ] Confirm `npm run check` sees the public `v0.1.0` tag, while separately
  verifying the tag contains the reviewed plugin. Marketplace liveness checks
  tag/ref existence but do not build or review plugin behavior.
- [ ] Confirm the entry's engine ranges do not exceed the plugin manifest,
  `author.github` is `juanbermudez`, and the description states observed user
  value in one concrete sentence.
- [ ] Commit only the entry/icon, push `submit-crm`, and open the PR against
  `get-bb/marketplace:main` after the final validation:

  ```sh
  git add entries/crm.json icons/crm-f1ddd8a4.svg
  git commit -m "Add plugin entry: crm"
  git push -u origin submit-crm
  gh pr create \
    --repo get-bb/marketplace \
    --base main \
    --head juanbermudez:submit-crm \
    --title "Add plugin entry: crm" \
    --body-file /path/to/crm-marketplace-pr.md
  ```

- [ ] Do not wait for merge unless monitoring is explicitly requested.

### Future releases

- [ ] Publish a new immutable `vX.Y.Z` tag within `^0.1.0` for compatible
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

6. In browser/Electron, verify the dashboard, company/contact/deal tables,
   filters, saved views, bulk actions, record drawers, timeline/activity
   composer, search, agent surfaces, settings, and connection/error states at
   wide and compact widths. Verify BB light/dark/custom themes and keyboard
   focus/escape behavior for wide drawers and compact overlays.
7. After live QA, run the release commands again, create the clean release
   commit/tag, and repeat the public-tag install test before marketplace
   validation.
