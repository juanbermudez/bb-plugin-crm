import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBbNavigate,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";

import { Button } from "../components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.js";
import { Icon } from "../components/ui/icon.js";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip.js";
import {
  ChecklistProgressRing,
  EnrichmentQueue,
  GlobalSearch,
  TooltipIconButton,
  WorkspaceChecklist,
  WORKSPACE_CHECKLIST_CHANGE_EVENT,
  dismissWorkspaceChecklist,
  readWorkspaceChecklistState,
  workspaceChecklistProgress,
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
  type CrmRouteKind,
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

const CRM_TABS: ReadonlyArray<{ kind: CrmPanelKind; label: string }> = [
  { kind: "dashboard", label: "Overview" },
  { kind: "companies", label: "Companies" },
  { kind: "contacts", label: "Contacts" },
  { kind: "deals", label: "Deals" },
  { kind: "agents", label: "Agents" },
];

const HEADER_ICON_BUTTON_CLASS = "size-8 text-muted-foreground hover:text-foreground";

function CrmSectionTabs({
  activeKind,
  onNavigate,
  placement,
}: {
  activeKind: CrmRouteKind;
  onNavigate: (kind: CrmPanelKind) => void;
  placement: "header" | "body";
}) {
  const inHeader = placement === "header";
  return (
    <nav
      className={inHeader
        ? "crm-header-tabs hidden shrink-0 xl:block"
        : "shrink-0 border-b border-border px-4 xl:hidden sm:px-5"}
      aria-label="CRM sections"
    >
      <Tabs
        value={activeKind === "settings" ? "dashboard" : activeKind}
        onValueChange={(value) => {
          const tab = CRM_TABS.find(({ kind }) => kind === value);
          if (tab) onNavigate(tab.kind);
        }}
      >
        <TabsList className={inHeader
          ? "h-10 gap-3 overflow-x-auto rounded-none bg-transparent p-0"
          : "h-11 w-full justify-start gap-5 overflow-x-auto rounded-none bg-transparent p-0"}
        >
          {CRM_TABS.map((tab) => (
            <TabsTrigger
              key={tab.kind}
              value={tab.kind}
              className={`${inHeader ? "h-10 text-xs" : "h-11 text-sm"} rounded-none border-b-2 border-transparent px-0 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

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

function CrmHeaderSearch({
  onOpen,
}: {
  onOpen: (result: GlobalSearchResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey
      ) return;
      event.preventDefault();
      setExpanded(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [expanded]);

  return (
    <div ref={rootRef} className="relative flex h-8 shrink-0 items-center justify-end">
      {expanded ? (
        <GlobalSearch
          autoFocus
          resultsAlign="right"
          onDismiss={() => setExpanded(false)}
          onOpen={(result) => {
            setExpanded(false);
            onOpen(result);
          }}
          className="w-40 animate-in fade-in-0 zoom-in-95 duration-150"
        />
      ) : (
        <TooltipIconButton
          label="Search CRM"
          icon="Search"
          variant="ghost"
          className={HEADER_ICON_BUTTON_CLASS}
          onClick={() => setExpanded(true)}
        />
      )}
    </div>
  );
}

/** Compact actions mounted in BB's host-owned title bar. */
export function CrmHeaderContent({ subPath }: CrmPanelProps) {
  const goRoute = useCrmRouteNavigation();
  const route = parseCrmPanelRoute("dashboard", subPath);
  const [createOpen, setCreateOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(
    () => !readWorkspaceChecklistState().dismissed,
  );
  const [checklistProgress, setChecklistProgress] = useState(workspaceChecklistProgress);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setChecklistProgress(workspaceChecklistProgress());
    window.addEventListener(WORKSPACE_CHECKLIST_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WORKSPACE_CHECKLIST_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const closeChecklist = useCallback(() => {
    dismissWorkspaceChecklist();
    setChecklistOpen(false);
    setChecklistProgress(workspaceChecklistProgress());
  }, []);

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
    <div className="flex min-w-0 items-center gap-1">
      <CrmSectionTabs
        activeKind={route.kind}
        onNavigate={(kind) => goRoute({ kind, recordId: null })}
        placement="header"
      />
      <CrmHeaderSearch
        onOpen={(result) => goRoute(routeForSearchResult(result))}
      />
      <EnrichmentQueue
        compact
        triggerClassName={HEADER_ICON_BUTTON_CLASS}
        onOpen={(subject) => {
          const route = routeForQueueSubject(subject);
          if (route !== null) goRoute(route);
        }}
      />
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={HEADER_ICON_BUTTON_CLASS}
              aria-label={`Checklist, ${checklistProgress.completed} of ${checklistProgress.total} complete`}
              onClick={() => setChecklistOpen(true)}
            >
              <ChecklistProgressRing
                completed={checklistProgress.completed}
                total={checklistProgress.total}
                minimumRatio={0.12}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Checklist · {checklistProgress.completed} of {checklistProgress.total} complete
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="relative">
        <TooltipIconButton
          label="New"
          icon="Plus"
          variant="ghost"
          className={HEADER_ICON_BUTTON_CLASS}
          aria-expanded={createOpen}
          aria-haspopup="menu"
          aria-controls="crm-create-menu"
          ref={createButtonRef}
          onClick={() => setCreateOpen((open) => !open)}
        />
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
      <Dialog
        open={checklistOpen}
        onOpenChange={(open) => {
          if (open) setChecklistOpen(true);
          else closeChecklist();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Set up your CRM workspace</DialogTitle>
            <DialogDescription>Complete the first steps for your CRM workspace.</DialogDescription>
          </DialogHeader>
          <WorkspaceChecklist
            onNavigate={(kind) => {
              closeChecklist();
              if (kind === "settings") {
                window.location.assign("/settings/plugins/crm");
                return;
              }
              goRoute({ kind, recordId: null });
            }}
            onDismiss={closeChecklist}
          />
        </DialogContent>
      </Dialog>
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
      <CrmSectionTabs
        activeKind={route.kind}
        onNavigate={(kind) => goRoute({ kind, recordId: null })}
        placement="body"
      />
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
