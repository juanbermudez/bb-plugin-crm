import { useMemo } from "react";
import {
  useBbNavigate,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
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
import { DashboardView } from "./views/dashboard/index.js";
import { SettingsView, type SettingsSection } from "./views/settings/index.js";

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
          <DashboardView />
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
          <SettingsView
            initialSection={route.recordId === "custom-fields" ? "custom-fields" : "currency"}
            onSectionChange={(section: SettingsSection) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "settings", recordId: section }),
              });
            }}
          />
        ) : (
          <PendingView kind={route.kind} />
        )}
      </main>
    </div>
  );
}
