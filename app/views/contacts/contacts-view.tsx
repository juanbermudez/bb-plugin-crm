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
  EmptyState,
  PageHeader,
  RecordDrawer,
  SearchField,
  TableShell,
} from "../../components/index.js";
import type {
  Contact,
  ContactCreateInput,
  ContactListInput,
  ContactListOutput,
} from "../../../contracts/core.js";
import { useContactsRpc, type ContactsRpcClient } from "./rpc.js";

const PAGE_SIZE = 25;

type ContactTab = "overview" | "deals" | "activity" | "agent";

const CONTACT_TABS: ReadonlyArray<{ id: ContactTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "deals", label: "Deals" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

const CONTACT_COLUMNS = [
  { id: "contact", label: "Contact", className: "min-w-48" },
  { id: "company", label: "Company", className: "min-w-40" },
  { id: "title", label: "Title", className: "min-w-36" },
  { id: "owner", label: "Owner", className: "min-w-32" },
  { id: "email", label: "Email", className: "min-w-52" },
  { id: "deals", label: "Deals", className: "text-right" },
  { id: "last-activity", label: "Last activity", className: "min-w-32" },
] as const;

const EMPTY_LIST: ContactListOutput = {
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function createListInput(
  query: string,
  page: number,
  archived: boolean,
): ContactListInput {
  return {
    q: query,
    sort: "name",
    dir: "asc",
    page,
    pageSize: PAGE_SIZE,
    owner: [],
    company: [],
    source: [],
    title: [],
    seniority: [],
    persona: [],
    activity: [],
    fields: {},
    archived,
  };
}

interface ContactFormProps {
  formId: string;
  value: ContactCreateInput;
  error: string | null;
  saving: boolean;
  onChange: (next: ContactCreateInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function ContactForm({
  formId,
  value,
  error,
  saving,
  onChange,
  onSubmit,
}: ContactFormProps) {
  return (
    <form id={formId} className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-first-name`}>
            First name
          </label>
          <Input
            id={`${formId}-first-name`}
            required
            autoFocus
            value={value.firstName}
            onChange={(event) =>
              onChange({ ...value, firstName: event.target.value })
            }
            placeholder="Ada"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-last-name`}>
            Last name <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${formId}-last-name`}
            value={value.lastName ?? ""}
            onChange={(event) =>
              onChange({ ...value, lastName: event.target.value || undefined })
            }
            placeholder="Lovelace"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-email`}>
          Email <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`${formId}-email`}
          type="email"
          value={value.email ?? ""}
          onChange={(event) =>
            onChange({ ...value, email: event.target.value || undefined })
          }
          placeholder="ada@example.com"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-phone`}>
            Phone <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${formId}-phone`}
            type="tel"
            value={value.phone ?? ""}
            onChange={(event) =>
              onChange({ ...value, phone: event.target.value || undefined })
            }
            placeholder="+1 555 0100"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-title`}>
            Title <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${formId}-title`}
            value={value.title ?? ""}
            onChange={(event) =>
              onChange({ ...value, title: event.target.value || undefined })
            }
            placeholder="VP of Sales"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-company`}>
          Company ID <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`${formId}-company`}
          value={value.companyId ?? ""}
          onChange={(event) =>
            onChange({ ...value, companyId: event.target.value || null })
          }
          placeholder="Leave blank for an unassigned contact"
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
      </div>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saving ? (
        <p className="text-sm text-muted-foreground" role="status">
          Creating contact…
        </p>
      ) : null}
    </form>
  );
}

interface ContactOverviewProps {
  contact: Contact;
  mutationBusy: boolean;
  mutationError: string | null;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

function ContactOverview({
  contact,
  mutationBusy,
  mutationError,
  onArchive,
  onRestore,
  onPurge,
}: ContactOverviewProps) {
  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">First name</dt>
          <dd className="mt-1 text-sm">{displayValue(contact.firstName)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Last name</dt>
          <dd className="mt-1 text-sm">{displayValue(contact.lastName)}</dd>
        </div>
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
          <dd className="mt-1 text-sm">
            {contact.company?.name ?? displayValue(contact.companyId)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Owner</dt>
          <dd className="mt-1 text-sm">
            {contact.owner?.name ?? displayValue(contact.ownerId)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Source</dt>
          <dd className="mt-1 text-sm">{displayValue(contact.source)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Deals</dt>
          <dd className="mt-1 text-sm">
            {contact.deals === undefined ? "—" : contact.deals.length}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Last activity</dt>
          <dd className="mt-1 text-sm">{formatDate(contact.lastActivityAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Status</dt>
          <dd className="mt-1 text-sm">
            {contact.archivedAt ? "Archived" : "Active"}
          </dd>
        </div>
      </dl>
      <section className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {contact.archivedAt ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutationBusy}
            onClick={onRestore}
          >
            <Icon name="ArchiveRestore" aria-hidden="true" />
            Restore contact
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={mutationBusy}
            onClick={onArchive}
          >
            <Icon name="Archive" aria-hidden="true" />
            Archive contact
          </Button>
        )}
        {contact.archivedAt ? (
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
          Saving contact…
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

function StagedContactTab({ tab }: { tab: Exclude<ContactTab, "overview"> }) {
  const label = CONTACT_TABS.find((item) => item.id === tab)?.label ?? tab;
  return (
    <EmptyState
      icon={tab === "agent" ? "Brain" : tab === "deals" ? "Target" : "Layers"}
      title={`${label} is staged next`}
      description={`The ${label.toLowerCase()} workspace keeps the source layout and will be connected in the next CRM parity slice.`}
      className="min-h-56 border-0 bg-transparent"
    />
  );
}

export interface ContactsViewProps {
  /** Optional client injection keeps component tests and host previews small. */
  rpcClient?: ContactsRpcClient;
  /** Record selected by the BB panel sub-path or browser history. */
  initialRecordId?: string | null;
  /** Reflects record drawer changes back into the BB panel sub-path. */
  onRecordIdChange?: (id: string | null) => void;
}

export function ContactsView({
  rpcClient,
  initialRecordId = null,
  onRecordIdChange,
}: ContactsViewProps) {
  const contextRpc = useContactsRpc();
  const rpc = rpcClient ?? contextRpc;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [list, setList] = useState<ContactListOutput>(EMPTY_LIST);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordId, setRecordId] = useState<string | null>(initialRecordId);
  const [record, setRecord] = useState<Contact | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordRefreshKey, setRecordRefreshKey] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<ContactTab>("overview");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState<ContactCreateInput>({
    firstName: "",
    lastName: undefined,
    email: undefined,
    phone: undefined,
    title: undefined,
    companyId: null,
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
      const next = await rpc.call("contacts_list", listInput);
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
      .call("contacts_list", listInput)
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
      .call("contacts_get", { id: recordId })
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
    async (method: "contacts_archive" | "contacts_restore") => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result =
          method === "contacts_archive"
            ? await rpc.call("contacts_archive", { id: record.id })
            : await rpc.call("contacts_restore", { id: record.id });
        setRecord(
          isContact(result)
            ? result
            : {
                ...record,
                archivedAt:
                  method === "contacts_archive"
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
        `Delete ${contactName(record)} permanently? This cannot be undone.`,
      )
    ) {
      return;
    }
    setMutationBusy(true);
    setMutationError(null);
    try {
      await rpc.call("contacts_purge", { id: record.id });
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
      const firstName = createValue.firstName.trim();
      if (firstName === "") {
        setCreateError("First name is required.");
        return;
      }
      setCreateSaving(true);
      setCreateError(null);
      try {
        await rpc.call("contacts_create", {
          firstName,
          ...(createValue.lastName?.trim()
            ? { lastName: createValue.lastName.trim() }
            : {}),
          ...(createValue.email?.trim()
            ? { email: createValue.email.trim() }
            : {}),
          ...(createValue.phone?.trim()
            ? { phone: createValue.phone.trim() }
            : {}),
          ...(createValue.title?.trim()
            ? { title: createValue.title.trim() }
            : {}),
          companyId: createValue.companyId?.trim() || null,
          ownerId: createValue.ownerId?.trim() || null,
        });
        setCreateOpen(false);
        setCreateValue({
          firstName: "",
          lastName: undefined,
          email: undefined,
          phone: undefined,
          title: undefined,
          companyId: null,
          ownerId: null,
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

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-background text-foreground">
      <PageHeader
        title="Contacts"
        description="Search and manage the people in your CRM workspace."
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
              New contact
            </Button>
          </>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchField
            label="Search contacts"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            onClear={() => {
              setQuery("");
              setPage(1);
            }}
            placeholder="Search contacts…"
            containerClassName="w-full sm:w-80"
          />
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {list.total} {list.total === 1 ? "contact" : "contacts"}
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
          caption="Contacts"
          columns={CONTACT_COLUMNS}
          loading={listLoading}
          empty={
            <EmptyState
              icon="UserRound"
              title={showArchived ? "No archived contacts" : "No contacts found"}
              description={
                query
                  ? "Try a different search or clear the current filter."
                  : "Create a contact to start building your CRM workspace."
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
                    New contact
                  </Button>
                )
              }
              className="min-h-48 rounded-none border-0 bg-transparent"
            />
          }
        >
          {list.rows.map((contact) => {
            const name = contactName(contact);
            return (
              <tr
                key={contact.id}
                tabIndex={0}
                aria-label={`Open ${name}`}
                className="cursor-pointer outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
                onClick={() => openRecord(contact.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openRecord(contact.id);
                  }
                }}
              >
                <td className="px-3 py-3 font-medium">{name}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {contact.company?.name ?? displayValue(contact.companyId)}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {displayValue(contact.title)}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {contact.owner?.name ?? displayValue(contact.ownerId)}
                </td>
                <td className="break-words px-3 py-3 text-muted-foreground">
                  {displayValue(contact.email)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {contact.deals === undefined ? "—" : contact.deals.length}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  {contact.lastActivityAt ? (
                    <time dateTime={contact.lastActivityAt}>
                      {formatDate(contact.lastActivityAt)}
                    </time>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
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
              aria-label="Previous contacts page"
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
              aria-label="Next contacts page"
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
        title={record === null ? "Contact" : contactName(record)}
        description={record?.email ?? record?.title ?? "Contact record"}
      >
        {recordLoading ? (
          <div className="flex min-h-56 items-center justify-center" role="status">
            Loading contact…
          </div>
        ) : recordError !== null ? (
          <EmptyState
            title="Could not load contact"
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
          <EmptyState title="Contact not found" />
        ) : (
          <div className="space-y-5">
            <div
              className="flex min-w-0 gap-1 overflow-x-auto border-b border-border"
              role="tablist"
              aria-label={`${contactName(record)} views`}
            >
              {CONTACT_TABS.map((tab) => (
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
              <ContactOverview
                contact={record}
                mutationBusy={mutationBusy}
                mutationError={mutationError}
                onArchive={() => void runArchiveMutation("contacts_archive")}
                onRestore={() => void runArchiveMutation("contacts_restore")}
                onPurge={() => void purgeRecord()}
              />
            ) : (
              <StagedContactTab tab={recordTab} />
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
        title="New contact"
        description="Add a person to your CRM workspace."
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
            <Button type="submit" form="create-contact-form" disabled={createSaving}>
              {createSaving ? "Creating…" : "Create contact"}
            </Button>
          </>
        }
      >
        <ContactForm
          formId="create-contact-form"
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
