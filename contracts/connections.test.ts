import { describe, expect, it } from "vitest";
import {
  connectionConfigurationSchema,
  connectionUpsertInputSchema,
  trackingEventBatchInputSchema,
  trackingEventInputSchema,
  trackingSiteCreateInputSchema,
  trackingTokenProvisionInputSchema,
} from "./connections.js";

describe("connections and tracking wire contracts", () => {
  it("rejects unknown keys and secret-shaped connection metadata", () => {
    expect(connectionUpsertInputSchema.safeParse({
      provider: "GOOGLE",
      configuration: { accountEmail: "ops@example.com" },
    }).success).toBe(true);
    expect(connectionUpsertInputSchema.safeParse({
      provider: "GOOGLE",
      unexpected: true,
    }).success).toBe(false);
    expect(connectionConfigurationSchema.safeParse({ access_token: "secret" }).success).toBe(false);
    expect(connectionConfigurationSchema.safeParse({ nested: { refreshToken: "secret" } }).success).toBe(false);
    expect(connectionConfigurationSchema.safeParse({ accountEmail: new Date() }).success).toBe(false);
  });

  it("bounds and validates site domains, retention, and token scope semantics", () => {
    expect(trackingSiteCreateInputSchema.safeParse({
      name: "Marketing",
      domains: ["https://www.example.com"],
      eventRetentionDays: 30,
      aggregateRetentionDays: 365,
    }).success).toBe(true);
    expect(trackingSiteCreateInputSchema.safeParse({
      name: "Marketing",
      allowedDomains: ["example.com/path"],
    }).success).toBe(false);
    expect(trackingSiteCreateInputSchema.safeParse({
      name: "Marketing",
      allowedDomains: ["example.com"],
      unknown: true,
    }).success).toBe(false);
    expect(trackingTokenProvisionInputSchema.safeParse({
      scope: "TRACKING",
      siteId: "site_1",
    }).success).toBe(true);
    expect(trackingTokenProvisionInputSchema.safeParse({
      scope: "INTAKE",
      siteId: "site_1",
    }).success).toBe(false);
  });

  it("rejects unsafe collector payloads while accepting browser aliases", () => {
    const event = {
      siteKey: "trk_site_1",
      token: "crm_trk_test-token-123456",
      type: "page_view",
      origin: "https://www.example.com/",
      pageUrl: "https://www.example.com/pricing",
      visitorId: "visitor-1",
      properties: { plan: "pro", converted: true },
    };
    expect(trackingEventInputSchema.safeParse(event).success).toBe(true);
    expect(trackingEventInputSchema.safeParse({ ...event, properties: { email: "ada@example.com" } }).success).toBe(false);
    expect(trackingEventInputSchema.safeParse({ ...event, pageUrl: "https://www.example.com/pricing?email=ada@example.com" }).success).toBe(false);
    expect(trackingEventInputSchema.safeParse({ ...event, unknown: 1 }).success).toBe(false);
    expect(trackingEventBatchInputSchema.safeParse({ events: [event] }).success).toBe(true);
    expect(trackingEventBatchInputSchema.safeParse({ events: [] }).success).toBe(false);
    expect(trackingEventBatchInputSchema.safeParse({ events: [event], extra: true }).success).toBe(false);
  });
});
