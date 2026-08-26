# Google sync adapter boundary

`services/google-adapter.ts` is the provider-facing slice for Gmail and Google
Calendar. It is intentionally credential-in/credential-out: the caller supplies
an access token for each request, and the adapter never persists, refreshes, or
logs that token. It also does not write CRM rows, match people or companies, run
background jobs, or expose OAuth callbacks.

## What is implemented

- Gmail profile and forward-history reads (`messageAdded`), bounded message-list
  reads, and full-message reads.
- Calendar primary-event reads with the upstream-compatible initial window and
  incremental `syncToken` semantics (`singleEvents=true`, `showDeleted=true`).
- Safe outcome mapping for authorization loss, expired cursors, rate limits,
  upstream failures, timeouts, malformed responses, and oversized responses.
- MIME plain-text/HTML fallback, attachment exclusion, quoted-history trimming,
  RFC message/root IDs, participant parsing, direction inference, and normalized
  Gmail records.
- Calendar time normalization (including all-day events), attendees, organizer,
  cancellation tombstones, and HTTPS-only conference/event links.

The orchestration layer performs a bounded 30-day initial Gmail backfill, then
uses the profile `historyId` for forward sync. A Gmail `404` or Calendar `410` is reported as `cursor-invalid` so the core
can clear the cursor and resume from the provider's current position. A rate
limit includes a clamped retry delay (30 seconds to 15 minutes). The adapter
does not silently retry or advance a cursor after a failed page.

## Credentials and BB boundary

Genuine live sync still needs an external authorization flow. Google requires an
OAuth client ID and client secret, a registered redirect URI, user consent, and
offline access so a refresh token can be retained by the credential owner. The
requested read-only scopes are:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

The BB public plugin SDK provides secret settings, HTTP routes, typed RPC,
namespaced KV/database storage, background services, and an optional enrolled
host contract. It does not provide a Google OAuth/link-account helper, a current
user identity, a Google token refresh store, or Gmail/Calendar provider methods.
The plugin therefore runs live sync from an operator-provisioned access token
stored in a BB server-only secret; self-service OAuth and refresh-token rotation
still require a host/external credential owner.

If OAuth is added later, client ID/secret belong in BB secret settings (or an
authorized external service), refresh/access tokens must remain in the secure
credential owner, and the callback/host must bind the resulting account to the
CRM connection. Never place either token in the existing SQLite connection
configuration or sync-cursor rows.

## Integrated shared core

The plugin now wires the adapter through:

1. Schema-12 email thread/message and calendar event/attendee storage.
2. Exact-email CRM matching, activity projection, and lazy timeline details.
3. Durable Gmail/Calendar cursors, cursor-reset recovery, manual Sync now, and
   a bounded five-minute background service.
4. Strict RPC/UI contracts for health, diagnostics, purge, thread/event detail,
   and provider links.

OAuth callback, refresh, revoke-at-provider, and programmatic secret rotation
remain host/operator boundaries because the public settings handle is read-only.
