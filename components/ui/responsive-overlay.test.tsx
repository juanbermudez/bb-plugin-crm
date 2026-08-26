// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CompactViewportOverrideProvider } from "./hooks/use-compact-viewport.js";
import { PersistentResponsiveDrawerShell } from "./responsive-overlay.js";

afterEach(() => {
  cleanup();
});

function renderCompactDrawer() {
  return render(
    <CompactViewportOverrideProvider isCompactViewport>
      <PersistentResponsiveDrawerShell
        open
        onOpenChange={() => {}}
        srLabel="Compact test drawer"
      >
        <button type="button">First control</button>
        <button type="button">Last control</button>
      </PersistentResponsiveDrawerShell>
    </CompactViewportOverrideProvider>,
  );
}

describe("PersistentResponsiveDrawerShell keyboard focus", () => {
  it("keeps forward Tab inside the drawer when focus has fallen to body", () => {
    renderCompactDrawer();
    const first = screen.getByRole("button", { name: "First control" });

    document.body.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    });
    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("leaves focus events in another portaled overlay to that overlay", () => {
    renderCompactDrawer();
    const externalOverlay = document.createElement("button");
    externalOverlay.type = "button";
    externalOverlay.textContent = "External overlay control";
    externalOverlay.setAttribute("data-bb-portaled-overlay", "");
    document.body.append(externalOverlay);
    externalOverlay.focus();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    });
    externalOverlay.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(externalOverlay);
    externalOverlay.remove();
  });
});
