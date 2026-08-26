// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WORKSPACE_CHECKLIST_STORAGE_KEY,
  WorkspaceChecklist,
  readWorkspaceChecklistState,
} from "./workspace-checklist.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("workspace onboarding checklist", () => {
  it("tracks completion, navigation, and a persisted dismissal", () => {
    const onNavigate = vi.fn();
    const onDismiss = vi.fn();
    render(<WorkspaceChecklist onNavigate={onNavigate} onDismiss={onDismiss} />);

    expect(screen.getByRole("heading", { name: "Set up your CRM workspace" })).toBeDefined();
    expect(screen.getByText("0 of 4 complete")).toBeDefined();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Mark Add your first company complete" }),
    );
    expect(screen.getByText("1 of 4 complete")).toBeDefined();
    expect(readWorkspaceChecklistState()).toEqual({
      completed: ["company"],
      dismissed: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /Review workspace settings/ }));
    expect(onNavigate).toHaveBeenCalledWith("settings");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_CHECKLIST_STORAGE_KEY) ?? "{}"))
      .toEqual({ completed: ["company"], dismissed: true });
  });
});
