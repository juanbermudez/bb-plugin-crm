import { describe, expect, it } from "vitest";
import { crmRouteToSubPath, parseCrmRoute } from "./routes.js";

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
});
