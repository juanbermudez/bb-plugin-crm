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
  const createCandidate = new URLSearchParams(rawQuery).get("create");
  const create = CREATE_ACTIONS.has(createCandidate as CrmCreateAction)
    ? (createCandidate as CrmCreateAction)
    : undefined;
  return {
    kind,
    recordId: segments[1] ?? null,
    ...(segments[2] === undefined ? {} : { tab: segments[2] }),
    ...(create === undefined ? {} : { create }),
  };
}

export function crmRouteToSubPath(route: CrmRoute): string {
  const query = route.create === undefined
    ? ""
    : `?create=${encodeURIComponent(route.create)}`;
  if (route.recordId === null) return `${route.kind}${query}`;
  const base = `${route.kind}/${encodeURIComponent(route.recordId)}`;
  const tab = route.tab?.trim();
  return `${tab ? `${base}/${encodeURIComponent(tab)}` : base}${query}`;
}
