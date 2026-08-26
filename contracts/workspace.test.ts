import { describe, expect, it } from "vitest";

import {
  workspaceIdentitySchema,
  workspaceIdentityUpdateInputSchema,
} from "./workspace.js";

describe("workspace identity contracts", () => {
  it("bounds the persistent profile and keeps URLs explicit", () => {
    expect(workspaceIdentityUpdateInputSchema.safeParse({
      website: "acme.example",
      narrative: "Acme sells compliance automation to growing software companies.",
    }).success).toBe(true);
    expect(workspaceIdentityUpdateInputSchema.safeParse({
      website: "acme.example",
      narrative: "Too short",
    }).success).toBe(false);
    expect(workspaceIdentityUpdateInputSchema.safeParse({
      website: "acme.example",
      narrative: "",
    }).success).toBe(true);
    expect(workspaceIdentitySchema.safeParse({
      workspaceName: "Acme CRM",
      website: "https://acme.example",
      profile: null,
    }).success).toBe(true);
  });
});
