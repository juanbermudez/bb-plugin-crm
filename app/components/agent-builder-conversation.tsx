import { useCallback, useEffect, useMemo, useState } from "react";
import { ThreadChat, type ThreadChatMessageAction } from "@get-bb/plugin-sdk/app";

import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import type { AgentDetail, AgentThreadLink } from "../../contracts/agents.js";
import { agentThreadLinkSchema } from "../../contracts/agents.js";
import type { AgentsRpcClient } from "../views/agents/rpc.js";
import { AlertDialog } from "./alert-dialog.js";

const LIST_LIMIT = 100;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function parseBuilderLinks(value: unknown): AgentThreadLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((candidate) => agentThreadLinkSchema.safeParse(candidate))
    .filter((result): result is { success: true; data: AgentThreadLink } => result.success)
    .map((result) => result.data)
    .filter((link) => link.kind === "BUILDER");
}

export interface AgentBuilderConversationProps {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
  /** Move to the draft editor with a verified linked BB thread as provenance. */
  onUseVersionSource?: (threadId: string) => void;
  /** Copy one exact assistant message into the draft editor for review. */
  onUseVersionDraft?: (text: string, threadId: string) => void;
  sourceConversationId?: string | null;
}

/**
 * BB-native conversational builder history. The CRM owns only the strict
 * agent/thread links; BB owns the transcript and all chat interaction UI.
 */
export function AgentBuilderConversation({
  agent,
  rpc,
  onUseVersionSource,
  onUseVersionDraft,
  sourceConversationId = null,
}: AgentBuilderConversationProps) {
  const [links, setLinks] = useState<AgentThreadLink[]>([]);
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteLink, setDeleteLink] = useState<AgentThreadLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rpc.call("agents_threads_list", {
        agentId: agent.id,
        kind: "BUILDER",
        limit: LIST_LIMIT,
        offset: 0,
      });
      const nextLinks = parseBuilderLinks(result);
      setLinks(nextLinks);
      setActiveLinkId((current) =>
        current && nextLinks.some((link) => link.id === current)
          ? current
          : nextLinks[0]?.id ?? null,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [agent.id, rpc]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeLink = useMemo(
    () => links.find((link) => link.id === activeLinkId) ?? null,
    [activeLinkId, links],
  );

  const messageActions = useMemo<readonly ThreadChatMessageAction[]>(
    () => onUseVersionDraft ? [{
      id: "use-as-version-draft",
      title: "Use as version draft",
      icon: "FileDiff",
      roles: ["assistant"],
      run: (message) => onUseVersionDraft(message.text, message.threadId),
    }] : [],
    [onUseVersionDraft],
  );

  const createConversation = async (newConversation: boolean) => {
    setCreating(true);
    setError(null);
    try {
      const input: {
        agentId: string;
        versionId?: string;
        newConversation: boolean;
      } = {
        agentId: agent.id,
        newConversation,
      };
      if (agent.currentVersionId) input.versionId = agent.currentVersionId;
      const result = await rpc.call("agents_threads_createBuilder", input);
      const parsed = agentThreadLinkSchema.safeParse(result);
      if (!parsed.success || parsed.data.kind !== "BUILDER") {
        throw new Error("BB returned an invalid builder thread link.");
      }
      setLinks((current) => [
        parsed.data,
        ...current.filter((link) => link.id !== parsed.data.id),
      ]);
      setActiveLinkId(parsed.data.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteLink) return;
    setDeleting(true);
    setError(null);
    try {
      await rpc.call("agents_threads_deleteBuilder", {
        agentId: agent.id,
        id: deleteLink.id,
      });
      const remaining = links.filter((link) => link.id !== deleteLink.id);
      setLinks(remaining);
      setActiveLinkId((current) =>
        current === deleteLink.id ? remaining[0]?.id ?? null : current,
      );
      setDeleteLink(null);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-4" aria-label={`${agent.name} conversation builder`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Conversation builder</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Collaborate with BB in natural language to shape this agent’s automation draft. The selected version context is seeded when a conversation starts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void reload()} disabled={loading || creating}>
            <Icon name="RotateCcw" aria-hidden="true" />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => void createConversation(true)} disabled={creating || deleting}>
            <Icon name="Plus" aria-hidden="true" />
            {creating ? "Starting…" : "New conversation"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {loading && links.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading builder conversations…</p>
      ) : links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">No builder conversation yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Start a conversation to describe the automation you want this agent to perform.</p>
          <Button type="button" size="sm" className="mt-4" onClick={() => void createConversation(false)} disabled={creating || deleting}>
            <Icon name="MessageSquare" aria-hidden="true" />
            {creating ? "Starting…" : "Start conversation"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">Conversation history</h3>
            <div className="divide-y divide-border rounded-md border border-border" aria-label="Builder conversation history">
              {links.map((link) => (
                <div key={link.id} className="p-2">
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-2 text-left text-xs hover:bg-muted/30 aria-selected:bg-muted/50"
                    aria-selected={activeLinkId === link.id}
                    onClick={() => setActiveLinkId(link.id)}
                  >
                    <span className="block font-medium">{link.summary || "Automation draft"}</span>
                    <span className="mt-1 block text-muted-foreground">{formatDate(link.createdAt) || "Builder conversation"}</span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">{link.threadId}</span>
                  </button>
                  {onUseVersionSource ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 w-full justify-start px-2 text-[11px]"
                      onClick={() => onUseVersionSource(link.threadId)}
                    >
                      {sourceConversationId === link.threadId ? "Selected as version source" : "Use as version source"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 w-full justify-start px-2 text-[11px] text-destructive hover:text-destructive"
                    aria-label={`Delete builder conversation ${link.threadId}`}
                    onClick={() => setDeleteLink(link)}
                    disabled={deleting}
                  >
                    Delete conversation
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 rounded-lg border border-border bg-background p-2">
            {activeLink ? (
              typeof ThreadChat === "function" ? (
                <ThreadChat
                  threadId={activeLink.threadId}
                  variant="compact"
                  layout="contained"
                  className="min-h-[24rem] h-[34rem]"
                  messageActions={messageActions}
                />
              ) : (
                <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  BB ThreadChat is unavailable in this host; the CRM keeps the linked conversation history without rebuilding BB’s chat surface.
                </div>
              )
            ) : (
              <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Choose a builder conversation.</div>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        BB renders the transcript and chat interactions. The CRM does not claim public sharing; use the host’s own thread controls where available.
      </p>
      <AlertDialog
        open={deleteLink !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteLink(null);
        }}
        title="Delete builder conversation?"
        description="This deletes the visible BB thread and then removes its CRM link. The conversation cannot be restored by the CRM."
        confirmLabel="Delete conversation"
        destructive
        disabled={deleting}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
