import { useEffect, useMemo, useRef, useState } from "react";
import {
  useBbNavigate,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { Button } from "../components/ui/button.js";
import { Icon, type IconName } from "../components/ui/icon.js";
import {
  EnrichmentQueue,
  GlobalSearch,
  WorkspaceChecklist,
  readWorkspaceChecklistState,
  type GlobalSearchResult,
} from "./components/index.js";
import type { EnrichmentQueueSubject } from "../contracts/enrichment-queue.js";
import {
  crmRouteToSubPath,
  parseCrmRoute,
  type CrmCreateAction,
  type CrmRouteKind,
} from "./routes.js";
import { CompaniesView } from "./views/companies/index.js";
import { ContactsView } from "./views/contacts/index.js";
import { DealsView } from "./views/deals/index.js";
import { DashboardView } from "./views/dashboard/index.js";
import { SettingsView, type SettingsSection } from "./views/settings/index.js";
import { AgentsView } from "./views/agents/index.js";
import { GlobalActivityCreate } from "./components/global-activity-create.js";

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

const CREATE_ITEMS: ReadonlyArray<{ action: CrmCreateAction; label: string }> = [
  { action: "company", label: "New company" },
  { action: "contact", label: "New contact" },
  { action: "deal", label: "New deal" },
  { action: "note", label: "New note" },
  { action: "task", label: "New task" },
  { action: "agent", label: "New agent" },
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
  const [createOpen, setCreateOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const [checklistOpen, setChecklistOpen] = useState(
    () => !readWorkspaceChecklistState().dismissed,
  );

  useEffect(() => {
    if (!createOpen) return;
    const firstItem = createMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstItem?.focus();
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (createMenuRef.current?.contains(target) || createButtonRef.current?.contains(target)) return;
      setCreateOpen(false);
      createButtonRef.current?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCreateOpen(false);
        createButtonRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        setCreateOpen(false);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      const items = Array.from(createMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[nextIndex]?.focus();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [createOpen]);
  const go = useMemo(
    () => (kind: CrmRouteKind) => {
      navigate.toPluginPanel("crm", {
        subPath: crmRouteToSubPath({ kind, recordId: null }),
      });
    },
    [navigate],
  );
  const clearCreateRoute = useMemo(
    () => () => {
      navigate.toPluginPanel("crm", {
        subPath: crmRouteToSubPath({
          kind: route.kind,
          recordId: route.recordId,
          ...(route.tab === undefined ? {} : { tab: route.tab }),
        }),
      });
    },
    [navigate, route.kind, route.recordId, route.tab],
  );
  const openCreate = useMemo(
    () => (action: CrmCreateAction) => {
      const kind =
        action === "company"
          ? "companies"
          : action === "contact"
            ? "contacts"
            : action === "deal"
              ? "deals"
              : action === "agent"
                ? "agents"
                : "dashboard";
      navigate.toPluginPanel("crm", {
        subPath: crmRouteToSubPath({ kind, recordId: null, create: action }),
      });
    },
    [navigate],
  );

  const openSearchResult = (result: GlobalSearchResult) => {
    navigate.toPluginPanel("crm", {
      subPath: crmRouteToSubPath({
        kind:
          result.kind === "company"
            ? "companies"
            : result.kind === "contact"
              ? "contacts"
              : "deals",
        recordId: result.id,
      }),
    });
  };

  const openQueueSubject = useMemo(
    () => (subject: EnrichmentQueueSubject) => {
      const target =
        subject.kind === "contact"
          ? { kind: "contacts" as const, recordId: subject.id }
          : subject.kind === "company"
            ? { kind: "companies" as const, recordId: subject.id }
            : subject.kind === "deal"
              ? { kind: "deals" as const, recordId: subject.id }
            : subject.kind === "agent"
              ? { kind: "agents" as const, recordId: subject.id }
              : subject.related === null
                ? null
                : {
                    kind:
                      subject.related.kind === "contact"
                        ? ("contacts" as const)
                        : subject.related.kind === "company"
                          ? ("companies" as const)
                          : ("deals" as const),
                    recordId: subject.related.id,
                  };
      if (target === null) return;
      navigate.toPluginPanel("crm", { subPath: crmRouteToSubPath(target) });
    },
    [navigate],
  );

  const dismissChecklist = () => {
    setChecklistOpen(false);
  };

  const routeLabel = NAV_ITEMS.find((item) => item.kind === route.kind)?.label ?? "CRM";

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
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              CRM
            </span>
            <span className="text-border" aria-hidden="true">/</span>
            <span className="truncate text-sm font-medium">{routeLabel}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
            <GlobalSearch onOpen={openSearchResult} className="order-3 w-full sm:order-none sm:w-72" />
            <EnrichmentQueue onOpen={openQueueSubject} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={checklistOpen}
              onClick={() => setChecklistOpen((open) => !open)}
            >
              <Icon name="Check" aria-hidden="true" />
              Checklist
            </Button>
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={createOpen}
                aria-haspopup="menu"
                aria-controls="crm-create-menu"
                ref={createButtonRef}
                onClick={() => setCreateOpen((open) => !open)}
              >
                <Icon name="Plus" aria-hidden="true" />
                New
              </Button>
              {createOpen ? (
                <div
                  id="crm-create-menu"
                  ref={createMenuRef}
                  className="absolute right-0 z-40 mt-2 w-44 rounded-lg border border-border bg-background p-1 shadow-lg"
                  role="menu"
                  aria-label="Create CRM record"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setCreateOpen(false);
                      createButtonRef.current?.focus();
                    }
                  }}
                >
                  {CREATE_ITEMS.map(({ action, label }) => {
                    return (
                      <Button
                        key={action}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        role="menuitem"
                        onClick={() => {
                          setCreateOpen(false);
                          openCreate(action);
                        }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {checklistOpen ? (
          <WorkspaceChecklist onNavigate={go} onDismiss={dismissChecklist} />
        ) : null}
        <div className="min-h-0 min-w-0 flex-1">
        {route.kind === "dashboard" ? (
          <DashboardView />
        ) : route.kind === "companies" ? (
          <CompaniesView
            initialRecordId={route.recordId}
            initialCreate={route.create === "company"}
            initialTab={route.tab}
            onCreateChange={route.create === "company" ? clearCreateRoute : undefined}
            onRecordIdChange={(recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "companies", recordId }),
              });
            }}
            onTabChange={(tab, recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({
                  kind: "companies",
                  recordId,
                  tab,
                }),
              });
            }}
          />
        ) : route.kind === "contacts" ? (
          <ContactsView
            initialRecordId={route.recordId}
            initialCreate={route.create === "contact"}
            initialTab={route.tab}
            onCreateChange={route.create === "contact" ? clearCreateRoute : undefined}
            onOpenRelatedRecord={(kind, id) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({
                  kind: kind === "deal" ? "deals" : "companies",
                  recordId: id,
                }),
              });
            }}
            onRecordIdChange={(recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "contacts", recordId }),
              });
            }}
            onTabChange={(tab, recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({
                  kind: "contacts",
                  recordId,
                  tab,
                }),
              });
            }}
          />
        ) : route.kind === "deals" ? (
          <DealsView
            initialRecordId={route.recordId}
            initialCreate={route.create === "deal"}
            initialTab={route.tab}
            onCreateChange={route.create === "deal" ? clearCreateRoute : undefined}
            onOpenRelatedRecord={(kind, id) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({
                  kind: kind === "contact" ? "contacts" : "companies",
                  recordId: id,
                }),
              });
            }}
            onRecordIdChange={(recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "deals", recordId }),
              });
            }}
            onTabChange={(tab, recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({
                  kind: "deals",
                  recordId,
                  tab,
                }),
              });
            }}
          />
        ) : route.kind === "settings" ? (
          <SettingsView
            initialSection={
              route.recordId === "custom-fields"
                ? "custom-fields"
                : route.recordId === "connections"
                  ? "connections"
                  : route.recordId === "tracking"
                    ? "tracking"
                    : "currency"
            }
            onSectionChange={(section: SettingsSection) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "settings", recordId: section }),
              });
            }}
          />
        ) : route.kind === "agents" ? (
          <AgentsView
            initialRecordId={route.recordId}
            initialCreate={route.create === "agent"}
            initialTab={route.tab}
            onCreateChange={route.create === "agent" ? clearCreateRoute : undefined}
            onRecordIdChange={(recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({ kind: "agents", recordId }),
              });
            }}
            onTabChange={(tab, recordId) => {
              navigate.toPluginPanel("crm", {
                subPath: crmRouteToSubPath({
                  kind: "agents",
                  recordId,
                  tab,
                }),
              });
            }}
          />
        ) : (
          <PendingView kind={route.kind} />
        )}
        </div>
      </main>
      {route.create === "note" || route.create === "task" ? (
        <GlobalActivityCreate
          type={route.create}
          onClose={clearCreateRoute}
        />
      ) : null}
    </div>
  );
}
