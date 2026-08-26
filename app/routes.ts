import { DEAL_STAGES, type DealStage } from "../contracts/core.js";

export type CrmRouteKind =
  | "dashboard"
  | "companies"
  | "contacts"
  | "deals"
  | "agents"
  | "settings";

/** Route kinds that can be exposed as first-class BB sidebar panels. */
export type CrmPanelKind = Exclude<CrmRouteKind, "settings">;

export interface CrmPanelTarget {
  path: string;
  subPath: string;
}

export const CRM_PANEL_PATHS: Readonly<Record<CrmPanelKind, string>> = {
  dashboard: "crm",
  companies: "crm",
  contacts: "crm",
  deals: "crm",
  agents: "crm",
};

export type CrmCreateAction =
  | "company"
  | "contact"
  | "deal"
  | "note"
  | "task"
  | "agent";

export interface CrmRoute {
  kind: CrmRouteKind;
  recordId: string | null;
  /** Optional record drawer tab/subview, persisted in the BB panel sub-path. */
  tab?: string;
  /** Optional deal-list stage filter, persisted in the BB panel query. */
  stage?: DealStage;
  /** Optional create action opened from the CRM header. */
  create?: CrmCreateAction;
}

const ROUTE_KINDS = new Set<CrmRouteKind>([
  "dashboard",
  "companies",
  "contacts",
  "deals",
  "agents",
  "settings",
]);

const CREATE_ACTIONS = new Set<CrmCreateAction>([
  "company",
  "contact",
  "deal",
  "note",
  "task",
  "agent",
]);

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCrmRoute(rawSubPath: string): CrmRoute {
  const [path = "", rawQuery = ""] = rawSubPath.split("?", 2);
  const segments = path.split("/").filter(Boolean).map(decodeSegment);
  const candidate = segments[0];
  const kind =
    candidate !== undefined && ROUTE_KINDS.has(candidate as CrmRouteKind)
      ? (candidate as CrmRouteKind)
      : "dashboard";
  const isCreatePath = segments[1] === "create";
  const pathCreateCandidate = isCreatePath ? segments[2] : null;
  const createCandidate = pathCreateCandidate ?? new URLSearchParams(rawQuery).get("create");
  const create = CREATE_ACTIONS.has(createCandidate as CrmCreateAction)
    ? (createCandidate as CrmCreateAction)
    : undefined;
  const stageCandidate = new URLSearchParams(rawQuery).get("stage");
  const stage =
    kind === "deals" && stageCandidate !== null && DEAL_STAGES.includes(stageCandidate as DealStage)
      ? (stageCandidate as DealStage)
      : undefined;
  return {
    kind,
    recordId: isCreatePath ? null : segments[1] ?? null,
    ...(isCreatePath || segments[2] === undefined ? {} : { tab: segments[2] }),
    ...(stage === undefined ? {} : { stage }),
    ...(create === undefined ? {} : { create }),
  };
}

export function crmRouteToSubPath(route: CrmRoute): string {
  // BB owns the outer route and percent-encodes plugin sub-path segments.
  // Keep create state in path segments rather than query syntax so `?` is
  // never encoded into a literal route segment by the host.
  if (route.create !== undefined) {
    return `${route.kind}/create/${encodeURIComponent(route.create)}`;
  }
  const stage = route.kind === "deals" && route.stage?.trim()
    ? `?stage=${encodeURIComponent(route.stage.trim())}`
    : "";
  if (route.recordId === null) return `${route.kind}${stage}`;
  const base = `${route.kind}/${encodeURIComponent(route.recordId)}`;
  const tab = route.tab?.trim();
  return `${tab ? `${base}/${encodeURIComponent(tab)}` : base}${stage}`;
}

/**
 * Parse a route owned by one of the flat BB sidebar panels. Legacy deep links
 * rooted at `/crm/<kind>` remain valid so published links do not break.
 */
export function parseCrmPanelRoute(
  panelKind: CrmPanelKind,
  rawSubPath: string,
): CrmRoute {
  const [rawPath = ""] = rawSubPath.split("?", 1);
  const firstSegment = rawPath.split("/").filter(Boolean)[0];
  if (firstSegment !== undefined && ROUTE_KINDS.has(firstSegment as CrmRouteKind)) {
    return parseCrmRoute(rawSubPath);
  }
  const separator = rawSubPath.startsWith("?") ? "" : rawSubPath ? "/" : "";
  return parseCrmRoute(`${panelKind}${separator}${rawSubPath}`);
}

/** Translate a logical CRM route into the BB panel that should own it. */
export function crmRouteToPanelTarget(route: CrmRoute): CrmPanelTarget {
  const fullSubPath = crmRouteToSubPath(route);
  return { path: CRM_PANEL_PATHS.dashboard, subPath: fullSubPath };
}
