import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin, {
  CRM_TRACKING_COLLECTOR_PATH,
  CRM_TRACKING_LOADER_PATH,
} from "./server.js";

describe("tracking HTTP routes", () => {
  it("serves a fixed loader and validates token, origin, and privacy at collection", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm-tracking-http" });
    await plugin(bb);
    try {
      expect(harness.inspection.registrations.httpRoutes.map((route) => [route.method, route.path, route.auth])).toEqual([
        ["GET", CRM_TRACKING_LOADER_PATH, "none"],
        ["OPTIONS", CRM_TRACKING_COLLECTOR_PATH, "none"],
        ["POST", CRM_TRACKING_COLLECTOR_PATH, "none"],
      ]);

      const site = await harness.behavior.callRpc("tracking_sites_create", {
        id: "site-http",
        siteKey: "site_http",
        name: "HTTP test site",
        allowedDomains: ["example.com"],
      }) as { id: string; siteKey: string };
      const token = await harness.behavior.callRpc("tracking_tokens_provision", {
        siteId: site.id,
        scope: "TRACKING",
      }) as { token: string };

      const loader = await harness.behavior.fetchHttp(
        "GET",
        `${CRM_TRACKING_LOADER_PATH}?siteKey=${site.siteKey}`,
      );
      expect(loader.status).toBe(200);
      expect(loader.headers.get("content-type")).toContain("application/javascript");
      const loaderSource = await loader.text();
      expect(loaderSource).toContain("PAGE_VIEW");
      expect(loaderSource).toContain("crmTrack");
      expect(loaderSource).not.toContain(token.token);

      const origin = "https://example.com";
      const preflight = await harness.behavior.fetchHttp(
        "OPTIONS",
        `${CRM_TRACKING_COLLECTOR_PATH}?siteKey=${site.siteKey}`,
        { headers: { Origin: origin } },
      );
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
      expect(preflight.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");

      const accepted = await harness.behavior.fetchHttp(
        "POST",
        `${CRM_TRACKING_COLLECTOR_PATH}?siteKey=${site.siteKey}`,
        {
          headers: { Origin: origin, "content-type": "application/json" },
          body: JSON.stringify({
            siteKey: site.siteKey,
            token: token.token,
            eventType: "PAGE_VIEW",
            origin,
            path: "/pricing",
            referrer: null,
            properties: { plan: "pro" },
            eventKey: "page-http-1",
          }),
        },
      );
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toMatchObject({
        ok: true,
        accepted: 1,
        ids: [expect.any(String)],
      });

      const mismatchedOrigin = await harness.behavior.fetchHttp(
        "POST",
        `${CRM_TRACKING_COLLECTOR_PATH}?siteKey=${site.siteKey}`,
        {
          headers: { Origin: "https://evil.example", "content-type": "application/json" },
          body: JSON.stringify({
            siteKey: site.siteKey,
            token: token.token,
            eventType: "PAGE_VIEW",
            origin: "https://evil.example",
            path: "/pricing",
            referrer: null,
            properties: {},
          }),
        },
      );
      expect(mismatchedOrigin.status).toBe(403);

      const sensitive = await harness.behavior.fetchHttp(
        "POST",
        `${CRM_TRACKING_COLLECTOR_PATH}?siteKey=${site.siteKey}`,
        {
          headers: { Origin: origin, "content-type": "application/json" },
          body: JSON.stringify({
            siteKey: site.siteKey,
            token: token.token,
            eventType: "CUSTOM",
            origin,
            path: "/pricing",
            referrer: null,
            properties: { email: "person@example.com" },
          }),
        },
      );
      expect(sensitive.status).toBe(400);

      const unauthorized = await harness.behavior.fetchHttp(
        "POST",
        `${CRM_TRACKING_COLLECTOR_PATH}?siteKey=${site.siteKey}`,
        {
          headers: { Origin: origin, "content-type": "application/json" },
          body: JSON.stringify({
            siteKey: site.siteKey,
            token: "crm_trk_invalid-token-123456",
            eventType: "PAGE_VIEW",
            origin,
            path: "/pricing",
            referrer: null,
            properties: {},
          }),
        },
      );
      expect(unauthorized.status).toBe(401);
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
