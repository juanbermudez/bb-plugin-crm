import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { Button } from "../../../components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import {
  CURRENCY_CODES,
  CLOSING_WINDOWS,
  type CompanyListOutput,
  type Contact,
  type ContactListInput,
  DEAL_STAGES,
  type CurrencyCode,
  type Deal,
  type DealCreateInput,
  type DealListInput,
  type DealListOutput,
  type DealStage,
  type DealUpdateData,
  type DealUpdateInput,
  type SetDealStageInput,
  type DealListStatus,
  type FieldDefinition,
  type SavedViewFilters,
  type SortDirection,
} from "../../../contracts/core.js";
import {
  ColumnPreferences,
  COMPANY_PICKER_INPUT,
  companyOptionsFromRows,
  AlertDialog,
  EmptyState,
  EntityPicker,
  InlineDateField,
  InlineField,
  InlineSelectField,
  InlineTextArea,
  PageHeader,
  RecordDrawer,
  SearchField,
  TableShell,
  ownerOptionsFromRecords,
  type EntityOption,
  usePersistentColumnPreferences,
  type TableColumnPreference,
} from "../../components/index.js";
import { useDealsRpc, type DealsRpcClient } from "./rpc.js";
import { ActivityTimeline } from "../activity/index.js";
import { SavedViewBar } from "../saved-views/index.js";
import { RecordFieldsEditor } from "../record-fields/index.js";
import { RecordAgentTab, type RecordAgentRpcClient } from "../../components/record-agent-tab.js";
import { cn } from "../../../lib/utils.js";
import {
  customFieldFacets,
  facetOptionsFromCounts,
  ListControls,
  type ListFacet,
  type ListFilters,
  type ListSortOption,
  SelectAllCheckbox,
} from "../list-controls/list-controls.js";

const PAGE_SIZE = 25;

const DEAL_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: "name", label: "Deal" },
  { value: "createdAt", label: "Created" },
  { value: "company", label: "Company" },
  { value: "stage", label: "Stage" },
  { value: "owner", label: "Owner" },
  { value: "amount", label: "Amount" },
  { value: "expectedClose", label: "Close date" },
  { value: "lastActivity", label: "Last activity" },
  { value: "archivedAt", label: "Archived" },
];

const DEAL_STANDARD_FILTERS = ["owner", "stage", "closing"] as const;

type DealBulkRpcClient = {
  call(method: string, input: unknown): Promise<unknown>;
};

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type DealTab = "overview" | "contacts" | "activity" | "agent";

const DEAL_TABS: ReadonlyArray<{ id: DealTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

function dealTabFromRoute(value: string | null | undefined): DealTab {
  return DEAL_TABS.some((tab) => tab.id === value)
    ? (value as DealTab)
    : "overview";
}

const DEAL_STATUS_OPTIONS: ReadonlyArray<{
  id: DealListStatus;
  label: string;
}> = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

const CLOSING_LABELS: Record<(typeof CLOSING_WINDOWS)[number], string> = {
  overdue: "Overdue",
  "this-month": "Closing this month",
  "next-month": "Closing next month",
  later: "Later",
  none: "No close date",
};

const DEAL_COLUMNS = [
  { id: "deal", label: "Deal", className: "min-w-52", required: true },
  { id: "company", label: "Company", className: "min-w-40" },
  { id: "stage", label: "Stage", className: "min-w-44" },
  { id: "owner", label: "Owner", className: "min-w-32" },
  { id: "amount", label: "Amount", className: "min-w-32 text-right" },
  { id: "close-date", label: "Close date", className: "min-w-32" },
  { id: "last-activity", label: "Last activity", className: "min-w-32" },
] as const;

const STAGE_LABELS: Record<DealStage, string> = {
  DEMO_BOOKED: "Demo booked",
  QUALIFIED_TO_BUY: "Qualified to buy",
  UNQUALIFIED_TO_BUY: "Unqualified to buy",
  DECISION_MAKER_BOUGHT_IN: "Decision maker bought in",
  CONTRACT_SENT: "Contract sent",
  CLOSED_WON: "Closed won",
  CLOSED_LOST: "Closed lost",
};

const EMPTY_LIST: DealListOutput = {
  rows: [],
  total: 0,
  facetCounts: {},
  openValueCents: null,
  reportingCurrency: "USD",
  unconverted: { count: 0, currencies: [] },
};

function ArchivedRelationshipBadge({
  archivedAt,
}: {
  archivedAt: string | null | undefined;
}) {
  if (!archivedAt) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      Archived
    </span>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function stageIndex(stage: DealStage): number {
  return DEAL_STAGES.indexOf(stage);
}

function customFieldDisplay(
  definition: FieldDefinition,
  value: unknown,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (definition.type === "CHECKBOX") return value === true ? "Yes" : "No";
  if (definition.type === "SELECT") {
    const option = definition.options.find((candidate) => candidate.id === value);
    return option?.label ?? String(value);
  }
  return String(value);
}

function formatMinorAmount(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amountCents === null || amountCents === undefined) return "—";
  if (!currency) return `${amountCents.toLocaleString()} minor units`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${amountCents.toLocaleString()} ${currency}`;
  }
}

function stageLabel(stage: DealStage): string {
  return STAGE_LABELS[stage];
}

function dealColumnValue(
  deal: Deal,
  columnId: string,
  definitions: readonly FieldDefinition[],
): string {
  switch (columnId) {
    case "deal":
      return deal.name;
    case "company":
      return deal.company?.name ?? displayValue(deal.companyId);
    case "stage":
      return stageLabel(deal.stage);
    case "owner":
      return deal.owner?.name ?? displayValue(deal.ownerId);
    case "amount":
      return formatMinorAmount(deal.amountCents, deal.currency);
    case "close-date":
      return formatDate(deal.expectedCloseDate);
    case "last-activity":
      return formatDate(deal.lastActivityAt);
    default: {
      const fieldId = columnId.startsWith("field:")
        ? columnId.slice("field:".length)
        : "";
      const definition = definitions.find((candidate) => candidate.id === fieldId);
      return definition
        ? customFieldDisplay(definition, deal.fields?.[definition.key])
        : "—";
    }
  }
}

function isClosedStage(stage: DealStage): boolean {
  return stage === "CLOSED_WON" || stage === "CLOSED_LOST";
}

const STAGES_REQUIRING_REASON = new Set<DealStage>([
  "CLOSED_LOST",
  "UNQUALIFIED_TO_BUY",
]);

interface DealStageMenuProps {
  deal: Deal;
  busy?: boolean;
  onSelect: (stage: DealStage) => void;
}

/** Compact table control matching the source's inline stage menu. */
function DealStageMenu({ deal, busy = false, onSelect }: DealStageMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative inline-block"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="max-w-full justify-start px-2 text-left font-normal"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{stageLabel(deal.stage)}</span>
        <Icon name="ChevronDown" aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label={`Change stage for ${deal.name}`}
          className="absolute left-0 z-30 mt-1 min-w-52 rounded-md border border-border bg-background p-1 shadow-lg"
        >
          {DEAL_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              role="menuitemradio"
              aria-checked={deal.stage === stage}
              className={cn(
                "flex w-full items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-state-hover",
                deal.stage === stage && "bg-state-active font-medium",
              )}
              onClick={() => {
                setOpen(false);
                if (stage !== deal.stage) onSelect(stage);
              }}
            >
              {stageLabel(stage)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface DealStageReasonDialogProps {
  request: { dealId: string; dealName: string; stage: DealStage } | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void | Promise<void>;
}

function DealStageReasonDialog({
  request,
  busy,
  onOpenChange,
  onSubmit,
}: DealStageReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formId = "deal-stage-reason-form";

  useEffect(() => {
    if (request === null) {
      setReason("");
      setError(null);
    }
  }, [request]);

  const stage = request?.stage;
  const open = request !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stage === "CLOSED_LOST" ? "Close as lost" : "Mark as unqualified"}
          </DialogTitle>
          <DialogDescription>
            {stage === "CLOSED_LOST"
              ? `Record why ${request?.dealName ?? "this deal"} was lost.`
              : `Record why ${request?.dealName ?? "this deal"} is not qualified.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = reason.trim();
            if (trimmed === "") return;
            setError(null);
            void Promise.resolve(onSubmit(trimmed)).catch((cause: unknown) => {
              setError(errorMessage(cause));
            });
          }}
        >
          <label className="text-sm font-medium" htmlFor={`${formId}-input`}>
            Reason <span className="font-normal text-muted-foreground">(required)</span>
          </label>
          <Input
            id={`${formId}-input`}
            value={reason}
            required
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            placeholder={stage === "CLOSED_LOST" ? "Budget, timing, competitor…" : "Not a fit…"}
          />
          {error === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={busy || reason.trim() === ""}
          >
            {busy ? "Saving…" : "Save stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isDeal(value: unknown): value is Deal {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "stage" in value
  );
}

function isCompanyListOutput(value: unknown): value is CompanyListOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { rows?: unknown }).rows)
  );
}

function isContactListOutput(value: unknown): value is { rows: Contact[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { rows?: unknown }).rows)
  );
}

function contactName(contact: Pick<Contact, "firstName" | "lastName">): string {
  return [contact.firstName, contact.lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ") || "Contact";
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function listRpc(rpc: DealsRpcClient): DealBulkRpcClient {
  return rpc as unknown as DealBulkRpcClient;
}

function facetValueLabel(value: string): string {
  if (value === "unassigned") return "Unassigned";
  if (value === "none") return "No close date";
  if (!value.includes("_") && !value.includes("-") && value !== value.toUpperCase()) {
    return value;
  }
  return value
    .toLowerCase()
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function customFieldInput(filters: ListFilters): Record<string, string[]> {
  const standard = new Set<string>(DEAL_STANDARD_FILTERS);
  return Object.fromEntries(
    Object.entries(filters).filter(([key, values]) => !standard.has(key) && values.length > 0),
  );
}

function cleanFilters(filters: Record<string, string[]>): ListFilters {
  return Object.fromEntries(
    Object.entries(filters)
      .map(([key, values]) => [key, [...new Set(values)]])
      .filter(([, values]) => values.length > 0),
  );
}

function createListInput(
  query: string,
  page: number,
  status: DealListStatus,
  archived: boolean,
  sort: string,
  dir: SortDirection,
  filters: ListFilters,
): DealListInput {
  return {
    q: query,
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
    status,
    owner: filters.owner ?? [],
    stage: (filters.stage ?? []) as DealListInput["stage"],
    closing: (filters.closing ?? []) as DealListInput["closing"],
    fields: customFieldInput(filters),
    archived,
  };
}

interface DealCreateFormValue {
  name: string;
  companyId: string;
  ownerId: string;
  stage: DealStage;
  amountCents: string;
  currency: CurrencyCode;
  expectedCloseDate: string;
}

interface DealFormProps {
  formId: string;
  value: DealCreateFormValue;
  error: string | null;
  saving: boolean;
  onChange: (next: DealCreateFormValue) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  companyOptions: readonly EntityOption[];
  ownerOptions: readonly EntityOption[];
}

function DealForm({
  formId,
  value,
  error,
  saving,
  onChange,
  onSubmit,
  companyOptions,
  ownerOptions,
}: DealFormProps) {
  return (
    <form id={formId} className="space-y-5" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-name`}>
          Deal name
        </label>
        <Input
          id={`${formId}-name`}
          required
          autoFocus
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="Enterprise expansion"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <EntityPicker
          id={`${formId}-company`}
          label="Company"
          value={value.companyId}
          options={companyOptions}
          required
          disabled={saving}
          placeholder="Choose an existing CRM company"
          onChange={(companyId) => onChange({ ...value, companyId: companyId ?? "" })}
        />
        <EntityPicker
          id={`${formId}-owner`}
          label="Owner"
          value={value.ownerId}
          options={ownerOptions}
          required
          disabled={saving}
          placeholder="Choose an existing CRM owner"
          onChange={(ownerId) => onChange({ ...value, ownerId: ownerId ?? "" })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Company and owner choices come from CRM data already loaded in this workspace; BB member lookup is not exposed here.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-stage`}>
            Stage
          </label>
          <select
            id={`${formId}-stage`}
            className={SELECT_CLASS}
            value={value.stage}
            onChange={(event) =>
              onChange({ ...value, stage: event.target.value as DealStage })
            }
          >
            {DEAL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-currency`}>
            Currency
          </label>
          <select
            id={`${formId}-currency`}
            className={SELECT_CLASS}
            value={value.currency}
            onChange={(event) =>
              onChange({ ...value, currency: event.target.value as CurrencyCode })
            }
          >
            {CURRENCY_CODES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-amount`}>
            Amount (minor units) <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${formId}-amount`}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={value.amountCents}
            onChange={(event) =>
              onChange({ ...value, amountCents: event.target.value })
            }
            placeholder="125000"
            aria-describedby={`${formId}-amount-help`}
          />
          <p id={`${formId}-amount-help`} className="text-xs text-muted-foreground">
            Enter an integer in the smallest currency unit: 125000 is 1,250.00.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-close-date`}>
            Expected close date <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${formId}-close-date`}
            type="date"
            value={value.expectedCloseDate}
            onChange={(event) =>
              onChange({ ...value, expectedCloseDate: event.target.value })
            }
          />
        </div>
      </div>
      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Source amount and currency remain unchanged. Reporting totals use a separately frozen base-money conversion when one is available.
      </p>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saving ? (
        <p className="text-sm text-muted-foreground" role="status">
          Creating deal…
        </p>
      ) : null}
    </form>
  );
}

interface DealOverviewProps {
  deal: Deal;
  companyOptions: readonly EntityOption[];
  ownerOptions: readonly EntityOption[];
  onUpdate: (data: DealUpdateData, optimistic: Partial<Deal>) => void;
  mutationBusy: boolean;
  mutationError: string | null;
  onSetStage: (stage: DealStage, closedReason?: string) => Promise<void> | void;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

function DealOverview({
  deal,
  companyOptions,
  ownerOptions,
  onUpdate,
  mutationBusy,
  mutationError,
  onSetStage,
  onArchive,
  onRestore,
  onPurge,
}: DealOverviewProps) {
  const [stageDraft, setStageDraft] = useState<DealStage>(deal.stage);
  const [closedReasonDraft, setClosedReasonDraft] = useState(
    deal.closedReason ?? "",
  );
  const [amountError, setAmountError] = useState<string | null>(null);

  useEffect(() => {
    setStageDraft(deal.stage);
    setClosedReasonDraft(deal.closedReason ?? "");
  }, [deal.id, deal.stage, deal.closedReason]);

  const reasonChanged =
    STAGES_REQUIRING_REASON.has(stageDraft) &&
    closedReasonDraft.trim() !== (deal.closedReason ?? "");
  const stageDirty = stageDraft !== deal.stage || reasonChanged;
  const missingLostReason =
    STAGES_REQUIRING_REASON.has(stageDraft) && closedReasonDraft.trim() === "";

  return (
    <div className="space-y-6">
      <form
        className="space-y-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSetStage(
            stageDraft,
            STAGES_REQUIRING_REASON.has(stageDraft)
              ? closedReasonDraft.trim() || undefined
              : undefined,
          );
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-52 flex-1 space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="deal-stage-select">
              Stage
            </label>
            <select
              id="deal-stage-select"
              className={SELECT_CLASS}
              value={stageDraft}
              disabled={mutationBusy}
              onChange={(event) => setStageDraft(event.target.value as DealStage)}
            >
              {DEAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabel(stage)}
                </option>
              ))}
            </select>
            <ol
              className="flex min-w-0 items-start gap-1 overflow-x-auto pt-1"
              aria-label="Deal stage stepper"
            >
              {DEAL_STAGES.map((stage, index) => {
                const active = stage === stageDraft;
                const complete = index < stageIndex(stageDraft);
                return (
                  <li key={stage} className="flex min-w-20 flex-1 items-start gap-1">
                    <button
                      type="button"
                      className={cn(
                        "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-1 text-center text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        active
                          ? "text-foreground"
                          : complete
                            ? "text-muted-foreground hover:bg-state-hover hover:text-foreground"
                            : "text-muted-foreground/70 hover:bg-state-hover hover:text-foreground",
                      )}
                      aria-label={`Set stage to ${stageLabel(stage)}`}
                      aria-pressed={active}
                      disabled={mutationBusy}
                      onClick={() => setStageDraft(stage)}
                    >
                      <span
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : complete
                              ? "border-border bg-muted text-foreground"
                              : "border-border bg-background",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="max-w-24 leading-tight">{stageLabel(stage)}</span>
                    </button>
                    {index < DEAL_STAGES.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-3 h-px min-w-2 flex-1 bg-border",
                          complete && "bg-foreground/40",
                        )}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={mutationBusy || !stageDirty || missingLostReason}
          >
            {mutationBusy ? "Saving…" : "Save stage"}
          </Button>
        </div>
        {STAGES_REQUIRING_REASON.has(stageDraft) ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="deal-closed-reason">
              {stageDraft === "CLOSED_LOST" ? "Close reason" : "Qualification reason"}{" "}
              <span className="font-normal">(required)</span>
            </label>
            <Input
              id="deal-closed-reason"
              value={closedReasonDraft}
              required
              disabled={mutationBusy}
              onChange={(event) => setClosedReasonDraft(event.target.value)}
              placeholder={
                stageDraft === "CLOSED_LOST"
                  ? "Budget, timing, competitor…"
                  : "Not a fit, timing, budget…"
              }
            />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Current stage: <span className="font-medium text-foreground">{stageLabel(deal.stage)}</span>
        </p>
      </form>

      <section className="space-y-3" aria-label="Deal details">
        <h3 className="text-sm font-medium">Details</h3>
        <div className="grid gap-4 rounded-lg border border-border p-4">
          <InlineField
            label="Name"
            value={deal.name}
            saving={mutationBusy}
            onSave={(name) => {
              if (name) onUpdate({ name }, { name });
            }}
          />
          <InlineField
            label="Amount"
            value={deal.amountCents === null ? null : String(deal.amountCents / 100)}
            type="number"
            placeholder="0.00"
            saving={mutationBusy}
            render={(value) => formatMinorAmount(Math.round(Number(value) * 100), deal.currency)}
            onSave={(amount) => {
              const raw = amount.trim();
              if (raw === "") {
                setAmountError(null);
                onUpdate({ amountCents: null }, { amountCents: null });
                return;
              }
              const parsed = Number(raw);
              const cents = Math.round(parsed * 100);
              if (!Number.isFinite(parsed) || parsed < 0 || !Number.isSafeInteger(cents)) {
                setAmountError("Amount must be a non-negative number.");
                return;
              }
              setAmountError(null);
              onUpdate({ amountCents: cents }, { amountCents: cents });
            }}
          />
          {amountError ? (
            <p className="text-sm text-destructive" role="alert">
              {amountError}
            </p>
          ) : null}
          <InlineSelectField
            label="Currency"
            value={deal.currency}
            options={CURRENCY_CODES.map((currency) => ({
              value: currency,
              label: currency,
            }))}
            saving={mutationBusy}
            onSave={(currency) => {
              setAmountError(null);
              onUpdate(
                { currency: currency as CurrencyCode },
                { currency: currency as CurrencyCode },
              );
            }}
          />
          <InlineDateField
            label="Expected close date"
            value={deal.expectedCloseDate}
            saving={mutationBusy}
            onSave={(expectedCloseDate) => {
              const next = expectedCloseDate || null;
              onUpdate({ expectedCloseDate: next }, { expectedCloseDate: next });
            }}
          />
          <EntityPicker
            label="Company"
            value={deal.companyId}
            options={companyOptions}
            required
            disabled={mutationBusy}
            placeholder="Choose an existing CRM company"
            onChange={(companyId) => {
              if (!companyId) return;
              onUpdate({ companyId }, { companyId, company: undefined });
            }}
          />
          <EntityPicker
            label="Owner"
            value={deal.ownerId}
            options={ownerOptions}
            required
            disabled={mutationBusy}
            placeholder="Choose an existing CRM owner"
            onChange={(ownerId) => {
              if (!ownerId) return;
              onUpdate({ ownerId }, { ownerId, owner: undefined });
            }}
          />
          <InlineTextArea
            label="Description"
            value={deal.description ?? null}
            placeholder="What the customer is buying, why now, and what stands in the way."
            saving={mutationBusy}
            onSave={(description) =>
              onUpdate(
                { description: description || null },
                { description: description || null },
              )
            }
          />
        </div>
      </section>

      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Frozen base amount</dt>
          <dd className="mt-1 text-sm">
            {deal.baseAmountCents === null
              ? "Not converted"
              : formatMinorAmount(
                  deal.baseAmountCents,
                  deal.baseCurrency ?? deal.reportingCurrency ?? deal.currency,
                )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Closed at</dt>
          <dd className="mt-1 text-sm">{formatDate(deal.closedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Close reason</dt>
          <dd className="mt-1 text-sm">{displayValue(deal.closedReason)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Last activity</dt>
          <dd className="mt-1 text-sm">{formatDate(deal.lastActivityAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Contacts</dt>
          <dd className="mt-1 text-sm">
            {deal.contacts === undefined ? "—" : deal.contacts.length}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Status</dt>
          <dd className="mt-1 text-sm">
            {deal.archivedAt ? "Archived" : isClosedStage(deal.stage) ? "Closed" : "Open"}
          </dd>
        </div>
      </dl>

      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Source money is stored in {deal.currency}. The frozen base amount is the snapshot used for reporting and is not silently recalculated when source money changes.
        {deal.baseAmountCents === null
          ? " This deal has no base conversion and is excluded from compatible reporting totals."
          : ""}
      </p>

      <RecordFieldsEditor entity="DEAL" recordId={deal.id} />

      <section className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {deal.archivedAt ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutationBusy}
            onClick={onRestore}
          >
            <Icon name="ArchiveRestore" aria-hidden="true" />
            Restore deal
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={mutationBusy}
            onClick={onArchive}
          >
            <Icon name="Archive" aria-hidden="true" />
            Archive deal
          </Button>
        )}
        {deal.archivedAt ? (
          <Button
            type="button"
            variant="destructive"
            disabled={mutationBusy}
            onClick={onPurge}
          >
            <Icon name="Trash2" aria-hidden="true" />
            Delete permanently
          </Button>
        ) : null}
      </section>
      {mutationBusy ? (
        <p className="text-sm text-muted-foreground" role="status">
          Saving deal…
        </p>
      ) : null}
      {mutationError === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      )}
    </div>
  );
}

function DealContacts({
  deal,
  rpc,
  onChanged,
  onOpenContact,
}: {
  deal: Deal;
  rpc: DealsRpcClient;
  onChanged: () => void;
  onOpenContact?: (id: string) => void;
}) {
  const contacts = deal.contacts ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<readonly Contact[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contactListInput = useMemo<ContactListInput>(
    () => ({
      q: "",
      sort: "name",
      dir: "asc",
      page: 1,
      pageSize: 100,
      owner: [],
      company: deal.companyId ? [deal.companyId] : [],
      source: [],
      title: [],
      seniority: [],
      persona: [],
      activity: [],
      fields: {},
      archived: false,
    }),
    [deal.companyId],
  );

  useEffect(() => {
    if (!addOpen) return;
    let active = true;
    setError(null);
    void rpc
      .call("contacts_list", contactListInput)
      .then((next) => {
        if (active && isContactListOutput(next)) setAvailableContacts(next.rows);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [addOpen, contactListInput, rpc]);

  const attachedIds = useMemo(() => new Set(contacts.map((contact) => contact.id)), [contacts]);
  const contactOptions = useMemo<EntityOption[]>(
    () =>
      availableContacts
        .filter((contact) => !attachedIds.has(contact.id))
        .map((contact) => ({
          value: contact.id,
          label: contactName(contact),
          description: [contact.title, contact.email].filter(Boolean).join(" · ") || contact.id,
        })),
    [attachedIds, availableContacts],
  );

  const resetAdd = () => {
    setAddOpen(false);
    setContactId(null);
    setRole("");
    setError(null);
  };

  const attachContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactId) {
      setError("Choose a contact before attaching.");
      return;
    }
    setBusy("attach");
    setError(null);
    try {
      await rpc.call("deals_contacts_attach", {
        dealId: deal.id,
        contactId,
        role: role.trim() || null,
      });
      resetAdd();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const updateRole = async (contactIdToUpdate: string, nextRole: string) => {
    setBusy(`role:${contactIdToUpdate}`);
    setError(null);
    try {
      await rpc.call("deals_contacts_updateRole", {
        dealId: deal.id,
        contactId: contactIdToUpdate,
        role: nextRole.trim() || null,
      });
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const detachContact = async (contactIdToDetach: string) => {
    setBusy(`detach:${contactIdToDetach}`);
    setError(null);
    try {
      await rpc.call("deals_contacts_detach", {
        dealId: deal.id,
        contactId: contactIdToDetach,
      });
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3" aria-label="Deal contacts panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Contacts</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Link people from this deal&apos;s company and capture their buying role.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => {
            setError(null);
            setAddOpen(true);
          }}
        >
          <Icon name="Plus" aria-hidden="true" />
          Add contact
        </Button>
      </div>
      {addOpen ? (
        <form className="space-y-3 rounded-lg border border-border bg-muted/20 p-4" onSubmit={attachContact}>
          <EntityPicker
            label="Contact"
            value={contactId}
            options={contactOptions}
            required
            disabled={busy === "attach"}
            placeholder="Choose a contact from this company"
            onChange={setContactId}
          />
          <div className="grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-center">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="deal-contact-role">
              Role <span className="font-normal">(optional)</span>
            </label>
            <Input
              id="deal-contact-role"
              value={role}
              disabled={busy === "attach"}
              placeholder="Champion, economic buyer…"
              onChange={(event) => setRole(event.target.value)}
            />
          </div>
          {contactOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No unattached active contacts were found for this company.
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={busy === "attach"} onClick={resetAdd}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy === "attach" || contactOptions.length === 0}>
              {busy === "attach" ? "Attaching…" : "Attach contact"}
            </Button>
          </div>
        </form>
      ) : null}
      {contacts.length === 0 ? (
        <EmptyState
          icon="UserRound"
          title="No contacts linked"
          description="Contacts assigned to this deal will appear here."
          className="min-h-56 border-0 bg-transparent"
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Deal contacts">
          {contacts.map((contact) => {
            const name = contactName(contact);
            return (
              <li key={contact.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.8fr)_auto] sm:items-center">
                <div className="min-w-0">
                  {onOpenContact ? (
                    <button
                      type="button"
                      className="truncate rounded text-left text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => onOpenContact(contact.id)}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="truncate">{name}</span>
                        <ArchivedRelationshipBadge archivedAt={contact.archivedAt} />
                      </span>
                    </button>
                  ) : (
                    <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                      <span className="truncate">{name}</span>
                      <ArchivedRelationshipBadge archivedAt={contact.archivedAt} />
                    </p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {[contact.title, contact.email].filter(Boolean).join(" · ") || contact.id}
                  </p>
                </div>
                <InlineField
                  label={`Role for ${name}`}
                  value={contact.role ?? null}
                  placeholder="Add role"
                  saving={busy === `role:${contact.id}`}
                  onSave={(nextRole) => void updateRole(contact.id, nextRole)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${name} from deal`}
                  disabled={Boolean(busy)}
                  onClick={() => void detachContact(contact.id)}
                >
                  <Icon name="X" aria-hidden="true" />
                  <span className="sr-only">Remove</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function StagedDealTab({ tab }: { tab: "agent" }) {
  const label = DEAL_TABS.find((item) => item.id === tab)?.label ?? tab;
  return (
    <EmptyState
      icon={tab === "agent" ? "Brain" : tab === "contacts" ? "UserRound" : "Layers"}
      title={`${label} is staged next`}
      description={`The ${label.toLowerCase()} workspace keeps the source layout and will be connected in the next CRM parity slice.`}
      className="min-h-56 border-0 bg-transparent"
    />
  );
}

export interface DealsViewProps {
  /** Optional client injection keeps component tests and host previews small. */
  rpcClient?: DealsRpcClient;
  /** Record selected by the BB panel sub-path or browser history. */
  initialRecordId?: string | null;
  /** Open the create-deal drawer from a routed header action. */
  initialCreate?: boolean;
  /** Reflects record drawer changes back into the BB panel sub-path. */
  onRecordIdChange?: (id: string | null) => void;
  /** Opens a linked company or contact through the owning BB route. */
  onOpenRelatedRecord?: (kind: "company" | "contact", id: string) => void;
  /** Clears a routed create action after the drawer closes or submits. */
  onCreateChange?: (open: boolean) => void;
  /** Reflects the active record drawer tab back into the BB panel sub-path. */
  initialTab?: string | null;
  onTabChange?: (tab: DealTab, recordId: string) => void;
}

export function DealsView({
  rpcClient,
  initialRecordId = null,
  initialCreate = false,
  onRecordIdChange,
  onOpenRelatedRecord,
  onCreateChange,
  initialTab,
  onTabChange,
}: DealsViewProps) {
  const contextRpc = useDealsRpc();
  const rpc = rpcClient ?? contextRpc;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DealListStatus>("open");
  const [sort, setSort] = useState("createdAt");
  const [dir, setDir] = useState<SortDirection>("desc");
  const [filters, setFilters] = useState<ListFilters>({});
  const [showArchived, setShowArchived] = useState(false);
  const [list, setList] = useState<DealListOutput>(EMPTY_LIST);
  const [companyOptions, setCompanyOptions] = useState<readonly EntityOption[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterDefinitions, setFilterDefinitions] = useState<readonly FieldDefinition[]>([]);
  const [tableDefinitions, setTableDefinitions] = useState<readonly FieldDefinition[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [bulkStage, setBulkStage] = useState<DealStage>("DEMO_BOOKED");
  const [bulkCloseReason, setBulkCloseReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordId, setRecordId] = useState<string | null>(initialRecordId);
  const [record, setRecord] = useState<Deal | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordRefreshKey, setRecordRefreshKey] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<DealTab>("overview");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [stageRequest, setStageRequest] = useState<{
    dealId: string;
    dealName: string;
    stage: DealStage;
  } | null>(null);
  const [stageBusyId, setStageBusyId] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<"archive" | "purge" | null>(null);
  const [createOpen, setCreateOpen] = useState(initialCreate);
  const [createValue, setCreateValue] = useState<DealCreateFormValue>({
    name: "",
    companyId: "",
    ownerId: "",
    stage: "DEMO_BOOKED",
    amountCents: "",
    currency: "USD",
    expectedCloseDate: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const columnDefinitions = useMemo<readonly TableColumnPreference[]>(
    () => [
      ...DEAL_COLUMNS,
      ...tableDefinitions
        .filter(
          (definition) =>
            definition.showOnTable &&
            definition.archived !== true &&
            definition.archivedAt == null,
        )
        .map((definition) => ({
          id: `field:${definition.id}`,
          label: definition.label,
          className: "min-w-36",
        })),
    ],
    [tableDefinitions],
  );
  const columnPreferences = usePersistentColumnPreferences(
    "crm:table-columns:deal",
    columnDefinitions,
  );

  const listInput = useMemo(
    () => createListInput(query, page, status, showArchived, sort, dir, filters),
    [dir, filters, page, query, showArchived, sort, status],
  );

  const reloadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const next = await rpc.call("deals_list", listInput);
      setList(next);
    } catch (cause) {
      setListError(errorMessage(cause));
    } finally {
      setListLoading(false);
    }
  }, [listInput, refreshKey, rpc]);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(null);
    void rpc
      .call("deals_list", listInput)
      .then((next) => {
        if (active) setList(next);
      })
      .catch((cause: unknown) => {
        if (active) setListError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listInput, refreshKey, rpc]);

  useEffect(() => {
    let active = true;
    void listRpc(rpc)
      .call("companies_list", COMPANY_PICKER_INPUT)
      .then((next) => {
        if (active && isCompanyListOutput(next)) {
          setCompanyOptions(companyOptionsFromRows(next.rows));
        }
      })
      .catch(() => {
        // Company choices are optional; an incomplete host cannot create a deal blindly.
      });
    return () => {
      active = false;
    };
  }, [rpc, refreshKey]);

  useEffect(() => {
    let active = true;
    void listRpc(rpc)
      .call("fields_filters", { entity: "DEAL" })
      .then((next) => {
        if (active && Array.isArray(next)) {
          setFilterDefinitions(next as FieldDefinition[]);
        }
      })
      .catch(() => {
        // Custom-field facets are optional; the standard facets remain usable.
      });
    return () => {
      active = false;
    };
  }, [rpc]);

  useEffect(() => {
    let active = true;
    void listRpc(rpc)
      .call("fields_list", { entity: "DEAL", includeArchived: false })
      .then((next) => {
        if (active && Array.isArray(next)) {
          setTableDefinitions(next as FieldDefinition[]);
        }
      })
      .catch(() => {
        // Table field definitions are optional; standard columns remain usable.
      });
    return () => {
      active = false;
    };
  }, [rpc]);

  useEffect(() => {
    setSelectedIds([]);
  }, [listInput]);

  useEffect(() => {
    setRecordId(initialRecordId);
  }, [initialRecordId]);

  useEffect(() => {
    setCreateError(null);
    setCreateOpen(initialCreate);
  }, [initialCreate]);

  useEffect(() => {
    setRecordTab(dealTabFromRoute(initialTab));
  }, [initialTab, recordId]);

  useEffect(() => {
    if (recordId === null) return;
    let active = true;
    setRecordLoading(true);
    setRecordError(null);
    setMutationError(null);
    void rpc
      .call("deals_get", { id: recordId })
      .then((next) => {
        if (active) setRecord(next);
      })
      .catch((cause: unknown) => {
        if (active) setRecordError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setRecordLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recordId, recordRefreshKey, rpc]);

  const closeRecord = useCallback(() => {
    setRecordId(null);
    onRecordIdChange?.(null);
    setRecord(null);
    setRecordError(null);
    setMutationError(null);
  }, [onRecordIdChange]);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateError(null);
    onCreateChange?.(false);
  }, [onCreateChange]);

  const runRecordUpdate = useCallback(
    async (data: DealUpdateData, optimistic: Partial<Deal>) => {
      if (record === null) return;
      const previous = record;
      const id = record.id;
      const next = { ...record, ...optimistic };
      setMutationBusy(true);
      setMutationError(null);
      setRecord(next);
      setList((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          row.id === id ? { ...row, ...optimistic } : row,
        ),
      }));
      try {
        const result = await rpc.call("deals_update", { id, data });
        const settled = isDeal(result)
          ? {
              ...next,
              ...result,
              company: result.company === undefined ? next.company : result.company,
              owner: result.owner === undefined ? next.owner : result.owner,
              contacts: result.contacts ?? next.contacts,
            }
          : next;
        setRecord((current) => (current?.id === id ? settled : current));
        setList((current) => ({
          ...current,
          rows: current.rows.map((row) =>
            row.id === id ? { ...row, ...settled } : row,
          ),
        }));
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setRecord((current) => (current?.id === id ? previous : current));
        setList((current) => ({
          ...current,
          rows: current.rows.map((row) =>
            row.id === id ? { ...row, ...previous } : row,
          ),
        }));
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [record, rpc],
  );

  const runSetStage = useCallback(
    async (stage: DealStage, closedReason?: string) => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const input: SetDealStageInput = {
          id: record.id,
          stage,
          ...(STAGES_REQUIRING_REASON.has(stage) && closedReason?.trim()
            ? { closedReason: closedReason.trim() }
            : {}),
        };
        const result = await rpc.call("deals_setStage", input);
        setRecord(
          isDeal(result)
            ? result
            : {
                ...record,
                stage,
                closedReason:
                  stage === "CLOSED_LOST"
                    ? closedReason?.trim() || null
                    : null,
                closedAt: isClosedStage(stage)
                  ? record.closedAt ?? new Date().toISOString()
                  : null,
              },
        );
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [record, rpc],
  );

  const runListSetStage = useCallback(
    async (id: string, stage: DealStage, closedReason?: string) => {
      setStageBusyId(id);
      try {
        const result = await rpc.call("deals_setStage", {
          id,
          stage,
          ...(STAGES_REQUIRING_REASON.has(stage) && closedReason?.trim()
            ? { closedReason: closedReason.trim() }
            : {}),
        } satisfies SetDealStageInput);
        const current = list.rows.find((row) => row.id === id);
        const settled = isDeal(result)
          ? result
          : current
            ? {
                ...current,
                stage,
                closedReason:
                  stage === "CLOSED_LOST"
                    ? closedReason?.trim() || null
                    : null,
                closedAt: isClosedStage(stage)
                  ? current.closedAt ?? new Date().toISOString()
                  : null,
              }
            : null;
        if (settled !== null) {
          setList((currentList) => ({
            ...currentList,
            rows: currentList.rows.map((row) =>
              row.id === id ? { ...row, ...settled } : row,
            ),
          }));
          setRecord((currentRecord) =>
            currentRecord?.id === id ? { ...currentRecord, ...settled } : currentRecord,
          );
        }
        setRefreshKey((value) => value + 1);
      } finally {
        setStageBusyId(null);
      }
    },
    [list.rows, rpc],
  );

  const selectListStage = useCallback(
    (deal: Deal, stage: DealStage) => {
      if (STAGES_REQUIRING_REASON.has(stage)) {
        setStageRequest({ dealId: deal.id, dealName: deal.name, stage });
        return;
      }
      void runListSetStage(deal.id, stage).catch((cause: unknown) => {
        setListError(errorMessage(cause));
      });
    },
    [runListSetStage],
  );

  const runArchiveMutation = useCallback(
    async (method: "deals_archive" | "deals_restore") => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result =
          method === "deals_archive"
            ? await rpc.call("deals_archive", { id: record.id })
            : await rpc.call("deals_restore", { id: record.id });
        setRecord(
          isDeal(result)
            ? result
            : {
                ...record,
                archivedAt:
                  method === "deals_archive"
                    ? new Date().toISOString()
                    : null,
              },
        );
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [record, rpc],
  );

  const purgeRecord = useCallback(async () => {
    if (record === null) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await rpc.call("deals_purge", { id: record.id });
      closeRecord();
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setMutationError(errorMessage(cause));
      throw cause;
    } finally {
      setMutationBusy(false);
    }
  }, [closeRecord, record, rpc]);

  const submitCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = createValue.name.trim();
      const companyId = createValue.companyId.trim();
      const ownerId = createValue.ownerId.trim();
      if (name === "") {
        setCreateError("Deal name is required.");
        return;
      }
      if (companyId === "" || ownerId === "") {
        setCreateError("Company ID and owner ID are required.");
        return;
      }
      const amountText = createValue.amountCents.trim();
      const amountCents = amountText === "" ? null : Number(amountText);
      if (
        amountCents !== null &&
        (!Number.isSafeInteger(amountCents) || amountCents < 0)
      ) {
        setCreateError("Amount must be a non-negative integer in minor units.");
        return;
      }
      setCreateSaving(true);
      setCreateError(null);
      try {
        await rpc.call("deals_create", {
          name,
          companyId,
          ownerId,
          stage: createValue.stage,
          amountCents,
          currency: createValue.currency,
          expectedCloseDate: createValue.expectedCloseDate || null,
        });
        closeCreate();
        setCreateValue({
          name: "",
          companyId: "",
          ownerId: "",
          stage: "DEMO_BOOKED",
          amountCents: "",
          currency: "USD",
          expectedCloseDate: "",
        });
        setPage(1);
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setCreateError(errorMessage(cause));
      } finally {
        setCreateSaving(false);
      }
    },
    [closeCreate, createValue, rpc],
  );

  const openRecord = useCallback(
    (id: string) => {
      setRecord(id === recordId ? record : null);
      setRecordId(id);
      onRecordIdChange?.(id);
    },
    [onRecordIdChange, record, recordId],
  );

  const ownerLabels = useMemo(
    () =>
      new Map(
        list.rows
          .filter((deal) => deal.owner?.name)
          .map((deal) => [deal.ownerId, deal.owner?.name as string]),
      ),
    [list.rows],
  );
  const ownerOptions = useMemo(
    () => ownerOptionsFromRecords(record ? [...list.rows, record] : list.rows),
    [list.rows, record],
  );
  const selectableCompanyOptions = useMemo(() => {
    const options = [...companyOptions];
    const current = record?.company;
    if (current && !options.some((option) => option.value === current.id)) {
      options.push({
        value: current.id,
        label: current.name,
        description: current.domain ?? current.id,
      });
    }
    return options;
  }, [companyOptions, record?.company]);
  const facets = useMemo<ListFacet[]>(
    () => [
      {
        id: "owner",
        label: "Owner",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "owner",
          filters.owner,
          (value) => ownerLabels.get(value) ?? facetValueLabel(value),
        ),
      },
      {
        id: "stage",
        label: "Stage",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "stage",
          filters.stage,
          (value) => STAGE_LABELS[value as DealStage] ?? facetValueLabel(value),
        ),
      },
      {
        id: "closing",
        label: "Closing",
        options: CLOSING_WINDOWS.map((value) => ({
          value,
          label: CLOSING_LABELS[value],
          count: list.facetCounts.closing?.[value],
        })),
      },
      ...customFieldFacets(filterDefinitions, list.facetCounts, filters),
    ],
    [filterDefinitions, filters, list.facetCounts, ownerLabels],
  );
  const visibleIds = useMemo(() => list.rows.map((deal) => deal.id), [list.rows]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedSet.has(id));
  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of visibleIds) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return [...next];
      });
    },
    [visibleIds],
  );
  const runBulk = useCallback(
    async (method: string, input: unknown, successMessage: string) => {
      setBulkBusy(true);
      setBulkError(null);
      setBulkStatus(null);
      try {
        await listRpc(rpc).call(method, input);
        setSelectedIds([]);
        setBulkStatus(successMessage);
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setBulkError(errorMessage(cause));
      } finally {
        setBulkBusy(false);
      }
    },
    [rpc],
  );

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const unconverted = list.unconverted;

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-background text-foreground">
      <PageHeader
        title="Deals"
        description="Track pipeline stages, source-currency amounts, and expected close dates."
        actions={
          <>
            <Button
              type="button"
              variant={showArchived ? "secondary" : "outline"}
              size="sm"
              aria-pressed={showArchived}
              onClick={() => {
                setShowArchived((value) => !value);
                setPage(1);
              }}
            >
              <Icon name="Archive" aria-hidden="true" />
              Archived
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
            >
              <Icon name="Plus" aria-hidden="true" />
              New deal
            </Button>
          </>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
        <SavedViewBar
          entity="DEAL"
          currentFilters={{
            q: query,
            sort,
            dir,
            archived: showArchived,
            filters: { ...filters, status: [status] },
            columns: columnPreferences.visibleColumns.map((column) => column.id),
          }}
          onApplyFilters={(filters: SavedViewFilters) => {
            const savedStatus = filters.filters.status?.[0];
            setQuery(filters.q);
            setSort(
              DEAL_SORT_OPTIONS.some((option) => option.value === filters.sort)
                ? filters.sort
                : "createdAt",
            );
            setDir(filters.dir);
            setFilters(
              cleanFilters(
                Object.fromEntries(
                  Object.entries(filters.filters).filter(([key]) => key !== "status"),
                ),
              ),
            );
            setShowArchived(filters.archived);
            if (savedStatus === "open" || savedStatus === "closed" || savedStatus === "all") {
              setStatus(savedStatus);
            }
            if (filters.columns.length > 0) {
              columnPreferences.apply(filters.columns);
            }
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <SearchField
              label="Search deals"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onClear={() => {
                setQuery("");
                setPage(1);
              }}
              placeholder="Search deals by name or company…"
              containerClassName="w-full sm:w-80"
            />
            <ColumnPreferences preference={columnPreferences} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span role="status" aria-live="polite">
              {list.total} {list.total === 1 ? "deal" : "deals"}
            </span>
            <span>
              Open pipeline ({list.reportingCurrency}): {formatMinorAmount(list.openValueCents, list.reportingCurrency)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-1 rounded-md border border-border p-1"
            role="group"
            aria-label="Deal status filter"
          >
            {DEAL_STATUS_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant={status === option.id ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={status === option.id}
                onClick={() => {
                  setStatus(option.id);
                  setPage(1);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Source amounts stay in their original currency; compatible pipeline totals use frozen base money.
          </p>
        </div>
        <ListControls
          entityLabel="deals"
          sort={sort}
          dir={dir}
          sortOptions={DEAL_SORT_OPTIONS}
          filters={filters}
          facets={facets}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          onDirChange={(next) => {
            setDir(next);
            setPage(1);
          }}
          onFiltersChange={(next) => {
            setFilters(cleanFilters(next));
            setPage(1);
          }}
        />
        {unconverted.count > 0 ? (
          <div
            className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            role="note"
          >
            <span className="font-medium text-foreground">Unconverted deal disclosure:</span>{" "}
            {unconverted.count} {unconverted.count === 1 ? "deal is" : "deals are"} missing a frozen {list.reportingCurrency} conversion. Their source values remain visible, but they are excluded from compatible reporting totals
            {unconverted.currencies.length > 0
              ? ` (${unconverted.currencies.join(", ")}).`
              : "."}
          </div>
        ) : null}
        {listError === null ? null : (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <span>{listError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void reloadList()}>
              Retry
            </Button>
          </div>
        )}
        {bulkStatus ? (
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {bulkStatus}
          </p>
        ) : null}
        {bulkError ? (
          <p className="text-sm text-destructive" role="alert">
            {bulkError}
          </p>
        ) : null}
        {selectedIds.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
            role="toolbar"
            aria-label="Deal bulk actions"
          >
            <span className="text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">{selectedIds.length}</strong>{" "}
              selected
            </span>
            {!showArchived ? (
              <>
                <select
                  className="h-8 min-w-36 rounded-md border border-input bg-background px-2 text-xs"
                  aria-label="Bulk owner"
                  value={bulkOwnerId}
                  onChange={(event) => setBulkOwnerId(event.target.value)}
                  disabled={bulkBusy}
                >
                  <option value="">Unassigned</option>
                  {(facets.find((facet) => facet.id === "owner")?.options ?? [])
                    .filter((option) => option.value !== "unassigned")
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() =>
                    void runBulk(
                      "deals_bulkAssignOwner",
                      { ids: selectedIds, ownerId: bulkOwnerId || null },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "deal" : "deals"} reassigned.`,
                    )
                  }
                >
                  Assign owner
                </Button>
                <select
                  className="h-8 min-w-40 rounded-md border border-input bg-background px-2 text-xs"
                  aria-label="Bulk stage"
                  value={bulkStage}
                  onChange={(event) => setBulkStage(event.target.value as DealStage)}
                  disabled={bulkBusy}
                >
                  {DEAL_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stageLabel(stage)}
                    </option>
                  ))}
                </select>
                {bulkStage === "CLOSED_LOST" ? (
                  <Input
                    className="h-8 w-40 text-xs"
                    aria-label="Bulk close reason"
                    value={bulkCloseReason}
                    onChange={(event) => setBulkCloseReason(event.target.value)}
                    placeholder="Close reason"
                    disabled={bulkBusy}
                  />
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy || (bulkStage === "CLOSED_LOST" && bulkCloseReason.trim() === "")}
                  onClick={() =>
                    void runBulk(
                      "deals_bulkSetStage",
                      {
                        ids: selectedIds,
                        stage: bulkStage,
                        ...(bulkStage === "CLOSED_LOST" && bulkCloseReason.trim()
                          ? { closedReason: bulkCloseReason.trim() }
                          : {}),
                      },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "deal" : "deals"} moved.`,
                    )
                  }
                >
                  Change stage
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => setBulkConfirm("archive")}
                >
                  Archive selected
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() =>
                    void runBulk(
                      "deals_bulkRestore",
                      { ids: selectedIds },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "deal" : "deals"} restored.`,
                    )
                  }
                >
                  Restore selected
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => setBulkConfirm("purge")}
                >
                  Delete selected
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulkBusy}
              onClick={() => setSelectedIds([])}
            >
              Clear selection
            </Button>
          </div>
        ) : null}
        <TableShell
          caption="Deals"
          columns={[
            {
              id: "select",
              label: (
                <SelectAllCheckbox
                  label="Select all visible deals"
                  checked={allVisibleSelected}
                  indeterminate={!allVisibleSelected && someVisibleSelected}
                  disabled={listLoading || visibleIds.length === 0}
                  onChange={toggleAll}
                />
              ),
              className: "w-10 px-3",
            },
            ...columnPreferences.visibleColumns,
          ]}
          loading={listLoading}
          empty={
            <EmptyState
              icon="Target"
              title={showArchived ? "No archived deals" : "No deals found"}
              description={
                query
                  ? "Try a different search or clear the current filter."
                  : "Create a deal to start building your pipeline."
              }
              action={
                query ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setPage(1);
                    }}
                  >
                    Clear search
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                    <Icon name="Plus" aria-hidden="true" />
                    New deal
                  </Button>
                )
              }
              className="min-h-48 rounded-none border-0 bg-transparent"
            />
          }
        >
          {list.rows.map((deal) => (
            <tr
              key={deal.id}
              tabIndex={0}
              aria-label={`Open ${deal.name}`}
              className="cursor-pointer outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
              onClick={() => openRecord(deal.id)}
                onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openRecord(deal.id);
                  }
                }}
              >
                <td
                  className="w-10 px-3 py-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Select ${deal.name}`}
                    checked={selectedSet.has(deal.id)}
                    onChange={(event) => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(deal.id);
                        else next.delete(deal.id);
                        return [...next];
                      });
                    }}
                  />
                </td>
                {columnPreferences.visibleColumns.map((column) => (
                  <td
                    key={column.id}
                    className={
                      column.id === "deal"
                        ? "px-3 py-3 font-medium"
                        : column.id === "amount"
                          ? "px-3 py-3 text-right tabular-nums"
                          : column.id === "close-date" ||
                              column.id === "last-activity" ||
                              column.id.startsWith("field:")
                            ? "whitespace-nowrap px-3 py-3 text-muted-foreground"
                            : "px-3 py-3 text-muted-foreground"
                    }
                  >
                    {column.id === "stage" ? (
                      <DealStageMenu
                        deal={deal}
                        busy={stageBusyId === deal.id}
                        onSelect={(stage) => selectListStage(deal, stage)}
                      />
                    ) : column.id === "last-activity" && deal.lastActivityAt ? (
                      <time dateTime={deal.lastActivityAt}>
                        {dealColumnValue(deal, column.id, tableDefinitions)}
                      </time>
                    ) : column.id === "close-date" && deal.expectedCloseDate ? (
                      <time dateTime={deal.expectedCloseDate}>
                        {dealColumnValue(deal, column.id, tableDefinitions)}
                      </time>
                    ) : (
                      dealColumnValue(deal, column.id, tableDefinitions)
                    )}
                  </td>
                ))}
            </tr>
          ))}
        </TableShell>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={listLoading || page <= 1}
              aria-label="Previous deals page"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <Icon name="ChevronLeft" aria-hidden="true" />
              Previous
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={listLoading || page >= totalPages}
              aria-label="Next deals page"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
              <Icon name="ChevronRight" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <DealStageReasonDialog
        request={stageRequest}
        busy={stageBusyId === stageRequest?.dealId}
        onOpenChange={(open) => {
          if (!open) setStageRequest(null);
        }}
        onSubmit={async (reason) => {
          if (stageRequest === null) return;
          await runListSetStage(stageRequest.dealId, stageRequest.stage, reason);
          setStageRequest(null);
        }}
      />
      <AlertDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={`Delete ${record?.name ?? "deal"} permanently?`}
        description="This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={purgeRecord}
      />
      <AlertDialog
        open={bulkConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setBulkConfirm(null);
        }}
        title={
          bulkConfirm === "purge"
            ? `Delete ${selectedIds.length} ${selectedIds.length === 1 ? "deal" : "deals"} permanently?`
            : `Archive ${selectedIds.length} ${selectedIds.length === 1 ? "deal" : "deals"}?`
        }
        description={bulkConfirm === "purge" ? "This cannot be undone." : "Archived deals can be restored later."}
        confirmLabel={bulkConfirm === "purge" ? "Delete permanently" : "Archive"}
        destructive={bulkConfirm === "purge"}
        onConfirm={async () => {
          if (bulkConfirm === "purge") {
            await runBulk(
              "deals_bulkPurge",
              { ids: selectedIds },
              `${selectedIds.length} ${selectedIds.length === 1 ? "deal" : "deals"} deleted.`,
            );
          } else if (bulkConfirm === "archive") {
            await runBulk(
              "deals_bulkArchive",
              { ids: selectedIds },
              `${selectedIds.length} ${selectedIds.length === 1 ? "deal" : "deals"} archived.`,
            );
          }
        }}
      />
      <RecordDrawer
        open={recordId !== null}
        onOpenChange={(open) => {
          if (!open) closeRecord();
        }}
        title={record?.name ?? "Deal"}
        description={
          record === null
            ? "Deal record"
            : `${stageLabel(record.stage)} · ${formatMinorAmount(record.amountCents, record.currency)}`
        }
      >
        {recordLoading ? (
          <div className="flex min-h-56 items-center justify-center" role="status">
            Loading deal…
          </div>
        ) : recordError !== null ? (
          <EmptyState
            title="Could not load deal"
            description={recordError}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecordRefreshKey((value) => value + 1)}
              >
                Retry
              </Button>
            }
          />
        ) : record === null ? (
          <EmptyState title="Deal not found" />
        ) : (
          <div className="space-y-5">
            <div
              className="flex min-w-0 gap-1 overflow-x-auto border-b border-border"
              role="tablist"
              aria-label={`${record.name} views`}
            >
              {DEAL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={recordTab === tab.id}
                  className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
                  onClick={() => {
                    setRecordTab(tab.id);
                    onTabChange?.(tab.id, record.id);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {recordTab === "overview" ? (
              <DealOverview
                deal={record}
                companyOptions={selectableCompanyOptions}
                ownerOptions={ownerOptions}
                onUpdate={(data, optimistic) => void runRecordUpdate(data, optimistic)}
                mutationBusy={mutationBusy}
                mutationError={mutationError}
                onSetStage={runSetStage}
                onArchive={() => void runArchiveMutation("deals_archive")}
                onRestore={() => void runArchiveMutation("deals_restore")}
                onPurge={() => setPurgeOpen(true)}
              />
            ) : recordTab === "contacts" ? (
              <DealContacts
                deal={record}
                rpc={rpc}
                onOpenContact={
                  onOpenRelatedRecord === undefined
                    ? undefined
                    : (id) => onOpenRelatedRecord("contact", id)
                }
                onChanged={() => {
                  setRecordRefreshKey((value) => value + 1);
                  setRefreshKey((value) => value + 1);
                }}
              />
            ) : recordTab === "activity" ? (
              <ActivityTimeline
                anchor={{ dealId: record.id }}
                title="Deal activity"
                description="Notes, touchpoints, and follow-up work for this deal."
              />
            ) : recordTab === "agent" ? (
              <RecordAgentTab
                rpc={rpc as unknown as RecordAgentRpcClient}
                recordType="DEAL"
                recordId={record.id}
                recordLabel={record.name}
              />
            ) : null}
          </div>
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
        title="New deal"
        description="Add a pipeline opportunity with explicit source-money semantics."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={createSaving}
              onClick={closeCreate}
            >
              Cancel
            </Button>
            <Button type="submit" form="create-deal-form" disabled={createSaving}>
              {createSaving ? "Creating…" : "Create deal"}
            </Button>
          </>
        }
      >
        <DealForm
          formId="create-deal-form"
          value={createValue}
          error={createError}
          saving={createSaving}
          onChange={setCreateValue}
          onSubmit={submitCreate}
          companyOptions={companyOptions}
          ownerOptions={ownerOptions}
        />
      </RecordDrawer>
    </div>
  );
}
