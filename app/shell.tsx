import { useEffect, useMemo, useState } from "react";
import {
  useBbNavigate,
  useRpc,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contracts/rpc.js";
import { Button } from "../components/ui/button.js";
import { Icon, type IconName } from "../components/ui/icon.js";
import {
  crmRouteToSubPath,
  parseCrmRoute,
  type CrmRouteKind,
} from "./routes.js";
import { CompaniesView } from "./views/companies/index.js";
import { ContactsView } from "./views/contacts/index.js";
import { DealsView } from "./views/deals/index.js";
import { CurrencySettingsView } from "./views/settings/currency/index.js";

const NAV_ITEMS: ReadonlyArray<{
  kind: CrmRouteKind;
  label: string;
  icon: IconName;
}> = [
  { kind: "dashboard", label: "Dashboard", icon: "ChartColumn" },
  { kind: "companies", label: "Companies", icon: "Layers" },
  { kind: "contacts", label: "Contacts", icon: "UserRound" },
  { kind: "deals", label: "Deals", icon: "Target" },
  { kind: "agents", label: "Agents", icon: "Brain" },
  { kind: "settings", label: "Settings", icon: "Settings" },
];

interface Status {
  version: string;
  schemaVersion: number;
  workspaceName: string;
  reportingCurrency: string;
}

function FoundationDashboard() {
  const rpc = useRpc<typeof rpcContract>();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void rpc
      .call("status")
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [rpc]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 md:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          CRM storage, navigation, CLI, and BB runtime status.
        </p>
      </div>
      {error !== null ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : status === null ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Workspace", status.workspaceName],
            ["Reporting currency", status.reportingCurrency],
            ["Plugin version", status.version],
            ["Schema version", String(status.schemaVersion)],
          ].map(([label, value]) => (
            <div key={label} className="bg-background p-4">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-2 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingView({ kind }: { kind: Exclude<CrmRouteKind, "dashboard"> }) {
  const title = NAV_ITEMS.find((item) => item.kind === kind)?.label ?? kind;
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        This feature slice is mapped in the port plan and is next in the parity build.
      </p>
    </div>
  );
}

export function CrmAppShell({ subPath }: PluginNavPanelProps) {
  const route = parseCrmRoute(subPath);
  const navigate = useBbNavigate();
  const go = useMemo(
    () => (kind: CrmRouteKind) => {
      navigate.toPluginPanel("crm", {
        subPath: crmRouteToSubPath({ kind, recordId: null }),
      });
    },
    [navigate],
  );

  const navigation = NAV_ITEMS.map((item) => (
    <Button
      key={item.kind}
      variant="ghost"
      size="icon"
      aria-label={item.label}
      aria-pressed={route.kind === item.kind}
      onClick={() => go(item.kind)}
    >
      <Icon name={item.icon} aria-hidden="true" />
    </Button>
  ));

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-background text-foreground @md:flex-row">
      <nav className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5 @md:w-14 @md:flex-col @md:border-r @md:border-b-0 @md:px-0 @md:py-3">
        {navigation}
      </nav>
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        {route.kind === "dashboard" ? (
          <FoundationDashboard />
        ) : route.kind === "companies" ? (
          <CompaniesView
            initialRecordId={route.recordId}
            onRecordIdChange={(recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "companies", recordId }),
              });
            }}
          />
        ) : route.kind === "contacts" ? (
          <ContactsView
            initialRecordId={route.recordId}
            onRecordIdChange={(recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "contacts", recordId }),
              });
            }}
          />
        ) : route.kind === "deals" ? (
          <DealsView
            initialRecordId={route.recordId}
            onRecordIdChange={(recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "deals", recordId }),
              });
            }}
          />
        ) : route.kind === "settings" ? (
          <CurrencySettingsView />
        ) : (
          <PendingView kind={route.kind} />
        )}
      </main>
    </div>
  );
}
