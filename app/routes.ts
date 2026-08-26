import { DEAL_STAGES, type DealStage } from "../contracts/core.js";

export type CrmRouteKind =
  | "dashboard"
  | "companies"
  | "contacts"
  | "deals"
  | "agents"
  | "settings";

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
