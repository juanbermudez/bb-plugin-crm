import { useEffect, useRef, useState } from "react";

import { useRpc } from "@get-bb/plugin-sdk/app";

import {
  type EnrichmentQueueOutput,
  type EnrichmentQueueRow,
  type EnrichmentQueueScheduledRow,
  type EnrichmentQueueSubject,
} from "../../contracts/enrichment-queue.js";
import { rpcContract } from "../../contracts/rpc.js";
import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip.js";
import { cn } from "../../lib/utils.js";

export type EnrichmentQueueRpcClient = {
  call(method: "enrichment_queue", input: { limit: number }): Promise<EnrichmentQueueOutput>;
};

export interface EnrichmentQueueProps {
  rpcClient?: EnrichmentQueueRpcClient;
  onOpen?: (subject: EnrichmentQueueSubject) => void;
  compact?: boolean;
  triggerClassName?: string;
  className?: string;
}

const EMPTY_QUEUE: EnrichmentQueueOutput = {
  rows: [],
  total: 0,
  scheduled: [],
  scheduledTotal: 0,
};

function subjectLabel(subject: EnrichmentQueueSubject): string {
  return subject.name;
}

function statusLabel(state: EnrichmentQueueRow["state"]): string {
  return state === "running" ? "Running" : state === "failed" ? "Failed" : "Queued";
}

function timestampLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function subjectIcon(subject: EnrichmentQueueSubject): "UserRound" | "Layers" | "Target" | "Brain" | "ListTodo" {
  if (subject.kind === "contact") return "UserRound";
  if (subject.kind === "company") return "Layers";
  if (subject.kind === "deal") return "Target";
  if (subject.kind === "agent") return "Brain";
  return "ListTodo";
}

function QueueSubjectButton({
  subject,
  onOpen,
  children,
}: {
  subject: EnrichmentQueueSubject;
  onOpen?: (subject: EnrichmentQueueSubject) => void;
  children: React.ReactNode;
}) {
  const canOpen = subject.kind !== "task" || subject.related !== null;
  if (!onOpen || !canOpen) {
    return <div className="min-w-0">{children}</div>;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto min-w-0 justify-start px-1 py-0 text-left"
      onClick={() => onOpen(subject)}
      aria-label={`Open ${subject.kind} ${subjectLabel(subject)}`}
    >
      {children}
    </Button>
  );
}

function QueueRow({ row, onOpen }: { row: EnrichmentQueueRow; onOpen?: EnrichmentQueueProps["onOpen"] }) {
  const label = subjectLabel(row.subject);
  return (
    <li className="flex items-start gap-2 rounded-md px-1 py-2 hover:bg-state-hover">
      <Icon name={subjectIcon(row.subject)} className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <QueueSubjectButton subject={row.subject} onOpen={onOpen}>
          <span className="truncate font-medium">{label}</span>
        </QueueSubjectButton>
        <p className="truncate text-xs text-muted-foreground">{row.line}</p>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{statusLabel(row.state)}</span>
          <span aria-hidden="true"> · </span>
          <time dateTime={row.finishedAt ?? row.startedAt ?? row.createdAt}>
            {timestampLabel(row.finishedAt ?? row.startedAt ?? row.createdAt)}
          </time>
        </p>
      </div>
    </li>
  );
}

function ScheduledRow({
  row,
  onOpen,
}: {
  row: EnrichmentQueueScheduledRow;
  onOpen?: EnrichmentQueueProps["onOpen"];
}) {
  return (
    <li className="flex items-start gap-2 rounded-md px-1 py-2 hover:bg-state-hover">
      <Icon name="TimeSchedule" className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <QueueSubjectButton subject={row.subject} onOpen={onOpen}>
          <span className="truncate font-medium">{subjectLabel(row.subject)}</span>
        </QueueSubjectButton>
        <p className="truncate text-xs text-muted-foreground">{row.line}</p>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Due</span>
          <span aria-hidden="true"> · </span>
          <time dateTime={row.due}>{timestampLabel(row.due)}</time>
        </p>
      </div>
    </li>
  );
}

/**
 * The shell-level queue is intentionally sourced only from persisted local
 * agent runs and CRM tasks. It exposes work state, not claims that a provider
 * lookup or external sync completed.
 */
export function EnrichmentQueue({
  rpcClient,
  onOpen,
  compact = false,
  triggerClassName,
  className,
}: EnrichmentQueueProps) {
  const contextRpc = useRpc<typeof rpcContract>() as unknown as EnrichmentQueueRpcClient;
  const rpc = rpcClient ?? contextRpc;
  const [queue, setQueue] = useState<EnrichmentQueueOutput>(EMPTY_QUEUE);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      setLoading(true);
      void rpc.call("enrichment_queue", { limit: 25 })
        .then((next) => {
          if (!active) return;
          setQueue(next);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    refresh();
    const interval = window.setInterval(refresh, open ? 5_000 : 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [open, rpc]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const visibleCount = queue.total + queue.scheduledTotal;
  const openSubject = (subject: EnrichmentQueueSubject) => {
    onOpen?.(subject);
    setOpen(false);
  };
  const triggerLabel = `Enrichment queue${visibleCount > 0 ? `, ${visibleCount} items` : ""}`;
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon" : "sm"}
      className={cn(compact && "size-8 text-muted-foreground", triggerClassName)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls="enrichment-queue-dialog"
      aria-label={triggerLabel}
      ref={triggerRef}
      onClick={() => setOpen((current) => !current)}
    >
      <Icon name="Zap" aria-hidden="true" />
      {compact ? null : "Enrichment"}
      {visibleCount > 0 ? (
        <span className={compact
          ? "absolute right-0.5 top-0.5 size-1.5 rounded-full bg-foreground ring-2 ring-background"
          : "rounded-full bg-secondary px-1.5 text-[11px] leading-5 text-secondary-foreground"}
          aria-hidden={compact ? "true" : undefined}
        >
          {compact ? null : visibleCount}
        </span>
      ) : null}
    </Button>
  );
  return (
    <div className={`relative ${className ?? ""}`}>
      {compact ? (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="top">{triggerLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : trigger}
      {open ? (
        <div
          id="enrichment-queue-dialog"
          ref={panelRef}
          className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-background shadow-lg"
          role="dialog"
          aria-label="Enrichment queue"
        >
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Enrichment queue</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Local BB agent and CRM task records.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close enrichment queue"
                ref={closeRef}
                onClick={() => setOpen(false)}
              >
                <Icon name="X" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Status here reflects local work state; it does not claim provider delivery.
            </p>
          </div>
          {loading && queue.total === 0 && queue.scheduledTotal === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
              Loading queue…
            </p>
          ) : error ? (
            <p className="px-3 py-4 text-sm text-destructive" role="alert">
              Unable to load the local queue: {error}
            </p>
          ) : queue.total === 0 && queue.scheduledTotal === 0 ? (
            <p className="px-3 py-5 text-sm text-muted-foreground">No enrichment work is queued.</p>
          ) : (
            <div className="max-h-[min(32rem,70vh)] overflow-y-auto px-3 py-2">
              {queue.rows.length > 0 ? (
                <section aria-labelledby="enrichment-queue-current">
                  <h3 id="enrichment-queue-current" className="px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Current work ({queue.total})
                  </h3>
                  <ul className="divide-y divide-border/60">
                    {queue.rows.map((row) => <QueueRow key={row.id} row={row} onOpen={openSubject} />)}
                  </ul>
                </section>
              ) : null}
              {queue.scheduledTotal > 0 ? (
                <section className="mt-2 border-t border-border pt-2" aria-labelledby="enrichment-queue-scheduled">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between px-1"
                    aria-expanded={scheduledOpen}
                    onClick={() => setScheduledOpen((current) => !current)}
                  >
                    <span id="enrichment-queue-scheduled">Scheduled ({queue.scheduledTotal})</span>
                    <Icon name={scheduledOpen ? "ChevronUp" : "ChevronDown"} aria-hidden="true" />
                  </Button>
                  {scheduledOpen ? (
                    <ul className="divide-y divide-border/60">
                      {queue.scheduled.map((row) => <ScheduledRow key={row.id} row={row} onOpen={openSubject} />)}
                    </ul>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
