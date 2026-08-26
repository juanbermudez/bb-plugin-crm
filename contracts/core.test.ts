import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  CURRENCY_CODES,
  DEAL_STAGES,
  FIELD_TYPES,
  activityCreateInputSchema,
  activityEntrySchema,
  companyCreateInputSchema,
  companyListInputSchema,
  companySchema,
  contactBriefCreateInputSchema,
  contactFactCreateInputSchema,
  contactFactRecordSchema,
  contactWorkHistoryCreateInputSchema,
  currencyCodeSchema,
  dealCreateInputSchema,
  dealSchema,
  fieldDefinitionCreateInputSchema,
  fieldDefinitionSchema,
  fieldValueSchema,
  frozenMoneySchema,
  listInputSchema,
  moneySchema,
  savedViewCreateInputSchema,
} from "./core.js";

describe("CRM core contracts", () => {
  it("keeps the source canonical enums", () => {
    expect(DEAL_STAGES).toEqual([
      "DEMO_BOOKED",
      "QUALIFIED_TO_BUY",
      "UNQUALIFIED_TO_BUY",
      "DECISION_MAKER_BOUGHT_IN",
      "CONTRACT_SENT",
      "CLOSED_WON",
      "CLOSED_LOST",
    ]);
    expect(ACTIVITY_TYPES).toContain("STAGE_CHANGE");
    expect(FIELD_TYPES).toContain("USER");
    expect(CURRENCY_CODES).toHaveLength(11);
    expect(currencyCodeSchema.parse("USD")).toBe("USD");
    expect(currencyCodeSchema.safeParse("usd").success).toBe(false);
  });

  it("uses defaults for the flattened list query", () => {
    expect(listInputSchema.parse({})).toEqual({
      q: "",
      sort: "",
      dir: "asc",
      page: 1,
      pageSize: 25,
    });
    expect(companyListInputSchema.parse({})).toMatchObject({
      q: "",
      sort: "",
      dir: "asc",
      page: 1,
      pageSize: 25,
      owner: [],
      fields: {},
      archived: false,
    });
  });

  it("rejects unknown object keys at every boundary", () => {
    expect(
      companyCreateInputSchema.safeParse({ name: "Acme", extra: true })
        .success,
    ).toBe(false);
    expect(
      companySchema.safeParse({ id: "co_1", name: "Acme", extra: true })
        .success,
    ).toBe(false);
    expect(
      fieldDefinitionSchema.safeParse({
        id: "field_1",
        entity: "COMPANY",
        key: "segment",
        label: "Segment",
        type: "SELECT",
        agentFilled: true,
        agentBrief: null,
        required: false,
        showOnSheet: true,
        showOnTable: true,
        showOnFilter: true,
        position: 0,
        options: [],
        extra: "nope",
      }).success,
    ).toBe(false);
  });

  it("keeps all wire values RPC-safe", () => {
    expect(fieldValueSchema.safeParse(new Date()).success).toBe(false);
    expect(fieldValueSchema.safeParse(1n).success).toBe(false);
    expect(fieldValueSchema.safeParse(Number.NaN).success).toBe(false);
    expect(fieldValueSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(
      false,
    );
    expect(moneySchema.safeParse({ amountCents: 1250, currency: "USD" }).success).toBe(
      true,
    );
    expect(
      moneySchema.safeParse({ amountCents: 12.5, currency: "USD" }).success,
    ).toBe(false);
    expect(
      frozenMoneySchema.safeParse({
        amountCents: 1250,
        currency: "USD",
        baseAmountCents: 1150,
        baseCurrency: "USD",
        fxRate: 1,
        fxRateAt: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("validates create/update domain invariants", () => {
    expect(
      companyCreateInputSchema.safeParse({ name: "  Acme  " }).success,
    ).toBe(true);
    expect(
      dealCreateInputSchema.safeParse({
        name: "Renewal",
        companyId: "co_1",
        ownerId: "user_1",
        stage: "QUALIFIED_TO_BUY",
        amountCents: 500_00,
        currency: "USD",
        expectedCloseDate: "2026-06-30",
      }).success,
    ).toBe(true);
    expect(
      dealCreateInputSchema.safeParse({
        name: "Renewal",
        companyId: "co_1",
        ownerId: "user_1",
        amountCents: -1,
        currency: "USD",
      }).success,
    ).toBe(false);
  });

  it("requires an activity anchor and task subject", () => {
    expect(
      activityCreateInputSchema.safeParse({ type: "NOTE", body: "hello" })
        .success,
    ).toBe(false);
    expect(
      activityCreateInputSchema.safeParse({
        type: "TASK",
        companyId: "co_1",
      }).success,
    ).toBe(false);
    expect(
      activityCreateInputSchema.safeParse({
        type: "NOTE",
        companyId: "co_1",
        createdById: "local_user",
        body: "hello",
      }).success,
    ).toBe(true);
  });

  it("models dynamic fields, saved views, and full activity output", () => {
    expect(
      fieldDefinitionCreateInputSchema.parse({
        entity: "COMPANY",
        label: "Segment",
        type: "SELECT",
      }),
    ).toMatchObject({
      options: [],
      agentFilled: true,
      required: false,
      showOnSheet: true,
    });
    expect(
      savedViewCreateInputSchema.parse({
        entity: "DEAL",
        name: "Open renewals",
        filters: {},
      }).filters,
    ).toMatchObject({ q: "", dir: "asc", archived: false, filters: {} });
    expect(
      activityEntrySchema.safeParse({
        id: "activity_1",
        type: "NOTE",
        subject: null,
        body: "hello",
        occurredAt: null,
        dueAt: null,
        completedAt: null,
        meta: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: {
          id: "user_1",
          name: "Ada",
          email: "ada@example.com",
          image: null,
        },
        company: { id: "co_1", name: "Acme" },
        contact: null,
        deal: null,
        emailThread: null,
        calendarEvent: null,
      }).success,
    ).toBe(true);
  });

  it("keeps evidence-backed contact inputs strict and source-valid", () => {
    const evidence = {
      kind: "linkedin.employer-and-name",
      detail: "Profile names the person and employer.",
      sourceUrl: "https://www.linkedin.com/in/ada",
    };
    expect(
      contactFactCreateInputSchema.safeParse({
        contactId: "con_1",
        field: "title",
        value: "Principal Engineer",
        score: 0.85,
        band: "VERIFIED",
        evidence: [evidence],
        method: "linkedin",
        sourceUrl: evidence.sourceUrl,
      }).success,
    ).toBe(true);
    expect(
      contactFactCreateInputSchema.safeParse({
        contactId: "con_1",
        field: "title",
        value: "Principal Engineer",
        score: 1.1,
        band: "VERIFIED",
        evidence: [evidence],
        method: "linkedin",
      }).success,
    ).toBe(false);
    expect(
      contactFactCreateInputSchema.safeParse({
        contactId: "con_1",
        field: "title",
        value: "Principal Engineer",
        score: 0.85,
        band: "CERTAIN",
        evidence: [evidence],
        method: "linkedin",
      }).success,
    ).toBe(false);
    expect(
      contactFactCreateInputSchema.safeParse({
        contactId: "con_1",
        field: "title",
        value: "Principal Engineer",
        score: 0.85,
        band: "VERIFIED",
        evidence: [{ ...evidence, sourceUrl: "not-a-url" }],
        method: "linkedin",
      }).success,
    ).toBe(false);
    expect(
      contactFactCreateInputSchema.safeParse({
        contactId: "con_1",
        field: "title",
        value: "Principal Engineer",
        score: 0.85,
        band: "VERIFIED",
        evidence: [evidence],
        method: "linkedin",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      contactBriefCreateInputSchema.safeParse({
        contactId: "con_1",
        narrative: "A useful background.",
        sections: { currentRole: "Principal Engineer" },
        score: 0.8,
        sourceUrl: "https://example.com/profile",
      }).success,
    ).toBe(true);
    expect(
      contactWorkHistoryCreateInputSchema.safeParse({
        contactId: "con_1",
        organizationName: "Example Labs",
        startDate: "2024-01-01",
        score: 0.8,
        band: "PROBABLE",
        evidence: [evidence],
        method: "profile",
      }).success,
    ).toBe(true);
    expect(
      contactWorkHistoryCreateInputSchema.safeParse({
        contactId: "con_1",
        organizationName: "Example Labs",
        startDate: "01/01/2024",
        score: 0.8,
        band: "PROBABLE",
        evidence: [evidence],
        method: "profile",
      }).success,
    ).toBe(false);
    expect(
      contactFactRecordSchema.safeParse({
        id: "fact_1",
        contactId: "con_1",
        field: "title",
        value: "Principal Engineer",
        score: 0.8,
        band: "VERIFIED",
        evidence: [{ ...evidence, sourceUrl: evidence.sourceUrl }],
        method: "profile",
        sourceUrl: evidence.sourceUrl,
        sessionId: null,
        status: "PROPOSED",
        decidedById: null,
        decidedAt: null,
        observedAt: "2026-08-25T00:00:00.000Z",
        supersededAt: null,
        supersedesId: null,
        supersededById: null,
        createdAt: "2026-08-25T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
