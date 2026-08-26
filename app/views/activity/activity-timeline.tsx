import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import {
  type ActivityCreateInput,
  type ActivityEntry,
  type ActivityType,
  type ComposableActivityType,
  type Id,
  type TimelineCountsOutput,
  type TimelineFilter,
  type TimelineInput,
  type TimelineOutput,
} from "../../../contracts/core.js";
import { EmptyState } from "../../components/index.js";
import { cn } from "../../../lib/utils.js";
import { useActivityRpc, type ActivityRpcClient } from "./rpc.js";

const PAGE_SIZE = 30;
const DEFAULT_CREATED_BY_ID = "local_user" as Id;

/** The user-facing source tabs intentionally omit the backend-only history filter. */
export type ActivitySourceTab =
  | "all"
  | "notes"
  | "email"
  | "meetings"
  | "upcoming"
  | "done";

export type ActivityAnchor =
  | { companyId: Id; contactId?: never; dealId?: never }
  | { contactId: Id; companyId?: never; dealId?: never }
  | { dealId: Id; companyId?: never; contactId?: never };

export interface ActivityTimelineProps {
  /** Exactly one CRM record anchors the timeline. */
  anchor: ActivityAnchor;
  /** Optional injection keeps host previews and tests independent of BB runtime. */
  rpcClient?: ActivityRpcClient;
  /** BB does not currently expose plugin identity to the app SDK. */
  createdById?: Id;
  /** Embedded timelines can override the default heading and supporting copy. */
  title?: string;
  description?: string;
  className?: string;
  /** Opens a related record while the owning view preserves its drawer/navigation model. */
  onOpenRelatedRecord?: (kind: "company" | "contact" | "deal", id: Id) => void;
}

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_CLASS =
  "flex min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const ACTIVITY_TYPE_OPTIONS: ReadonlyArray<{
  id: ComposableActivityType;
  label: string;
}> = [
  { id: "NOTE", label: "Note" },
  { id: "CALL", label: "Call" },
  { id: "EMAIL", label: "Email" },
  { id: "MEETING", label: "Meeting" },
  { id: "TASK", label: "Task" },
];

const SOURCE_TABS: ReadonlyArray<{
  id: ActivitySourceTab;
  label: string;
  countKey: keyof TimelineCountsOutput;
}> = [
  { id: "all", label: "All", countKey: "all" },
  { id: "notes", label: "Notes", countKey: "notes" },
  { id: "email", label: "Email", countKey: "email" },
  { id: "meetings", label: "Meetings", countKey: "meetings" },
  { id: "upcoming", label: "Upcoming", countKey: "upcoming" },
  { id: "done", label: "Done", countKey: "done" },
];

const ACTIVITY_TYPE_META: Record<
  ActivityType,
  { label: string; icon: React.ComponentProps<typeof Icon>["name"] }
> = {
  NOTE: { label: "Note", icon: "FileText" },
  CALL: { label: "Call", icon: "Mic" },
  EMAIL: { label: "Email", icon: "Mail" },
  MEETING: { label: "Meeting", icon: "Calendar" },
  TASK: { label: "Task", icon: "ListTodo" },
  STAGE_CHANGE: { label: "Stage change", icon: "ArrowReloadHorizontal" },
  ENRICHMENT: { label: "Enrichment", icon: "Zap" },
};

interface AnchorInput {
  companyId?: Id;
  contactId?: Id;
  dealId?: Id;
}

interface ComposerValue {
  type: ComposableActivityType;
  subject: string;
  body: string;
  dueAt: string;
}

interface DayGroup {
  key: string;
  label: string;
  entries: readonly ActivityEntry[];
}

const EMPTY_COMPOSER: ComposerValue = {
  type: "NOTE",
  subject: "",
  body: "",
  dueAt: "",
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function anchorToInput(anchor: ActivityAnchor): AnchorInput {
  if ("companyId" in anchor) return { companyId: anchor.companyId };
  if ("contactId" in anchor) return { contactId: anchor.contactId };
  return { dealId: anchor.dealId };
}

function hasAnchor(input: AnchorInput): boolean {
  return Boolean(input.companyId || input.contactId || input.dealId);
}

function timelineInput(
  anchor: AnchorInput,
  filter: ActivitySourceTab,
  cursor?: string,
): TimelineInput {
  const value: TimelineInput = {
    ...anchor,
    filter,
    limit: PAGE_SIZE,
  };
  if (cursor) value.cursor = cursor;
  return value;
}

function activityTimestamp(entry: ActivityEntry): number {
  const value = entry.occurredAt ?? entry.createdAt;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

const DEAL_STAGE_LABELS: Record<string, string> = {
  DEMO_BOOKED: "Demo booked",
  QUALIFIED_TO_BUY: "Qualified to buy",
  UNQUALIFIED_TO_BUY: "Unqualified to buy",
  DECISION_MAKER_BOUGHT_IN: "Decision maker bought in",
  CONTRACT_SENT: "Contract sent",
  CLOSED_WON: "Closed won",
  CLOSED_LOST: "Closed lost",
};

const ENRICHMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETE: "Complete",
  FAILED: "Failed",
  SKIPPED: "Skipped",
};

function metaText(entry: ActivityEntry, key: string): string | null {
  const value = entry.meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function titleCaseToken(value: string): string {
  return value
    .toLowerCase()
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stageLabel(value: string): string {
  return DEAL_STAGE_LABELS[value] ?? titleCaseToken(value);
}

function enrichmentStatusLabel(value: string): string {
  return ENRICHMENT_STATUS_LABELS[value] ?? titleCaseToken(value);
}

function activityTitle(entry: ActivityEntry): string {
  const fallback = ACTIVITY_TYPE_META[entry.type].label;
  const subject = entry.subject?.trim();
  if (entry.type === "STAGE_CHANGE") {
    const from = metaText(entry, "from") ?? metaText(entry, "fromStage");
    const to = metaText(entry, "to") ?? metaText(entry, "toStage");
    if (from && to) return `${stageLabel(from)} → ${stageLabel(to)}`;
    if (to) return `Stage changed to ${stageLabel(to)}`;
  }
  if (entry.type === "ENRICHMENT") {
    const from = metaText(entry, "from") ?? metaText(entry, "fromStatus");
    const to = metaText(entry, "to") ?? metaText(entry, "toStatus");
    if (from && to) {
      return `${enrichmentStatusLabel(from)} → ${enrichmentStatusLabel(to)}`;
    }
    if (to) return `Enrichment ${enrichmentStatusLabel(to)}`;
  }
  return subject || fallback;
}

function isNoteLikeActivityType(type: ActivityType): boolean {
  return type === "NOTE" || type === "CALL" || type === "EMAIL" || type === "MEETING";
}

function mergeEntries(
  current: readonly ActivityEntry[],
  incoming: readonly ActivityEntry[],
): ActivityEntry[] {
  const byId = new Map<string, ActivityEntry>();
  [...current, ...incoming].forEach((entry) => byId.set(entry.id, entry));
  return [...byId.values()].sort(
    (left, right) => {
      const timestampDifference = activityTimestamp(right) - activityTimestamp(left);
      return timestampDifference === 0 ? right.id.localeCompare(left.id) : timestampDifference;
    },
  );
}

function localDateKey(value: string | null | undefined): string {
  if (!value) return "undated";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "undated";
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function dateGroupLabel(key: string): string {
  if (key === "undated") return "Undated";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.valueOf())) return "Undated";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function groupEntries(entries: readonly ActivityEntry[]): DayGroup[] {
  const groups = new Map<string, ActivityEntry[]>();
  entries.forEach((entry) => {
    const key = localDateKey(entry.occurredAt ?? entry.createdAt);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  });
  return [...groups.entries()].map(([key, groupedEntries]) => ({
    key,
    label: dateGroupLabel(key),
    entries: groupedEntries,
  }));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
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

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function normalizeDateTime(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizeText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function activityMatchesFilter(
  entry: ActivityEntry,
  filter: ActivitySourceTab,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "notes":
      return ["NOTE", "CALL", "EMAIL", "MEETING"].includes(entry.type);
    case "email":
      return entry.type === "EMAIL";
    case "meetings":
      return entry.type === "MEETING";
    case "upcoming":
      return entry.type === "TASK" && entry.completedAt === null;
    case "done":
      return entry.type === "TASK" && entry.completedAt !== null;
  }
}

function countFor(
  counts: TimelineCountsOutput | null,
  tab: (typeof SOURCE_TABS)[number],
): number | undefined {
  return counts?.[tab.countKey];
}

function Composer({
  anchor,
  createdById,
  rpc,
  onCreated,
}: {
  anchor: AnchorInput;
  createdById: Id;
  rpc: ActivityRpcClient;
  onCreated: (entry: ActivityEntry) => void;
}) {
  const formId = useId();
  const [value, setValue] = useState<ComposerValue>(EMPTY_COMPOSER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selectedType = ACTIVITY_TYPE_OPTIONS.find(
    (option) => option.id === value.type,
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const subject = normalizeText(value.subject);
    if (value.type === "TASK" && !subject) {
      setError("Tasks need a subject.");
      setSavedMessage(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    const input: ActivityCreateInput = {
      ...anchor,
      type: value.type,
      createdById,
    };
    if (subject) input.subject = subject;
    const body = normalizeText(value.body);
    if (body) input.body = body;
    if (value.type === "TASK") input.dueAt = normalizeDateTime(value.dueAt);
    try {
      const created = await rpc.call("activity_create", input);
      onCreated(created);
      setValue(EMPTY_COMPOSER);
      setSavedMessage(`${selectedType?.label ?? "Activity"} added.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-4 border-b border-border pb-5"
      aria-label="Add activity"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Add activity</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Capture the next touchpoint on this record.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          Created by {createdById}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${formId}-type`}>
            Type
          </label>
          <select
            id={`${formId}-type`}
            className={SELECT_CLASS}
            value={value.type}
            disabled={saving}
            onChange={(event) => {
              const type = event.target.value as ComposableActivityType;
              setValue((current) => ({ ...current, type }));
              setError(null);
              setSavedMessage(null);
            }}
          >
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${formId}-subject`}>
            Subject
            {value.type === "TASK" ? (
              <span className="font-normal"> (required)</span>
            ) : (
              <span className="font-normal"> (optional)</span>
            )}
          </label>
          <Input
            id={`${formId}-subject`}
            value={value.subject}
            required={value.type === "TASK"}
            disabled={saving}
            onChange={(event) => {
              setValue((current) => ({ ...current, subject: event.target.value }));
              setError(null);
              setSavedMessage(null);
            }}
            placeholder={value.type === "TASK" ? "Send a follow-up" : "Short summary"}
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${formId}-body`}>
          Details <span className="font-normal">(optional)</span>
        </label>
        <textarea
          id={`${formId}-body`}
          className={TEXTAREA_CLASS}
          rows={3}
          value={value.body}
          disabled={saving}
          onChange={(event) => {
            setValue((current) => ({ ...current, body: event.target.value }));
            setError(null);
            setSavedMessage(null);
          }}
          placeholder="Add context for the next person who opens this record."
        />
      </div>
      {value.type === "TASK" ? (
        <div className="max-w-xs space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${formId}-due-at`}>
            Due date <span className="font-normal">(optional)</span>
          </label>
          <Input
            id={`${formId}-due-at`}
            type="datetime-local"
            value={value.dueAt}
            disabled={saving}
            onChange={(event) =>
              setValue((current) => ({ ...current, dueAt: event.target.value }))
            }
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-5">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : savedMessage ? (
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              {savedMessage}
            </p>
          ) : saving ? (
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              Adding activity…
            </p>
          ) : null}
        </div>
        <Button type="submit" size="sm" disabled={saving}>
          <Icon name="Plus" aria-hidden="true" />
          {saving ? "Adding…" : "Add activity"}
        </Button>
      </div>
    </form>
  );
}

function TimelineEntry({
  entry,
  anchor,
  completingId,
  onComplete,
  onOpenRelatedRecord,
}: {
  entry: ActivityEntry;
  anchor: AnchorInput;
  completingId: string | null;
  onComplete: (entry: ActivityEntry) => void;
  onOpenRelatedRecord?: ActivityTimelineProps["onOpenRelatedRecord"];
}) {
  const meta = ACTIVITY_TYPE_META[entry.type];
  const isTask = entry.type === "TASK";
  const isComplete = entry.completedAt !== null;
  const subject = activityTitle(entry);
  const completionLabel = isComplete ? "Reopen task" : "Complete task";
  const completionBusy = completingId === entry.id;
  const relations = [
    entry.company && entry.company.id !== anchor.companyId
      ? { kind: "company" as const, id: entry.company.id, label: entry.company.name }
      : null,
    entry.contact && entry.contact.id !== anchor.contactId
      ? {
          kind: "contact" as const,
          id: entry.contact.id,
          label: [entry.contact.firstName, entry.contact.lastName].filter(Boolean).join(" "),
        }
      : null,
    entry.deal && entry.deal.id !== anchor.dealId
      ? { kind: "deal" as const, id: entry.deal.id, label: entry.deal.name }
      : null,
  ].filter((relation): relation is NonNullable<typeof relation> => relation !== null);

  return (
    <li className="relative pl-10">
      <span
        className="absolute left-0 top-0 flex size-7 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <Icon name={meta.icon} className="size-3.5" />
      </span>
      <article className="space-y-2 border-b border-border-hairline pb-4 last:border-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{subject}</h4>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {meta.label}
            </span>
            {isTask && isComplete ? (
              <span className="text-xs text-muted-foreground">Done</span>
            ) : null}
          </div>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            dateTime={entry.occurredAt ?? entry.createdAt}
          >
            {formatDateTime(entry.occurredAt ?? entry.createdAt)}
          </time>
        </div>
        {entry.body ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {entry.body}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span>By {entry.createdBy.name}</span>
          {entry.dueAt ? (
            <time dateTime={entry.dueAt}>
              Due {formatDateOnly(entry.dueAt)}
            </time>
          ) : null}
          {isTask ? (
            <Button
              type="button"
              variant={isComplete ? "ghost" : "outline"}
              size="sm"
              aria-pressed={isComplete}
              aria-label={`${completionLabel}: ${subject}`}
              disabled={completionBusy}
              onClick={() => onComplete(entry)}
            >
              <Icon
                name={isComplete ? "CircleCheck" : "Circle"}
                aria-hidden="true"
              />
              {completionBusy ? "Saving…" : completionLabel}
            </Button>
          ) : null}
          {onOpenRelatedRecord === undefined
            ? null
            : relations.map((relation) => (
                <button
                  key={`${relation.kind}-${relation.id}`}
                  type="button"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={() => onOpenRelatedRecord(relation.kind, relation.id)}
                >
                  {relation.label}
                </button>
              ))}
        </div>
      </article>
    </li>
  );
}

function LoadingTimeline() {
  return (
    <div className="space-y-3 py-10 text-center" role="status" aria-live="polite">
      <Icon name="Loading" aria-hidden="true" className="mx-auto size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading activity…</p>
    </div>
  );
}

export function ActivityTimeline({
  anchor,
  rpcClient,
  createdById = DEFAULT_CREATED_BY_ID,
  title = "Activity timeline",
  description = "Notes, touchpoints, and follow-up work for this record.",
  className,
  onOpenRelatedRecord,
}: ActivityTimelineProps) {
  const contextRpc = useActivityRpc();
  const rpc = rpcClient ?? contextRpc;
  const anchorInput = useMemo(
    () => anchorToInput(anchor),
    [anchor.companyId, anchor.contactId, anchor.dealId],
  );
  const anchorKey = useMemo(
    () => `${anchorInput.companyId ?? ""}:${anchorInput.contactId ?? ""}:${anchorInput.dealId ?? ""}`,
    [anchorInput.companyId, anchorInput.contactId, anchorInput.dealId],
  );
  const timelineId = useId();
  const [filter, setFilter] = useState<ActivitySourceTab>("all");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [outstandingTasks, setOutstandingTasks] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<TimelineCountsOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const olderSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    if (!hasAnchor(anchorInput)) {
      setEntries([]);
      setNextCursor(null);
      setLoading(false);
      setError("Choose a company, contact, or deal to view activity.");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError(null);
    setEntries([]);
    setOutstandingTasks([]);
    setNextCursor(null);
    const timelineRequest = rpc.call("activity_timeline", timelineInput(anchorInput, filter));
    const outstandingRequest = filter === "all"
      ? rpc.call("activity_timeline", { ...anchorInput, filter: "upcoming", limit: 100 })
      : Promise.resolve({ entries: [], nextCursor: null } satisfies TimelineOutput);
    void Promise.all([timelineRequest, outstandingRequest])
      .then(([result, outstanding]: [TimelineOutput, TimelineOutput]) => {
        if (!active) return;
        setEntries(mergeEntries([], result.entries));
        setOutstandingTasks(
          mergeEntries([], outstanding.entries).filter(
            (entry) => entry.type === "TASK" && entry.completedAt === null,
          ),
        );
        setNextCursor(result.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [anchorInput, anchorKey, filter, refreshKey, rpc]);

  useEffect(() => {
    let active = true;
    if (!hasAnchor(anchorInput)) {
      setCounts(null);
      setCountsError(null);
      return () => {
        active = false;
      };
    }
    setCountsError(null);
    void rpc
      .call("activity_timelineCounts", anchorInput)
      .then((result: TimelineCountsOutput) => {
        if (active) setCounts(result);
      })
      .catch((cause: unknown) => {
        if (active) setCountsError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [anchorInput, anchorKey, refreshKey, rpc]);

  const groupedEntries = useMemo(
    () => groupEntries(
      filter === "all"
        ? entries.filter((entry) => entry.type !== "TASK" || entry.completedAt !== null)
        : entries,
    ),
    [entries, filter],
  );

  const onCreated = useCallback(
    (entry: ActivityEntry) => {
      if (activityMatchesFilter(entry, filter)) {
        setEntries((current) => mergeEntries([entry], current));
      }
      if (filter === "all" && entry.type === "TASK" && entry.completedAt === null) {
        setOutstandingTasks((current) => mergeEntries([entry], current));
      }
      setCounts((current) => {
        if (!current) return current;
        const next = { ...current, all: current.all + 1 };
        if (isNoteLikeActivityType(entry.type)) next.notes += 1;
        if (entry.type === "EMAIL") next.email += 1;
        if (entry.type === "MEETING") next.meetings += 1;
        if (entry.type === "TASK" && entry.completedAt === null) next.upcoming += 1;
        if (entry.type === "TASK" && entry.completedAt !== null) next.done += 1;
        return next;
      });
    },
    [filter],
  );

  const onComplete = useCallback(
    async (entry: ActivityEntry) => {
      if (entry.type !== "TASK") return;
      setCompletingId(entry.id);
      setError(null);
      try {
        const updated = await rpc.call("activity_complete", {
          id: entry.id,
          completed: entry.completedAt === null,
        });
        setEntries((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        setOutstandingTasks((current) =>
          updated.completedAt === null
            ? mergeEntries(current, [updated])
            : current.filter((item) => item.id !== updated.id),
        );
        setCounts((current) => {
          if (!current) return current;
          const wasDone = entry.completedAt !== null;
          const isDone = updated.completedAt !== null;
          if (wasDone === isDone) return current;
          return {
            ...current,
            upcoming: Math.max(0, current.upcoming + (isDone ? -1 : 1)),
            done: Math.max(0, current.done + (isDone ? 1 : -1)),
          };
        });
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setCompletingId(null);
      }
    },
    [rpc],
  );

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder || loading) return;
    setLoadingOlder(true);
    setError(null);
    try {
      const result = await rpc.call(
        "activity_timeline",
        timelineInput(anchorInput, filter, nextCursor),
      );
      setEntries((current) => mergeEntries(current, result.entries));
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingOlder(false);
    }
  }, [anchorInput, filter, loading, loadingOlder, nextCursor, rpc]);

  useEffect(() => {
    if (!nextCursor || loading || loadingOlder) return;
    const target = olderSentinelRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (observations) => {
        if (observations.some((observation) => observation.isIntersecting)) {
          void loadOlder();
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadOlder, loading, loadingOlder, nextCursor]);

  return (
    <section
      className={cn("min-w-0 space-y-5", className)}
      aria-labelledby={`${timelineId}-title`}
    >
      <header className="space-y-1">
        <h2 id={`${timelineId}-title`} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <div
        className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Activity source"
      >
        {SOURCE_TABS.map((tab) => {
          const count = countFor(counts, tab);
          return (
            <Button
              key={tab.id}
              type="button"
              role="tab"
              variant={filter === tab.id ? "secondary" : "ghost"}
              size="sm"
              aria-selected={filter === tab.id}
              aria-controls={`${timelineId}-entries`}
              onClick={() => {
                setFilter(tab.id);
                setError(null);
              }}
            >
              {tab.label}
              {count === undefined ? null : (
                <span className="tabular-nums text-xs text-muted-foreground">
                  {count}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {countsError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs" role="alert">
          <span className="text-muted-foreground">Activity counts unavailable: {countsError}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
            Retry
          </Button>
        </div>
      ) : null}

      <Composer
        anchor={anchorInput}
        createdById={createdById?.trim() ? createdById : DEFAULT_CREATED_BY_ID}
        rpc={rpc}
        onCreated={onCreated}
      />

      <div
        id={`${timelineId}-entries`}
        className="min-w-0"
        role="region"
        aria-label={`${title} entries`}
        aria-busy={loading || loadingOlder || undefined}
      >
        {filter === "all" && outstandingTasks.length > 0 ? (
          <section className="mb-6 rounded-lg border border-border bg-muted/20 p-4" aria-labelledby={`${timelineId}-outstanding`}>
            <div className="mb-3 flex items-center gap-2">
              <Icon name="ListTodo" aria-hidden="true" className="size-4 text-muted-foreground" />
              <h3 id={`${timelineId}-outstanding`} className="text-sm font-semibold">Outstanding</h3>
              <span className="text-xs tabular-nums text-muted-foreground">{outstandingTasks.length}</span>
            </div>
            <ol className="space-y-4">
              {outstandingTasks.map((entry) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  anchor={anchorInput}
                  completingId={completingId}
                  onComplete={(value) => void onComplete(value)}
                  onOpenRelatedRecord={onOpenRelatedRecord}
                />
              ))}
            </ol>
          </section>
        ) : null}
        {error && entries.length === 0 && !loading ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <LoadingTimeline />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="Clock"
            title={`No ${SOURCE_TABS.find((tab) => tab.id === filter)?.label.toLowerCase() ?? "activity"} yet`}
            description="New notes, touchpoints, and follow-up tasks will appear here."
            className="min-h-40 border-0 bg-transparent"
          />
        ) : (
          <div className="space-y-6">
            {error ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                <span>{error}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
                  Retry
                </Button>
              </div>
            ) : null}
            {groupedEntries.map((group) => (
              <section key={group.key} aria-labelledby={`${timelineId}-day-${group.key}`}>
                <h3
                  id={`${timelineId}-day-${group.key}`}
                  className="sticky top-0 z-10 mb-3 bg-background/95 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur"
                >
                  {group.label}
                </h3>
                <ol className="space-y-4">
                  {group.entries.map((entry) => (
                    <TimelineEntry
                      key={entry.id}
                      entry={entry}
                      anchor={anchorInput}
                      completingId={completingId}
                      onComplete={(value) => void onComplete(value)}
                      onOpenRelatedRecord={onOpenRelatedRecord}
                    />
                  ))}
                </ol>
              </section>
            ))}
            {nextCursor ? (
              <div className="space-y-2 pt-1">
                <div
                  ref={olderSentinelRef}
                  data-testid="older-activity-sentinel"
                  className="h-px w-full"
                  aria-hidden="true"
                />
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingOlder}
                    onClick={() => void loadOlder()}
                  >
                    <Icon name="ArrowDown" aria-hidden="true" />
                    {loadingOlder ? "Loading older…" : "Load older activity"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
