import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import {
  EmptyState,
  PageHeader,
  RecordDrawer,
  SearchField,
  TableShell,
} from "../../components/index.js";
import type {
  Company,
  CompanyCreateInput,
  CompanyListInput,
  CompanyListOutput,
  SavedViewFilters,
} from "../../../contracts/core.js";
import { useCompaniesRpc, type CompaniesRpcClient } from "./rpc.js";
import { ActivityTimeline } from "../activity/index.js";
import { SavedViewBar } from "../saved-views/index.js";
import { RecordFieldsEditor } from "../record-fields/index.js";

const PAGE_SIZE = 25;

type CompanyTab = "overview" | "contacts" | "deals" | "activity" | "agent";

const COMPANY_TABS: ReadonlyArray<{ id: CompanyTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "deals", label: "Deals" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

const COMPANY_COLUMNS = [
  { id: "company", label: "Company", className: "min-w-52" },
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

function isCompany(value: unknown): value is Company {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function createListInput(
  query: string,
  page: number,
  archived: boolean,
): CompanyListInput {
  return {
    q: query,
    sort: "name",
    dir: "asc",
    page,
    pageSize: PAGE_SIZE,
    owner: [],
    industry: [],
    enrichment: [],
    source: [],
    activity: [],
    fields: {},
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

function CompanyContacts({ company }: { company: Company }) {
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
      {contacts.map((contact) => (
        <li key={contact.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-medium">
              {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
            </p>
            <p className="text-xs text-muted-foreground">{displayValue(contact.title)}</p>
          </div>
          <p className="text-sm text-muted-foreground sm:text-right">
            {displayValue(contact.email)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CompanyDeals({ company }: { company: Company }) {
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
        <li key={deal.id} className="px-4 py-3">
          <p className="text-sm font-medium">{deal.name}</p>
          <p className="text-xs text-muted-foreground">{deal.id}</p>
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

export interface CompaniesViewProps {
  /** Optional client injection keeps component tests and host previews small. */
  rpcClient?: CompaniesRpcClient;
  /** Record selected by the BB panel sub-path or browser history. */
  initialRecordId?: string | null;
  /** Reflects record drawer changes back into the BB panel sub-path. */
  onRecordIdChange?: (id: string | null) => void;
}

export function CompaniesView({
  rpcClient,
  initialRecordId = null,
  onRecordIdChange,
}: CompaniesViewProps) {
  const contextRpc = useCompaniesRpc();
  const rpc = rpcClient ?? contextRpc;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [list, setList] = useState<CompanyListOutput>(EMPTY_LIST);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordId, setRecordId] = useState<string | null>(initialRecordId);
  const [record, setRecord] = useState<Company | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordRefreshKey, setRecordRefreshKey] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<CompanyTab>("overview");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState<CompanyCreateInput>({
    name: "",
    domain: undefined,
    ownerId: null,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const listInput = useMemo(
    () => createListInput(query, page, showArchived),
    [page, query, showArchived],
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

  const closeRecord = useCallback(() => {
    setRecordId(null);
    onRecordIdChange?.(null);
    setRecord(null);
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
    onRecordIdChange?.(id);
  }, [onRecordIdChange, record, recordId]);

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
          currentFilters={{
            q: query,
            sort: "name",
            dir: "asc",
            archived: showArchived,
            filters: {},
            columns: [],
          }}
          onApplyFilters={(filters: SavedViewFilters) => {
            setQuery(filters.q);
            setShowArchived(filters.archived);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {list.total} {list.total === 1 ? "company" : "companies"}
            {showArchived ? " · archived" : ""}
          </p>
        </div>
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
          caption="Companies"
          columns={COMPANY_COLUMNS}
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
              <td className="px-3 py-3 font-medium">{company.name}</td>
              <td className="px-3 py-3 text-muted-foreground">
                {displayValue(company.domain)}
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {displayValue(company.industry)}
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {company.owner?.name ?? displayValue(company.ownerId)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {company.contactCount ?? 0}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {company.openDealCount ?? 0}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {company.lastActivityAt ? (
                  <time dateTime={company.lastActivityAt}>
                    {formatDate(company.lastActivityAt)}
                  </time>
                ) : (
                  "—"
                )}
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
              <CompanyContacts company={record} />
            ) : recordTab === "deals" ? (
              <CompanyDeals company={record} />
            ) : recordTab === "activity" ? (
              <ActivityTimeline
                anchor={{ companyId: record.id }}
                title="Company activity"
                description="Notes, touchpoints, and follow-up work for this company."
              />
            ) : (
              <StagedCompanyTab tab={recordTab} />
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
