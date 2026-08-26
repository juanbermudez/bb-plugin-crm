import { useState } from "react";

import {
  experimental_NewThreadComposer as NewThreadComposer,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "../../components/ui/icon.js";
import { cn } from "../../lib/utils.js";
import type {
  AgentDefinition,
  AgentThreadBuilderSpawnRequest,
} from "../../contracts/agents.js";
import type { AgentsRpcClient } from "../views/agents/rpc.js";

const SUGGESTIONS = [
  "Brief every deal owner before a renewal call",
  "Flag deals with no activity for 14 days",
  "Hand new customers from Sales to Onboarding",
] as const;

export interface AgentBuilderHomeProps {
  /** The same CRM RPC client used by the Agents workspace and its thread UI. */
  rpc: AgentsRpcClient;
  /** Opens the newly-created definition on its visible BB builder thread. */
  onOpenBuilder: (agentId: string) => void;
  /** Optional surface styling when the builder is hosted inside a modal. */
  className?: string;
}

function textFromPrompt(request: NewThreadRequest): string {
  return request.input
    .filter((part): part is Extract<NewThreadRequest["input"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/**
 * Natural-language entry point for creating a CRM agent draft.
 *
 * The composer intentionally stops at the CRM's existing RPC boundary: it
 * creates a DRAFT definition, seeds its visible BB builder thread with the
 * submitted request, and lets AgentBuilderConversation render the host-owned
 * transcript/composer after routing to the Conversation tab.
 */
export function AgentBuilderHome({ rpc, onOpenBuilder, className }: AgentBuilderHomeProps) {
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | undefined>();
  const [composerKey, setComposerKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (request: NewThreadRequest) => {
    if (saving) return;
    const prompt = textFromPrompt(request);
    if (!prompt) {
      setError("Describe the CRM automation you want to build.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = (await rpc.call("agents_create", {
        name: draftAgentName(prompt),
        description: prompt,
      })) as AgentDefinition;
      await rpc.call("agents_threads_createBuilder", {
        agentId: created.id,
        newConversation: false,
        initialPrompt: prompt,
        spawnRequest: request as AgentThreadBuilderSpawnRequest,
      });
      onOpenBuilder(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Build an agent with BB"
      className={cn("border-b border-border bg-card px-4 py-6 sm:px-5 sm:py-8", className)}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon name="Brain" aria-hidden="true" className="size-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Build an agent with BB</h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            Describe the CRM automation you want. BB will open a private builder conversation to clarify the goal and shape a draft.
          </p>
        </div>

        <div className="min-h-24 rounded-lg border border-input bg-background p-2 shadow-sm">
          <NewThreadComposer
            key={composerKey}
            initialPrompt={suggestedPrompt}
            placeholder="Describe the CRM automation you want…"
            layout="document"
            draftKey="crm-agent-builder-home"
            onSubmit={submit}
          />
          {saving ? (
            <p className="px-2 pb-1 text-xs text-muted-foreground" role="status">
              Creating a draft and opening its BB builder conversation…
            </p>
          ) : null}
          <p id="agent-builder-hint" className="px-2 pt-1 text-xs text-muted-foreground">
            BB keeps the composer, model, project, and permission controls native to the host.
          </p>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Suggested agents</p>
          <div className="divide-y divide-border rounded-md border border-border">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="flex min-h-10 w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover disabled:pointer-events-none disabled:opacity-60"
                disabled={saving}
                onClick={() => {
                  setSuggestedPrompt(suggestion);
                  setComposerKey((key) => key + 1);
                }}
              >
                <span className="min-w-0 flex-1">{suggestion}</span>
                <Icon name="ArrowRight" aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Produce a useful, bounded draft name while leaving the full request in description/thread context. */
export function draftAgentName(request: string): string {
  const normalized = request.trim().replace(/\s+/g, " ");
  const summary = normalized
    .replace(
      /^(?:please\s+)?(?:create|build|draft|make|set\s+up)(?:\s+me)?\s+(?:(?:a|an|the)\s+)?(?:new\s+)?agent(?:\s+(?:to|that|for))?\s*/i,
      "",
    )
    .replace(/[.!?]+$/u, "")
    .trim();
  const source = summary || normalized;
  const bounded = source.length > 72 ? `${source.slice(0, 69).trimEnd()}…` : source;
  return `Draft · ${bounded || "CRM automation"}`;
}
