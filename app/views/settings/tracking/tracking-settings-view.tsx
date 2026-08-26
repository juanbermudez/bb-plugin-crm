import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "../../../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog.js";
import { Icon } from "../../../../components/ui/icon.js";
import { Input } from "../../../../components/ui/input.js";
import { AlertDialog, EmptyState, PageHeader, TableShell } from "../../../components/index.js";
import type {
  TokenScope,
  TrackingAggregate,
  TrackingSite,
  TrackingTrafficSource,
  TrackingToken,
} from "../../../../contracts/connections.js";
import {
  useTrackingRpc,
  type TrackingRpcClient,
} from "./rpc.js";

const TEXTAREA_CLASS =
  "min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const INITIAL_SITE_FORM = {
  name: "",
  siteKey: "",
  allowedDomains: "",
  eventRetentionDays: "30",
  aggregateRetentionDays: "730",
  crossDomain: true,
  limitToDomains: true,
  cookieSubdomains: false,
  secureCookies: true,
  honourDnt: true,
  cookieDays: "395",
};

type SiteForm = typeof INITIAL_SITE_FORM;

type OneTimeToken = {
  secret: string;
  scope: TokenScope;
  tokenId: string;
  siteId: string | null;
  siteKey: string | null;
};

type RollupResult = {
  aggregateCount: number;
  eventCount: number;
};

const COOKIE_LIFETIMES = [
  { days: 395, label: "13 months" },
  { days: 180, label: "6 months" },
  { days: 0, label: "Session only" },
] as const;

type PruneResult = {
  eventsDeleted: number;
  aggregatesDeleted: number;
  sitesProcessed: number;
};

type TrackingConfirmAction =
  | { kind: "rotate-site"; site: TrackingSite }
  | { kind: "revoke-token"; token: TrackingToken }
  | { kind: "prune" };

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function statusClass(status: TrackingSite["status"]): string {
  return status === "ACTIVE"
    ? "bg-state-active text-foreground"
    : "bg-muted text-muted-foreground";
}

function verificationClass(status: TrackingSite["verificationStatus"]): string {
  return status === "VERIFIED"
    ? "bg-state-active text-foreground"
    : "bg-muted text-muted-foreground";
}

function parseDomains(value: string): string[] {
  return value
    .split(/[\n,]+/u)
    .map((domain) => domain.trim())
    .filter(Boolean);
}

function installSnippet(siteKey: string, token = "YOUR_TRACKING_TOKEN"): string {
  return `<script src="/tracking/loader.js?siteKey=${encodeURIComponent(siteKey)}" data-site-key="${siteKey}" data-token="${token}" async defer></script>`;
}

function optionalPositiveInteger(value: string, label: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

function provisionedTokenFields(value: unknown): {
  secret: string | null;
  tokenId: string;
  scope: TokenScope;
  siteId: string | null;
  siteKey: string | null;
} | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as {
    token?: unknown;
    secret?: unknown;
    id?: unknown;
    tokenId?: unknown;
    scope?: unknown;
    siteId?: unknown;
    siteKey?: unknown;
    site?: { siteId?: unknown; siteKey?: unknown };
  };
  const secret = typeof candidate.secret === "string"
    ? candidate.secret
    : typeof candidate.token === "string"
      ? candidate.token
      : null;
  if (secret === null || typeof candidate.scope !== "string") return null;
  const scope: TokenScope = candidate.scope === "INTAKE" ? "INTAKE" : "TRACKING";
  const nestedSite = candidate.site;
  return {
    secret,
    tokenId: typeof candidate.tokenId === "string"
      ? candidate.tokenId
      : typeof candidate.id === "string" ? candidate.id : "one-time-token",
    scope,
    siteId: typeof candidate.siteId === "string"
      ? candidate.siteId
      : nestedSite && typeof nestedSite.siteId === "string" ? nestedSite.siteId : null,
    siteKey: typeof candidate.siteKey === "string"
      ? candidate.siteKey
      : nestedSite && typeof nestedSite.siteKey === "string" ? nestedSite.siteKey : null,
  };
}

function siteFromProvisioned(value: unknown): TrackingSite | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { site?: unknown; id?: unknown; siteKey?: unknown };
  const site = candidate.site ?? value;
  if (typeof site !== "object" || site === null) return null;
  const row = site as Partial<TrackingSite>;
  return typeof row.id === "string" && typeof row.siteKey === "string"
    ? row as TrackingSite
    : null;
}

interface SiteCreateDialogProps {
  open: boolean;
  value: SiteForm;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onChange: (value: SiteForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function SiteCreateDialog({
  open,
  value,
  saving,
  error,
  onOpenChange,
  onChange,
  onSubmit,
}: SiteCreateDialogProps) {
  const hasAllowedDomains = parseDomains(value.allowedDomains).length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" aria-describedby="tracking-site-description">
        <DialogHeader>
          <DialogTitle>Add tracking site</DialogTitle>
          <DialogDescription id="tracking-site-description">
            Register a site, allowed origins, and retention windows. A tracking token is generated once after the site is created.
          </DialogDescription>
        </DialogHeader>
        <form id="tracking-site-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="tracking-site-name">Site name</label>
            <Input
              id="tracking-site-name"
              required
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              placeholder="Marketing website"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="tracking-site-key">
              Site key <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="tracking-site-key"
              value={value.siteKey}
              onChange={(event) => onChange({ ...value, siteKey: event.target.value })}
              placeholder="marketing_site"
              autoCapitalize="none"
            />
            <p className="text-xs text-muted-foreground">Leave blank to generate a key. Rotating a site replaces this key and its active tracking token.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="tracking-site-domains">Allowed domains</label>
            <textarea
              id="tracking-site-domains"
              className={TEXTAREA_CLASS}
              value={value.allowedDomains}
              onChange={(event) => onChange({ ...value, allowedDomains: event.target.value })}
              placeholder="example.com\n*.preview.example.com"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">One hostname per line. Wildcards such as *.preview.example.com are supported. Leave empty only when domain limiting is disabled.</p>
          </div>
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">Tracking rules and cookies</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.crossDomain}
                onChange={(event) => onChange({ ...value, crossDomain: event.target.checked })}
              />
              <span><span className="font-medium">Automatic cross-domain linking</span><span className="block text-xs text-muted-foreground">Carry the anonymous visitor between configured domains.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.limitToDomains}
                disabled={!hasAllowedDomains && !value.limitToDomains}
                onChange={(event) => {
                  if (event.target.checked && !hasAllowedDomains) return;
                  onChange({ ...value, limitToDomains: event.target.checked });
                }}
              />
              <span><span className="font-medium">Limit tracking to the domains below</span><span className="block text-xs text-muted-foreground">Reject events from hosts outside the allow list.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.cookieSubdomains}
                onChange={(event) => onChange({ ...value, cookieSubdomains: event.target.checked })}
              />
              <span><span className="font-medium">Limit cookies to subdomains</span><span className="block text-xs text-muted-foreground">Keep the visitor cookie on the exact host.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.secureCookies}
                onChange={(event) => onChange({ ...value, secureCookies: event.target.checked })}
              />
              <span><span className="font-medium">Use secure cookies only</span><span className="block text-xs text-muted-foreground">Set the cookie's secure attribute on HTTPS.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.honourDnt}
                onChange={(event) => onChange({ ...value, honourDnt: event.target.checked })}
              />
              <span><span className="font-medium">Honour Do Not Track</span><span className="block text-xs text-muted-foreground">Record nothing when the browser asks not to be tracked.</span></span>
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tracking-cookie-days">Cookie lifetime</label>
              <select
                id="tracking-cookie-days"
                className={SELECT_CLASS}
                value={value.cookieDays}
                onChange={(event) => onChange({ ...value, cookieDays: event.target.value })}
              >
                {COOKIE_LIFETIMES.map((lifetime) => <option key={lifetime.days} value={lifetime.days}>{lifetime.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">After this a returning visitor counts as somebody new.</p>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tracking-event-retention">Event retention (days)</label>
              <Input
                id="tracking-event-retention"
                type="number"
                min="1"
                step="1"
                value={value.eventRetentionDays}
                onChange={(event) => onChange({ ...value, eventRetentionDays: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tracking-aggregate-retention">Aggregate retention (days)</label>
              <Input
                id="tracking-aggregate-retention"
                type="number"
                min="1"
                step="1"
                value={value.aggregateRetentionDays}
                onChange={(event) => onChange({ ...value, aggregateRetentionDays: event.target.value })}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="tracking-site-form" disabled={saving}>
            {saving ? "Creating…" : "Create tracking site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OneTimeTokenCardProps {
  token: OneTimeToken;
  copyStatus: string | null;
  onCopy: () => void;
  onHide: () => void;
}

function OneTimeTokenCard({ token, copyStatus, onCopy, onHide }: OneTimeTokenCardProps) {
  return (
    <Card className="border-primary/40 bg-primary/5" aria-labelledby="one-time-token-heading">
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle id="one-time-token-heading" className="flex items-center gap-2 text-base">
              <Icon name="Lock" aria-hidden="true" />
              One-time token
            </CardTitle>
            <CardDescription className="mt-1">
              {token.scope === "INTAKE" ? "Intake token" : "Tracking token"}{token.siteKey ? ` for ${token.siteKey}` : ""}
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onHide} aria-label="Hide one-time token">
            <Icon name="X" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          Copy this secret now. It will not be shown again, and BB stores only a hash after this response.
        </p>
        <code className="block select-all break-all rounded-md border border-border bg-background px-3 py-3 text-xs leading-relaxed" data-one-time-token="true">
          {token.secret}
        </code>
        {token.siteKey ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Paste this site snippet after replacing the token only if your deployment does not already inject it.</p>
            <code className="block select-all break-all rounded-md border border-border bg-background px-3 py-3 text-xs leading-relaxed" data-tracking-snippet="true">
              {installSnippet(token.siteKey, token.secret)}
            </code>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onCopy}>
            <Icon name="Copy" aria-hidden="true" />
            Copy token
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onHide}>I copied it — hide secret</Button>
          {copyStatus ? <span className="text-xs text-muted-foreground" role="status">{copyStatus}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

interface SiteCardProps {
  site: TrackingSite;
  busyAction: string | null;
  onAction: (site: TrackingSite, action: "verify" | "pause" | "resume" | "rotate" | "token") => void;
  onUpdate: (site: TrackingSite, update: Record<string, unknown>) => void;
}

function SiteCard({ site, busyAction, onAction, onUpdate }: SiteCardProps) {
  const actionBusy = busyAction !== null;
  const crossDomain = site.crossDomain ?? true;
  const limitToDomains = site.limitToDomains ?? true;
  const cookieSubdomains = site.cookieSubdomains ?? false;
  const secureCookies = site.secureCookies ?? true;
  const honourDnt = site.honourDnt ?? true;
  const cookieDays = site.cookieDays ?? 395;
  const hasAllowedDomains = site.allowedDomains.length > 0;
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{site.name}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1.5">
              <code className="truncate">{site.siteKey}</code>
              <span aria-hidden="true">·</span>
              <span>{site.id}</span>
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(site.status)}`} role="status">{site.status === "ACTIVE" ? "Active" : "Paused"}</span>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${verificationClass(site.verificationStatus)}`} role="status">{site.verificationStatus === "VERIFIED" ? "Observed traffic verified" : "Observed traffic required"}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Allowed domains</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {site.allowedDomains.map((domain) => (
              <span key={domain} className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">{domain}</span>
            ))}
          </div>
        </div>
        <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Event retention</dt>
            <dd className="mt-1 font-medium">{formatNumber(site.retention.eventRetentionDays)} days</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Aggregate retention</dt>
            <dd className="mt-1 font-medium">{formatNumber(site.retention.aggregateRetentionDays)} days</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last rollup</dt>
            <dd className="mt-1 font-medium">{formatDate(site.retention.lastRollupAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last prune</dt>
            <dd className="mt-1 font-medium">{formatDate(site.retention.lastPrunedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Verification evidence</dt>
            <dd className="mt-1 font-medium">{site.verificationEventId ? `${site.verificationDomain ?? "Allowed host"} · ${site.verificationEventId}` : "No page view observed yet"}</dd>
          </div>
        </dl>
        <details className="rounded-md border border-border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">Install snippet and tracking rules</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">The token placeholder is intentional. Copy the one-time token into this snippet only on an allowed site; token secrets are never persisted or listed.</p>
            <code className="block select-all break-all rounded-md border border-border bg-background px-3 py-3 text-xs leading-relaxed" data-tracking-snippet="true">{installSnippet(site.siteKey)}</code>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={crossDomain} disabled={actionBusy} onChange={(event) => onUpdate(site, { crossDomain: event.target.checked })} />Automatic cross-domain linking</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={limitToDomains} disabled={actionBusy || (!hasAllowedDomains && !limitToDomains)} onChange={(event) => {
                if (event.target.checked && !hasAllowedDomains) return;
                onUpdate(site, { limitToDomains: event.target.checked });
              }} />Limit tracking to the domains below</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cookieSubdomains} disabled={actionBusy} onChange={(event) => onUpdate(site, { cookieSubdomains: event.target.checked })} />Limit cookies to subdomains</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={secureCookies} disabled={actionBusy} onChange={(event) => onUpdate(site, { secureCookies: event.target.checked })} />Use secure cookies only</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={honourDnt} disabled={actionBusy} onChange={(event) => onUpdate(site, { honourDnt: event.target.checked })} />Honour Do Not Track</label>
              <label className="flex items-center gap-2"><span className="shrink-0">Cookie lifetime</span><select className={SELECT_CLASS} value={String(cookieDays)} disabled={actionBusy} onChange={(event) => onUpdate(site, { cookieDays: Number(event.target.value) })}>{COOKIE_LIFETIMES.map((lifetime) => <option key={lifetime.days} value={lifetime.days}>{lifetime.label}</option>)}</select></label>
            </div>
            {!hasAllowedDomains ? <p className="text-xs text-muted-foreground" role="status">Add an allowed domain before enabling domain-limited tracking.</p> : null}
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {site.verificationStatus === "VERIFIED" ? null : (
            <Button type="button" size="sm" onClick={() => onAction(site, "verify")} disabled={actionBusy}>
              <Icon name="Check" aria-hidden="true" />
              Confirm allowed domain
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onAction(site, site.status === "ACTIVE" ? "pause" : "resume")} disabled={actionBusy}>
            <Icon name={site.status === "ACTIVE" ? "Pause" : "Play"} aria-hidden="true" />
            {site.status === "ACTIVE" ? "Pause site" : "Resume site"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onAction(site, "token")} disabled={actionBusy}>
            <Icon name="Lock" aria-hidden="true" />
            Issue token
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onAction(site, "rotate")} disabled={actionBusy} aria-label={`Rotate site ID and token for ${site.name}`}>
            <Icon name="Repeat" aria-hidden="true" />
            Rotate ID &amp; token
          </Button>
        </div>
        {busyAction ? <p className="text-xs text-muted-foreground" role="status">Updating site…</p> : null}
      </CardContent>
    </Card>
  );
}

const TOKEN_COLUMNS = [
  { id: "token-scope", label: "Scope", className: "min-w-24" },
  { id: "token-site", label: "Site", className: "min-w-36" },
  { id: "token-hint", label: "Fingerprint", className: "min-w-36" },
  { id: "token-created", label: "Created", className: "min-w-36" },
  { id: "token-last-used", label: "Last used", className: "min-w-36" },
  { id: "token-status", label: "Status", className: "min-w-24" },
  { id: "token-actions", label: "Actions", className: "min-w-28" },
] as const;

const AGGREGATE_COLUMNS = [
  { id: "aggregate-day", label: "Day", className: "min-w-28" },
  { id: "aggregate-type", label: "Event", className: "min-w-28" },
  { id: "aggregate-path", label: "Path", className: "min-w-44" },
  { id: "aggregate-source", label: "Source", className: "min-w-28" },
  { id: "aggregate-events", label: "Events", className: "min-w-24" },
  { id: "aggregate-visitors", label: "Visitors", className: "min-w-24" },
] as const;

const TRAFFIC_SOURCE_COLUMNS = [
  { id: "traffic-source", label: "Source", className: "min-w-32" },
  { id: "traffic-medium", label: "Medium", className: "min-w-28" },
  { id: "traffic-events", label: "Page views", className: "min-w-24" },
  { id: "traffic-visitors", label: "Visitor-days", className: "min-w-24" },
] as const;

export interface TrackingSettingsViewProps {
  rpcClient?: TrackingRpcClient;
}

export function TrackingSettingsView({ rpcClient }: TrackingSettingsViewProps) {
  const contextRpc = useTrackingRpc();
  const rpc = rpcClient ?? contextRpc;
  const [sites, setSites] = useState<readonly TrackingSite[]>([]);
  const [tokens, setTokens] = useState<readonly TrackingToken[]>([]);
  const [aggregates, setAggregates] = useState<readonly TrackingAggregate[]>([]);
  const [trafficSources, setTrafficSources] = useState<readonly TrackingTrafficSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [siteForm, setSiteForm] = useState<SiteForm>(INITIAL_SITE_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<OneTimeToken | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [aggregateAction, setAggregateAction] = useState<"rollup" | "prune" | null>(null);
  const [aggregateError, setAggregateError] = useState<string | null>(null);
  const [rollupResult, setRollupResult] = useState<RollupResult | null>(null);
  const [pruneResult, setPruneResult] = useState<PruneResult | null>(null);
  const [confirmAction, setConfirmAction] = useState<TrackingConfirmAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      rpc.call("tracking_sites_list", { limit: 100, offset: 0 }),
      rpc.call("tracking_tokens_list", {}),
      rpc.call("tracking_aggregates_list", { limit: 100, offset: 0 }),
      rpc.call("tracking_traffic_sources_list", { limit: 100, offset: 0 }),
    ]);
    const [siteResult, tokenResult, aggregateResult, trafficResult] = results;
    if (siteResult?.status === "fulfilled") {
      setSites(Array.isArray(siteResult.value) ? siteResult.value : []);
    }
    if (tokenResult?.status === "fulfilled") {
      setTokens(Array.isArray(tokenResult.value) ? tokenResult.value : []);
    }
    if (aggregateResult?.status === "fulfilled") {
      setAggregates(Array.isArray(aggregateResult.value) ? aggregateResult.value : []);
    }
    if (trafficResult?.status === "fulfilled") {
      setTrafficSources(Array.isArray(trafficResult.value) ? trafficResult.value : []);
    }
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") setError(errorMessage(rejected.reason));
    setLoading(false);
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const siteNames = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);

  const updateSite = useCallback((next: TrackingSite) => {
    setSites((current) => {
      const found = current.some((site) => site.id === next.id);
      return found ? current.map((site) => site.id === next.id ? next : site) : [next, ...current];
    });
  }, []);

  const updateSiteConfig = useCallback(async (site: TrackingSite, update: Record<string, unknown>) => {
    const key = `update:${site.id}`;
    setBusyAction(key);
    setError(null);
    try {
      const next = await rpc.call("tracking_sites_update", { id: site.id, ...update });
      updateSite(next);
    } catch (cause) {
      setError(`${site.name}: ${errorMessage(cause)}`);
    } finally {
      setBusyAction(null);
    }
  }, [rpc, updateSite]);

  const presentOneTimeToken = useCallback((value: unknown, fallbackSite?: TrackingSite) => {
    const fields = provisionedTokenFields(value);
    if (fields?.secret === null || fields === null) return false;
    setCopyStatus(null);
    setOneTimeToken({
      secret: fields.secret,
      scope: fields.scope,
      tokenId: fields.tokenId,
      siteId: fields.siteId ?? fallbackSite?.id ?? null,
      siteKey: fields.siteKey ?? fallbackSite?.siteKey ?? null,
    });
    return true;
  }, []);

  const createSite = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    const allowedDomains = parseDomains(siteForm.allowedDomains);
    if (!siteForm.name.trim()) {
      setCreateError("A site name is required.");
      return;
    }
    if (allowedDomains.length === 0 && siteForm.limitToDomains) {
      setCreateError("At least one allowed domain is required.");
      return;
    }
    try {
      const eventRetentionDays = optionalPositiveInteger(siteForm.eventRetentionDays, "Event retention");
      const aggregateRetentionDays = optionalPositiveInteger(siteForm.aggregateRetentionDays, "Aggregate retention");
      setCreateSaving(true);
      const input = {
        name: siteForm.name.trim(),
        ...(siteForm.siteKey.trim() ? { siteKey: siteForm.siteKey.trim() } : {}),
        allowedDomains,
        ...(eventRetentionDays === undefined ? {} : { eventRetentionDays }),
        ...(aggregateRetentionDays === undefined ? {} : { aggregateRetentionDays }),
        ...(siteForm.crossDomain ? {} : { crossDomain: false }),
        ...(siteForm.limitToDomains ? {} : { limitToDomains: false }),
        ...(siteForm.cookieSubdomains ? { cookieSubdomains: true } : {}),
        ...(siteForm.secureCookies ? {} : { secureCookies: false }),
        ...(siteForm.honourDnt ? {} : { honourDnt: false }),
        ...(siteForm.cookieDays === "395" ? {} : { cookieDays: Number(siteForm.cookieDays) }),
      };
      const created = await rpc.call("tracking_sites_create", input);
      updateSite(created);
      let tokenCreated = false;
      try {
        const token = await rpc.call("tracking_tokens_provision", {
          scope: "TRACKING",
          siteId: created.id,
        });
        tokenCreated = presentOneTimeToken(token, created);
      } catch (cause) {
        setError(`Site created, but the tracking token could not be provisioned: ${errorMessage(cause)}`);
      }
      if (!tokenCreated) setError("Site created. Provision a tracking token from the site card when token setup is available.");
      setSiteForm(INITIAL_SITE_FORM);
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setCreateError(errorMessage(cause));
    } finally {
      setCreateSaving(false);
    }
  }, [presentOneTimeToken, rpc, siteForm, updateSite]);

  const runSiteAction = useCallback(async (
    site: TrackingSite,
    action: "verify" | "pause" | "resume" | "rotate" | "token",
    options: { rethrow?: boolean } = {},
  ) => {
    const key = `${action}:${site.id}`;
    setBusyAction(key);
    setError(null);
    try {
      if (action === "verify") {
        const next = await rpc.call("tracking_sites_verify", { id: site.id });
        updateSite(next);
      } else if (action === "pause" || action === "resume") {
        const next = await rpc.call("tracking_sites_pause", { id: site.id, paused: action === "pause" });
        updateSite(next);
      } else if (action === "rotate") {
        const result = await rpc.call("tracking_sites_rotate", { id: site.id });
        const next = siteFromProvisioned(result);
        if (next) updateSite(next);
        presentOneTimeToken(result, next ?? site);
      } else {
        const result = await rpc.call("tracking_tokens_provision", { scope: "TRACKING", siteId: site.id });
        presentOneTimeToken(result, site);
      }
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(`${site.name}: ${errorMessage(cause)}`);
      if (options.rethrow) throw cause;
    } finally {
      setBusyAction(null);
    }
  }, [presentOneTimeToken, rpc, updateSite]);

  const copyToken = useCallback(async () => {
    const secret = oneTimeToken?.secret;
    if (!secret) return;
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Clipboard is unavailable; select the secret and copy it manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(secret);
      setCopyStatus("Copied. Hide the secret when you are done.");
    } catch {
      setCopyStatus("Copy failed; select the secret and copy it manually.");
    }
  }, [oneTimeToken]);

  const hideToken = useCallback(() => {
    setOneTimeToken(null);
    setCopyStatus(null);
  }, []);

  const revokeToken = useCallback(async (
    token: TrackingToken,
    options: { rethrow?: boolean } = {},
  ) => {
    if (token.revokedAt) return;
    setBusyAction(`revoke:${token.id}`);
    setError(null);
    try {
      const revoked = await rpc.call("tracking_tokens_revoke", { id: token.id });
      setTokens((current) => current.map((row) => row.id === revoked.id ? revoked : row));
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(`Token ${token.id}: ${errorMessage(cause)}`);
      if (options.rethrow) throw cause;
    } finally {
      setBusyAction(null);
    }
  }, [rpc]);

  const runAggregateAction = useCallback(async (
    action: "rollup" | "prune",
    options: { rethrow?: boolean } = {},
  ) => {
    setAggregateAction(action);
    setAggregateError(null);
    if (action === "rollup") setRollupResult(null);
    else setPruneResult(null);
    try {
      if (action === "rollup") {
        const result = await rpc.call("tracking_aggregates_rollup", {});
        setRollupResult(result as RollupResult);
      } else {
        const result = await rpc.call("tracking_aggregates_prune", {});
        setPruneResult(result as PruneResult);
      }
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setAggregateError(errorMessage(cause));
      if (options.rethrow) throw cause;
    } finally {
      setAggregateAction(null);
    }
  }, [rpc]);

  const aggregateSummary = useMemo(() => ({
    eventCount: aggregates.reduce((sum, row) => sum + row.eventCount, 0),
    uniqueVisitors: aggregates.reduce((sum, row) => sum + row.uniqueVisitors, 0),
    paths: new Set(aggregates.map((row) => row.path)).size,
    lastRollup: aggregates.reduce<string | null>((latest, row) => latest === null || row.rolledUpAt > latest ? row.rolledUpAt : latest, null),
  }), [aggregates]);

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <PageHeader
        title="Tracking"
        description="Manage first-party site tracking, token access, and privacy-aware retention."
        actions={
          <Button type="button" size="sm" onClick={() => { setCreateError(null); setCreateOpen(true); }}>
            <Icon name="Plus" aria-hidden="true" />
            Add tracking site
          </Button>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-5">
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground" role="note">
          <div className="flex items-start gap-3">
            <Icon name="Info" className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Tracking accepts only validated origins and privacy-safe event properties. Site tokens are shown once at provisioning or rotation; this screen never displays token secrets from the token list.</p>
          </div>
        </div>

        {oneTimeToken ? <OneTimeTokenCard token={oneTimeToken} copyStatus={copyStatus} onCopy={() => void copyToken()} onHide={hideToken} /> : null}

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <span>Could not load or update tracking: {error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>Try again</Button>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground" role="status" aria-live="polite">Loading tracking…</div>
        ) : (
          <>
            <section aria-labelledby="tracking-sites-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="tracking-sites-heading" className="text-base font-semibold">Sites</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Allowed domains, observed installation evidence, status, site keys, cookie controls, and retention windows. A site is verified only after an allowed PAGE_VIEW is received.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => { setCreateError(null); setCreateOpen(true); }}>
                  <Icon name="Plus" aria-hidden="true" />
                  Add site
                </Button>
              </div>
              {sites.length === 0 ? (
                <EmptyState
                  icon="Globe"
                  title="No tracking sites configured"
                  description="Add a site to start collecting privacy-aware page views and form events."
                  action={<Button type="button" size="sm" onClick={() => setCreateOpen(true)}><Icon name="Plus" aria-hidden="true" />Add tracking site</Button>}
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {sites.map((site) => (
                    <SiteCard
                      key={site.id}
                      site={site}
                      busyAction={busyAction?.endsWith(`:${site.id}`) === true ? busyAction : null}
                      onUpdate={(value, update) => void updateSiteConfig(value, update)}
                      onAction={(value, action) =>
                        action === "rotate"
                          ? setConfirmAction({ kind: "rotate-site", site: value })
                          : void runSiteAction(value, action)
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="tracking-tokens-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="tracking-tokens-heading" className="text-base font-semibold">API tokens</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Only site-scoped tracking token fingerprints and usage metadata are retained in this list. The source CRM intake endpoint is not available yet, so this extension does not issue unused intake credentials.</p>
                </div>
              </div>
              <TableShell
                caption="Tracking API tokens"
                columns={TOKEN_COLUMNS}
                empty={<EmptyState title="No tracking tokens" description="Provision a tracking site to see its non-secret token metadata here." className="min-h-28 rounded-none border-0 bg-transparent" />}
              >
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td className="px-3 py-3 font-medium">{token.scope}</td>
                    <td className="px-3 py-3">{token.siteId ? siteNames.get(token.siteId)?.name ?? token.siteId : "Intake"}</td>
                    <td className="px-3 py-3"><code className="text-xs">{token.tokenHint}</code></td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(token.createdAt)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(token.lastUsedAt)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${token.revokedAt ? "bg-muted text-muted-foreground" : "bg-state-active text-foreground"}`}>{token.revokedAt ? "Revoked" : "Active"}</span>
                    </td>
                    <td className="px-3 py-3">
                      {token.revokedAt ? <span className="text-xs text-muted-foreground">No actions</span> : (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmAction({ kind: "revoke-token", token })} disabled={busyAction !== null} aria-label={`Revoke token ${token.id}`}>
                          <Icon name="Trash2" aria-hidden="true" />
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </TableShell>
            </section>

            <section aria-labelledby="tracking-aggregates-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="tracking-aggregates-heading" className="text-base font-semibold">Aggregate summary</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Roll up daily events before pruning data outside each site's retention policy.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void runAggregateAction("rollup")} disabled={aggregateAction !== null}>
                    <Icon name="ChartColumn" aria-hidden="true" />
                    {aggregateAction === "rollup" ? "Rolling up…" : "Roll up events"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmAction({ kind: "prune" })} disabled={aggregateAction !== null}>
                    <Icon name="Trash2" aria-hidden="true" />
                    {aggregateAction === "prune" ? "Pruning…" : "Prune retained data"}
                  </Button>
                </div>
              </div>
              {aggregateError ? <p className="mb-3 text-sm text-destructive" role="alert">Aggregate action failed: {aggregateError}</p> : null}
              {rollupResult ? <p className="mb-3 text-sm text-muted-foreground" role="status">Rolled up {formatNumber(rollupResult.eventCount)} events into {formatNumber(rollupResult.aggregateCount)} daily aggregates.</p> : null}
              {pruneResult ? <p className="mb-3 text-sm text-muted-foreground" role="status">Pruned {formatNumber(pruneResult.eventsDeleted)} events and {formatNumber(pruneResult.aggregatesDeleted)} aggregates across {formatNumber(pruneResult.sitesProcessed)} sites.</p> : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardHeader className="p-4 pb-2"><CardDescription>Aggregated events</CardDescription><CardTitle className="text-2xl">{formatNumber(aggregateSummary.eventCount)}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="p-4 pb-2"><CardDescription>Unique visitors</CardDescription><CardTitle className="text-2xl">{formatNumber(aggregateSummary.uniqueVisitors)}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="p-4 pb-2"><CardDescription>Tracked paths</CardDescription><CardTitle className="text-2xl">{formatNumber(aggregateSummary.paths)}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="p-4 pb-2"><CardDescription>Latest rollup</CardDescription><CardTitle className="text-base">{formatDate(aggregateSummary.lastRollup)}</CardTitle></CardHeader></Card>
              </div>
              <div className="mt-4">
                <TableShell
                  caption="Daily tracking aggregates"
                  columns={AGGREGATE_COLUMNS}
                  empty={<EmptyState title="No aggregates yet" description="Run a rollup after events arrive to see daily totals." className="min-h-28 rounded-none border-0 bg-transparent" />}
                >
                  {aggregates.map((aggregate) => (
                    <tr key={`${aggregate.siteId}:${aggregate.day}:${aggregate.eventType}:${aggregate.path}:${aggregate.source ?? ""}`}>
                      <td className="px-3 py-3">{aggregate.day}</td>
                      <td className="px-3 py-3 font-medium">{aggregate.eventType}</td>
                      <td className="px-3 py-3"><code className="text-xs">{aggregate.path}</code></td>
                      <td className="px-3 py-3 text-muted-foreground">{aggregate.source ?? "Direct"}</td>
                      <td className="px-3 py-3">{formatNumber(aggregate.eventCount)}</td>
                      <td className="px-3 py-3">{formatNumber(aggregate.uniqueVisitors)}</td>
                    </tr>
                  ))}
                </TableShell>
              </div>
              <div className="mt-6">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Traffic sources</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Page-view totals grouped from locally collected source and medium fields. Anonymous traffic is not attributed to contacts.</p>
                </div>
                <TableShell
                  caption="Traffic source aggregates"
                  columns={TRAFFIC_SOURCE_COLUMNS}
                  empty={<EmptyState title="No traffic sources yet" description="Traffic sources appear after a rollup receives UTM or referrer data." className="min-h-24 rounded-none border-0 bg-transparent" />}
                >
                  {trafficSources.map((source) => (
                    <tr key={`${source.siteId}:${source.source}:${source.medium ?? ""}`}>
                      <td className="px-3 py-3 font-medium">{source.source}</td>
                      <td className="px-3 py-3 text-muted-foreground">{source.medium ?? "Direct"}</td>
                      <td className="px-3 py-3">{formatNumber(source.eventCount)}</td>
                      <td className="px-3 py-3">{formatNumber(source.visitorDays)}</td>
                    </tr>
                  ))}
                </TableShell>
              </div>
            </section>
          </>
        )}
      </div>
      <SiteCreateDialog
        open={createOpen}
        value={siteForm}
        saving={createSaving}
        error={createError}
        onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateError(null); }}
        onChange={setSiteForm}
        onSubmit={(event) => void createSite(event)}
      />

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction?.kind === "rotate-site"
            ? `Rotate the site ID and token for ${confirmAction.site.name}?`
            : confirmAction?.kind === "revoke-token"
              ? `Revoke the ${confirmAction.token.scope.toLowerCase()} token ${confirmAction.token.id}?`
              : "Prune retained tracking data?"
        }
        description={
          confirmAction?.kind === "rotate-site"
            ? "Existing tracking tokens for this site will stop working."
            : confirmAction?.kind === "revoke-token"
              ? "This token will stop authenticating tracking requests immediately."
              : "Tracking events and aggregates outside each site's retention window will be deleted."
        }
        confirmLabel={
          confirmAction?.kind === "rotate-site"
            ? "Rotate credentials"
            : confirmAction?.kind === "revoke-token"
              ? "Revoke token"
              : "Prune data"
        }
        destructive
        disabled={busyAction !== null || aggregateAction !== null}
        onConfirm={async () => {
          if (confirmAction?.kind === "rotate-site") {
            await runSiteAction(confirmAction.site, "rotate", { rethrow: true });
          } else if (confirmAction?.kind === "revoke-token") {
            await revokeToken(confirmAction.token, { rethrow: true });
          } else if (confirmAction?.kind === "prune") {
            await runAggregateAction("prune", { rethrow: true });
          }
        }}
      />
    </div>
  );
}
