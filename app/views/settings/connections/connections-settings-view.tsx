import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card.js";
import { Icon } from "../../../../components/ui/icon.js";
import { EmptyState, PageHeader } from "../../../components/index.js";
import type {
  Connection,
  ConnectionProvider,
  SyncCursor,
} from "../../../../contracts/connections.js";
import {
  useConnectionsRpc,
  type ConnectionsRpcClient,
} from "./rpc.js";

const PROVIDERS: ReadonlyArray<{
  id: ConnectionProvider;
  label: string;
  description: string;
  icon: "CalendarSync" | "MessageSquare";
}> = [
  {
    id: "GOOGLE",
    label: "Google",
    description: "Mail and calendar sync for Google Workspace.",
    icon: "CalendarSync",
  },
  {
    id: "MICROSOFT",
    label: "Microsoft",
    description: "Mail and calendar sync for Microsoft 365.",
    icon: "CalendarSync",
  },
  {
    id: "SLACK",
    label: "Slack",
    description: "Workspace, channel, and people matching for Slack.",
    icon: "MessageSquare",
  },
] as const;

type Diagnostics = {
  connection: Connection;
  syncCursors: readonly SyncCursor[];
};

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

function statusLabel(status: Connection["health"]["status"]): string {
  switch (status) {
    case "CONNECTED":
      return "Connected";
    case "CONNECTING":
      return "Connecting";
    case "DEGRADED":
      return "Degraded";
    case "ERROR":
      return "Error";
    case "DISABLED":
      return "Disabled";
    default:
      return "Not connected";
  }
}

function statusClass(status: Connection["health"]["status"]): string {
  switch (status) {
    case "CONNECTED":
      return "bg-state-active text-foreground";
    case "ERROR":
      return "bg-destructive/10 text-destructive";
    case "DEGRADED":
      return "bg-muted text-foreground";
    case "DISABLED":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() ? value : "Not set";
}

function configurationValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface ProviderCardProps {
  provider: (typeof PROVIDERS)[number];
  connection: Connection | undefined;
  diagnostics: Diagnostics | undefined;
  diagnosticsOpen: boolean;
  diagnosticsLoading: boolean;
  diagnosticsError: string | null;
  busyAction: string | null;
  onAdd: (provider: ConnectionProvider) => void;
  onDisable: (connection: Connection) => void;
  onEnable: (connection: Connection) => void;
  onHealth: (connection: Connection) => void;
  onDiagnostics: (connection: Connection) => void;
}

function ProviderCard({
  provider,
  connection,
  diagnostics,
  diagnosticsOpen,
  diagnosticsLoading,
  diagnosticsError,
  busyAction,
  onAdd,
  onDisable,
  onEnable,
  onHealth,
  onDiagnostics,
}: ProviderCardProps) {
  const status = connection?.health.status ?? "DISCONNECTED";
  const configurationEntries = connection
    ? Object.entries(connection.configuration)
    : [];

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon name={provider.icon} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">{provider.label}</CardTitle>
              <CardDescription className="mt-1">
                {provider.description}
              </CardDescription>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusClass(status)}`}
            role="status"
          >
            {statusLabel(status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {connection === undefined ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            No {provider.label} connection is registered yet.
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Display name</dt>
                <dd className="mt-1 truncate font-medium">
                  {displayValue(connection.displayName)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Account</dt>
                <dd className="mt-1 truncate font-medium">
                  {displayValue(connection.externalAccountId)}
                </dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Last checked</dt>
                <dd className="mt-1 font-medium">
                  {formatDate(connection.health.lastCheckedAt)}
                </dd>
              </div>
            </dl>

            <div>
              <p className="text-xs text-muted-foreground">Granted scopes</p>
              {connection.scopes.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No scopes recorded.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {connection.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Provider metadata</p>
              {configurationEntries.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No metadata recorded.</p>
              ) : (
                <dl className="mt-2 space-y-1.5 text-sm">
                  {configurationEntries.map(([key, value]) => (
                    <div key={key} className="flex min-w-0 justify-between gap-3">
                      <dt className="truncate text-muted-foreground">{key}</dt>
                      <dd className="max-w-[60%] truncate text-right font-medium">
                        {configurationValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {connection.health.failureMessage ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {connection.health.failureMessage}
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {connection === undefined ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onAdd(provider.id)}
              disabled={busyAction !== null}
            >
              <Icon name="Plus" aria-hidden="true" />
              Add {provider.label} connection
            </Button>
          ) : connection.enabled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDisable(connection)}
              disabled={busyAction !== null}
              aria-label={`Disable ${provider.label} connection`}
            >
              Disable
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => onEnable(connection)}
              disabled={busyAction !== null}
              aria-label={`Enable ${provider.label} connection`}
            >
              Enable
            </Button>
          )}
          {connection === undefined ? null : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onHealth(connection)}
                disabled={busyAction !== null}
                aria-label={`Refresh ${provider.label} health`}
              >
                <Icon name="RotateCcw" aria-hidden="true" />
                Refresh health
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDiagnostics(connection)}
                disabled={busyAction !== null}
                aria-expanded={diagnosticsOpen}
                aria-controls={`diagnostics-${connection.id}`}
              >
                <Icon name="Bug" aria-hidden="true" />
                {diagnosticsOpen ? "Hide diagnostics" : "View diagnostics"}
              </Button>
            </>
          )}
        </div>

        {busyAction !== null ? (
          <p className="text-xs text-muted-foreground" role="status">
            Updating {provider.label}…
          </p>
        ) : null}

        {diagnosticsOpen && connection !== undefined ? (
          <div
            id={`diagnostics-${connection.id}`}
            className="rounded-md border border-border bg-muted/20 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">Sync diagnostics</h3>
              {diagnosticsLoading ? (
                <span className="text-xs text-muted-foreground" role="status">
                  Loading…
                </span>
              ) : null}
            </div>
            {diagnosticsError ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {diagnosticsError}
              </p>
            ) : diagnostics === undefined ? null : (
              <div className="mt-3 space-y-3">
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Last success</dt>
                    <dd className="mt-0.5 font-medium">{formatDate(diagnostics.connection.health.lastSuccessAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Consecutive failures</dt>
                    <dd className="mt-0.5 font-medium">{diagnostics.connection.health.consecutiveFailures}</dd>
                  </div>
                </dl>
                <div>
                  <p className="text-xs text-muted-foreground">Sync cursors</p>
                  {diagnostics.syncCursors.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">No sync cursors recorded.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-border-hairline rounded-md border border-border bg-background">
                      {diagnostics.syncCursors.map((cursor) => (
                        <div key={cursor.id} className="grid gap-1 px-2.5 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{cursor.stream}</p>
                            <p className="truncate text-muted-foreground">Cursor: {cursor.cursor ?? "Not set"}</p>
                          </div>
                          <span className="text-muted-foreground">{formatDate(cursor.lastSuccessAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export interface ConnectionsSettingsViewProps {
  rpcClient?: ConnectionsRpcClient;
}

export function ConnectionsSettingsView({ rpcClient }: ConnectionsSettingsViewProps) {
  const contextRpc = useConnectionsRpc();
  const rpc = rpcClient ?? contextRpc;
  const [connections, setConnections] = useState<readonly Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, Diagnostics>>({});
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<Record<string, boolean>>({});
  const [diagnosticsLoading, setDiagnosticsLoading] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rpc.call("connections_list", {});
      setConnections(Array.isArray(result) ? result : []);
    } catch (cause) {
      setConnections([]);
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const byProvider = useMemo(() => {
    const map = new Map<ConnectionProvider, Connection>();
    for (const connection of connections) {
      if (!map.has(connection.provider)) map.set(connection.provider, connection);
    }
    return map;
  }, [connections]);

  const updateConnection = useCallback((next: Connection) => {
    setConnections((current) => {
      const found = current.some((connection) => connection.id === next.id);
      return found
        ? current.map((connection) => connection.id === next.id ? next : connection)
        : [...current, next];
    });
  }, []);

  const runConnectionAction = useCallback(
    async (connection: Connection, action: "disable" | "enable" | "health") => {
      if (action === "disable" && !window.confirm(`Disable the ${connection.provider.toLowerCase()} connection?`)) {
        return;
      }
      const key = `${action}:${connection.id}`;
      setBusyAction(key);
      setError(null);
      try {
        const next = action === "disable"
          ? await rpc.call("connections_disable", { id: connection.id })
          : action === "enable"
            ? await rpc.call("connections_upsert", {
                id: connection.id,
                provider: connection.provider,
                enabled: true,
                status: "DISCONNECTED",
              })
            : {
                ...connection,
                health: await rpc.call("connections_health", { id: connection.id }),
              };
        updateConnection(next);
        setDiagnostics((current) => {
          const existing = current[connection.id];
          return existing === undefined
            ? current
            : { ...current, [connection.id]: { ...existing, connection: next } };
        });
      } catch (cause) {
        setError(`${connection.provider}: ${errorMessage(cause)}`);
      } finally {
        setBusyAction(null);
      }
    },
    [rpc, updateConnection],
  );

  const addConnection = useCallback(async (provider: ConnectionProvider) => {
    setBusyAction(`add:${provider}`);
    setError(null);
    try {
      const next = await rpc.call("connections_upsert", {
        provider,
        enabled: true,
        status: "DISCONNECTED",
      });
      updateConnection(next);
    } catch (cause) {
      setError(`${provider}: ${errorMessage(cause)}`);
    } finally {
      setBusyAction(null);
    }
  }, [rpc, updateConnection]);

  const openDiagnostics = useCallback(async (connection: Connection) => {
    const isOpen = diagnosticsOpen[connection.id] === true;
    if (isOpen) {
      setDiagnosticsOpen((current) => ({ ...current, [connection.id]: false }));
      return;
    }
    setDiagnosticsOpen((current) => ({ ...current, [connection.id]: true }));
    if (diagnostics[connection.id] !== undefined) return;
    setDiagnosticsLoading(connection.id);
    setDiagnosticsError((current) => {
      const next = { ...current };
      delete next[connection.id];
      return next;
    });
    try {
      const result = await rpc.call("connections_diagnostics", { id: connection.id });
      setDiagnostics((current) => ({ ...current, [connection.id]: result }));
      updateConnection(result.connection);
    } catch (cause) {
      setDiagnosticsError((current) => ({
        ...current,
        [connection.id]: errorMessage(cause),
      }));
    } finally {
      setDiagnosticsLoading(null);
    }
  }, [diagnostics, diagnosticsOpen, rpc, updateConnection]);

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <PageHeader
        title="Connections"
        description="Monitor provider health and sync state."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            <Icon name="RotateCcw" aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 sm:p-5">
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground" role="note">
          <div className="flex items-start gap-3">
            <Icon name="Lock" className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              OAuth authorization is not bundled with this CRM panel. Authorize providers through BB and keep OAuth client credentials and access secrets in BB secret settings. This view only stores and displays non-secret account metadata, scopes, and sync health.
            </p>
          </div>
        </div>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <span>Could not load or update connections: {error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
              Try again
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
            Loading connections…
          </div>
        ) : (
          <>
            {connections.length === 0 ? (
              <EmptyState
                icon="ElectricPlugs"
                title="No connections configured"
                description="Register a provider record after authorization is set up in BB."
              />
            ) : null}
            <section aria-labelledby="provider-connections-heading">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 id="provider-connections-heading" className="text-base font-semibold">Provider health</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Liveness, account metadata, scopes, and sync diagnostics.</p>
                </div>
                <span className="text-xs text-muted-foreground">{connections.length} registered</span>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                {PROVIDERS.map((provider) => {
                  const connection = byProvider.get(provider.id);
                  const key = connection === undefined ? `add:${provider.id}` : undefined;
                  const actionBusy = busyAction === key || (connection !== undefined && busyAction?.endsWith(`:${connection.id}`) === true) ? busyAction : null;
                  return (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      connection={connection}
                      diagnostics={connection === undefined ? undefined : diagnostics[connection.id]}
                      diagnosticsOpen={connection !== undefined && diagnosticsOpen[connection.id] === true}
                      diagnosticsLoading={connection !== undefined && diagnosticsLoading === connection.id}
                      diagnosticsError={connection === undefined ? null : diagnosticsError[connection.id] ?? null}
                      busyAction={actionBusy}
                      onAdd={addConnection}
                      onDisable={(value) => void runConnectionAction(value, "disable")}
                      onEnable={(value) => void runConnectionAction(value, "enable")}
                      onHealth={(value) => void runConnectionAction(value, "health")}
                      onDiagnostics={(value) => void openDiagnostics(value)}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
