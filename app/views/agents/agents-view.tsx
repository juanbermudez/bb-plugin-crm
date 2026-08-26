import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.js";
import {
  EmptyState,
  AlertDialog,
  ListToolbar,
  PageHeader,
  RecordDrawer,
  SearchField,
  TableShell,
  TooltipIconButton,
} from "../../components/index.js";
import type {
  AgentAttachment,
  AgentAuditEvent,
  AgentDefinition,
  AgentDefinitionStatus,
  AgentDetail,
  AgentListInput,
  AgentListItem,
  AgentRunDetail,
  AgentRunStatus,
  AgentTrigger,
  AgentTriggerType,
  AgentVersion,
  AgentVersionStatus,
} from "../../../contracts/agents.js";
import { useAgentsRpc, type AgentsRpcClient } from "./rpc.js";
import { AgentAttachmentPicker } from "./agent-attachments.js";
import { AgentBuilderHome } from "../../components/agent-builder-home.js";
import { AgentBuilderConversation } from "../../components/agent-builder-conversation.js";

const LIST_LIMIT = 100;
const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const TEXTAREA_CLASS =
  "flex min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const CODE_TEXTAREA_CLASS = `${TEXTAREA_CLASS} min-h-32 font-mono text-xs leading-relaxed`;

const AGENT_STATUSES: readonly AgentDefinitionStatus[] = [
  "DRAFT",
  "DEPLOYING",
  "LIVE",
  "PAUSED",
  "ARCHIVED",
];

const AGENT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "conversation", label: "Conversation" },
  { id: "versions", label: "Versions" },
  { id: "triggers", label: "Triggers" },
  { id: "runs", label: "Run history" },
  { id: "audit", label: "Audit" },
] as const;

type AgentTab = (typeof AGENT_TABS)[number]["id"];

function normalizeAgentTab(value: string | null | undefined): AgentTab {
  return AGENT_TABS.some((tab) => tab.id === value)
    ? value as AgentTab
    : "overview";
}

const TRIGGER_TYPES: readonly AgentTriggerType[] = [
  "MANUAL",
  "SCHEDULE",
  "EVENT",
  "WEBHOOK",
];

const RUN_STATUSES: readonly AgentRunStatus[] = [
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
];

const VERSION_STATUSES: readonly AgentVersionStatus[] = [
  "DRAFT",
  "VALIDATING",
  "READY",
  "DEPLOYED",
  "REJECTED",
];

type RawRpcClient = {
  call(method: string, input: unknown): Promise<unknown>;
};

type AgentJsonObject = Record<string, unknown>;

interface AgentFormValue {
  name: string;
  description: string;
}

interface VersionFormValue {
  instructions: string;
  modelId: string;
  modelContextWindowTokens: string;
  manifest: string;
  sandboxPolicy: string;
}

interface TriggerFormValue {
  versionId: string;
  type: AgentTriggerType;
  name: string;
  config: string;
}

function rawRpc(rpc: AgentsRpcClient): RawRpcClient {
  return rpc as unknown as RawRpcClient;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClass(value: string): string {
  switch (value) {
    case "LIVE":
    case "DEPLOYED":
    case "SUCCEEDED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "PAUSED":
    case "WAITING_FOR_APPROVAL":
    case "VALIDATING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "FAILED":
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "ARCHIVED":
    case "CANCELLED":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-background text-muted-foreground";
  }
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${statusClass(value)}`}
    >
      {statusLabel(value)}
    </span>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(
  value: string,
  field: string,
): { value: AgentJsonObject | null; error: string | null } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) {
      return { value: null, error: `${field} must be a JSON object.` };
    }
    return { value: parsed as AgentJsonObject, error: null };
  } catch {
    return { value: null, error: `${field} must contain valid JSON.` };
  }
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function emptyVersionForm(): VersionFormValue {
  return {
    instructions: "",
    modelId: "default",
    modelContextWindowTokens: "1000000",
    manifest: "{}",
    sandboxPolicy: "{}",
  };
}

function versionFormFrom(version: AgentVersion | null): VersionFormValue {
  if (!version) return emptyVersionForm();
  return {
    instructions: version.instructions,
    modelId: version.modelId,
    modelContextWindowTokens: String(version.modelContextWindowTokens),
    manifest: prettyJson(version.manifest),
    sandboxPolicy: prettyJson(version.sandboxPolicy),
  };
}

function emptyTriggerForm(agent: AgentDetail): TriggerFormValue {
  return {
    versionId: agent.currentVersion?.id ?? agent.versions[0]?.id ?? "",
    type: "MANUAL",
    name: "",
    config: "{}",
  };
}

function versionStatus(value: AgentVersion | null): string {
  return value?.status ?? "DRAFT";
}

function agentDescription(agent: AgentListItem): string {
  return agent.description?.trim() || "No description";
}

function isActiveRun(status: AgentRunStatus): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "WAITING_FOR_APPROVAL";
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border pb-6 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function InlineError({ message }: { message: string | null }) {
  return message ? (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function AgentListRow({
  agent,
  onOpen,
}: {
  agent: AgentListItem;
  onOpen: (id: string) => void;
}) {
  return (
    <tr
      key={agent.id}
      tabIndex={0}
      aria-label={`Open ${agent.name}`}
      className="cursor-pointer outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
      onClick={() => onOpen(agent.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(agent.id);
        }
      }}
    >
      <td className="min-w-56 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{agent.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{agentDescription(agent)}</p>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <StatusPill value={agent.status} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
        {agent.currentVersion ? (
          <span className="inline-flex items-center gap-2">
            <span>v{agent.currentVersion.number}</span>
            <StatusPill value={agent.currentVersion.status} />
          </span>
        ) : (
          "No version"
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{agent.runCount}</td>
      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
        <time dateTime={agent.updatedAt}>{formatDate(agent.updatedAt)}</time>
      </td>
    </tr>
  );
}

function MetadataEditor({
  agent,
  rpc,
  onChanged,
}: {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<AgentFormValue>({
    name: agent.name,
    description: agent.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue({ name: agent.name, description: agent.description ?? "" });
    setEditing(false);
    setError(null);
  }, [agent.id, agent.name, agent.description, agent.updatedAt]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = value.name.trim();
    if (!name) {
      setError("Agent name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await rawRpc(rpc).call("agents_update", {
        id: agent.id,
        data: { name, description: value.description.trim() || null },
      });
      setEditing(false);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Agent details"
      description="Keep the definition metadata short and operational. Versions hold the executable configuration."
      actions={
        editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            <Icon name="Edit" aria-hidden="true" />
            Edit details
          </Button>
        )
      }
    >
      {editing ? (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`agent-name-${agent.id}`}>
              Agent name
            </label>
            <Input
              id={`agent-name-${agent.id}`}
              required
              value={value.name}
              onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`agent-description-${agent.id}`}>
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id={`agent-description-${agent.id}`}
              className={TEXTAREA_CLASS}
              maxLength={500}
              value={value.description}
              onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))}
              placeholder="What this agent is responsible for"
            />
          </div>
          <InlineError message={error} />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save details"}
          </Button>
        </form>
      ) : (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="mt-1 font-medium">{agent.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Definition ID</dt>
            <dd className="mt-1 break-all font-mono text-xs">{agent.id}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{agent.description || "No description"}</dd>
          </div>
        </dl>
      )}
    </Section>
  );
}

function LifecycleActions({
  agent,
  rpc,
  onChanged,
  onDeleted,
}: {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
  onChanged: () => Promise<void>;
  onDeleted?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const run = async (method: "agents_pause" | "agents_resume" | "agents_archive" | "agents_restore") => {
    setBusy(method);
    setError(null);
    try {
      await rawRpc(rpc).call(method, { id: agent.id });
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const deleteAgent = async () => {
    setBusy("agents_delete");
    setError(null);
    try {
      await rawRpc(rpc).call("agents_delete", { id: agent.id });
      await onChanged();
      onDeleted?.();
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {agent.status === "LIVE" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          aria-label="Pause agent"
          onClick={() => void run("agents_pause")}
        >
          <Icon name="Pause" aria-hidden="true" />
          {busy === "agents_pause" ? "Pausing…" : "Pause"}
        </Button>
      ) : null}
      {agent.status === "PAUSED" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          aria-label="Resume agent"
          onClick={() => void run("agents_resume")}
        >
          <Icon name="Play" aria-hidden="true" />
          {busy === "agents_resume" ? "Resuming…" : "Resume"}
        </Button>
      ) : null}
      {agent.status === "LIVE" || agent.status === "PAUSED" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          aria-label="Archive agent"
          onClick={() => void run("agents_archive")}
        >
          <Icon name="Archive" aria-hidden="true" />
          {busy === "agents_archive" ? "Archiving…" : "Archive"}
        </Button>
      ) : null}
      {agent.status === "ARCHIVED" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          aria-label="Restore agent"
          onClick={() => void run("agents_restore")}
        >
          <Icon name="ArchiveRestore" aria-hidden="true" />
          {busy === "agents_restore" ? "Restoring…" : "Restore"}
        </Button>
      ) : null}
      {agent.status !== "DELETED" ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy !== null}
          aria-label="Delete agent"
          onClick={() => { setError(null); setDeleteOpen(true); }}
        >
          <Icon name="Trash2" aria-hidden="true" />
          Delete
        </Button>
      ) : null}
      {error ? <span className="basis-full text-xs text-destructive" role="alert">{error}</span> : null}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${agent.name}?`}
        description="This soft-deletes the agent, disables its triggers, cancels queued, running, and waiting runs, and stops linked hidden BB workers. Run, action, and audit history stays available for review."
        confirmLabel="Delete agent"
        destructive
        disabled={busy !== null}
        onConfirm={deleteAgent}
      />
    </div>
  );
}

function VersionEditor({
  agent,
  rpc,
  onChanged,
  sourceConversationId,
  draftInstructions,
}: {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
  onChanged: () => Promise<void>;
  sourceConversationId?: string | null;
  draftInstructions?: string | null;
}) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    agent.currentVersion?.id ?? agent.versions[0]?.id ?? null,
  );
  const [value, setValue] = useState<VersionFormValue>(
    () => {
      const base = versionFormFrom(agent.currentVersion ?? agent.versions[0] ?? null);
      return draftInstructions === null || draftInstructions === undefined
        ? base
        : { ...base, instructions: draftInstructions };
    },
  );
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<"validate" | "deploy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedVersion = useMemo(
    () => agent.versions.find((version) => version.id === selectedVersionId) ?? null,
    [agent.versions, selectedVersionId],
  );

  useEffect(() => {
    if (selectedVersionId && agent.versions.some((version) => version.id === selectedVersionId)) return;
    const next = agent.currentVersion ?? agent.versions[0] ?? null;
    setSelectedVersionId(next?.id ?? null);
    setValue(versionFormFrom(next));
  }, [agent.id, agent.currentVersionId, agent.versions, selectedVersionId]);

  const selectVersion = (id: string) => {
    if (!id) {
      setSelectedVersionId(null);
      setValue(emptyVersionForm());
      setError(null);
      setNotice(null);
      return;
    }
    const next = agent.versions.find((version) => version.id === id) ?? null;
    setSelectedVersionId(next?.id ?? null);
    setValue(versionFormFrom(next));
    setError(null);
    setNotice(null);
  };

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instructions = value.instructions.trim();
    const modelId = value.modelId.trim();
    if (!instructions) {
      setError("Instructions are required.");
      return;
    }
    if (!modelId) {
      setError("Model ID is required.");
      return;
    }
    const contextWindow = Number(value.modelContextWindowTokens);
    if (!Number.isInteger(contextWindow) || contextWindow < 1) {
      setError("Model context window must be a positive whole number.");
      return;
    }
    const manifest = parseJsonObject(value.manifest, "Manifest");
    if (manifest.error || !manifest.value) {
      setError(manifest.error ?? "Manifest must be a JSON object.");
      return;
    }
    const sandboxPolicy = parseJsonObject(value.sandboxPolicy, "BB permission policy");
    if (sandboxPolicy.error || !sandboxPolicy.value) {
      setError(sandboxPolicy.error ?? "BB permission policy must be a JSON object.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const retainedSourceConversationId = sourceConversationId ?? selectedVersion?.sourceConversationId ?? null;
      await rawRpc(rpc).call("agents_versions_create", {
        agentId: agent.id,
        data: {
          status: "DRAFT",
          instructions,
          modelId,
          modelContextWindowTokens: contextWindow,
          manifest: manifest.value,
          sandboxPolicy: sandboxPolicy.value,
          ...(retainedSourceConversationId === null ? {} : { sourceConversationId: retainedSourceConversationId }),
        },
      });
      setNotice("Draft saved. Validate it before deploying.");
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const versionAction = async (kind: "validate" | "deploy") => {
    if (!selectedVersionId) {
      setError("Save a draft before validating or deploying.");
      return;
    }
    setAction(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "validate") {
        await rawRpc(rpc).call("agents_versions_validate", { id: selectedVersionId });
        setNotice("Version validated and marked ready.");
      } else {
        await rawRpc(rpc).call("agents_deploy", {
          agentId: agent.id,
          versionId: selectedVersionId,
        });
        setNotice("Version deployed. Enabled triggers now point at this version.");
      }
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  };

  return (
    <Section
      title="Version draft editor"
      description="Instructions and BB execution permission policy are versioned together. The policy maps directly to the host permissionMode used for every spawned or resumed run."
      actions={
        <select
          className={`${SELECT_CLASS} w-auto min-w-40`}
          aria-label="Select agent version"
          value={selectedVersionId ?? ""}
          onChange={(event) => selectVersion(event.target.value)}
        >
          <option value="">New draft</option>
          {agent.versions.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.number} · {statusLabel(version.status)}
            </option>
          ))}
        </select>
      }
    >
      {selectedVersion ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Version {selectedVersion.number}</span>
          <StatusPill value={selectedVersion.status} />
          <span>Created {formatDate(selectedVersion.createdAt)}</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">This agent has no saved version yet. Start a draft below.</p>
      )}
      {sourceConversationId ? (
        <p className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground" role="status">
          This draft retains the selected BB builder thread as provenance. Copy any approved instructions from the conversation into this editor; transcript output is not applied automatically.
        </p>
      ) : null}
      {draftInstructions !== null && draftInstructions !== undefined ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground" role="status">
          Assistant text was copied from the BB conversation as a draft suggestion. Review it, then save explicitly; the CRM will not auto-save or deploy it.
        </p>
      ) : null}
      <form className="space-y-4" onSubmit={saveDraft}>
        <div className="space-y-2">
          <label className="text-xs font-medium" htmlFor={`agent-instructions-${agent.id}`}>
            Instructions
          </label>
          <textarea
            id={`agent-instructions-${agent.id}`}
            required
            className={`${TEXTAREA_CLASS} min-h-44`}
            value={value.instructions}
            onChange={(event) => setValue((current) => ({ ...current, instructions: event.target.value }))}
            placeholder="Describe the agent's objective, guardrails, and expected output"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`agent-model-${agent.id}`}>
              Model ID
            </label>
            <Input
              id={`agent-model-${agent.id}`}
              value={value.modelId}
              onChange={(event) => setValue((current) => ({ ...current, modelId: event.target.value }))}
              placeholder="default"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`agent-context-${agent.id}`}>
              Context window (tokens)
            </label>
            <Input
              id={`agent-context-${agent.id}`}
              type="number"
              min={1}
              step={1}
              value={value.modelContextWindowTokens}
              onChange={(event) => setValue((current) => ({ ...current, modelContextWindowTokens: event.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`agent-manifest-${agent.id}`}>
              Manifest JSON
            </label>
            <textarea
              id={`agent-manifest-${agent.id}`}
              className={CODE_TEXTAREA_CLASS}
              value={value.manifest}
              onChange={(event) => setValue((current) => ({ ...current, manifest: event.target.value }))}
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`agent-sandbox-${agent.id}`}>
              BB permission policy JSON
            </label>
            <textarea
              id={`agent-sandbox-${agent.id}`}
              className={CODE_TEXTAREA_CLASS}
              value={value.sandboxPolicy}
              onChange={(event) => setValue((current) => ({ ...current, sandboxPolicy: event.target.value }))}
              spellCheck={false}
              placeholder={'{ "permissionMode": "accept-edits" }'}
            />
            <p className="text-xs text-muted-foreground">
              Optional key: <code>permissionMode</code> with <code>accept-edits</code>, <code>auto</code>, or <code>full</code>. Unknown keys are rejected.
            </p>
          </div>
        </div>
        <InlineError message={error} />
        {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{notice}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={saving || action !== null}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || action !== null || selectedVersionId === null}
            onClick={() => void versionAction("validate")}
          >
            <Icon name="Check" aria-hidden="true" />
            {action === "validate" ? "Validating…" : "Validate version"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || action !== null || selectedVersionId === null}
            onClick={() => void versionAction("deploy")}
          >
            <Icon name="Zap" aria-hidden="true" />
            {action === "deploy" ? "Deploying…" : "Deploy version"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function VersionHistory({
  agent,
  onSelect,
}: {
  agent: AgentDetail;
  onSelect: (id: string) => void;
}) {
  return agent.versions.length === 0 ? (
    <EmptyState
      icon="FileDiff"
      title="No versions yet"
      description="Create a draft from the Overview tab before validating or deploying the agent."
      className="min-h-32 rounded-md"
    />
  ) : (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
        <caption className="sr-only">Agent versions</caption>
        <thead className="border-b border-border-hairline text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-medium">Version</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Model</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Created</th>
            <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-hairline">
          {agent.versions.map((version) => (
            <tr key={version.id} className="hover:bg-state-hover">
              <td className="px-3 py-3 font-medium">v{version.number}</td>
              <td className="px-3 py-3"><StatusPill value={version.status} /></td>
              <td className="px-3 py-3 text-muted-foreground">{version.modelId}</td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(version.createdAt)}</td>
              <td className="px-3 py-3 text-right">
                <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(version.id)}>
                  Edit draft
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TriggerWorkspace({
  agent,
  rpc,
  onChanged,
}: {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
  onChanged: () => Promise<void>;
}) {
  const [triggers, setTriggers] = useState<AgentTrigger[]>(agent.triggers);
  const [value, setValue] = useState<TriggerFormValue>(() => emptyTriggerForm(agent));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reloadTriggers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rawRpc(rpc).call("agents_triggers_list", {
        agentId: agent.id,
        limit: LIST_LIMIT,
        offset: 0,
      });
      setTriggers(Array.isArray(result) ? (result as AgentTrigger[]) : []);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [agent.id, rpc]);

  useEffect(() => {
    setTriggers(agent.triggers);
    setValue(emptyTriggerForm(agent));
  }, [agent.id, agent.currentVersionId, agent.triggers]);

  useEffect(() => {
    void reloadTriggers();
  }, [reloadTriggers]);

  const createTrigger = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = value.name.trim();
    if (!name) {
      setError("Trigger name is required.");
      return;
    }
    if (!value.versionId) {
      setError("Select a version for this trigger.");
      return;
    }
    const config = parseJsonObject(value.config, "Trigger config");
    if (config.error || !config.value) {
      setError(config.error ?? "Trigger config must be a JSON object.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await rawRpc(rpc).call("agents_triggers_create", {
        agentId: agent.id,
        data: {
          versionId: value.versionId,
          type: value.type,
          name,
          config: config.value,
          enabled: false,
        },
      });
      setNotice("Trigger created disabled. Enable it when the agent is ready.");
      setValue(emptyTriggerForm(agent));
      await Promise.all([reloadTriggers(), onChanged()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (trigger: AgentTrigger) => {
    setBusyId(trigger.id);
    setError(null);
    try {
      await rawRpc(rpc).call("agents_triggers_enable", {
        id: trigger.id,
        enabled: !trigger.enabled,
      });
      await Promise.all([reloadTriggers(), onChanged()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (trigger: AgentTrigger) => {
    setBusyId(trigger.id);
    setError(null);
    try {
      await rawRpc(rpc).call("agents_triggers_delete", { id: trigger.id });
      await Promise.all([reloadTriggers(), onChanged()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section
      title="Triggers"
      description="Manual, schedule, CRM event, and webhook configurations are stored per version. New triggers start disabled."
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void reloadTriggers()} disabled={loading}>
          <Icon name="RotateCcw" aria-hidden="true" />
          Refresh
        </Button>
      }
    >
      <form className="space-y-4 rounded-lg border border-border bg-muted/10 p-4" onSubmit={createTrigger}>
        <div className="flex items-center gap-2">
          <Icon name="Workflow" aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Add trigger</h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`trigger-name-${agent.id}`}>
              Trigger name
            </label>
            <Input
              id={`trigger-name-${agent.id}`}
              required
              value={value.name}
              onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
              placeholder="Weekly account review"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`trigger-type-${agent.id}`}>
              Trigger type
            </label>
            <select
              id={`trigger-type-${agent.id}`}
              className={SELECT_CLASS}
              value={value.type}
              onChange={(event) => setValue((current) => ({ ...current, type: event.target.value as AgentTriggerType }))}
            >
              {TRIGGER_TYPES.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor={`trigger-version-${agent.id}`}>
              Version
            </label>
            <select
              id={`trigger-version-${agent.id}`}
              className={SELECT_CLASS}
              value={value.versionId}
              onChange={(event) => setValue((current) => ({ ...current, versionId: event.target.value }))}
              disabled={agent.versions.length === 0}
            >
              <option value="">Select version</option>
              {agent.versions.map((version) => (
                <option key={version.id} value={version.id}>v{version.number} · {statusLabel(version.status)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium" htmlFor={`trigger-config-${agent.id}`}>
            Trigger config JSON
          </label>
          <textarea
            id={`trigger-config-${agent.id}`}
            className={CODE_TEXTAREA_CLASS}
            value={value.config}
            onChange={(event) => setValue((current) => ({ ...current, config: event.target.value }))}
            spellCheck={false}
            placeholder={value.type === "SCHEDULE" ? '{ "cron": "0 9 * * 1" }' : '{ }'}
          />
          <p className="text-xs text-muted-foreground">
            {value.type === "MANUAL"
              ? "Manual triggers are available for explicit queue actions."
              : `${statusLabel(value.type)} settings are retained as JSON for the dispatcher.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={saving || agent.versions.length === 0}>
            <Icon name="Plus" aria-hidden="true" />
            {saving ? "Creating…" : "Create trigger"}
          </Button>
          {agent.versions.length === 0 ? <span className="text-xs text-muted-foreground">Save a version first.</span> : null}
        </div>
      </form>
      <InlineError message={error} />
      {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{notice}</p> : null}
      {loading && triggers.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground" role="status">Loading triggers…</div>
      ) : triggers.length === 0 ? (
        <EmptyState
          icon="Workflow"
          title="No triggers configured"
          description="Create a disabled trigger above, then enable it after deploying a compatible version."
          className="min-h-32 rounded-md"
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {triggers.map((trigger) => (
            <div key={trigger.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-medium">{trigger.name}</h3>
                  <StatusPill value={trigger.type} />
                  <span className={`text-xs ${trigger.enabled ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
                    {trigger.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Version {agent.versions.find((version) => version.id === trigger.versionId)?.number ?? trigger.versionId}</p>
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">{prettyJson(trigger.config)}</pre>
                <p className="text-xs text-muted-foreground">
                  Next run {formatDate(trigger.nextRunAt)} · Last run {formatDate(trigger.lastRunAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant={trigger.enabled ? "secondary" : "outline"}
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void toggle(trigger)}
                >
                  {busyId === trigger.id ? "Updating…" : trigger.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={busyId !== null}
                  onClick={() => void remove(trigger)}
                >
                  <Icon name="Trash2" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function RunDetailPanel({
  run,
  rpc,
  onChanged,
}: {
  run: AgentRunDetail;
  rpc: AgentsRpcClient;
  onChanged: (run: AgentRunDetail) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transition = async (
    method:
      | "agents_runs_start"
      | "agents_runs_requestApproval"
      | "agents_runs_approve"
      | "agents_runs_success"
      | "agents_runs_fail"
      | "agents_runs_cancel"
      | "agents_runs_retry",
    input: unknown = { id: run.id },
  ) => {
    setBusy(method);
    setError(null);
    try {
      const next = await rawRpc(rpc).call(method, input);
      if (isRecord(next) && typeof next.id === "string") onChanged(next as unknown as AgentRunDetail);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Run {run.id}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Queued {formatDate(run.createdAt)} · {run.triggerType} trigger</p>
        </div>
        <StatusPill value={run.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Persisted test transitions</span>
        {run.status === "QUEUED" ? (
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void transition("agents_runs_start")}>
            {busy === "agents_runs_start" ? "Starting…" : "Start test run"}
          </Button>
        ) : null}
        {run.status === "RUNNING" ? (
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void transition("agents_runs_requestApproval")}>
            {busy === "agents_runs_requestApproval" ? "Requesting…" : "Request approval"}
          </Button>
        ) : null}
        {run.status === "WAITING_FOR_APPROVAL" ? (
          <>
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void transition("agents_runs_approve")}>
              {busy === "agents_runs_approve" ? "Approving…" : "Approve run"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => void transition("agents_runs_cancel", { id: run.id, reason: "Approval denied by user." })}>
              {busy === "agents_runs_cancel" ? "Denying…" : "Deny approval"}
            </Button>
          </>
        ) : null}
        {run.status === "RUNNING" ? (
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void transition("agents_runs_success")}>
            {busy === "agents_runs_success" ? "Finishing…" : "Mark succeeded"}
          </Button>
        ) : null}
        {isActiveRun(run.status) ? (
          <>
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => void transition("agents_runs_fail")}>
              {busy === "agents_runs_fail" ? "Failing…" : "Mark failed"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void transition("agents_runs_cancel")}>
              {busy === "agents_runs_cancel" ? "Cancelling…" : "Cancel run"}
            </Button>
          </>
        ) : null}
        {run.status === "FAILED" || run.status === "CANCELLED" ? (
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void transition("agents_runs_retry")}>
            {busy === "agents_runs_retry" ? "Retrying…" : "Retry run"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Run state and approval decisions are persisted by the CRM. Cancellation also requests cleanup of a linked BB worker when one exists.</p>
      <InlineError message={error} />
      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Version</dt><dd className="mt-1 break-all font-mono">{run.versionId}</dd></div>
        <div><dt className="text-muted-foreground">Correlation ID</dt><dd className="mt-1 break-all font-mono">{run.correlationId}</dd></div>
        <div><dt className="text-muted-foreground">Started</dt><dd className="mt-1">{formatDate(run.startedAt)}</dd></div>
        <div><dt className="text-muted-foreground">Finished</dt><dd className="mt-1">{formatDate(run.finishedAt)}</dd></div>
        {run.approvalReason ? <div className="sm:col-span-2"><dt className="text-muted-foreground">Approval request</dt><dd className="mt-1 whitespace-pre-wrap">{run.approvalReason}</dd></div> : null}
        {run.cancelRequestedAt ? <div><dt className="text-muted-foreground">Cancellation requested</dt><dd className="mt-1">{formatDate(run.cancelRequestedAt)}</dd></div> : null}
        {run.cancelDeliveredAt ? <div><dt className="text-muted-foreground">Cancellation delivered</dt><dd className="mt-1">{formatDate(run.cancelDeliveredAt)}</dd></div> : null}
        {run.errorMessage ? <div className="sm:col-span-2"><dt className="text-muted-foreground">Error</dt><dd className="mt-1 text-destructive">{run.errorCode ? `${run.errorCode}: ` : ""}{run.errorMessage}</dd></div> : null}
        {run.summary ? <div className="sm:col-span-2"><dt className="text-muted-foreground">Summary</dt><dd className="mt-1 whitespace-pre-wrap">{run.summary}</dd></div> : null}
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">Timeline</h4>
          {run.events.length === 0 ? <p className="text-xs text-muted-foreground">No events recorded.</p> : (
            <ol className="space-y-2 border-l border-border pl-4">
              {run.events.map((event) => (
                <li key={event.id} className="relative text-xs">
                  <span className="absolute -left-[1.05rem] top-1 size-2 rounded-full bg-muted-foreground" />
                  <p className="font-medium">{statusLabel(event.type)}</p>
                  <p className="text-muted-foreground">{formatDate(event.emittedAt)} · sequence {event.sequence}</p>
                  {isRecord(event.data) && Object.keys(event.data).length > 0 ? <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">{prettyJson(event.data)}</pre> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">Actions</h4>
          {run.actions.length === 0 ? <p className="text-xs text-muted-foreground">No actions recorded.</p> : (
            <div className="divide-y divide-border rounded-md border border-border">
              {run.actions.map((action) => (
                <div key={action.id} className="space-y-1 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{action.summary}</span>
                    <StatusPill value={action.status} />
                  </div>
                  <p className="text-muted-foreground">{action.provider} · {action.type} · {action.attemptCount} attempt{action.attemptCount === 1 ? "" : "s"}</p>
                  {action.errorMessage ? <p className="text-destructive">{action.errorMessage}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <details className="rounded-md border border-border bg-background px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">Input and result JSON</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><p className="mb-1 text-muted-foreground">Input</p><pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px]">{prettyJson(run.input)}</pre></div>
          <div><p className="mb-1 text-muted-foreground">Result</p><pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px]">{prettyJson(run.result)}</pre></div>
        </div>
      </details>
    </div>
  );
}

function RunHistory({
  agent,
  rpc,
}: {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
}) {
  const [runs, setRuns] = useState<AgentRunDetail[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reloadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rawRpc(rpc).call("agents_runs_list", {
        agentId: agent.id,
        limit: LIST_LIMIT,
        offset: 0,
        includeEvents: true,
        includeActions: true,
      });
      setRuns(Array.isArray(result) ? (result as AgentRunDetail[]) : []);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [agent.id, rpc]);

  useEffect(() => {
    void reloadRuns();
  }, [reloadRuns]);

  const queueRun = async () => {
    if (!agent.currentVersionId) {
      setError("Deploy a version before queueing a run.");
      return;
    }
    setQueueing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await rawRpc(rpc).call(
        "agents_runs_queue",
        attachments.length === 0
          ? { agentId: agent.id }
          : { agentId: agent.id, input: { attachments } },
      );
      setAttachments([]);
      if (isRecord(result) && typeof result.id === "string") setSelectedRun(result as unknown as AgentRunDetail);
      setNotice("Run queued for the BB thread dispatcher.");
      await reloadRuns();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setQueueing(false);
    }
  };

  const openRun = async (id: string) => {
    setRunLoading(true);
    setError(null);
    try {
      const result = await rawRpc(rpc).call("agents_runs_get", { id });
      setSelectedRun(result as AgentRunDetail);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunLoading(false);
    }
  };

  return (
    <Section
      title="Run history"
      description="Inspect persisted runs, their event timeline, actions, and QA transition controls."
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => void reloadRuns()} disabled={loading}>
            <Icon name="RotateCcw" aria-hidden="true" />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => void queueRun()} disabled={queueing || !agent.currentVersionId}>
            <Icon name="Play" aria-hidden="true" />
            {queueing ? "Queueing…" : "Run now"}
          </Button>
        </>
      }
    >
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        Run now persists a <strong className="font-semibold">QUEUED</strong> run first. The background dispatcher starts a hidden BB thread when an eligible project is available.
      </div>
      <AgentAttachmentPicker
        agentId={agent.id}
        versionId={agent.currentVersionId}
        rpc={rpc}
        value={attachments}
        onChange={setAttachments}
        disabled={queueing || !agent.currentVersionId}
      />
      <InlineError message={error} />
      {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{notice}</p> : null}
      {loading && runs.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground" role="status">Loading run history…</div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon="Play"
          title="No runs yet"
          description={agent.currentVersionId ? "Queue a manual run to create a persisted run record." : "Deploy a version before queueing a run."}
          className="min-h-32 rounded-md"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <caption className="sr-only">Agent run history</caption>
            <thead className="border-b border-border-hairline text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">Run</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Trigger</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Created</th>
                <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-hairline">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-state-hover">
                  <td className="px-3 py-3 font-mono text-xs">{run.id}</td>
                  <td className="px-3 py-3"><StatusPill value={run.status} /></td>
                  <td className="px-3 py-3 text-muted-foreground">{statusLabel(run.triggerType)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(run.createdAt)}</td>
                  <td className="px-3 py-3 text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => void openRun(run.id)}>
                      {runLoading ? "Loading…" : "View run"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedRun ? (
        <RunDetailPanel
          run={selectedRun}
          rpc={rpc}
          onChanged={(next) => {
            setSelectedRun(next);
            void reloadRuns();
          }}
        />
      ) : null}
    </Section>
  );
}

function AuditHistory({
  agent,
  rpc,
}: {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
}) {
  const [events, setEvents] = useState<AgentAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rawRpc(rpc).call("agents_audit_list", {
        agentId: agent.id,
        limit: LIST_LIMIT,
        offset: 0,
      });
      setEvents(Array.isArray(result) ? (result as AgentAuditEvent[]) : []);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [agent.id, rpc]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Section
      title="Audit trail"
      description="Append-only lifecycle events make changes to definitions, versions, triggers, and runs reviewable."
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>
          <Icon name="RotateCcw" aria-hidden="true" />
          Refresh
        </Button>
      }
    >
      <InlineError message={error} />
      {loading && events.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground" role="status">Loading audit trail…</div>
      ) : events.length === 0 ? (
        <EmptyState icon="FileText" title="No audit events yet" description="Lifecycle changes will appear here as this agent is edited and operated." className="min-h-32 rounded-md" />
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {events.map((event) => (
            <li key={event.id} className="space-y-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{event.summary}</span>
                <time className="text-xs text-muted-foreground" dateTime={event.emittedAt}>{formatDate(event.emittedAt)}</time>
              </div>
              <p className="text-xs text-muted-foreground">{event.type} · {event.actorType}{event.actorId ? ` · ${event.actorId}` : ""}</p>
              {event.before !== null || event.after !== null ? (
                <details className="pt-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">View change</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div><p className="mb-1 text-muted-foreground">Before</p><pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px]">{prettyJson(event.before)}</pre></div>
                    <div><p className="mb-1 text-muted-foreground">After</p><pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px]">{prettyJson(event.after)}</pre></div>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function AgentDetailWorkspace({
  agent,
  rpc,
  onChanged,
  initialTab,
  onTabChange,
}: {
  agent: AgentDetail;
  rpc: AgentsRpcClient;
  onChanged: () => Promise<void>;
  initialTab?: string | null;
  onTabChange?: (tab: AgentTab, recordId: string) => void;
}) {
  const [tab, setTab] = useState<AgentTab>(() => normalizeAgentTab(initialTab));
  const [versionToEdit, setVersionToEdit] = useState<string | null>(null);
  const [sourceConversationId, setSourceConversationId] = useState<string | null>(null);
  const [draftInstructions, setDraftInstructions] = useState<string | null>(null);

  useEffect(() => {
    setTab(normalizeAgentTab(initialTab));
  }, [initialTab]);

  const changeTab = (next: AgentTab) => {
    setTab(next);
    onTabChange?.(next, agent.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label={`${agent.name} views`}>
        {AGENT_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
            onClick={() => changeTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="space-y-6">
          <MetadataEditor agent={agent} rpc={rpc} onChanged={onChanged} />
          <VersionEditor key={versionToEdit ?? "new-version"} agent={versionToEdit ? { ...agent, currentVersion: agent.versions.find((version) => version.id === versionToEdit) ?? agent.currentVersion } : agent} rpc={rpc} onChanged={onChanged} sourceConversationId={sourceConversationId} draftInstructions={draftInstructions} />
          <Section
            title="Operational summary"
            description="A quick read of the current definition before you move into version, trigger, or run operations."
          >
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1"><StatusPill value={agent.status} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">Current version</dt><dd className="mt-1 font-medium">{agent.currentVersion ? `v${agent.currentVersion.number}` : "Not deployed"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Runs</dt><dd className="mt-1 font-medium tabular-nums">{agent.runCount}</dd></div>
            </dl>
          </Section>
        </div>
      ) : null}
      {tab === "versions" ? (
        <div className="space-y-6">
          <Section title="Version history" description="Select a version to continue editing it in the draft editor.">
            <VersionHistory agent={agent} onSelect={(id) => { setVersionToEdit(id); setDraftInstructions(null); changeTab("overview"); }} />
          </Section>
          <p className="text-xs text-muted-foreground">The draft editor lives on Overview so metadata, validation, and deployment remain in one workspace.</p>
        </div>
      ) : null}
      {tab === "conversation" ? (
        <AgentBuilderConversation
          agent={agent}
          rpc={rpc}
          sourceConversationId={sourceConversationId}
          onUseVersionSource={(threadId) => {
            setSourceConversationId(threadId);
            setDraftInstructions(null);
            setVersionToEdit(null);
            changeTab("overview");
          }}
          onUseVersionDraft={(text, threadId) => {
            setSourceConversationId(threadId);
            setDraftInstructions(text);
            setVersionToEdit(null);
            changeTab("overview");
          }}
        />
      ) : null}
      {tab === "triggers" ? <TriggerWorkspace agent={agent} rpc={rpc} onChanged={onChanged} /> : null}
      {tab === "runs" ? <RunHistory agent={agent} rpc={rpc} /> : null}
      {tab === "audit" ? <AuditHistory agent={agent} rpc={rpc} /> : null}
    </div>
  );
}

function CreateAgentForm({
  value,
  error,
  saving,
  onChange,
  onSubmit,
}: {
  value: AgentFormValue;
  error: string | null;
  saving: boolean;
  onChange: (value: AgentFormValue) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form id="create-agent-form" className="space-y-5" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="create-agent-name">Agent name</label>
        <Input
          id="create-agent-name"
          required
          autoFocus
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="Renewal intelligence"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="create-agent-description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="create-agent-description"
          className={TEXTAREA_CLASS}
          maxLength={500}
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          placeholder="What should this agent monitor or produce?"
        />
      </div>
      <InlineError message={error} />
      {saving ? <p className="text-sm text-muted-foreground" role="status">Creating agent…</p> : null}
    </form>
  );
}

export interface AgentsViewProps {
  /** Optional route-selected agent id used for deep links from BB navigation. */
  initialRecordId?: string | null;
  /** Open the create-agent drawer from a routed header action. */
  initialCreate?: boolean;
  /** Optional detail tab persisted in the BB panel sub-path. */
  initialTab?: string | null;
  /** Called whenever the selected agent changes so the route stays shareable. */
  onRecordIdChange?: (recordId: string | null) => void;
  /** Clears a routed create action after the drawer closes or submits. */
  onCreateChange?: (open: boolean) => void;
  /** Called when the selected agent detail tab changes. */
  onTabChange?: (tab: AgentTab, recordId: string) => void;
  /** Narrow RPC client override used by previews and focused tests. */
  rpcClient?: AgentsRpcClient;
}

export function AgentsView({
  initialRecordId = null,
  initialCreate = false,
  initialTab,
  onRecordIdChange,
  onCreateChange,
  onTabChange,
  rpcClient,
}: AgentsViewProps) {
  const hostRpc = useAgentsRpc();
  const rpc = rpcClient ?? hostRpc;
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentDefinitionStatus | "ALL">("ALL");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialRecordId);
  const [selectedTab, setSelectedTab] = useState<AgentTab>(() => normalizeAgentTab(initialTab));
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(initialCreate);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [createValue, setCreateValue] = useState<AgentFormValue>({ name: "", description: "" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const input: AgentListInput = {
      search: query,
      includeArchived,
      archivedOnly: false,
      limit: LIST_LIMIT,
      offset: 0,
      ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
    };
    try {
      const result = await rawRpc(rpc).call("agents_list", input);
      setAgents(Array.isArray(result) ? (result as AgentListItem[]) : []);
    } catch (cause) {
      setListError(errorMessage(cause));
    } finally {
      setListLoading(false);
    }
  }, [includeArchived, query, rpc, statusFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setSelectedId(initialRecordId ?? null);
  }, [initialRecordId]);

  useEffect(() => {
    setSelectedTab(normalizeAgentTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    setCreateError(null);
    setCreateOpen(initialCreate);
  }, [initialCreate]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const result = await rawRpc(rpc).call("agents_get", { id });
      setDetail(result as AgentDetail);
    } catch (cause) {
      setDetail(null);
      setDetailError(errorMessage(cause));
    } finally {
      setDetailLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    void loadDetail(selectedId);
  }, [detailRefreshKey, loadDetail, selectedId]);

  const openAgent = (id: string, tab: AgentTab = "overview") => {
    setSelectedId(id);
    setSelectedTab(tab);
    onRecordIdChange?.(id);
  };

  const openBuilder = (id: string) => {
    setBuilderOpen(false);
    void loadList();
    setSelectedId(id);
    setSelectedTab("conversation");
    // A tab callback carries both the record and the visible builder tab in
    // one route update. A bare record callback remains a useful fallback for
    // previews that do not wire tab-aware routing.
    if (onTabChange) onTabChange("conversation", id);
    else onRecordIdChange?.(id);
  };

  const closeAgent = () => {
    setSelectedId(null);
    setSelectedTab("overview");
    setDetail(null);
    onRecordIdChange?.(null);
  };

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateError(null);
    onCreateChange?.(false);
  }, [onCreateChange]);

  const reloadDetail = useCallback(async () => {
    if (!selectedId) return;
    await loadDetail(selectedId);
    await loadList();
  }, [loadDetail, loadList, selectedId]);

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createValue.name.trim();
    if (!name) {
      setCreateError("Agent name is required.");
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const result = await rawRpc(rpc).call("agents_create", {
        name,
        description: createValue.description.trim() || null,
      });
      const created = result as AgentDefinition;
      closeCreate();
      setCreateValue({ name: "", description: "" });
      await loadList();
      if (created.id) openAgent(created.id);
    } catch (cause) {
      setCreateError(errorMessage(cause));
    } finally {
      setCreateSaving(false);
    }
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-background text-foreground">
      <PageHeader
        title="Agents"
        description="Build, version, and monitor the CRM agents that operate in your workspace."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBuilderOpen(true)}
          >
            <Icon name="Brain" aria-hidden="true" />
            Build with BB
          </Button>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <ListToolbar
          aria-label="Agent table controls"
          summary={<p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {agents.length} {agents.length === 1 ? "agent" : "agents"}
          </p>}
        >
          <SearchField
            label="Search agents"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            placeholder="Search agents…"
            containerClassName="w-full sm:w-56"
          />
          <label className="sr-only" htmlFor="agent-status-filter">Filter agents by status</label>
          <select
            id="agent-status-filter"
            className={`${SELECT_CLASS} w-auto min-w-36`}
            aria-label="Filter agents by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as AgentDefinitionStatus | "ALL")}
          >
            <option value="ALL">All statuses</option>
            {AGENT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
          <TooltipIconButton
            label="Include archived agents"
            icon="Archive"
            variant={includeArchived ? "secondary" : "outline"}
            aria-pressed={includeArchived}
            onClick={() => setIncludeArchived((current) => !current)}
          />
        </ListToolbar>
        {listError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <span>{listError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadList()}>Retry</Button>
          </div>
        ) : null}
        <TableShell
          caption="Agents"
          columns={[
            { id: "agent", label: "Agent", className: "min-w-56" },
            { id: "status", label: "Status", className: "min-w-28" },
            { id: "version", label: "Version", className: "min-w-36" },
            { id: "runs", label: "Runs", className: "text-right" },
            { id: "updated", label: "Updated", className: "min-w-40" },
          ]}
          loading={listLoading}
          empty={
            <EmptyState
              icon="Brain"
              title={query || statusFilter !== "ALL" || includeArchived ? "No matching agents" : "No agents yet"}
              description={query || statusFilter !== "ALL" || includeArchived ? "Try a different search or status filter." : "Use New in the BB action bar to create your first agent."}
              action={query || statusFilter !== "ALL" || includeArchived ? (
                <Button type="button" variant="outline" size="sm" onClick={() => { setQuery(""); setStatusFilter("ALL"); setIncludeArchived(false); }}>Clear filters</Button>
              ) : undefined}
              className="min-h-48 rounded-none border-0 bg-transparent"
            />
          }
        >
          {agents.map((agent) => <AgentListRow key={agent.id} agent={agent} onOpen={openAgent} />)}
        </TableShell>
      </div>

      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-h-[min(52rem,calc(100vh-2rem))] max-w-4xl overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Build an agent with BB</DialogTitle>
            <DialogDescription>
              Describe an automation and open a private BB builder conversation.
            </DialogDescription>
          </DialogHeader>
          <AgentBuilderHome
            rpc={rpc}
            onOpenBuilder={openBuilder}
            className="border-b-0 bg-background"
          />
        </DialogContent>
      </Dialog>

      <RecordDrawer
        open={selectedId !== null}
        onOpenChange={(open) => { if (!open) closeAgent(); }}
        title={detail?.name ?? "Agent"}
        description={detail ? `${statusLabel(detail.status)} · ${detail.id}` : "Agent details"}
        actions={detail ? <LifecycleActions agent={detail} rpc={rpc} onChanged={reloadDetail} onDeleted={closeAgent} /> : undefined}
        className="sm:w-[min(72rem,calc(100vw-1.5rem))]"
        bodyClassName="px-5 py-4 sm:px-7"
      >
        {detailLoading ? (
          <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground" role="status">Loading agent…</div>
        ) : detailError ? (
          <EmptyState
            icon="Brain"
            title="Could not load agent"
            description={detailError}
            action={<Button type="button" variant="outline" onClick={() => setDetailRefreshKey((key) => key + 1)}>Retry</Button>}
          />
        ) : detail ? (
          <AgentDetailWorkspace
            agent={detail}
            rpc={rpc}
            onChanged={reloadDetail}
            initialTab={selectedTab}
            onTabChange={(tab, recordId) => {
              setSelectedTab(tab);
              onTabChange?.(tab, recordId);
            }}
          />
        ) : (
          <EmptyState icon="Brain" title="Agent not found" description="The selected agent may have been removed or archived." />
        )}
      </RecordDrawer>

      <RecordDrawer
        open={createOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateError(null);
            setCreateOpen(true);
          } else {
            closeCreate();
          }
        }}
        title="New agent"
        description="Create a definition first, then add a version and deploy it from the detail workspace."
        footer={
          <>
            <Button type="button" variant="outline" disabled={createSaving} onClick={closeCreate}>Cancel</Button>
            <Button type="submit" form="create-agent-form" disabled={createSaving}>{createSaving ? "Creating…" : "Create agent"}</Button>
          </>
        }
      >
        <CreateAgentForm value={createValue} error={createError} saving={createSaving} onChange={setCreateValue} onSubmit={submitCreate} />
      </RecordDrawer>
    </div>
  );
}
