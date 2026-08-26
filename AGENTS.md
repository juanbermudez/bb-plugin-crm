# Repository rules

- Read `docs/PORT_PLAN.md` before changing product behavior.
- Read the BB plugin authoring skill from the matching BB source release before changing plugin APIs.
- Keep server contracts strict and validate external data at the boundary.
- Store relational CRM data in the plugin SQLite database. Use KV only for small cursors and preferences.
- Append database migrations. Never edit a released migration.
- Use BB theme tokens and vendored BB registry components. Do not hardcode neutral colors.
- Preserve the source CRM's table-first layout, record drawers, saved views, and utility copy.
- Every end-user action must have a typed RPC and a `bb crm` CLI equivalent where practical.
- Add focused backend and frontend tests for each feature slice.
- Run `npm run typecheck`, `npm test`, and `npm run build` before a release commit.
- Keep commits scoped to one vertical slice. Do not add co-author trailers.
