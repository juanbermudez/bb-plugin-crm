export type CrmRouteKind =
  | "dashboard"
  | "companies"
  | "contacts"
  | "deals"
  | "agents"
  | "settings";

export interface CrmRoute {
  kind: CrmRouteKind;
  recordId: string | null;
  /** Optional record drawer tab/subview, persisted in the BB panel sub-path. */
  tab?: string;
}

const ROUTE_KINDS = new Set<CrmRouteKind>([
  "dashboard",
  "companies",
  "contacts",
  "deals",
  "agents",
  "settings",
]);

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCrmRoute(rawSubPath: string): CrmRoute {
  const path = rawSubPath.split("?")[0] ?? "";
  const segments = path.split("/").filter(Boolean).map(decodeSegment);
  const candidate = segments[0];
  const kind =
    candidate !== undefined && ROUTE_KINDS.has(candidate as CrmRouteKind)
      ? (candidate as CrmRouteKind)
      : "dashboard";
  return {
    kind,
    recordId: segments[1] ?? null,
    ...(segments[2] === undefined ? {} : { tab: segments[2] }),
  };
}

export function crmRouteToSubPath(route: CrmRoute): string {
  if (route.recordId === null) return route.kind;
  const base = `${route.kind}/${encodeURIComponent(route.recordId)}`;
  const tab = route.tab?.trim();
  return tab ? `${base}/${encodeURIComponent(tab)}` : base;
}
