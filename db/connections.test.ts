import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { initializeSchema } from "./schema.js";
import {
  createConnectionStore,
  createTrackingSite,
  disableConnection,
  getConnectionSyncCursor,
  hashTrackingToken,
  ingestTrackingEvent,
  listTrackingAggregates,
  listTrackingEvents,
  listTrackingTokens,
  markConnectionSyncFailure,
  markConnectionSyncSuccess,
  pauseTrackingSite,
  pruneTrackingData,
  rollupTrackingEvents,
  rotateTrackingSite,
  sanitizeTrackingEvent,
  verifyTrackingSite,
  type TrackingEventInput,
} from "./connections.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-connections-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("connection persistence", () => {
  it("upserts health and forward-only sync cursors, then disables safely", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = createConnectionStore(db);
      const created = store.upsert({
        provider: "google",
        externalAccountId: "acct-1",
        displayName: "Google Workspace",
        configuration: { accountEmail: "ops@example.com" },
        scopes: ["calendar.readonly", "gmail.readonly"],
      });
      expect(created.provider).toBe("GOOGLE");
      expect(created.health.status).toBe("DISCONNECTED");
      expect(created.configuration).toEqual({ accountEmail: "ops@example.com" });

      const connected = markConnectionSyncSuccess(db, created.id, {
        stream: "mail",
        cursor: "cursor-1",
        at: "2026-08-25T12:00:00.000Z",
      });
      expect(connected.health.status).toBe("CONNECTED");
      expect(connected.health.consecutiveFailures).toBe(0);
      expect(getConnectionSyncCursor(db, created.id, "mail")).toMatchObject({
        cursor: "cursor-1",
        lastSuccessAt: "2026-08-25T12:00:00.000Z",
      });

      const failed = markConnectionSyncFailure(db, created.id, {
        stream: "mail",
        errorCode: "RATE_LIMIT",
        errorMessage: "Bearer abc should not leak",
        at: "2026-08-25T12:01:00.000Z",
      });
      expect(failed.health.status).toBe("ERROR");
      expect(failed.health.consecutiveFailures).toBe(1);
      expect(failed.health.failureMessage).toBe("Bearer [redacted] should not leak");
      expect(getConnectionSyncCursor(db, created.id, "mail")?.cursor).toBe("cursor-1");

      const disabled = disableConnection(db, created.id, "2026-08-25T12:02:00.000Z");
      expect(disabled.enabled).toBe(false);
      expect(disabled.health.status).toBe("DISABLED");
      expect(() => markConnectionSyncSuccess(db, created.id, "mail", "cursor-2")).toThrow(
        "disabled connection",
      );
    } finally {
      await lifecycle.dispose();
    }
  });

  it("rejects secret-shaped connection configuration and persists no plaintext token", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = createConnectionStore(db);
      expect(() => store.upsert({
        provider: "slack",
        configuration: { access_token: "xoxb-secret" },
      })).toThrow("cannot contain secrets");

      const provisioned = createTrackingSite(db, {
        name: "Marketing site",
        allowedDomains: ["https://www.example.com"],
      });
      expect(provisioned.token).toMatch(/^crm_trk_/);
      expect(provisioned.site.allowedDomains).toEqual(["www.example.com"]);
      expect(hashTrackingToken(provisioned.token)).not.toBe(provisioned.token);
      const tokenRows = db.prepare("SELECT token_hash, token_hint FROM tracking_tokens").all() as Array<{ token_hash: string; token_hint: string }>;
      expect(tokenRows).toHaveLength(1);
      expect(tokenRows[0]?.token_hash).toBe(hashTrackingToken(provisioned.token));
      expect(JSON.stringify(tokenRows)).not.toContain(provisioned.token);
      expect(listTrackingTokens(db, provisioned.site.id)[0]).not.toHaveProperty("token");
    } finally {
      await lifecycle.dispose();
    }
  });
});

describe("tracking persistence", () => {
  it("sanitizes paths and rejects query strings, fragments, and sensitive properties", () => {
    const valid = sanitizeTrackingEvent({
      token: "crm_trk_test-token-123456",
      eventType: "page_view",
      origin: "https://example.com/",
      pageUrl: "https://example.com/pricing",
      visitorId: "visitor-1",
      properties: { utm_source: "newsletter", plan: "pro", converted: true },
      occurredAt: "2026-08-25T12:00:00.000Z",
    });
    expect(valid.eventType).toBe("PAGE_VIEW");
    expect(valid.path).toBe("/pricing");
    expect(valid.visitorHash).toHaveLength(64);
    expect(valid.properties).toEqual({ utm_source: "newsletter", plan: "pro", converted: true });

    expect(() => sanitizeTrackingEvent({
      token: "crm_trk_test-token-123456",
      eventType: "PAGE_VIEW",
      origin: "https://example.com",
      pageUrl: "https://example.com/pricing?email=ada@example.com#hero",
    })).toThrow("query string or fragment");
    expect(() => sanitizeTrackingEvent({
      token: "crm_trk_test-token-123456",
      eventType: "PAGE_VIEW",
      origin: "https://example.com",
      path: "/pricing#hero",
    })).toThrow("query string or fragment");
    expect(() => sanitizeTrackingEvent({
      token: "crm_trk_test-token-123456",
      eventType: "FORM_SUBMIT",
      origin: "https://example.com",
      path: "/signup",
      properties: { email: "ada@example.com" },
    })).toThrow("Sensitive tracking property");
    expect(() => sanitizeTrackingEvent({
      token: "crm_trk_test-token-123456",
      eventType: "FORM_SUBMIT",
      origin: "https://example.com",
      path: "/signup",
      properties: { nested: { safe: true } },
    })).toThrow("scalar JSON value");
  });

  it("enforces site token and allowed origin, and rotates/revokes the public site credential", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const provisioned = createTrackingSite(db, {
        name: "Marketing site",
        allowedDomains: ["example.com", "*.preview.example.com"],
      });
      const base: Omit<TrackingEventInput, "token"> = {
        siteId: provisioned.site.id,
        origin: "https://example.com",
        path: "/home",
        eventType: "PAGE_VIEW",
        visitorId: "visitor-1",
        occurredAt: "2026-08-25T12:00:00.000Z",
      };
      const event = ingestTrackingEvent(db, { ...base, token: provisioned.token });
      expect(event.path).toBe("/home");
      expect(event.visitorHash).not.toBe("visitor-1");
      expect(() => ingestTrackingEvent(db, { ...base, token: "crm_trk_wrong-token-123456" })).toThrow(
        "not authorized",
      );
      expect(() => ingestTrackingEvent(db, {
        ...base,
        token: provisioned.token,
        origin: "https://evil.example",
      })).toThrow("not allowed");
      expect(() => ingestTrackingEvent(db, {
        ...base,
        token: provisioned.token,
        path: "/home?utm_source=secret",
      })).toThrow("query string or fragment");

      pauseTrackingSite(db, provisioned.site.id, true, "2026-08-25T12:01:00.000Z");
      expect(() => ingestTrackingEvent(db, { ...base, token: provisioned.token })).toThrow("paused");
      pauseTrackingSite(db, provisioned.site.id, false, "2026-08-25T12:02:00.000Z");
      const rotated = rotateTrackingSite(db, provisioned.site.id, "2026-08-25T12:03:00.000Z");
      expect(rotated.siteKey).not.toBe(provisioned.site.siteKey);
      expect(() => ingestTrackingEvent(db, { ...base, token: provisioned.token })).toThrow("not authorized");
      const rotatedEvent = ingestTrackingEvent(db, {
        ...base,
        token: rotated.token,
        siteKey: rotated.siteKey,
        eventKey: "event-2",
        occurredAt: "2026-08-25T12:04:00.000Z",
      });
      expect(rotatedEvent.tokenId).toBe(rotated.tokenId);
      verifyTrackingSite(db, provisioned.site.id, { domain: "example.com", verifiedAt: "2026-08-25T12:05:00.000Z" });
    } finally {
      await lifecycle.dispose();
    }
  });

  it("rolls up bounded daily aggregates and prunes raw events by retention", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const provisioned = createTrackingSite(db, {
        name: "Short retention site",
        allowedDomains: ["example.com"],
        eventRetentionDays: 1,
        aggregateRetentionDays: 30,
      });
      const event = (id: string, occurredAt: string, visitorId: string): TrackingEventInput => ({
        id,
        siteId: provisioned.site.id,
        token: provisioned.token,
        origin: "https://example.com",
        path: "/pricing",
        eventType: "PAGE_VIEW",
        visitorId,
        eventKey: id,
        occurredAt,
        receivedAt: occurredAt,
        source: "newsletter",
      });
      ingestTrackingEvent(db, event("old", "2026-08-20T12:00:00.000Z", "visitor-1"));
      ingestTrackingEvent(db, event("new", "2026-08-25T12:00:00.000Z", "visitor-1"));
      ingestTrackingEvent(db, event("newer", "2026-08-25T13:00:00.000Z", "visitor-2"));

      expect(rollupTrackingEvents(db, { siteId: provisioned.site.id, now: "2026-08-25T14:00:00.000Z" })).toEqual({
        aggregateCount: 2,
        eventCount: 3,
      });
      expect(rollupTrackingEvents(db, { siteId: provisioned.site.id, now: "2026-08-25T14:01:00.000Z" })).toEqual({
        aggregateCount: 2,
        eventCount: 3,
      });
      expect(listTrackingAggregates(db, { siteId: provisioned.site.id })).toEqual(expect.arrayContaining([
        expect.objectContaining({ day: "2026-08-20", eventCount: 1, uniqueVisitors: 1, source: "newsletter" }),
        expect.objectContaining({ day: "2026-08-25", eventCount: 2, uniqueVisitors: 2, source: "newsletter" }),
      ]));

      const pruned = pruneTrackingData(db, {
        siteId: provisioned.site.id,
        now: "2026-08-25T14:00:00.000Z",
        batchSize: 1,
      });
      expect(pruned.eventsDeleted).toBe(1);
      expect(pruned.aggregatesDeleted).toBe(0);
      expect(listTrackingEvents(db, { siteId: provisioned.site.id })).toHaveLength(2);
      expect(listTrackingAggregates(db, { siteId: provisioned.site.id })).toHaveLength(2);
      expect(db.prepare("SELECT last_pruned_at FROM tracking_retention WHERE site_id = ?").get(provisioned.site.id)).toEqual({
        last_pruned_at: "2026-08-25T14:00:00.000Z",
      });
    } finally {
      await lifecycle.dispose();
    }
  });
});
