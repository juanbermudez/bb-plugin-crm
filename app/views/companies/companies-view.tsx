import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import {
  EmptyState,
  ColumnPreferences,
  PageHeader,
  RecordDrawer,
  SearchField,
  TableShell,
  usePersistentColumnPreferences,
  type TableColumnPreference,
} from "../../components/index.js";
import type {
  Company,
  CompanyCreateInput,
  CompanyListInput,
  CompanyListOutput,
  Contact,
  Deal,
  FieldDefinition,
  SavedViewFilters,
  SortDirection,
} from "../../../contracts/core.js";
import { useCompaniesRpc, type CompaniesRpcClient } from "./rpc.js";
import { ActivityTimeline } from "../activity/index.js";
import { SavedViewBar, type SavedViewsRpcClient } from "../saved-views/index.js";
import { RecordFieldsEditor } from "../record-fields/index.js";
import { RecordAgentTab, type RecordAgentRpcClient } from "../../components/record-agent-tab.js";
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

const COMPANY_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: "name", label: "Company" },
  { value: "domain", label: "Domain" },
  { value: "industry", label: "Industry" },
  { value: "owner", label: "Owner" },
  { value: "createdAt", label: "Created" },
  { value: "lastActivity", label: "Last activity" },
];

const COMPANY_STANDARD_FILTERS = [
  "owner",
  "industry",
  "enrichment",
  "source",
  "activity",
] as const;

type CompanyBulkRpcClient = {
  call(method: string, input: unknown): Promise<unknown>;
};

type CompanyTab = "overview" | "contacts" | "deals" | "activity" | "agent";

const COMPANY_TABS: ReadonlyArray<{ id: CompanyTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "deals", label: "Deals" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

const COMPANY_COLUMNS = [
  { id: "company", label: "Company", className: "min-w-52", required: true },
  { id: "domain", label: "Domain", className: "min-w-40" },
  { id: "industry", label: "Industry", className: "min-w-36" },
  { id: "owner", label: "Owner", className: "min-w-32" },
  { id: "contacts", label: "Contacts", className: "text-right" },
  { id: "open-deals", label: "Open deals", className: "text-right" },
  { id: "last-activity", label: "Last activity", className: "min-w-32" },
] as const;

const EMPTY_LIST: CompanyListOutput = {
  rows: [],
  total: 0,
  facetCounts: {},
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

function companyColumnValue(
  company: Company,
  columnId: string,
  definitions: readonly FieldDefinition[],
): string {
  switch (columnId) {
    case "company":
      return company.name;
    case "domain":
      return displayValue(company.domain);
    case "industry":
      return displayValue(company.industry);
    case "owner":
      return company.owner?.name ?? displayValue(company.ownerId);
    case "contacts":
      return String(company.contactCount ?? 0);
    case "open-deals":
      return String(company.openDealCount ?? 0);
    case "last-activity":
      return formatDate(company.lastActivityAt);
    default: {
      const fieldId = columnId.startsWith("field:")
        ? columnId.slice("field:".length)
        : "";
      const definition = definitions.find((candidate) => candidate.id === fieldId);
      return definition
        ? customFieldDisplay(definition, company.fields?.[definition.key])
        : "—";
    }
  }
}

function facetValueLabel(value: string): string {
  if (value === "unassigned") return "Unassigned";
  if (!value.includes("_") && !value.includes("-") && value !== value.toUpperCase()) {
    return value;
  }
  return value
    .toLowerCase()
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCompany(value: unknown): value is Company {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}

type NestedCompanyRecord =
  | { kind: "contact"; id: string; value: Contact | null }
  | { kind: "deal"; id: string; value: Deal | null };

function contactName(contact: Pick<Contact, "firstName" | "lastName">): string {
  return [contact.firstName, contact.lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ") || "Contact";
}

function isContact(value: unknown): value is Contact {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "firstName" in value &&
    typeof value.firstName === "string"
  );
}

function isDeal(value: unknown): value is Deal {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function listRpc(rpc: CompaniesRpcClient): CompanyBulkRpcClient {
  return rpc as unknown as CompanyBulkRpcClient;
}

function customFieldInput(filters: ListFilters): Record<string, string[]> {
  const standard = new Set<string>(COMPANY_STANDARD_FILTERS);
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
  archived: boolean,
  sort: string,
  dir: SortDirection,
  filters: ListFilters,
): CompanyListInput {
  return {
    q: query,
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
    owner: filters.owner ?? [],
    industry: filters.industry ?? [],
    enrichment: (filters.enrichment ?? []) as CompanyListInput["enrichment"],
    source: (filters.source ?? []) as CompanyListInput["source"],
    activity: (filters.activity ?? []) as CompanyListInput["activity"],
    fields: customFieldInput(filters),
    archived,
  };
}

interface CompanyFormProps {
  formId: string;
  value: CompanyCreateInput;
  error: string | null;
  saving: boolean;
  onChange: (next: CompanyCreateInput) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function CompanyForm({
  formId,
  value,
  error,
  saving,
  onChange,
  onSubmit,
}: CompanyFormProps) {
  return (
    <form id={formId} className="space-y-5" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-name`}>
          Company name
        </label>
        <Input
          id={`${formId}-name`}
          required
          autoFocus
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="Acme Corporation"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-domain`}>
          Domain <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`${formId}-domain`}
          type="text"
          value={value.domain ?? ""}
          onChange={(event) =>
            onChange({ ...value, domain: event.target.value || undefined })
          }
          placeholder="acme.example"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-owner`}>
          Owner ID <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`${formId}-owner`}
          value={value.ownerId ?? ""}
          onChange={(event) =>
            onChange({ ...value, ownerId: event.target.value || null })
          }
          placeholder="Leave blank for unassigned"
          autoCapitalize="none"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Paste a BB user ID when assigning the company during creation.
        </p>
      </div>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saving ? (
        <p className="text-sm text-muted-foreground" role="status">
          Creating company…
        </p>
      ) : null}
    </form>
  );
}

interface CompanyOverviewProps {
  company: Company;
  mutationBusy: boolean;
  mutationError: string | null;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

function CompanyOverview({
  company,
  mutationBusy,
  mutationError,
  onArchive,
  onRestore,
  onPurge,
}: CompanyOverviewProps) {
  const primaryContact = company.contacts?.find(
    (contact) => contact.id === company.primaryContactId,
  );
  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Domain</dt>
          <dd className="mt-1 text-sm">{displayValue(company.domain)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Industry</dt>
          <dd className="mt-1 text-sm">{displayValue(company.industry)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Owner</dt>
          <dd className="mt-1 text-sm">
            {company.owner?.name ?? displayValue(company.ownerId)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Primary contact</dt>
          <dd className="mt-1 text-sm">
            {company.primaryContactId ? (
              primaryContact ? contactName(primaryContact) : company.primaryContactId
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Source</dt>
          <dd className="mt-1 text-sm">{displayValue(company.source)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Contacts</dt>
          <dd className="mt-1 text-sm">{company.contactCount ?? 0}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Open deals</dt>
          <dd className="mt-1 text-sm">{company.openDealCount ?? 0}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Last activity</dt>
          <dd className="mt-1 text-sm">{formatDate(company.lastActivityAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Status</dt>
          <dd className="mt-1 text-sm">
            {company.archivedAt ? "Archived" : "Active"}
          </dd>
        </div>
      </dl>
      {company.description ? (
        <section className="space-y-2 border-t border-border pt-5">
          <h3 className="text-sm font-medium">Description</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {company.description}
          </p>
        </section>
      ) : null}
      <RecordFieldsEditor entity="COMPANY" recordId={company.id} />
      <section className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {company.archivedAt ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutationBusy}
            onClick={onRestore}
          >
            <Icon name="ArchiveRestore" aria-hidden="true" />
            Restore company
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={mutationBusy}
            onClick={onArchive}
          >
            <Icon name="Archive" aria-hidden="true" />
            Archive company
          </Button>
        )}
        {company.archivedAt ? (
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
          Saving company…
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

interface CompanyContactsProps {
  company: Company;
  busy?: boolean;
  onOpenContact?: (id: string) => void;
  onSetPrimary?: (id: string | null) => void;
}

function CompanyContacts({
  company,
  busy = false,
  onOpenContact,
  onSetPrimary,
}: CompanyContactsProps) {
  const contacts = company.contacts ?? [];
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon="UserRound"
        title="No contacts linked"
        description="Contacts assigned to this company will appear here."
        className="min-h-56 border-0 bg-transparent"
      />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Company contacts">
      {contacts.map((contact) => {
        const name = contactName(contact);
        const isPrimary = contact.id === company.primaryContactId;
        return (
          <li
            key={contact.id}
            className="flex min-w-0 items-center gap-2 px-3 py-2.5"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={
                isPrimary
                  ? `Clear primary contact: ${name}`
                  : `Make ${name} primary contact`
              }
              aria-pressed={isPrimary}
              disabled={busy || onSetPrimary === undefined}
              onClick={() => onSetPrimary?.(isPrimary ? null : contact.id)}
            >
              <Icon name="Star" aria-hidden="true" className={isPrimary ? "fill-current" : undefined} />
            </Button>
            <button
              type="button"
              className="min-w-0 flex-1 rounded px-1 py-1 text-left outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
              onClick={() => onOpenContact?.(contact.id)}
              disabled={onOpenContact === undefined}
              aria-label={`Open ${name}`}
            >
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {displayValue(contact.title)} · {displayValue(contact.email)}
              </span>
            </button>
        </li>
        );
      })}
    </ul>
  );
}

function CompanyDeals({
  company,
  onOpenDeal,
}: {
  company: Company;
  onOpenDeal?: (id: string) => void;
}) {
  const deals = company.deals ?? [];
  if (deals.length === 0) {
    return (
      <EmptyState
        icon="Target"
        title="No deals linked"
        description="Deals for this company will appear here."
        className="min-h-56 border-0 bg-transparent"
      />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Company deals">
      {deals.map((deal) => (
        <li key={deal.id} className="px-3 py-2.5">
          <button
            type="button"
            className="w-full rounded px-1 py-1 text-left outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
            onClick={() => onOpenDeal?.(deal.id)}
            disabled={onOpenDeal === undefined}
            aria-label={`Open ${deal.name}`}
          >
            <span className="block truncate text-sm font-medium">{deal.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{deal.id}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StagedCompanyTab({ tab }: { tab: "agent" }) {
  const label = COMPANY_TABS.find((item) => item.id === tab)?.label ?? tab;
  return (
    <EmptyState
      icon={tab === "agent" ? "Brain" : "Layers"}
      title={`${label} is staged next`}
      description={`The ${label.toLowerCase()} workspace keeps its source layout and will be connected in the next CRM parity slice.`}
      className="min-h-56 border-0 bg-transparent"
    />
  );
}

function NestedCompanyRecordContent({
  item,
  onOpenDeal,
}: {
  item: NestedCompanyRecord;
  onOpenDeal: (id: string) => void;
}) {
  if (item.value === null) return null;
  if (item.kind === "contact") {
    const contact = item.value;
    return (
      <div className="space-y-5">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Email</dt>
            <dd className="mt-1 break-words text-sm">{displayValue(contact.email)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Phone</dt>
            <dd className="mt-1 text-sm">{displayValue(contact.phone)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Title</dt>
            <dd className="mt-1 text-sm">{displayValue(contact.title)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Company</dt>
            <dd className="mt-1 text-sm">{contact.company?.name ?? displayValue(contact.companyId)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Owner</dt>
            <dd className="mt-1 text-sm">{contact.owner?.name ?? displayValue(contact.ownerId)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Status</dt>
            <dd className="mt-1 text-sm">{contact.archivedAt ? "Archived" : "Active"}</dd>
          </div>
        </dl>
        {contact.companyId ? (
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            This contact is shown in the company record stack. Use Back to return to the company.
          </p>
        ) : null}
        {contact.deals && contact.deals.length > 0 ? (
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Deals</h3>
            <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Nested contact deals">
              {contact.deals.map((deal) => (
                <li key={deal.id} className="px-3 py-2.5">
                  <button
                    type="button"
                    className="w-full rounded px-1 py-1 text-left text-sm font-medium outline-none hover:bg-state-hover focus-visible:bg-state-hover"
                    onClick={() => onOpenDeal(deal.id)}
                  >
                    {deal.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }
  const deal = item.value;
  return (
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Company</dt>
        <dd className="mt-1 text-sm">{deal.company?.name ?? displayValue(deal.companyId)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Stage</dt>
        <dd className="mt-1 text-sm">{displayValue(deal.stage)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Owner</dt>
        <dd className="mt-1 text-sm">{deal.owner?.name ?? displayValue(deal.ownerId)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Close date</dt>
        <dd className="mt-1 text-sm">{formatDate(deal.expectedCloseDate)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Amount</dt>
        <dd className="mt-1 text-sm">
          {deal.amountCents == null ? "—" : `${deal.amountCents.toLocaleString()} ${deal.currency}`}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Status</dt>
        <dd className="mt-1 text-sm">{deal.archivedAt ? "Archived" : "Active"}</dd>
      </div>
    </dl>
  );
}

export interface CompaniesViewProps {
  /** Optional client injection keeps component tests and host previews small. */
  rpcClient?: CompaniesRpcClient;
  /** Optional saved-view client keeps restore behavior independently testable. */
  savedViewsRpcClient?: SavedViewsRpcClient;
  /** Record selected by the BB panel sub-path or browser history. */
  initialRecordId?: string | null;
  /** Reflects record drawer changes back into the BB panel sub-path. */
  onRecordIdChange?: (id: string | null) => void;
}

export function CompaniesView({
  rpcClient,
  savedViewsRpcClient,
  initialRecordId = null,
  onRecordIdChange,
}: CompaniesViewProps) {
  const contextRpc = useCompaniesRpc();
  const rpc = rpcClient ?? contextRpc;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<ListFilters>({});
  const [showArchived, setShowArchived] = useState(false);
  const [list, setList] = useState<CompanyListOutput>(EMPTY_LIST);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterDefinitions, setFilterDefinitions] = useState<readonly FieldDefinition[]>([]);
  const [tableDefinitions, setTableDefinitions] = useState<readonly FieldDefinition[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordId, setRecordId] = useState<string | null>(initialRecordId);
  const [record, setRecord] = useState<Company | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordRefreshKey, setRecordRefreshKey] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<CompanyTab>("overview");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [nestedStack, setNestedStack] = useState<NestedCompanyRecord[]>([]);
  const [nestedLoading, setNestedLoading] = useState(false);
  const [nestedError, setNestedError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState<CompanyCreateInput>({
    name: "",
    domain: undefined,
    ownerId: null,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const columnDefinitions = useMemo<readonly TableColumnPreference[]>(
    () => [
      ...COMPANY_COLUMNS,
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
    "crm:table-columns:company",
    columnDefinitions,
  );

  const listInput = useMemo(
    () => createListInput(query, page, showArchived, sort, dir, filters),
    [dir, filters, page, query, showArchived, sort],
  );

  const reloadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const next = await rpc.call("companies_list", listInput);
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
      .call("companies_list", listInput)
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
      .call("fields_filters", { entity: "COMPANY" })
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
      .call("fields_list", { entity: "COMPANY", includeArchived: false })
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
    if (recordId === null) return;
    let active = true;
    setRecordLoading(true);
    setRecordError(null);
    setMutationError(null);
    setRecordTab("overview");
    void rpc
      .call("companies_get", { id: recordId })
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

  const nestedTop = nestedStack[nestedStack.length - 1] ?? null;
  const nestedKind = nestedTop?.kind ?? null;
  const nestedId = nestedTop?.id ?? null;

  useEffect(() => {
    if (nestedKind === null || nestedId === null) {
      setNestedLoading(false);
      setNestedError(null);
      return;
    }
    let active = true;
    setNestedLoading(true);
    setNestedError(null);
    const method = nestedKind === "contact" ? "contacts_get" : "deals_get";
    void listRpc(rpc)
      .call(method, { id: nestedId })
      .then((next) => {
        if (!active) return;
        const value =
          nestedKind === "contact"
            ? isContact(next)
              ? next
              : null
            : isDeal(next)
              ? next
              : null;
        if (value === null) {
          setNestedError(`Could not load ${nestedKind}.`);
          return;
        }
        setNestedStack((current) => {
          const index = current.findIndex(
            (item) => item.kind === nestedKind && item.id === nestedId,
          );
          if (index < 0) return current;
          const nextStack = [...current];
          nextStack[index] = { ...nextStack[index]!, value } as NestedCompanyRecord;
          return nextStack;
        });
      })
      .catch((cause: unknown) => {
        if (active) setNestedError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setNestedLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nestedId, nestedKind, rpc]);

  const closeRecord = useCallback(() => {
    setRecordId(null);
    onRecordIdChange?.(null);
    setRecord(null);
    setNestedStack([]);
    setRecordError(null);
    setMutationError(null);
  }, [onRecordIdChange]);

  const runArchiveMutation = useCallback(
    async (method: "companies_archive" | "companies_restore") => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result =
          method === "companies_archive"
            ? await rpc.call("companies_archive", { id: record.id })
            : await rpc.call("companies_restore", { id: record.id });
        setRecord(
          isCompany(result)
            ? result
            : {
                ...record,
                archivedAt:
                  method === "companies_archive"
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
      !window.confirm(`Delete ${record.name} permanently? This cannot be undone.`)
    ) {
      return;
    }
    setMutationBusy(true);
    setMutationError(null);
    try {
      await rpc.call("companies_purge", { id: record.id });
      closeRecord();
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setMutationError(errorMessage(cause));
    } finally {
      setMutationBusy(false);
    }
  }, [closeRecord, record, rpc]);

  const submitCreate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = createValue.name.trim();
      if (name === "") {
        setCreateError("Company name is required.");
        return;
      }
      setCreateSaving(true);
      setCreateError(null);
      try {
        await rpc.call("companies_create", {
          name,
          ...(createValue.domain?.trim()
            ? { domain: createValue.domain.trim() }
            : {}),
          ownerId: createValue.ownerId?.trim() || null,
        });
        setCreateOpen(false);
        setCreateValue({ name: "", domain: undefined, ownerId: null });
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

  const openRecord = useCallback((id: string) => {
    setRecord(id === recordId ? record : null);
    setRecordId(id);
    setNestedStack([]);
    onRecordIdChange?.(id);
  }, [onRecordIdChange, record, recordId]);

  const openNestedRecord = useCallback(
    (kind: NestedCompanyRecord["kind"], id: string) => {
      setNestedError(null);
      setNestedStack((current) => [
        ...current,
        { kind, id, value: null } as NestedCompanyRecord,
      ]);
    },
    [],
  );

  const popNestedRecord = useCallback(() => {
    setNestedStack((current) => current.slice(0, -1));
    setNestedError(null);
  }, []);

  const setPrimaryContact = useCallback(
    async (contactId: string | null) => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result = await rpc.call("companies_update", {
          id: record.id,
          data: { primaryContactId: contactId },
        });
        setRecord(
          isCompany(result) ? result : { ...record, primaryContactId: contactId },
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

  const ownerLabels = useMemo(
    () =>
      new Map(
        list.rows
          .filter((company) => company.owner?.name)
          .map((company) => [company.ownerId, company.owner?.name as string]),
      ),
    [list.rows],
  );
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
        id: "industry",
        label: "Industry",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "industry",
          filters.industry,
          facetValueLabel,
        ),
      },
      {
        id: "enrichment",
        label: "Enrichment",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "enrichment",
          filters.enrichment,
          facetValueLabel,
        ),
      },
      {
        id: "source",
        label: "Source",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "source",
          filters.source,
          facetValueLabel,
        ),
      },
      ...customFieldFacets(filterDefinitions, list.facetCounts, filters),
    ],
    [filterDefinitions, filters, list.facetCounts, ownerLabels],
  );
  const visibleIds = useMemo(() => list.rows.map((company) => company.id), [list.rows]);
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

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-background text-foreground">
      <PageHeader
        title="Companies"
        description="Search and manage the organizations in your CRM workspace."
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
              New company
            </Button>
          </>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
        <SavedViewBar
          entity="COMPANY"
          rpcClient={savedViewsRpcClient}
          currentFilters={{
            q: query,
            sort,
            dir,
            archived: showArchived,
            filters,
            columns: columnPreferences.visibleColumns.map((column) => column.id),
          }}
          onApplyFilters={(filters: SavedViewFilters) => {
            setQuery(filters.q);
            setSort(
              COMPANY_SORT_OPTIONS.some((option) => option.value === filters.sort)
                ? filters.sort
                : "name",
            );
            setDir(filters.dir);
            setFilters(cleanFilters(filters.filters));
            setShowArchived(filters.archived);
            if (filters.columns.length > 0) {
              columnPreferences.apply(filters.columns);
            }
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <SearchField
              label="Search companies"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onClear={() => {
                setQuery("");
                setPage(1);
              }}
              placeholder="Search companies…"
              containerClassName="w-full sm:w-80"
            />
            <ColumnPreferences preference={columnPreferences} />
          </div>
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {list.total} {list.total === 1 ? "company" : "companies"}
            {showArchived ? " · archived" : ""}
          </p>
        </div>
        <ListControls
          entityLabel="companies"
          sort={sort}
          dir={dir}
          sortOptions={COMPANY_SORT_OPTIONS}
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
            aria-label="Company bulk actions"
          >
            <span className="text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">{selectedIds.length}</strong>{" "}
              selected
            </span>
            {!showArchived ? (
              <>
                <select
                  className={"h-8 min-w-36 rounded-md border border-input bg-background px-2 text-xs"}
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
                      "companies_bulkAssignOwner",
                      { ids: selectedIds, ownerId: bulkOwnerId || null },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} reassigned.`,
                    )
                  }
                >
                  Assign owner
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => {
                    const confirmed =
                      typeof window === "undefined" ||
                      typeof window.confirm !== "function" ||
                      window.confirm(
                        `Archive ${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"}?`,
                      );
                    if (confirmed) {
                      void runBulk(
                        "companies_bulkArchive",
                        { ids: selectedIds },
                        `${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} archived.`,
                      );
                    }
                  }}
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
                      "companies_bulkRestore",
                      { ids: selectedIds },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} restored.`,
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
                  onClick={() => {
                    const confirmed =
                      typeof window === "undefined" ||
                      typeof window.confirm !== "function" ||
                      window.confirm(
                        `Delete ${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} permanently? This cannot be undone.`,
                      );
                    if (confirmed) {
                      void runBulk(
                        "companies_bulkPurge",
                        { ids: selectedIds },
                        `${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} deleted.`,
                      );
                    }
                  }}
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
          caption="Companies"
          columns={[
            {
              id: "select",
              label: (
                <SelectAllCheckbox
                  label="Select all visible companies"
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
              icon="Layers"
              title={showArchived ? "No archived companies" : "No companies found"}
              description={
                query
                  ? "Try a different search or clear the current filter."
                  : "Create a company to start building your CRM workspace."
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
                    New company
                  </Button>
                )
              }
              className="min-h-48 rounded-none border-0 bg-transparent"
            />
          }
        >
          {list.rows.map((company) => (
            <tr
              key={company.id}
              tabIndex={0}
              aria-label={`Open ${company.name}`}
              className="cursor-pointer outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
              onClick={() => openRecord(company.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openRecord(company.id);
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
                  aria-label={`Select ${company.name}`}
                  checked={selectedSet.has(company.id)}
                  onChange={(event) => {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(company.id);
                      else next.delete(company.id);
                      return [...next];
                    });
                  }}
                />
              </td>
              {columnPreferences.visibleColumns.map((column) => (
                <td
                  key={column.id}
                  className={
                    column.id === "company"
                      ? "px-3 py-3 font-medium"
                      : column.id === "contacts" || column.id === "open-deals"
                        ? "px-3 py-3 text-right tabular-nums"
                        : column.id === "last-activity" || column.id.startsWith("field:")
                          ? "whitespace-nowrap px-3 py-3 text-muted-foreground"
                          : "px-3 py-3 text-muted-foreground"
                  }
                >
                  {column.id === "last-activity" && company.lastActivityAt ? (
                    <time dateTime={company.lastActivityAt}>
                      {companyColumnValue(company, column.id, tableDefinitions)}
                    </time>
                  ) : (
                    companyColumnValue(company, column.id, tableDefinitions)
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
              aria-label="Previous companies page"
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
              aria-label="Next companies page"
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
        title={record?.name ?? "Company"}
        description={record?.domain ?? "Company record"}
      >
        {recordLoading ? (
          <div className="flex min-h-56 items-center justify-center" role="status">
            Loading company…
          </div>
        ) : recordError !== null ? (
          <EmptyState
            title="Could not load company"
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
          <EmptyState title="Company not found" />
        ) : (
          <div className="space-y-5">
            <div
              className="flex min-w-0 gap-1 overflow-x-auto border-b border-border"
              role="tablist"
              aria-label={`${record.name} views`}
            >
              {COMPANY_TABS.map((tab) => (
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
              <CompanyOverview
                company={record}
                mutationBusy={mutationBusy}
                mutationError={mutationError}
                onArchive={() => void runArchiveMutation("companies_archive")}
                onRestore={() => void runArchiveMutation("companies_restore")}
                onPurge={() => void purgeRecord()}
              />
            ) : recordTab === "contacts" ? (
              <CompanyContacts
                company={record}
                busy={mutationBusy}
                onOpenContact={(id) => openNestedRecord("contact", id)}
                onSetPrimary={(id) => void setPrimaryContact(id)}
              />
            ) : recordTab === "deals" ? (
              <CompanyDeals
                company={record}
                onOpenDeal={(id) => openNestedRecord("deal", id)}
              />
            ) : recordTab === "activity" ? (
              <ActivityTimeline
                anchor={{ companyId: record.id }}
                title="Company activity"
                description="Notes, touchpoints, and follow-up work for this company."
              />
            ) : recordTab === "agent" ? (
              <RecordAgentTab
                rpc={rpc as unknown as RecordAgentRpcClient}
                recordType="COMPANY"
                recordId={record.id}
                recordLabel={record.name}
              />
            ) : null}
          </div>
        )}
      </RecordDrawer>

      <RecordDrawer
        open={nestedTop !== null}
        onOpenChange={(open) => {
          if (!open) popNestedRecord();
        }}
        title={
          nestedTop?.value === null || nestedTop === null
            ? nestedTop?.kind === "contact"
              ? "Contact"
              : "Deal"
            : nestedTop.kind === "contact"
              ? contactName(nestedTop.value)
              : nestedTop.value.name
        }
        description={
          nestedTop?.kind === "contact"
            ? nestedTop.value && isContact(nestedTop.value)
              ? nestedTop.value.email ?? "Contact record"
              : "Contact record"
            : nestedTop?.value && isDeal(nestedTop.value)
              ? `${nestedTop.value.stage} · Deal record`
              : "Deal record"
        }
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={nestedStack.length === 0}
            onClick={popNestedRecord}
          >
            <Icon name="ChevronLeft" aria-hidden="true" />
            Back
          </Button>
        }
      >
        {nestedLoading ? (
          <div className="flex min-h-56 items-center justify-center" role="status">
            Loading {nestedTop?.kind ?? "record"}…
          </div>
        ) : nestedError !== null ? (
          <EmptyState title="Could not load record" description={nestedError} />
        ) : nestedTop?.value === null ? (
          <EmptyState title="Record not found" />
        ) : nestedTop ? (
          <NestedCompanyRecordContent
            item={nestedTop}
            onOpenDeal={(id) => openNestedRecord("deal", id)}
          />
        ) : null}
      </RecordDrawer>

      <RecordDrawer
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
        title="New company"
        description="Add an organization to your CRM workspace."
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
            <Button type="submit" form="create-company-form" disabled={createSaving}>
              {createSaving ? "Creating…" : "Create company"}
            </Button>
          </>
        }
      >
        <CompanyForm
          formId="create-company-form"
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
