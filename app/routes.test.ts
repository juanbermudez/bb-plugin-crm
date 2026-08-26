import { describe, expect, it } from "vitest";
import {
  crmRouteToPanelTarget,
  crmRouteToSubPath,
  parseCrmPanelRoute,
  parseCrmRoute,
} from "./routes.js";

describe("CRM panel routes", () => {
  it("defaults unknown and empty paths to the dashboard", () => {
    expect(parseCrmRoute("")).toEqual({ kind: "dashboard", recordId: null });
    expect(parseCrmRoute("unknown")).toEqual({
      kind: "dashboard",
      recordId: null,
    });
  });

  it("round-trips list and record routes", () => {
    expect(parseCrmRoute(crmRouteToSubPath({ kind: "contacts", recordId: null }))).toEqual({
      kind: "contacts",
      recordId: null,
    });
    expect(
      parseCrmRoute(
        crmRouteToSubPath({ kind: "companies", recordId: "cmp/acme" }),
      ),
    ).toEqual({ kind: "companies", recordId: "cmp/acme" });
  });

  it("round-trips a record drawer tab in the panel sub-path", () => {
    const route = {
      kind: "deals" as const,
      recordId: "deal/1",
      tab: "activity",
    };
    expect(parseCrmRoute(crmRouteToSubPath(route))).toEqual(route);
  });

  it("round-trips the routed deal stage filter", () => {
    const route = {
      kind: "deals" as const,
      recordId: null,
      stage: "DEMO_BOOKED" as const,
    };
    expect(crmRouteToSubPath(route)).toBe("deals?stage=DEMO_BOOKED");
    expect(parseCrmRoute(crmRouteToSubPath(route))).toEqual(route);
    expect(parseCrmRoute("deals?stage=not-a-stage")).toEqual({
      kind: "deals",
      recordId: null,
    });
  });

  it("round-trips a routed create action", () => {
    const route = {
      kind: "contacts" as const,
      recordId: null,
      create: "contact" as const,
    };
    const subPath = crmRouteToSubPath(route);
    expect(subPath).toBe("contacts/create/contact");
    expect(subPath).not.toContain("?");
    expect(parseCrmRoute(subPath)).toEqual(route);
    // Preserve old direct links while BB-hosted navigation uses path state.
    expect(parseCrmRoute("dashboard?create=task")).toEqual({
      kind: "dashboard",
      recordId: null,
      create: "task",
    });
    expect(parseCrmRoute("dashboard?create=unknown")).toEqual({
      kind: "dashboard",
      recordId: null,
    });
    expect(parseCrmRoute("dashboard/create/unknown")).toEqual({
      kind: "dashboard",
      recordId: null,
    });
  });

  it("parses first-class BB panel paths while preserving legacy CRM links", () => {
    expect(parseCrmPanelRoute("contacts", "")).toEqual({
      kind: "contacts",
      recordId: null,
    });
    expect(parseCrmPanelRoute("companies", "cmp%2Facme/activity")).toEqual({
      kind: "companies",
      recordId: "cmp/acme",
      tab: "activity",
    });
    expect(parseCrmPanelRoute("dashboard", "deals/deal-1")).toEqual({
      kind: "deals",
      recordId: "deal-1",
    });
  });

  it("maps logical routes to the panel that owns them", () => {
    expect(crmRouteToPanelTarget({ kind: "companies", recordId: "cmp/acme" })).toEqual({
      path: "companies",
      subPath: "cmp%2Facme",
    });
    expect(crmRouteToPanelTarget({ kind: "deals", recordId: null, stage: "DEMO_BOOKED" })).toEqual({
      path: "deals",
      subPath: "?stage=DEMO_BOOKED",
    });
    expect(crmRouteToPanelTarget({ kind: "dashboard", recordId: null, create: "task" })).toEqual({
      path: "crm",
      subPath: "create/task",
    });
  });
});
