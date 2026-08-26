// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Contact } from "../../contracts/core.js";
import { ContactEvidence, type ContactEvidenceRpcClient } from "./contact-evidence.js";

afterEach(() => cleanup());

const contact: Contact = {
  id: "contact_1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  fields: {},
};

const fact = {
  id: "fact_1",
  contactId: contact.id,
  field: "title",
  value: "VP Engineering",
  score: 0.9,
  band: "HIGH",
  evidence: [{ kind: "WEB", detail: "Company leadership page", sourceUrl: "https://example.com/ada" }],
  method: "research",
  sourceUrl: "https://example.com/ada",
  sessionId: null,
  status: "PROPOSED",
  decidedById: null,
  decidedAt: null,
  observedAt: "2026-08-25T10:00:00.000Z",
  supersededAt: null,
  supersedesId: null,
  supersededById: null,
  createdAt: "2026-08-25T10:00:00.000Z",
};

const brief = {
  id: "brief_1",
  contactId: contact.id,
  version: 1,
  narrative: "Engineering leader with an active buying role.",
  sections: { currentRole: "VP Engineering" },
  score: 0.8,
  sourceUrl: "https://example.com/ada",
  sessionId: null,
  refreshedAt: "2026-08-25T10:00:00.000Z",
  createdAt: "2026-08-25T10:00:00.000Z",
};

describe("ContactEvidence", () => {
  it("resolves a proposed fact and saves a sourced brief version", async () => {
    const call = vi.fn(async (method: string) => {
      if (method === "contacts_facts_list") return [fact];
      if (method === "contacts_workHistory_list") return [];
      if (method === "contacts_briefs_current") return brief;
      if (method === "contacts_facts_decide") return { ...fact, status: "APPLIED" };
      if (method === "contacts_briefs_create") return { ...brief, id: "brief_2", version: 2 };
      return [];
    });
    const rpc = { call } as unknown as ContactEvidenceRpcClient & { call: typeof call };

    render(<ContactEvidence contact={contact} rpc={rpc} />);
    expect(await screen.findByText("title: VP Engineering")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("contacts_facts_decide", { id: "fact_1", decision: "accept" }));

    fireEvent.click(screen.getByRole("button", { name: "Add brief version" }));
    fireEvent.change(screen.getByLabelText("Brief narrative"), { target: { value: "Updated research summary." } });
    fireEvent.click(screen.getByRole("button", { name: "Save brief version" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("contacts_briefs_create", expect.objectContaining({
      contactId: contact.id,
      narrative: "Updated research summary.",
      score: 0.5,
      sourceUrl: null,
    })));
  });
});
