import { useState } from "react";

import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import type { CrmRouteKind } from "../routes.js";

export const WORKSPACE_CHECKLIST_STORAGE_KEY = "crm:workspace-checklist:v1";

export interface WorkspaceChecklistItem {
  id: string;
  label: string;
  description: string;
  route: CrmRouteKind;
}

export const WORKSPACE_CHECKLIST_ITEMS: readonly WorkspaceChecklistItem[] = [
  {
    id: "workspace",
    label: "Review workspace settings",
    description: "Choose a workspace name and reporting currency.",
    route: "settings",
  },
  {
    id: "company",
    label: "Add your first company",
    description: "Create the organization at the center of your sales work.",
    route: "companies",
  },
  {
    id: "contact",
    label: "Add a contact",
    description: "Keep the people and relationships beside the company.",
    route: "contacts",
  },
  {
    id: "deal",
    label: "Create an open deal",
    description: "Start tracking a pipeline opportunity and close date.",
    route: "deals",
  },
];

interface StoredChecklistState {
  completed?: unknown;
  dismissed?: unknown;
}

export function readWorkspaceChecklistState(): {
  completed: string[];
  dismissed: boolean;
} {
  if (typeof window === "undefined" || window.localStorage === undefined) {
    return { completed: [], dismissed: false };
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CHECKLIST_STORAGE_KEY);
    if (raw === null) return { completed: [], dismissed: false };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { completed: [], dismissed: false };
    }
    const value = parsed as StoredChecklistState;
    return {
      completed: Array.isArray(value.completed)
        ? value.completed.filter((id): id is string => typeof id === "string")
        : [],
      dismissed: value.dismissed === true,
    };
  } catch {
    return { completed: [], dismissed: false };
  }
}

function persistChecklistState(completed: readonly string[], dismissed: boolean): void {
  if (typeof window === "undefined" || window.localStorage === undefined) return;
  try {
    window.localStorage.setItem(
      WORKSPACE_CHECKLIST_STORAGE_KEY,
      JSON.stringify({ completed: [...completed], dismissed }),
    );
  } catch {
    // The checklist remains usable if browser storage is unavailable.
  }
}

export function dismissWorkspaceChecklist(): void {
  const state = readWorkspaceChecklistState();
  persistChecklistState(state.completed, true);
}

export interface WorkspaceChecklistProps {
  onNavigate: (kind: CrmRouteKind) => void;
  onDismiss: () => void;
}

/** First-open orientation for a new installation, kept light and dismissible. */
export function WorkspaceChecklist({ onNavigate, onDismiss }: WorkspaceChecklistProps) {
  const initial = readWorkspaceChecklistState();
  const [completed, setCompleted] = useState<string[]>(initial.completed);
  const completedSet = new Set(completed);
  const progress = WORKSPACE_CHECKLIST_ITEMS.filter((item) => completedSet.has(item.id)).length;

  const toggle = (id: string) => {
    setCompleted((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      persistChecklistState(next, false);
      return next;
    });
  };

  const handleDismiss = () => {
    dismissWorkspaceChecklist();
    onDismiss();
  };

  return (
    <section
      className="mx-4 mt-4 shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:mx-5 sm:p-5"
      aria-labelledby="workspace-checklist-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon name="Check" aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="workspace-checklist-title" className="text-sm font-semibold">
              Set up your CRM workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A short checklist to get your first records and pipeline ready.
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleDismiss}>
          Dismiss
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{progress} of {WORKSPACE_CHECKLIST_ITEMS.length} complete</span>
        <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-foreground transition-[width]"
            style={{ width: `${(progress / WORKSPACE_CHECKLIST_ITEMS.length) * 100}%` }}
          />
        </span>
      </div>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2" aria-label="Workspace setup checklist">
        {WORKSPACE_CHECKLIST_ITEMS.map((item) => {
          const done = completedSet.has(item.id);
          return (
            <li key={item.id} className="flex min-w-0 items-start gap-2 rounded-md px-2 py-2 hover:bg-state-hover">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Mark ${item.label} complete`}
                checked={done}
                onChange={() => toggle(item.id)}
              />
              <button
                type="button"
                className="min-w-0 flex-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => onNavigate(item.route)}
              >
                <span className={done ? "block text-sm text-muted-foreground line-through" : "block text-sm font-medium"}>
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
              </button>
              <Icon name="ChevronRight" aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
