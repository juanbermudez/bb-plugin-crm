import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin, {
  CRM_AGENT_WEBHOOK_PATH,
  CRM_TRACKING_CONFIG_PATH,
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
        ["GET", CRM_TRACKING_CONFIG_PATH, "none"],
        ["OPTIONS", CRM_TRACKING_COLLECTOR_PATH, "none"],
        ["POST", CRM_TRACKING_COLLECTOR_PATH, "none"],
        ["POST", CRM_AGENT_WEBHOOK_PATH, "none"],
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

      const config = await harness.behavior.fetchHttp(
        "GET",
        `${CRM_TRACKING_CONFIG_PATH}?siteKey=${site.siteKey}`,
        { headers: { Origin: "https://example.com" } },
      );
      expect(config.status).toBe(200);
      await expect(config.json()).resolves.toMatchObject({
        siteKey: site.siteKey,
        allowedDomains: ["example.com"],
        crossDomain: true,
        limitToDomains: true,
        cookieSubdomains: false,
        secureCookies: true,
        honourDnt: true,
        cookieDays: 395,
        paused: false,
      });
      expect(config.headers.get("access-control-allow-origin")).toBe("https://example.com");

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

      const sensitiveSource = await harness.behavior.fetchHttp(
        "POST",
        CRM_TRACKING_COLLECTOR_PATH + "?siteKey=" + site.siteKey,
        {
          headers: { Origin: origin, "content-type": "application/json" },
          body: JSON.stringify({
            siteKey: site.siteKey,
            token: token.token,
            eventType: "CUSTOM",
            origin,
            path: "/pricing",
            source: "person@example.com",
            properties: {},
          }),
        },
      );
      expect(sensitiveSource.status).toBe(400);

      const sensitiveMedium = await harness.behavior.fetchHttp(
        "POST",
        CRM_TRACKING_COLLECTOR_PATH + "?siteKey=" + site.siteKey,
        {
          headers: { Origin: origin, "content-type": "application/json" },
          body: JSON.stringify({
            siteKey: site.siteKey,
            token: token.token,
            eventType: "CUSTOM",
            origin,
            path: "/pricing",
            medium: "4111 1111 1111 1111",
            properties: {},
          }),
        },
      );
      expect(sensitiveMedium.status).toBe(400);

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

  it("decorates only configured destination domains when collection accepts all hosts", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm-tracking-linker" });
    await plugin(bb);
    try {
      const site = await harness.behavior.callRpc("tracking_sites_create", {
        id: "site-linker",
        siteKey: "site_linker",
        name: "Linker test site",
        allowedDomains: ["example.com", "*.preview.example.com"],
        limitToDomains: false,
      }) as { id: string; siteKey: string };
      const response = await harness.behavior.fetchHttp(
        "GET",
        `${CRM_TRACKING_CONFIG_PATH}?siteKey=${site.siteKey}`,
        { headers: { Origin: "https://example.com" } },
      );
      const config = await response.json() as Record<string, unknown>;
      expect(config).toMatchObject({
        allowedDomains: ["*.preview.example.com", "example.com"],
        crossDomain: true,
        limitToDomains: false,
      });
      const loader = await harness.behavior.fetchHttp(
        "GET",
        `${CRM_TRACKING_LOADER_PATH}?siteKey=${site.siteKey}`,
      );
      const loaderSource = await loader.text();

      class HTMLScriptElement {}
      const listeners = new Map<string, (event: { target: unknown }) => void>();
      const script = Object.assign(new HTMLScriptElement(), {
        src: `https://127.0.0.1:38886${CRM_TRACKING_LOADER_PATH}?siteKey=${site.siteKey}`,
        dataset: { siteKey: site.siteKey, token: "loader-test-token" },
      });
      let cookie = "";
      const document = {
        currentScript: script,
        referrer: "",
        addEventListener: (type: string, listener: (event: { target: unknown }) => void) => {
          listeners.set(type, listener);
        },
        get cookie() {
          return cookie;
        },
        set cookie(value: string) {
          const pair = value.split(";", 1)[0] ?? "";
          const name = pair.split("=", 1)[0] ?? "";
          cookie = cookie
            .split("; ")
            .filter((existing) => !existing.startsWith(`${name}=`))
            .concat(pair)
            .filter(Boolean)
            .join("; ");
        },
      };
      const location = {
        hostname: "example.com",
        pathname: "/pricing",
        origin: "https://example.com",
        protocol: "https:",
        search: "",
        hash: "",
        href: "https://example.com/pricing",
      };
      const fetchMock = async (url: string) => {
        if (url.includes("/config")) return { ok: true, json: async () => config };
        return { ok: true, json: async () => ({ ok: true }) };
      };
      const context = {
        HTMLScriptElement,
        document,
        window: {
          location,
          crypto: { randomUUID: () => "visitor-12345678" },
          doNotTrack: "0",
        },
        navigator: { doNotTrack: "0", globalPrivacyControl: false },
        history: { replaceState: () => undefined },
        crypto: { randomUUID: () => "event-12345678" },
        fetch: fetchMock,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
      };
      runInNewContext(loaderSource, context);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const onMouseDown = listeners.get("mousedown");
      expect(onMouseDown).toBeDefined();
      const outside = { tagName: "A", href: "https://outside.invalid/pricing", parentElement: null };
      onMouseDown?.({ target: outside });
      expect(outside.href).toBe("https://outside.invalid/pricing");
      const configured = { tagName: "A", href: "https://docs.preview.example.com/pricing", parentElement: null };
      onMouseDown?.({ target: configured });
      expect(configured.href).toMatch(/^https:\/\/docs\.preview\.example\.com\/pricing#_crm=visitor12345678\.\d+$/u);
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("does not send sensitive UTM attribution through the public loader", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "crm-tracking-loader" });
    await plugin(bb);
    try {
      const site = await harness.behavior.callRpc("tracking_sites_create", {
        id: "site-loader",
        siteKey: "site_loader",
        name: "Loader test site",
        allowedDomains: ["example.com"],
      }) as { id: string; siteKey: string };
      const token = await harness.behavior.callRpc("tracking_tokens_provision", {
        siteId: site.id,
        scope: "TRACKING",
      }) as { token: string };
      const loader = await harness.behavior.fetchHttp(
        "GET",
        CRM_TRACKING_LOADER_PATH + "?siteKey=" + site.siteKey,
      );
      expect(loader.status).toBe(200);
      const loaderSource = await loader.text();

      const requests: Array<{ url: string; init?: { body?: unknown } }> = [];
      let cookie = "";
      class TestScriptElement {}
      const script = Object.assign(new TestScriptElement(), {
        src: "https://bb.example/plugins/crm/tracking/loader.js?siteKey=" + site.siteKey,
        dataset: { siteKey: site.siteKey, token: token.token },
      });
      const document = {
        currentScript: script,
        referrer: "",
        addEventListener() {},
        get cookie() {
          return cookie;
        },
        set cookie(value: string) {
          cookie = cookie ? cookie + "; " + value.split(";")[0] : value;
        },
      };
      const window = {
        location: {
          pathname: "/pricing",
          hostname: "example.com",
          protocol: "https:",
          origin: "https://example.com",
          search: "?utm_source=person%40example.com&utm_medium=4111%201111%201111%201111",
          hash: "",
          href: "https://example.com/pricing?utm_source=person%40example.com&utm_medium=4111%201111%201111%201111",
        },
        crypto: undefined,
        doNotTrack: undefined,
      };
      const fetch = (input: unknown, init?: { body?: unknown }) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes("/config")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              siteKey: site.siteKey,
              allowedDomains: ["example.com"],
              crossDomain: false,
              limitToDomains: true,
              cookieSubdomains: false,
              secureCookies: true,
              honourDnt: false,
              cookieDays: 0,
              paused: false,
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      };

      runInNewContext(loaderSource, {
        document,
        HTMLScriptElement: TestScriptElement,
        URL,
        URLSearchParams,
        window,
        navigator: {},
        history: { replaceState() {} },
        fetch,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const collector = requests.find(({ url }) => url.includes("/collect"));
      expect(collector).toBeDefined();
      const body = JSON.parse(String(collector?.init?.body)) as {
        source: string | null;
        medium: string | null;
      };
      expect(body.source).toBeNull();
      expect(body.medium).toBeNull();
      expect(cookie).not.toContain("person%40example.com");
      expect(cookie).not.toContain("4111");
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
