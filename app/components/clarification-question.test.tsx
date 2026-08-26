// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginPendingInteractionProps } from "@get-bb/plugin-sdk/app";

import { ClarificationQuestion } from "./clarification-question.js";

afterEach(() => cleanup());

function interaction(payload: unknown): PluginPendingInteractionProps["interaction"] {
  return {
    id: "interaction-1",
    threadId: "thread-1",
    title: "CRM clarification",
    payload: payload as PluginPendingInteractionProps["interaction"]["payload"],
    createdAt: Date.now(),
    expiresAt: null,
  };
}

describe("ClarificationQuestion", () => {
  it("submits the selected inspected option with the request id", async () => {
    const submit = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);

    render(
      <ClarificationQuestion
        interaction={interaction({
          kind: "question",
          requestId: "request-1",
          prompt: "Which account should receive this activity?",
          display: "select",
          options: [
            { id: "account-a", label: "Account A", description: "Primary account." },
            { id: "account-b", label: "Account B", description: "Secondary account." },
          ],
          allowFreeform: false,
        })}
        submit={submit}
        cancel={cancel}
      />,
    );

    expect((screen.getByRole("button", { name: "Submit answer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Account B/iu }));
    expect(screen.getByRole("button", { name: /Account B/iu }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      requestId: "request-1",
      optionId: "account-b",
    }));
    expect(cancel).not.toHaveBeenCalled();
  });

  it("allows a freeform answer when the question has no options", async () => {
    const submit = vi.fn(async () => undefined);

    render(
      <ClarificationQuestion
        interaction={interaction({
          kind: "question",
          requestId: "request-2",
          prompt: "What should the follow-up note say?",
          display: "text",
          options: [],
          allowFreeform: true,
        })}
        submit={submit}
        cancel={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
      target: { value: "Mention the renewal date." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      requestId: "request-2",
      text: "Mention the renewal date.",
    }));
  });
});
