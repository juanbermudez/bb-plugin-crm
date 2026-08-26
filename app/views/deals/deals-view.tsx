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
  CURRENCY_CODES,
  DEAL_STAGES,
  type CurrencyCode,
  type Deal,
  type DealCreateInput,
  type DealListInput,
  type DealListOutput,
  type DealStage,
  type DealUpdateInput,
  type SetDealStageInput,
  type DealListStatus,
  type SavedViewFilters,
} from "../../../contracts/core.js";
import {
  EmptyState,
  PageHeader,
  RecordDrawer,
  SearchField,
  TableShell,
} from "../../components/index.js";
import { useDealsRpc, type DealsRpcClient } from "./rpc.js";
import { ActivityTimeline } from "../activity/index.js";
import { SavedViewBar } from "../saved-views/index.js";

const PAGE_SIZE = 25;

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type DealTab = "overview" | "contacts" | "activity" | "agent";

const DEAL_TABS: ReadonlyArray<{ id: DealTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

const DEAL_STATUS_OPTIONS: ReadonlyArray<{
  id: DealListStatus;
  label: string;
}> = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

const DEAL_COLUMNS = [
  { id: "deal", label: "Deal", className: "min-w-52" },
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

function isClosedStage(stage: DealStage): boolean {
  return stage === "CLOSED_WON" || stage === "CLOSED_LOST";
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function createListInput(
  query: string,
  page: number,
  status: DealListStatus,
  archived: boolean,
): DealListInput {
  return {
    q: query,
    sort: "createdAt",
    dir: "desc",
    page,
    pageSize: PAGE_SIZE,
    status,
    owner: [],
    stage: [],
    closing: [],
    fields: {},
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
}

function DealForm({
  formId,
  value,
  error,
  saving,
  onChange,
  onSubmit,
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
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-company`}>
            Company ID
          </label>
          <Input
            id={`${formId}-company`}
            required
            value={value.companyId}
            onChange={(event) => onChange({ ...value, companyId: event.target.value })}
            placeholder="cmp_acme"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-owner`}>
            Owner ID
          </label>
          <Input
            id={`${formId}-owner`}
            required
            value={value.ownerId}
            onChange={(event) => onChange({ ...value, ownerId: event.target.value })}
            placeholder="usr_juan"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      </div>
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
  mutationBusy: boolean;
  mutationError: string | null;
  onSetStage: (stage: DealStage, closedReason?: string) => Promise<void> | void;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

function DealOverview({
  deal,
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

  useEffect(() => {
    setStageDraft(deal.stage);
    setClosedReasonDraft(deal.closedReason ?? "");
  }, [deal.id, deal.stage, deal.closedReason]);

  const reasonChanged =
    stageDraft === "CLOSED_LOST" &&
    closedReasonDraft.trim() !== (deal.closedReason ?? "");
  const stageDirty = stageDraft !== deal.stage || reasonChanged;
  const missingLostReason =
    stageDraft === "CLOSED_LOST" && closedReasonDraft.trim() === "";

  return (
    <div className="space-y-6">
      <form
        className="space-y-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSetStage(
            stageDraft,
            stageDraft === "CLOSED_LOST"
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
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={mutationBusy || !stageDirty || missingLostReason}
          >
            {mutationBusy ? "Saving…" : "Save stage"}
          </Button>
        </div>
        {stageDraft === "CLOSED_LOST" ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="deal-closed-reason">
              Close reason <span className="font-normal">(required)</span>
            </label>
            <Input
              id="deal-closed-reason"
              value={closedReasonDraft}
              required
              disabled={mutationBusy}
              onChange={(event) => setClosedReasonDraft(event.target.value)}
              placeholder="Budget, timing, competitor…"
            />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Current stage: <span className="font-medium text-foreground">{stageLabel(deal.stage)}</span>
        </p>
      </form>

      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Company</dt>
          <dd className="mt-1 text-sm">
            {deal.company?.name ?? displayValue(deal.companyId)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Owner</dt>
          <dd className="mt-1 text-sm">
            {deal.owner?.name ?? displayValue(deal.ownerId)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Source amount</dt>
          <dd className="mt-1 text-sm">
            {formatMinorAmount(deal.amountCents, deal.currency)}
          </dd>
        </div>
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
          <dt className="text-xs font-medium text-muted-foreground">Expected close date</dt>
          <dd className="mt-1 text-sm">{formatDate(deal.expectedCloseDate)}</dd>
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

      {deal.description ? (
        <section className="space-y-2 border-t border-border pt-5">
          <h3 className="text-sm font-medium">Description</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {deal.description}
          </p>
        </section>
      ) : null}

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

function DealContacts({ deal }: { deal: Deal }) {
  const contacts = deal.contacts ?? [];
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon="UserRound"
        title="No contacts linked"
        description="Contacts assigned to this deal will appear here."
        className="min-h-56 border-0 bg-transparent"
      />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Deal contacts">
      {contacts.map((contact) => (
        <li key={contact.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-medium">
              {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
            </p>
            <p className="text-xs text-muted-foreground">
              {displayValue(contact.role ?? contact.title)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground sm:text-right">
            {displayValue(contact.email)}
          </p>
        </li>
      ))}
    </ul>
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
  /** Reflects record drawer changes back into the BB panel sub-path. */
  onRecordIdChange?: (id: string | null) => void;
}

export function DealsView({
  rpcClient,
  initialRecordId = null,
  onRecordIdChange,
}: DealsViewProps) {
  const contextRpc = useDealsRpc();
  const rpc = rpcClient ?? contextRpc;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DealListStatus>("open");
  const [showArchived, setShowArchived] = useState(false);
  const [list, setList] = useState<DealListOutput>(EMPTY_LIST);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordId, setRecordId] = useState<string | null>(initialRecordId);
  const [record, setRecord] = useState<Deal | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordRefreshKey, setRecordRefreshKey] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<DealTab>("overview");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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

  const listInput = useMemo(
    () => createListInput(query, page, status, showArchived),
    [page, query, showArchived, status],
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
    setRecordId(initialRecordId);
  }, [initialRecordId]);

  useEffect(() => {
    if (recordId === null) return;
    let active = true;
    setRecordLoading(true);
    setRecordError(null);
    setMutationError(null);
    setRecordTab("overview");
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

  const runSetStage = useCallback(
    async (stage: DealStage, closedReason?: string) => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const input: SetDealStageInput = {
          id: record.id,
          stage,
          ...(stage === "CLOSED_LOST" && closedReason?.trim()
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
                  stage === "CLOSED_LOST" ? closedReason?.trim() || null : null,
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
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete ${record.name} permanently? This cannot be undone.`,
      )
    ) {
      return;
    }
    setMutationBusy(true);
    setMutationError(null);
    try {
      await rpc.call("deals_purge", { id: record.id });
      closeRecord();
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setMutationError(errorMessage(cause));
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
        setCreateOpen(false);
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
    [createValue, rpc],
  );

  const openRecord = useCallback(
    (id: string) => {
      setRecord(id === recordId ? record : null);
      setRecordId(id);
      onRecordIdChange?.(id);
    },
    [onRecordIdChange, record, recordId],
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
            sort: "createdAt",
            dir: "desc",
            archived: showArchived,
            filters: { status: [status] },
            columns: [],
          }}
          onApplyFilters={(filters: SavedViewFilters) => {
            const savedStatus = filters.filters.status?.[0];
            setQuery(filters.q);
            setShowArchived(filters.archived);
            if (savedStatus === "open" || savedStatus === "closed" || savedStatus === "all") {
              setStatus(savedStatus);
            }
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            placeholder="Search deals…"
            containerClassName="w-full sm:w-80"
          />
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
        <TableShell
          caption="Deals"
          columns={DEAL_COLUMNS}
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
              <td className="px-3 py-3 font-medium">{deal.name}</td>
              <td className="px-3 py-3 text-muted-foreground">
                {deal.company?.name ?? displayValue(deal.companyId)}
              </td>
              <td className="px-3 py-3 text-muted-foreground">{stageLabel(deal.stage)}</td>
              <td className="px-3 py-3 text-muted-foreground">
                {deal.owner?.name ?? displayValue(deal.ownerId)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {formatMinorAmount(deal.amountCents, deal.currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {formatDate(deal.expectedCloseDate)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {formatDate(deal.lastActivityAt)}
              </td>
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
                  onClick={() => setRecordTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {recordTab === "overview" ? (
              <DealOverview
                deal={record}
                mutationBusy={mutationBusy}
                mutationError={mutationError}
                onSetStage={runSetStage}
                onArchive={() => void runArchiveMutation("deals_archive")}
                onRestore={() => void runArchiveMutation("deals_restore")}
                onPurge={() => void purgeRecord()}
              />
            ) : recordTab === "contacts" ? (
              <DealContacts deal={record} />
            ) : recordTab === "activity" ? (
              <ActivityTimeline
                anchor={{ dealId: record.id }}
                title="Deal activity"
                description="Notes, touchpoints, and follow-up work for this deal."
              />
            ) : (
              <StagedDealTab tab={recordTab} />
            )}
          </div>
        )}
      </RecordDrawer>

      <RecordDrawer
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
        title="New deal"
        description="Add a pipeline opportunity with explicit source-money semantics."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={createSaving}
              onClick={() => setCreateOpen(false)}
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
        />
      </RecordDrawer>
    </div>
  );
}
