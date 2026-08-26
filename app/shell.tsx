import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBbNavigate,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";

import { Button } from "../components/ui/button.js";
import { Icon } from "../components/ui/icon.js";
import {
  EnrichmentQueue,
  GlobalSearch,
  WorkspaceChecklist,
  readWorkspaceChecklistState,
  type GlobalSearchResult,
} from "./components/index.js";
import { GlobalActivityCreate } from "./components/global-activity-create.js";
import type { EnrichmentQueueSubject } from "../contracts/enrichment-queue.js";
import type { DealStage } from "../contracts/core.js";
import {
  crmRouteToPanelTarget,
  parseCrmPanelRoute,
  type CrmCreateAction,
  type CrmPanelKind,
  type CrmRoute,
} from "./routes.js";
import { CompaniesView } from "./views/companies/index.js";
import { ContactsView } from "./views/contacts/index.js";
import { DealsView } from "./views/deals/index.js";
import { DashboardView } from "./views/dashboard/index.js";
import { AgentsView } from "./views/agents/index.js";

const CREATE_ITEMS: ReadonlyArray<{ action: CrmCreateAction; label: string }> = [
  { action: "company", label: "New company" },
  { action: "contact", label: "New contact" },
  { action: "deal", label: "New deal" },
  { action: "note", label: "New note" },
  { action: "task", label: "New task" },
  { action: "agent", label: "New agent" },
];

export interface CrmPanelProps extends PluginNavPanelProps {
  panelKind?: CrmPanelKind;
}

function useCrmRouteNavigation() {
  const navigate = useBbNavigate();
  return useCallback((route: CrmRoute) => {
    const target = crmRouteToPanelTarget(route);
    navigate.toPluginPanel(target.path, { subPath: target.subPath });
  }, [navigate]);
}

function createRoute(action: CrmCreateAction): CrmRoute {
  const kind = action === "company"
    ? "companies"
    : action === "contact"
      ? "contacts"
      : action === "deal"
        ? "deals"
        : action === "agent"
          ? "agents"
          : "dashboard";
  return { kind, recordId: null, create: action };
}

function routeForSearchResult(result: GlobalSearchResult): CrmRoute {
  return {
    kind: result.kind === "company"
      ? "companies"
      : result.kind === "contact"
        ? "contacts"
        : "deals",
    recordId: result.id,
  };
}

function routeForQueueSubject(subject: EnrichmentQueueSubject): CrmRoute | null {
  if (subject.kind === "contact") return { kind: "contacts", recordId: subject.id };
  if (subject.kind === "company") return { kind: "companies", recordId: subject.id };
  if (subject.kind === "deal") return { kind: "deals", recordId: subject.id };
  if (subject.kind === "agent") return { kind: "agents", recordId: subject.id };
  if (subject.related === null) return null;
  return {
    kind: subject.related.kind === "contact"
      ? "contacts"
      : subject.related.kind === "company"
        ? "companies"
        : "deals",
    recordId: subject.related.id,
  };
}

/** Compact actions mounted in BB's host-owned title bar. */
export function CrmHeaderContent({ subPath: _subPath }: CrmPanelProps) {
  const goRoute = useCrmRouteNavigation();
  const [createOpen, setCreateOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  const focusCreateButton = useCallback(() => {
    const button = createButtonRef.current;
    if (button?.isConnected && button.closest('[aria-hidden="true"], [inert]') === null) {
      button.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    createMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (createMenuRef.current?.contains(target) || createButtonRef.current?.contains(target)) return;
      setCreateOpen(false);
      focusCreateButton();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCreateOpen(false);
        focusCreateButton();
        return;
      }
      if (event.key === "Tab") {
        setCreateOpen(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(
        createMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
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
  }, [createOpen, focusCreateButton]);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
      <GlobalSearch
        onOpen={(result) => goRoute(routeForSearchResult(result))}
        className="hidden w-64 lg:block"
      />
      <EnrichmentQueue
        onOpen={(subject) => {
          const route = routeForQueueSubject(subject);
          if (route !== null) goRoute(route);
        }}
      />
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
          >
            {CREATE_ITEMS.map(({ action, label }) => (
              <Button
                key={action}
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                role="menuitem"
                onClick={() => {
                  setCreateOpen(false);
                  goRoute(createRoute(action));
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MovedSettingsNotice() {
  return (
    <div className="mx-auto flex min-h-80 w-full max-w-xl flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon name="Settings" aria-hidden="true" className="size-6 text-muted-foreground" />
      <h1 className="text-lg font-semibold">CRM settings moved</h1>
      <p className="text-sm text-muted-foreground">
        Configure the CRM from BB Settings under Plugins → CRM.
      </p>
      <Button asChild variant="outline" size="sm">
        <a href="/settings/plugins/crm">Open BB Settings</a>
      </Button>
    </div>
  );
}

export function CrmAppShell({ subPath, panelKind = "dashboard" }: CrmPanelProps) {
  const route = parseCrmPanelRoute(panelKind, subPath);
  const goRoute = useCrmRouteNavigation();
  const [checklistOpen, setChecklistOpen] = useState(
    () => route.kind === "dashboard" && !readWorkspaceChecklistState().dismissed,
  );

  const clearCreateRoute = useCallback(() => {
    goRoute({
      kind: route.kind,
      recordId: route.recordId,
      ...(route.tab === undefined ? {} : { tab: route.tab }),
      ...(route.stage === undefined ? {} : { stage: route.stage }),
    });
  }, [goRoute, route.kind, route.recordId, route.stage, route.tab]);

  const openDashboardRecord = useCallback((kind: "company" | "contact" | "deal", id: string) => {
    goRoute({
      kind: kind === "company" ? "companies" : kind === "contact" ? "contacts" : "deals",
      recordId: id,
    });
  }, [goRoute]);

  const openDashboardDeals = useCallback((stage?: DealStage) => {
    goRoute({ kind: "deals", recordId: null, ...(stage === undefined ? {} : { stage }) });
  }, [goRoute]);

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-background text-foreground">
      {route.kind === "dashboard" && checklistOpen ? (
        <WorkspaceChecklist
          onNavigate={(kind) => goRoute({ kind, recordId: null })}
          onDismiss={() => setChecklistOpen(false)}
        />
      ) : null}
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        {route.kind === "dashboard" ? (
          <DashboardView
            onOpenRecord={openDashboardRecord}
            onOpenDeals={openDashboardDeals}
            onOpenCurrencySettings={() => window.location.assign("/settings/plugins/crm")}
          />
        ) : route.kind === "companies" ? (
          <CompaniesView
            initialRecordId={route.recordId}
            initialCreate={route.create === "company"}
            initialTab={route.tab}
            onCreateChange={route.create === "company" ? clearCreateRoute : undefined}
            onRecordIdChange={(recordId) => goRoute({ kind: "companies", recordId })}
            onTabChange={(tab, recordId) => goRoute({ kind: "companies", recordId, tab })}
          />
        ) : route.kind === "contacts" ? (
          <ContactsView
            initialRecordId={route.recordId}
            initialCreate={route.create === "contact"}
            initialTab={route.tab}
            onCreateChange={route.create === "contact" ? clearCreateRoute : undefined}
            onOpenRelatedRecord={(kind, id) => goRoute({
              kind: kind === "deal" ? "deals" : "companies",
              recordId: id,
            })}
            onRecordIdChange={(recordId) => goRoute({ kind: "contacts", recordId })}
            onTabChange={(tab, recordId) => goRoute({ kind: "contacts", recordId, tab })}
          />
        ) : route.kind === "deals" ? (
          <DealsView
            initialRecordId={route.recordId}
            initialStage={route.stage ?? null}
            initialCreate={route.create === "deal"}
            initialTab={route.tab}
            onCreateChange={route.create === "deal" ? clearCreateRoute : undefined}
            onOpenRelatedRecord={(kind, id) => goRoute({
              kind: kind === "contact" ? "contacts" : "companies",
              recordId: id,
            })}
            onRecordIdChange={(recordId) => goRoute({ kind: "deals", recordId })}
            onTabChange={(tab, recordId) => goRoute({ kind: "deals", recordId, tab })}
          />
        ) : route.kind === "agents" ? (
          <AgentsView
            initialRecordId={route.recordId}
            initialCreate={route.create === "agent"}
            initialTab={route.tab}
            onCreateChange={route.create === "agent" ? clearCreateRoute : undefined}
            onRecordIdChange={(recordId) => goRoute({ kind: "agents", recordId })}
            onTabChange={(tab, recordId) => goRoute({ kind: "agents", recordId, tab })}
          />
        ) : (
          <MovedSettingsNotice />
        )}
      </main>
      {route.create === "note" || route.create === "task" ? (
        <GlobalActivityCreate type={route.create} onClose={clearCreateRoute} />
      ) : null}
    </div>
  );
}
