import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Button } from "../../../components/ui/button.js";
import { Card } from "../../../components/ui/card.js";
import { Icon, type IconName } from "../../../components/ui/icon.js";
import type {
  DashboardBiggestOpenDeal,
  DashboardOverdueTask,
  DashboardRecentActivity,
  DashboardScope,
  DashboardStageBucket,
  DashboardSummaryInput,
  DashboardSummaryOutput,
  DashboardTrendPoint,
  DealStage,
  Id,
} from "../../../contracts/core.js";
import {
  EmptyState,
  PageHeader,
} from "../../components/index.js";
import { cn } from "../../../lib/utils.js";
import { useDashboardRpc, type DashboardRpcClient } from "./rpc.js";

const STAGE_LABELS: Record<DealStage, string> = {
  DEMO_BOOKED: "Demo booked",
  QUALIFIED_TO_BUY: "Qualified to buy",
  UNQUALIFIED_TO_BUY: "Unqualified to buy",
  DECISION_MAKER_BOUGHT_IN: "Decision maker bought in",
  CONTRACT_SENT: "Contract sent",
  CLOSED_WON: "Closed won",
  CLOSED_LOST: "Closed lost",
};

const ACTIVITY_META: Record<
  DashboardRecentActivity["type"],
  { label: string; icon: IconName }
> = {
  NOTE: { label: "Note", icon: "FileText" },
  CALL: { label: "Call", icon: "Mic" },
  EMAIL: { label: "Email", icon: "Mail" },
  MEETING: { label: "Meeting", icon: "Calendar" },
  TASK: { label: "Task", icon: "ListTodo" },
  STAGE_CHANGE: { label: "Stage change", icon: "ArrowReloadHorizontal" },
  ENRICHMENT: { label: "Enrichment", icon: "Zap" },
};

const SCOPE_OPTIONS: readonly { id: DashboardScope; label: string }[] = [
  { id: "me", label: "Me" },
  { id: "everyone", label: "Everyone" },
];

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function formatMoney(
  valueCents: number | null | undefined,
  currency: string,
): string {
  if (valueCents === null || valueCents === undefined) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(valueCents / 100);
  } catch {
    return `${valueCents.toLocaleString()} ${currency}`;
  }
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Date-only values are parsed at local noon so a user's timezone cannot
  // make a closing date appear one day early.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function stageLabel(stage: DealStage): string {
  return STAGE_LABELS[stage];
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

function amountChange(
  current: number,
  previous: number,
  currency: string,
): ReactNode {
  if (previous === 0 && current === 0) return "No change from last month";
  if (previous === 0) return "New this month";
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change));
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  if (direction === "flat") return "Flat from last month";
  return (
    <>
      <span
        className={cn(
          "font-medium",
          direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        {direction === "up" ? "↑" : "↓"} {rounded}%
      </span>{" "}
      <span>vs {formatMoney(previous, currency)}</span>
    </>
  );
}

function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold tracking-tight">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action === undefined ? null : (
        <div className="shrink-0 text-xs text-muted-foreground">{action}</div>
      )}
    </header>
  );
}

function Metric({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-4 sm:px-5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      <span className="sr-only">Loading dashboard…</span>
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {["w-28", "w-36", "w-24", "w-32"].map((width, index) => (
          <div key={index} className="space-y-3 bg-card px-4 py-5 sm:px-5">
            <div aria-hidden="true" className={cn("h-3 animate-pulse rounded bg-muted", width)} />
            <div aria-hidden="true" className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div aria-hidden="true" className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div aria-hidden="true" className="h-72 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div aria-hidden="true" className="h-72 animate-pulse rounded-lg border border-border bg-muted/40" />
      </div>
    </div>
  );
}

function DashboardError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-5 sm:px-5"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <Icon name="AlertCircle" aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Dashboard unavailable</h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">{message}</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            <Icon name="RotateCcw" aria-hidden="true" />
            Try again
          </Button>
        </div>
      </div>
    </section>
  );
}

function PipelineSection({ data }: { data: DashboardSummaryOutput }) {
  const { pipeline, reportingCurrency, unconverted } = data;
  const maxStageValue = Math.max(...pipeline.stages.map((stage) => stage.valueCents), 0);

  return (
    <Card className="overflow-hidden">
      <SectionHeading
        id="dashboard-pipeline"
        title="Open pipeline by stage"
        description="Open deals grouped by their current stage."
        action={
          <span>
            {formatMoney(pipeline.totalCents, reportingCurrency)} · {pluralize(pipeline.totalDeals, "deal")}
          </span>
        }
      />
      <div className="p-4 sm:p-5">
        {unconverted.count > 0 ? (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200" role="note">
            <Icon name="Info" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {pluralize(unconverted.count, "open deal")} in {unconverted.currencies.join(", ")} do not have a frozen {reportingCurrency} conversion and are excluded from totals.
            </span>
          </p>
        ) : null}
        {pipeline.stages.length === 0 ? (
          <EmptyState
            icon="Target"
            title="No open pipeline"
            description="Open deals will appear here as they move through the sales process."
            className="min-h-48 border-0 bg-transparent px-2 py-6"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm" aria-label="Open pipeline by stage">
              <caption className="sr-only">Open pipeline by stage</caption>
              <thead>
                <tr className="border-b border-border-hairline text-xs text-muted-foreground">
                  <th scope="col" className="pb-2.5 pr-4 font-medium">Stage</th>
                  <th scope="col" className="pb-2.5 pr-4 text-right font-medium">Deals</th>
                  <th scope="col" className="pb-2.5 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-hairline">
                {pipeline.stages.map((stage) => {
                  const share = maxStageValue > 0
                    ? (stage.valueCents / maxStageValue) * 100
                    : pipeline.totalDeals > 0
                      ? (stage.count / pipeline.totalDeals) * 100
                      : 0;
                  const barStyle: CSSProperties = {
                    width: `${Math.max(share, stage.count > 0 ? 5 : 0)}%`,
                  };
                  return (
                    <tr key={stage.stage} className="group">
                      <th scope="row" className="py-3 pr-4 font-medium">
                        <div className="flex min-w-52 items-center gap-3">
                          <span aria-hidden="true" className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full bg-primary transition-[width] duration-300 group-hover:bg-foreground" style={barStyle} />
                          </span>
                          <span>{stageLabel(stage.stage)}</span>
                        </div>
                      </th>
                      <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatNumber(stage.count)}</td>
                      <td className="py-3 tabular-nums">{formatMoney(stage.valueCents, reportingCurrency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function PerformanceSection({ data }: { data: DashboardSummaryOutput }) {
  const { performance } = data;
  const closedDeals = performance.wins + performance.losses;
  return (
    <Card className="overflow-hidden">
      <SectionHeading
        id="dashboard-performance"
        title="Performance"
        description={`Closed-deal performance over the last ${performance.windowDays} days.`}
      />
      <div className="p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-5">
          <div>
            <dt className="text-xs text-muted-foreground">Win rate</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{formatPercent(performance.winRate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Closed deals</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(closedDeals)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Wins</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(performance.wins)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Losses</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(performance.losses)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Average deal</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(performance.avgDealCents, data.reportingCurrency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Average cycle</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {performance.avgCycleDays === null ? "—" : `${Math.round(performance.avgCycleDays)}d`}
            </dd>
          </div>
        </dl>
        {closedDeals === 0 ? (
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            No closed deals in this window yet.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function TrendBar({
  point,
  maxValue,
}: {
  point: DashboardTrendPoint;
  maxValue: number;
}) {
  const wonHeight = maxValue > 0 ? (point.won / maxValue) * 100 : 0;
  const createdHeight = maxValue > 0 ? (point.created / maxValue) * 100 : 0;
  return (
    <div className="flex h-full min-w-0 flex-col justify-end gap-1">
      <div className="flex h-full items-end justify-center gap-1" aria-hidden="true">
        <span
          className="w-2.5 rounded-t-sm bg-primary transition-[height] duration-300 sm:w-3"
          style={{ height: `${Math.max(wonHeight, point.won > 0 ? 3 : 0)}%` }}
        />
        <span
          className="w-2.5 rounded-t-sm bg-primary/25 transition-[height] duration-300 sm:w-3"
          style={{ height: `${Math.max(createdHeight, point.created > 0 ? 3 : 0)}%` }}
        />
      </div>
      <span className="truncate text-center text-[10px] text-muted-foreground">{point.month}</span>
    </div>
  );
}

function TrendSection({ data }: { data: DashboardSummaryOutput }) {
  const maxValue = Math.max(...data.trend.flatMap((point) => [point.won, point.created]), 0);
  return (
    <Card className="overflow-hidden">
      <SectionHeading
        id="dashboard-trend"
        title="Closed won vs. new pipeline"
        description="Last six months, by the month a deal closed or was created."
        action={
          <span className="inline-flex items-center gap-3" aria-label="Trend legend">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-primary" /> Won</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-primary/25" /> Created</span>
          </span>
        }
      />
      <div className="space-y-5 p-4 sm:p-5">
        <div
          className="grid h-48 grid-cols-6 items-end gap-2 border-b border-border-hairline pb-2 sm:gap-4"
          role="img"
          aria-label="Six-month deal value trend chart"
        >
          {data.trend.map((point) => (
            <TrendBar key={point.month} point={point} maxValue={maxValue} />
          ))}
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[28rem] border-collapse text-left text-xs" aria-label="Six-month deal value trend by month">
            <caption className="sr-only">Six-month deal value trend by month</caption>
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th scope="col" className="px-3 py-2.5 font-medium">Month</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Won</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-hairline">
              {data.trend.map((point) => (
                <tr key={point.month}>
                  <th scope="row" className="px-3 py-2.5 font-medium">{point.month}</th>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(point.won, data.reportingCurrency)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatMoney(point.created, data.reportingCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function CompanyMark({ deal }: { deal: DashboardBiggestOpenDeal }) {
  const firstLetters = deal.company.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return deal.company.iconUrl ? (
    <img
      src={deal.company.iconUrl}
      alt=""
      className="size-8 rounded-md border border-border object-cover"
    />
  ) : (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
      {firstLetters || "?"}
    </span>
  );
}

function BiggestOpenSection({ data }: { data: DashboardSummaryOutput }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeading
        id="dashboard-biggest-open"
        title="Biggest open deals"
        description="The largest open opportunities by frozen reporting value."
        action={<span>{pluralize(data.biggestOpen.length, "deal")}</span>}
      />
      {data.biggestOpen.length === 0 ? (
        <EmptyState
          icon="Target"
          title="No open deals yet"
          description="Create an open deal to start building your pipeline."
          className="min-h-48 rounded-none border-0 bg-transparent"
        />
      ) : (
        <ol className="divide-y divide-border" aria-labelledby="dashboard-biggest-open">
          {data.biggestOpen.map((deal) => {
            const amount = deal.baseAmountCents === null
              ? formatMoney(deal.amountCents, deal.currency)
              : formatMoney(deal.baseAmountCents, data.reportingCurrency);
            const amountDescription = deal.baseAmountCents === null
              ? `Unconverted ${deal.currency} amount`
              : `Reporting value in ${data.reportingCurrency}`;
            return (
              <li key={deal.id} className="group px-4 py-3.5 transition-colors hover:bg-state-hover sm:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <CompanyMark deal={deal} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{deal.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.company.name} · {stageLabel(deal.stage)}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{deal.owner.name} · Close {formatDate(deal.expectedCloseDate)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{amount}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{amountDescription}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function recordContext(
  task: DashboardOverdueTask,
): string {
  const context = [task.deal?.name, task.company?.name].filter(Boolean);
  return context.length > 0 ? context.join(" · ") : "No linked record";
}

function OverdueTasksSection({ data }: { data: DashboardSummaryOutput }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeading
        id="dashboard-overdue"
        title="Overdue tasks"
        description="Open follow-ups that are past their due date."
        action={<span>{pluralize(data.overdueTasks.length, "task")}</span>}
      />
      {data.overdueTasks.length === 0 ? (
        <EmptyState
          icon="CircleCheck"
          title="No overdue tasks"
          description="Your follow-up queue is clear."
          className="min-h-44 rounded-none border-0 bg-transparent"
        />
      ) : (
        <ul className="divide-y divide-border" aria-labelledby="dashboard-overdue">
          {data.overdueTasks.map((task) => (
            <li key={task.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <Icon name="Clock" className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.subject?.trim() || "Untitled task"}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{recordContext(task)}</p>
                </div>
                <time className="shrink-0 text-right text-xs tabular-nums text-destructive" dateTime={task.dueAt ?? undefined}>
                  {formatDate(task.dueAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentActivitySection({ data }: { data: DashboardSummaryOutput }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeading
        id="dashboard-activity"
        title="Recent activity"
        description="The latest notes, meetings, messages, and tasks."
        action={<span>{pluralize(data.recentActivity.length, "entry", "entries")}</span>}
      />
      {data.recentActivity.length === 0 ? (
        <EmptyState
          icon="Layers"
          title="No recent activity"
          description="New CRM activity will be listed here."
          className="min-h-44 rounded-none border-0 bg-transparent"
        />
      ) : (
        <ul className="divide-y divide-border" aria-labelledby="dashboard-activity">
          {data.recentActivity.map((activity) => {
            const meta = ACTIVITY_META[activity.type];
            const subject = activity.subject?.trim() || `${meta.label} activity`;
            const context = [activity.deal?.name, activity.company?.name].filter(Boolean).join(" · ");
            return (
              <li key={activity.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon name={meta.icon} className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{subject}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {meta.label} · {activity.createdBy.name}{context ? ` · ${context}` : ""}
                    </p>
                    {activity.body?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{activity.body}</p>
                    ) : null}
                  </div>
                  <time className="shrink-0 text-right text-xs text-muted-foreground" dateTime={activity.createdAt}>
                    {formatDateTime(activity.createdAt)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function DashboardContent({ data }: { data: DashboardSummaryOutput }) {
  const wonChange = amountChange(
    data.wonThisMonth.valueCents,
    data.wonPrevMonth.valueCents,
    data.reportingCurrency,
  );
  const hasSignals =
    data.pipeline.totalDeals > 0 ||
    data.wonThisMonth.count > 0 ||
    data.closingThisMonthTotal.count > 0 ||
    data.performance.wins + data.performance.losses > 0 ||
    data.trend.some((point) => point.won > 0 || point.created > 0) ||
    data.recentActivity.length > 0;

  return (
    <div className="space-y-4" data-dashboard-content="">
      <section
        className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Selected dashboard metrics"
      >
        <Metric
          label="Open pipeline"
          value={formatMoney(data.pipeline.totalCents, data.reportingCurrency)}
          detail={`${pluralize(data.pipeline.totalDeals, "open deal")} · ${data.reportingCurrency}`}
        />
        <Metric
          label="Closed won this month"
          value={formatMoney(data.wonThisMonth.valueCents, data.reportingCurrency)}
          detail={
            <>
              {pluralize(data.wonThisMonth.count, "deal")} · {wonChange}
            </>
          }
        />
        <Metric
          label={`Win rate (${data.performance.windowDays}d)`}
          value={formatPercent(data.performance.winRate)}
          detail={`${formatNumber(data.performance.wins)} won · ${formatNumber(data.performance.losses)} lost`}
        />
        <Metric
          label={`Average deal (${data.performance.windowDays}d)`}
          value={formatMoney(data.performance.avgDealCents, data.reportingCurrency)}
          detail={
            data.performance.avgCycleDays === null
              ? "No wins to measure"
              : `${Math.round(data.performance.avgCycleDays)}-day average cycle`
          }
        />
      </section>

      {!hasSignals ? (
        <EmptyState
          icon="ChartColumn"
          title="Your dashboard is clear"
          description="Add deals or activities to see pipeline health, performance, and follow-up work here."
          className="border-border bg-card"
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <PipelineSection data={data} />
        <PerformanceSection data={data} />
      </div>

      <TrendSection data={data} />

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="overflow-hidden">
          <SectionHeading
            id="dashboard-closing"
            title="Closing this month"
            description="Open deals with an expected close date in the current month."
            action={<span>{data.reportingCurrency}</span>}
          />
          <div className="p-4 sm:p-5">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(data.closingThisMonthTotal.valueCents, data.reportingCurrency)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {pluralize(data.closingThisMonthTotal.count, "deal")} scheduled to close
            </p>
            {data.closingThisMonthTotal.count === 0 ? (
              <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                No open deals have a close date this month.
              </p>
            ) : null}
          </div>
        </Card>
        <BiggestOpenSection data={data} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <OverdueTasksSection data={data} />
        <RecentActivitySection data={data} />
      </div>
    </div>
  );
}

export interface DashboardViewProps {
  /** Optional client injection keeps the dashboard independently previewable. */
  rpcClient?: DashboardRpcClient;
  /** Authenticated BB identity when the host can provide it for the `me` scope. */
  ownerId?: Id | null;
  /** Initial scope for hosts that persist a dashboard preference. */
  initialScope?: DashboardScope;
  className?: string;
}

export function DashboardView({
  rpcClient,
  ownerId,
  initialScope = "me",
  className,
}: DashboardViewProps) {
  const contextRpc = useDashboardRpc();
  const rpc = rpcClient ?? contextRpc;
  const [scope, setScope] = useState<DashboardScope>(initialScope);
  const [summary, setSummary] = useState<DashboardSummaryOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const input = useMemo<DashboardSummaryInput>(() => {
    const next: DashboardSummaryInput = { scope };
    if (ownerId !== undefined) next.ownerId = ownerId;
    return next;
  }, [ownerId, scope]);

  const retry = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void rpc
      .call("dashboard_summary", input)
      .then((next) => {
        if (active) setSummary(next);
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
  }, [input, refreshKey, rpc]);

  const scopeDescription = scope === "me" ? "your assigned work" : "the whole team";

  return (
    <div
      className={cn("mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:gap-5 sm:p-6", className)}
      data-dashboard-scope={scope}
      aria-busy={loading || undefined}
    >
      <PageHeader
        className="border-0 px-0 py-0"
        title="Dashboard"
        description={`Pipeline, performance, and follow-up signals for ${scopeDescription}.`}
        actions={
          <div
            className="inline-flex rounded-md border border-border bg-muted/30 p-0.5"
            role="group"
            aria-label="Dashboard scope"
          >
            {SCOPE_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant={scope === option.id ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={scope === option.id}
                onClick={() => setScope(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
      />

      {error !== null && summary === null ? <DashboardError message={error} onRetry={retry} /> : null}
      {summary === null && error === null ? <DashboardLoading /> : null}
      {summary !== null ? (
        <>
          {error !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
              <span>Couldn’t refresh this view: {error}</span>
              <Button type="button" variant="ghost" size="sm" onClick={retry}>Try again</Button>
            </div>
          ) : null}
          {loading ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              Updating dashboard…
            </p>
          ) : null}
          <DashboardContent data={summary} />
        </>
      ) : null}
    </div>
  );
}
