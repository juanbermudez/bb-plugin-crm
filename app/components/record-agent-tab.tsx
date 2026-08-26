import { useCallback, useEffect, useMemo, useState } from "react";
import { ThreadChat } from "@get-bb/plugin-sdk/app";

import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";

export type RecordAgentType = "COMPANY" | "CONTACT" | "DEAL";

/** Broad on purpose: record views can inject their narrow typed RPC clients. */
export interface RecordAgentRpcClient {
  call(method: string, input: unknown): Promise<unknown>;
}

interface AgentSummary {
  id: string;
  name: string;
  status: string;
  currentVersionId: string | null;
}

interface RecordThreadLink {
  id: string;
  agentId: string;
  threadId: string;
  kind: "RECORD";
  recordType: RecordAgentType;
  recordId: string;
  versionId: string | null;
  summary: string | null;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asAgent(value: unknown): AgentSummary | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    status: typeof value.status === "string" ? value.status : "",
    currentVersionId: typeof value.currentVersionId === "string" ? value.currentVersionId : null,
  };
}

function asLink(value: unknown, recordType: RecordAgentType, recordId: string): RecordThreadLink | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.agentId !== "string" ||
    typeof value.threadId !== "string" ||
    value.kind !== "RECORD" ||
    value.recordType !== recordType ||
    value.recordId !== recordId
  ) return null;
  return {
    id: value.id,
    agentId: value.agentId,
    threadId: value.threadId,
    kind: "RECORD",
    recordType,
    recordId,
    versionId: typeof value.versionId === "string" ? value.versionId : null,
    summary: typeof value.summary === "string" ? value.summary : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
  };
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface RecordAgentTabProps {
  rpc: RecordAgentRpcClient;
  recordType: RecordAgentType;
  recordId: string;
  recordLabel: string;
}

/**
 * Record-scoped agent workspace. BB owns transcript, composer, and
 * interaction rendering through ThreadChat; this component only owns CRM
 * filing and the persisted link selector.
 */
export function RecordAgentTab({ rpc, recordType, recordId, recordLabel }: RecordAgentTabProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [links, setLinks] = useState<RecordThreadLink[]>([]);
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rawAgents = await rpc.call("agents_list", {
        search: "",
        // Existing links remain visible even when their agent is paused or
        // archived; only new-thread choices below require LIVE deployment.
        includeArchived: true,
        archivedOnly: false,
        limit: 100,
        offset: 0,
      });
      const nextAgents = Array.isArray(rawAgents)
        ? rawAgents.map(asAgent).filter((value): value is AgentSummary => value !== null)
        : [];
      const rawLinks = await Promise.all(
        nextAgents.map(async (agent) => {
          const result = await rpc.call("agents_threads_list", {
            agentId: agent.id,
            kind: "RECORD",
            recordType,
            recordId,
            limit: 100,
            offset: 0,
          });
          return Array.isArray(result)
            ? result.map((value) => asLink(value, recordType, recordId)).filter(
                (value): value is RecordThreadLink => value !== null,
              )
            : [];
        }),
      );
      const nextLinks = rawLinks.flat();
      setAgents(nextAgents);
      setLinks(nextLinks);
      setSelectedAgentId((current) =>
        current && nextAgents.some((agent) => agent.id === current && agent.status === "LIVE" && agent.currentVersionId)
          ? current
          : nextAgents.find((agent) => agent.status === "LIVE" && agent.currentVersionId)?.id ?? "",
      );
      setActiveLinkId((current) =>
        current && nextLinks.some((link) => link.id === current) ? current : nextLinks[0]?.id ?? null,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [recordId, recordType, rpc]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const agentNames = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents]);
  const activeLink = links.find((link) => link.id === activeLinkId) ?? null;
  const eligibleAgents = agents.filter((agent) => agent.status === "LIVE" && agent.currentVersionId);

  const createThread = async () => {
    if (!selectedAgentId) return;
    setCreating(true);
    setError(null);
    try {
      const result = await rpc.call("agents_threads_createRecord", {
        agentId: selectedAgentId,
        recordType,
        recordId,
      });
      const link = asLink(result, recordType, recordId);
      if (!link) throw new Error("BB returned an invalid record thread link.");
      setLinks((current) => [link, ...current.filter((item) => item.id !== link.id)]);
      setActiveLinkId(link.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-4" aria-label={`${recordLabel} agent workspace`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Agent workspace</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Record-scoped BB threads stay linked to this {recordType.toLowerCase()}.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => void reload()} disabled={loading || creating}>
          <Icon name="RotateCcw" aria-hidden="true" />
          Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {loading && links.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading agent threads…</p>
      ) : (
        <>
          <div className="grid gap-3 rounded-lg border border-border bg-muted/10 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-1 text-xs font-medium" htmlFor={`record-agent-${recordType.toLowerCase()}-${recordId}`}>
              Start a linked thread
              <select
                id={`record-agent-${recordType.toLowerCase()}-${recordId}`}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-normal"
                value={selectedAgentId}
                onChange={(event) => setSelectedAgentId(event.target.value)}
                disabled={creating || eligibleAgents.length === 0}
              >
                <option value="">{eligibleAgents.length === 0 ? "No live deployed agents" : "Choose an agent"}</option>
                {eligibleAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </label>
            <Button type="button" size="sm" onClick={() => void createThread()} disabled={creating || !selectedAgentId}>
              <Icon name="Plus" aria-hidden="true" />
              {creating ? "Starting…" : "Start agent thread"}
            </Button>
          </div>
          {links.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-medium">No agent thread yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a live deployed agent to create the first linked BB conversation.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold">Linked threads</h3>
                <div className="divide-y divide-border rounded-md border border-border" aria-label="Linked agent threads">
                  {links.map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      className="block w-full px-3 py-3 text-left text-xs hover:bg-muted/30 aria-selected:bg-muted/50"
                      aria-selected={activeLinkId === link.id}
                      onClick={() => setActiveLinkId(link.id)}
                    >
                      <span className="block font-medium">{agentNames.get(link.agentId) ?? link.agentId}</span>
                      <span className="mt-1 block text-muted-foreground">{formatDate(link.createdAt) || "Linked thread"}</span>
                      {link.summary ? <span className="mt-1 block truncate text-muted-foreground">{link.summary}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-0 rounded-lg border border-border bg-background p-2">
                {activeLink ? (
                  typeof ThreadChat === "function" ? (
                    <ThreadChat threadId={activeLink.threadId} variant="compact" layout="contained" className="min-h-[24rem] h-[34rem]" />
                  ) : (
                    <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                      BB ThreadChat is unavailable in this host. Transcript and clarification controls remain host-owned and are intentionally unavailable here.
                    </div>
                  )
                ) : (
                  <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Choose a linked thread.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
