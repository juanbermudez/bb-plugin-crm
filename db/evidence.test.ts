import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { initializeSchema } from "./schema.js";
import { createContact, getContact, purgeContact } from "./contacts.js";
import {
  createContactBrief,
  createContactFact,
  createContactWorkHistory,
  decideContactFact,
  decideContactWorkHistory,
  getContactBriefVersion,
  getContactFact,
  getContactWorkHistory,
  getLatestContactBrief,
  listContactBriefVersions,
  listContactFacts,
  listContactWorkHistory,
  supersedeContactFact,
  supersedeContactWorkHistory,
} from "./evidence.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-evidence-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

const evidence = [
  {
    kind: "linkedin.employer-and-name" as const,
    detail: "The profile names the person and their current employer.",
    sourceUrl: "https://www.linkedin.com/in/ada",
  },
];

describe("CRM contact evidence storage", () => {
  it("stores, lists, decides, and supersedes evidence-backed facts", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const contact = createContact(db, {
        id: "con_evidence",
        firstName: "Ada",
        lastName: "Lovelace",
      });
      const applied = createContactFact(db, {
        id: "fact_title_1",
        contactId: contact.id,
        field: "title",
        value: "Principal Engineer",
        score: 0.01,
        band: "POSSIBLE",
        evidence,
        method: "linkedin",
        sourceUrl: evidence[0].sourceUrl,
        observedAt: "2026-08-20T12:00:00.000Z",
      });
      expect(applied.status).toBe("APPLIED");
      expect(applied.score).toBe(0.85);
      expect(applied.band).toBe("VERIFIED");
      expect(applied.evidence[0]?.sourceUrl).toBe(evidence[0].sourceUrl);
      expect(listContactFacts(db, contact.id, { field: "title" })).toHaveLength(1);
      expect(getContact(db, contact.id)?.title).toBe("Principal Engineer");

      const replacement = createContactFact(db, {
        id: "fact_title_2",
        contactId: contact.id,
        field: "title",
        value: "VP Engineering",
        score: 0.95,
        band: "VERIFIED",
        evidence,
        method: "linkedin-refresh",
      });
      expect(replacement.status).toBe("APPLIED");
      expect(getContactFact(db, applied.id)?.status).toBe("SUPERSEDED");
      expect(getContactFact(db, applied.id)?.supersededById).toBe(replacement.id);
      expect(getContact(db, contact.id)?.title).toBe("VP Engineering");
      expect(listContactFacts(db, contact.id, { includeSuperseded: false })).toHaveLength(1);

      createContactFact(db, {
        contactId: contact.id,
        field: "employer",
        value: "Evidence Systems",
        evidence,
        method: "profile",
      });
      const secondaryEvidence = [{
        kind: "web.cited-claim" as const,
        detail: "A cited biography makes the claim.",
        sourceUrl: "https://example.com/ada",
      }];
      const dismissed = createContactFact(db, {
        id: "fact_location_1",
        contactId: contact.id,
        field: "employer",
        value: "Difference Machines",
        evidence: secondaryEvidence,
        method: "profile",
      });
      expect(dismissed.status).toBe("PROPOSED");
      expect(decideContactFact(db, dismissed.id, "dismiss", "bb-user-2").status).toBe("DISMISSED");
      expect(() => decideContactFact(db, dismissed.id, "accept", "bb-user-2")).toThrow(/already been settled/);

      const oldEmployer = createContactFact(db, {
        id: "fact_employer_1",
        contactId: contact.id,
        field: "employer",
        value: "Example Labs",
        score: 0.7,
        band: "PROBABLE",
        evidence: secondaryEvidence,
        method: "profile",
      });
      const newEmployer = createContactFact(db, {
        id: "fact_employer_2",
        contactId: contact.id,
        field: "employer",
        value: "Analytical Engines",
        score: 0.85,
        band: "VERIFIED",
        evidence: secondaryEvidence,
        method: "profile-refresh",
      });
      const superseded = supersedeContactFact(db, oldEmployer.id, newEmployer.id);
      expect(superseded.status).toBe("SUPERSEDED");
      expect(superseded.supersededById).toBe(newEmployer.id);
      expect(getContactFact(db, newEmployer.id)?.supersedesId).toBe(oldEmployer.id);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("derives confidence from evidence and protects human-entered fields", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const contact = createContact(db, {
        id: "con_policy",
        firstName: "Grace",
        lastName: "Hopper",
        title: "Rear Admiral",
      });
      expect(() => createContactFact(db, {
        contactId: contact.id,
        field: "title",
        value: "Compiler Pioneer",
        evidence,
        method: "linkedin",
      })).toThrow(/person already filled in title/i);
      expect(() => createContactFact(db, {
        contactId: contact.id,
        field: "location",
        value: "Arlington",
        evidence: [{ kind: "employer-only", detail: "Only the employer matched." }],
        method: "weak-search",
      })).toThrow(/below the floor/i);
      const contradicted = createContactFact(db, {
        contactId: contact.id,
        field: "location",
        value: "Arlington",
        evidence: [
          ...evidence,
          { kind: "contradiction", detail: "A second source lists New York." },
        ],
        method: "profile-check",
      });
      expect(contradicted).toMatchObject({ score: 0.45, band: "POSSIBLE", status: "APPLIED" });
    } finally {
      await lifecycle.dispose();
    }
  });

  it("keeps immutable brief versions and evidence-backed work history", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const contact = createContact(db, {
        id: "con_brief",
        firstName: "Grace",
        lastName: "Hopper",
      });
      const first = createContactBrief(db, {
        contactId: contact.id,
        narrative: "Grace Hopper is a computing pioneer and naval officer.",
        sections: {
          currentRole: "Rear Admiral · US Navy",
          previousRoles: ["Professor · Vassar College"],
        },
        score: 0.85,
        sourceUrl: "https://example.com/grace-1",
      });
      const second = createContactBrief(db, {
        contactId: contact.id,
        narrative: "Grace Hopper led compiler work for the US Navy.",
        sections: { currentRole: "Rear Admiral · US Navy" },
        score: 0.95,
        sourceUrl: "https://example.com/grace-2",
      });
      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
      expect(getLatestContactBrief(db, contact.id)?.id).toBe(second.id);
      expect(getContactBriefVersion(db, contact.id, 1)?.narrative).toContain("pioneer");
      expect(listContactBriefVersions(db, contact.id).map((brief) => brief.version)).toEqual([2, 1]);
      expect(() => createContactBrief(db, {
        contactId: contact.id,
        narrative: "Invalid extra section.",
        sections: { unexpected: "no" } as never,
        score: 0.5,
      })).toThrow(/Unknown brief section/);

      const originalRole = createContactWorkHistory(db, {
        id: "work_1",
        contactId: contact.id,
        title: "Professor",
        organizationName: "Vassar College",
        organizationDomain: "https://www.vassar.edu",
        startDate: "1931-01-01",
        endDate: "1943-01-01",
        isCurrent: false,
        score: 0.7,
        band: "PROBABLE",
        evidence,
        method: "profile",
      });
      expect(decideContactWorkHistory(db, originalRole.id, "accept", "bb-user-1").status).toBe("APPLIED");
      const currentRole = createContactWorkHistory(db, {
        id: "work_2",
        contactId: contact.id,
        title: "Rear Admiral",
        organizationName: "US Navy",
        startDate: "1966-01-01",
        isCurrent: true,
        score: 0.95,
        band: "VERIFIED",
        evidence,
        method: "profile-refresh",
      });
      expect(supersedeContactWorkHistory(db, originalRole.id, currentRole.id).supersededById).toBe(currentRole.id);
      expect(getContactWorkHistory(db, currentRole.id)?.supersedesId).toBe(originalRole.id);
      expect(listContactWorkHistory(db, contact.id, { includeSuperseded: false })).toHaveLength(1);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("cascades evidence, briefs, and work history with contact deletion", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const contact = createContact(db, { id: "con_cascade", firstName: "Katherine" });
      createContactFact(db, {
        contactId: contact.id,
        field: "title",
        value: "Mathematician",
        score: 0.85,
        band: "VERIFIED",
        evidence,
        method: "profile",
      });
      createContactBrief(db, {
        contactId: contact.id,
        narrative: "Katherine worked on orbital calculations.",
        sections: {},
        score: 0.85,
      });
      createContactWorkHistory(db, {
        contactId: contact.id,
        title: "Mathematician",
        score: 0.85,
        band: "VERIFIED",
        evidence,
        method: "profile",
      });
      purgeContact(db, contact.id);
      expect(db.prepare("SELECT COUNT(*) AS count FROM contact_facts").pluck().get()).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM contact_briefs").pluck().get()).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM contact_work_history").pluck().get()).toBe(0);
    } finally {
      await lifecycle.dispose();
    }
  });
});
