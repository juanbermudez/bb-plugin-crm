# Microsoft Outlook sync adapter boundary

`lib/microsoft-graph.ts`, `lib/microsoft-outlook.ts`, and
`lib/microsoft-outlook-sync.ts` provide a credential-in/normalized-message-out
slice for Microsoft Graph mail. The adapter never stores, refreshes, or logs a
token, writes CRM rows, matches contacts or companies, runs a background job,
or exposes an OAuth callback.

## Baseline parity audit

The locked upstream CRM baseline implements Microsoft Outlook mail only:

- `Mail.Read` is the only Microsoft Graph scope.
- Graph reads `me`, well-known `junkemail`/`deleteditems` folders, and forward
  message pages (`receivedDateTime gt cursor`, drafts excluded).
- RFC `References`/`In-Reply-To` headers take precedence for roots, followed by
  `outlook-conversation:<conversationId>`, then the message's own RFC ID.
- The first run records a watermark and does not import historical mail;
  incremental pages use a one-second overlap and a bounded 120-message tick.

The baseline contains no Microsoft Calendar scope, Graph calendar client,
calendar sync service, calendar connection control, or Microsoft calendar UI.
This slice therefore does not claim Microsoft Calendar parity. The shared
calendar contract can support Microsoft records when a separately authorized
Graph calendar adapter is designed and tested.

## Implemented adapter behavior

- `MicrosoftGraphClient` validates Graph URLs and response shapes at the
  boundary, keeps access tokens in the bearer header, bounds request timeouts,
  and maps unauthorized, invalid-cursor, rate-limit, malformed-response, and
  retryable failures to safe results.
- `parseOutlookMessage` normalizes addresses, dates, RFC headers, body text,
  quoted history, snippets, conversation IDs, and HTTPS web links.
- `normalizeOutlookMessage` projects a parsed row to provider-neutral message
  fields and infers direction only when the caller supplies a valid mailbox
  address; without it, direction is `UNKNOWN`.
- `OutlookSyncAdapter` preserves parsed partial pages on a later failure,
  advances a cursor only for a complete successful page sequence, tolerates
  missing excluded folders, and reports budget truncation so the next tick can
  continue from the overlap.

The focused mocked coverage is in `lib/microsoft-graph.test.ts`,
`lib/microsoft-outlook.test.ts`, and `lib/microsoft-outlook-sync.test.ts`.

## Credentials and BB boundary

Microsoft live sync uses an externally authorized account with the
`Mail.Read` delegated permission, a client registration or host-managed
device/OAuth flow, consent, and a secure refresh/access-token owner. The BB
public plugin SDK supplies secret settings, namespaced storage, typed RPC,
HTTP routes, background services, and an optional enrolled host contract. It
does not provide a Microsoft OAuth/link-account helper, current-user identity
or RBAC directory, token refresh store, or Microsoft Graph methods.

Client identifiers and secrets belong in BB secret settings (or an authorized
external service). Refresh/access tokens
must remain with the credential owner and must not be placed in the existing
SQLite connection configuration or sync-cursor rows. The shared core must bind
the credential to a connection before invoking this adapter.

## Integrated shared core

The plugin now provides:

1. Durable provider-neutral email threads/messages and matching, including
   company/contact associations and timeline projections.
2. A bounded `bb.background` loop with BB-secret token lookup, cursor
   persistence, health state, overlap-safe idempotent writes, and manual sync.
3. Strict RPC/UI operations for sync-now, purge, diagnostics, and thread detail.
4. Microsoft Calendar authorization, event/attendee normalization, event
   cursors, and meeting projections.

OAuth/device callbacks, refresh-token custody, and provider revoke remain an
authorized host/operator boundary; the source baseline's Outlook mail flow is
otherwise wired end to end.
