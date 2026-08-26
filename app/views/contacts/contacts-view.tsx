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
  ColumnPreferences,
  COMPANY_PICKER_INPUT,
  companyOptionsFromRows,
  AlertDialog,
  EmptyState,
  EntityPicker,
  InlineField,
  ListToolbar,
  PageHeader,
  PersonAvatar,
  RecordDrawer,
  SearchField,
  TableShell,
  ownerOptionsFromRecords,
  type EntityOption,
  usePersistentColumnPreferences,
  type TableColumnPreference,
} from "../../components/index.js";
import type {
  Contact,
  ContactCreateInput,
  ContactUpdateData,
  ContactListInput,
  ContactListOutput,
  CompanyListOutput,
  Deal,
  DealStage,
  FieldDefinition,
  SavedViewFilters,
  SetDealStageInput,
  SortDirection,
} from "../../../contracts/core.js";
import { useContactsRpc, type ContactsRpcClient } from "./rpc.js";
import {
  DealStageMenu,
  DealStageReasonDialog,
  isDeal,
  STAGES_REQUIRING_REASON,
} from "../deals/deals-view.js";
import { ActivityTimeline } from "../activity/index.js";
import { SavedViewBar } from "../saved-views/index.js";
import { RecordFieldsEditor } from "../record-fields/index.js";
import { ContactEvidence, type ContactEvidenceRpcClient } from "../../components/contact-evidence.js";
import { RecordAgentTab, type RecordAgentRpcClient } from "../../components/record-agent-tab.js";
import {
  activityFacetOptions,
  customFieldFacets,
  facetOptionsFromCounts,
  ListControls,
  type ListFacet,
  type ListFilters,
  type ListSortOption,
  SelectAllCheckbox,
} from "../list-controls/list-controls.js";

const PAGE_SIZE = 25;

const CONTACT_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: "name", label: "Contact" },
  { value: "email", label: "Email" },
  { value: "title", label: "Title" },
  { value: "company", label: "Company" },
  { value: "owner", label: "Owner" },
  { value: "createdAt", label: "Created" },
  { value: "lastActivity", label: "Last activity" },
  { value: "archivedAt", label: "Archived" },
];

const CONTACT_STANDARD_FILTERS = [
  "owner",
  "company",
  "source",
  "title",
  "seniority",
  "persona",
  "activity",
] as const;

type ContactBulkRpcClient = {
  call(method: string, input: unknown): Promise<unknown>;
};

export type ContactTab = "overview" | "deals" | "activity" | "agent";

export const CONTACT_TABS: ReadonlyArray<{ id: ContactTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "deals", label: "Deals" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

function contactTabFromRoute(value: string | null | undefined): ContactTab {
  return CONTACT_TABS.some((tab) => tab.id === value)
    ? (value as ContactTab)
    : "overview";
}

const CONTACT_COLUMNS = [
  { id: "contact", label: "Contact", className: "min-w-48", required: true },
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
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) options.timeZone = "UTC";
  return new Intl.DateTimeFormat(undefined, {
    ...options,
  }).format(date);
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "—";
}

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

function contactName(contact: Pick<Contact, "firstName" | "lastName">): string {
  return [contact.firstName, contact.lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ") || "Contact";
}

function contactColumnValue(
  contact: Contact,
  columnId: string,
  definitions: readonly FieldDefinition[],
): string {
  switch (columnId) {
    case "contact":
      return contactName(contact);
    case "company":
      return contact.company?.name ?? displayValue(contact.companyId);
    case "title":
      return displayValue(contact.title);
    case "owner":
      return contact.owner?.name ?? displayValue(contact.ownerId);
    case "email":
      return displayValue(contact.email);
    case "deals":
      return contact.deals === undefined ? "—" : String(contact.deals.length);
    case "last-activity":
      return formatDate(contact.lastActivityAt);
    default: {
      const fieldId = columnId.startsWith("field:")
        ? columnId.slice("field:".length)
        : "";
      const definition = definitions.find((candidate) => candidate.id === fieldId);
      return definition
        ? customFieldDisplay(definition, contact.fields?.[definition.key])
        : "—";
    }
  }
}

export function isContact(value: unknown): value is Contact {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "firstName" in value &&
    typeof value.firstName === "string"
  );
}

function isCompanyListOutput(value: unknown): value is CompanyListOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { rows?: unknown }).rows)
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function enrichmentResultMessage(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    return "Contact enrichment completed.";
  }
  const value = result as {
    requested?: unknown;
    succeeded?: unknown;
    skipped?: unknown;
    failed?: unknown;
    message?: unknown;
  };
  const requested = typeof value.requested === "number" ? value.requested : 0;
  const succeeded = typeof value.succeeded === "number" ? value.succeeded : 0;
  const skipped = typeof value.skipped === "number" ? value.skipped : 0;
  const failed = typeof value.failed === "number" ? value.failed : 0;
  const message = typeof value.message === "string" && value.message.trim()
    ? value.message.trim()
    : null;
  return [
    `Contact enrichment: requested ${requested}`,
    `succeeded ${succeeded}`,
    `skipped ${skipped}`,
    `failed ${failed}`,
    ...(message ? [message] : []),
  ].join(" · ");
}

function listRpc(rpc: ContactsRpcClient): ContactBulkRpcClient {
  return rpc as unknown as ContactBulkRpcClient;
}

function facetValueLabel(value: string): string {
  if (value === "unassigned" || value === "none") return "Unassigned";
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
  const standard = new Set<string>(CONTACT_STANDARD_FILTERS);
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
): ContactListInput {
  return {
    q: query,
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
    owner: filters.owner ?? [],
    company: filters.company ?? [],
    source: (filters.source ?? []) as ContactListInput["source"],
    title: filters.title ?? [],
    seniority: filters.seniority ?? [],
    persona: filters.persona ?? [],
    activity: (filters.activity ?? []) as ContactListInput["activity"],
    fields: customFieldInput(filters),
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
  companyOptions: readonly EntityOption[];
  ownerOptions: readonly EntityOption[];
}

function ContactForm({
  formId,
  value,
  error,
  saving,
  onChange,
  onSubmit,
  companyOptions,
  ownerOptions,
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
      <EntityPicker
        id={`${formId}-company`}
        label="Company"
        value={value.companyId}
        options={companyOptions}
        optional
        disabled={saving}
        placeholder="Leave blank for no company"
        onChange={(companyId) => onChange({ ...value, companyId })}
      />
      <EntityPicker
        id={`${formId}-owner`}
        label="Owner"
        value={value.ownerId}
        options={ownerOptions}
        optional
        disabled={saving}
        placeholder="Leave blank for unassigned"
        onChange={(ownerId) => onChange({ ...value, ownerId })}
      />
      <p className="text-xs text-muted-foreground">
        Company choices are existing CRM records. Owner choices use only owner IDs already present in CRM data; BB member lookup is not exposed.
      </p>
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

function ContactRelationshipSummary({
  relationship,
  onOpenContact,
}: {
  relationship?: Contact["relationship"];
  onOpenContact?: (id: string) => void;
}) {
  if (relationship === undefined) return null;
  return (
    <section
      className="space-y-4 border-t border-border pt-5"
      aria-label="We Know Them"
    >
      <div>
        <h3 className="text-sm font-medium">We Know Them</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A compact view of the relationship history already recorded in CRM.
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Emails</dt>
          <dd className="mt-1 text-sm tabular-nums">{relationship.emails}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Threads</dt>
          <dd className="mt-1 text-sm tabular-nums">{relationship.threads}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Meetings</dt>
          <dd className="mt-1 text-sm tabular-nums">{relationship.meetings}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Last reply</dt>
          <dd className="mt-1 text-sm">{formatDate(relationship.lastReplyAt)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted-foreground">Next meeting</dt>
          <dd className="mt-1 text-sm">
            {relationship.nextMeeting
              ? `${relationship.nextMeeting.title} · ${formatDate(relationship.nextMeeting.startsAt)}`
              : "—"}
          </dd>
        </div>
      </dl>
      <div>
        <h4 className="text-xs font-medium text-muted-foreground">Colleagues</h4>
        {relationship.colleagues.length > 0 ? (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border" aria-label="Known colleagues">
            {relationship.colleagues.map((colleague) => (
              <li key={colleague.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                {onOpenContact === undefined ? (
                  <span className="truncate text-sm font-medium">{colleague.name}</span>
                ) : (
                  <button
                    type="button"
                    className="truncate rounded text-left text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => onOpenContact(colleague.id)}
                  >
                    {colleague.name}
                  </button>
                )}
                <span className="truncate text-xs text-muted-foreground">{displayValue(colleague.title)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No colleagues recorded.</p>
        )}
      </div>
    </section>
  );
}

export interface ContactOverviewProps {
  contact: Contact;
  rpc: ContactsRpcClient;
  companyOptions: readonly EntityOption[];
  ownerOptions: readonly EntityOption[];
  onUpdate: (data: ContactUpdateData, optimistic: Partial<Contact>) => void;
  onEvidenceChanged: () => void;
  mutationBusy: boolean;
  mutationError: string | null;
  onEnrich: () => void;
  onResearch: (focus: "socials" | "work-history" | "brief") => void;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onOpenContact?: (id: string) => void;
}

export function ContactOverview({
  contact,
  rpc,
  companyOptions,
  ownerOptions,
  onUpdate,
  onEvidenceChanged,
  mutationBusy,
  mutationError,
  onEnrich,
  onResearch,
  onArchive,
  onRestore,
  onPurge,
  onOpenContact,
}: ContactOverviewProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Contact details">
        <h3 className="text-sm font-medium">Details</h3>
        <div className="grid gap-4 rounded-lg border border-border p-4">
          <InlineField
            label="First name"
            value={contact.firstName}
            saving={mutationBusy}
            onSave={(firstName) => {
              if (firstName) onUpdate({ firstName }, { firstName });
            }}
          />
          <InlineField
            label="Last name"
            value={contact.lastName ?? null}
            placeholder="Not set"
            saving={mutationBusy}
            onSave={(lastName) =>
              onUpdate({ lastName: lastName || null }, { lastName: lastName || null })
            }
          />
          <InlineField
            label="Title"
            value={contact.title ?? null}
            placeholder="VP of Sales"
            saving={mutationBusy}
            onSave={(title) => onUpdate({ title: title || null }, { title: title || null })}
          />
          <InlineField
            label="Email"
            value={contact.email ?? null}
            type="email"
            placeholder="name@example.com"
            saving={mutationBusy}
            onSave={(email) => onUpdate({ email: email || null }, { email: email || null })}
          />
          <InlineField
            label="Phone"
            value={contact.phone ?? null}
            type="tel"
            placeholder="+1 555 0100"
            saving={mutationBusy}
            onSave={(phone) => onUpdate({ phone: phone || null }, { phone: phone || null })}
          />
          <InlineField
            label="LinkedIn"
            value={contact.linkedinUrl ?? null}
            type="url"
            placeholder="https://linkedin.com/in/name"
            saving={mutationBusy}
            onSave={(linkedinUrl) =>
              onUpdate(
                { linkedinUrl: linkedinUrl || null },
                { linkedinUrl: linkedinUrl || null },
              )
            }
          />
          <InlineField
            label="X"
            value={contact.twitterUrl ?? null}
            type="url"
            placeholder="https://x.com/name"
            saving={mutationBusy}
            onSave={(twitterUrl) =>
              onUpdate(
                { twitterUrl: twitterUrl || null },
                { twitterUrl: twitterUrl || null },
              )
            }
          />
          <InlineField
            label="GitHub"
            value={contact.githubUrl ?? null}
            type="url"
            placeholder="https://github.com/name"
            saving={mutationBusy}
            onSave={(githubUrl) =>
              onUpdate(
                { githubUrl: githubUrl || null },
                { githubUrl: githubUrl || null },
              )
            }
          />
          <InlineField
            label="Photo URL"
            value={contact.imageUrl ?? null}
            type="url"
            placeholder="https://example.com/photo.jpg"
            saving={mutationBusy}
            onSave={(imageUrl) =>
              onUpdate(
                { imageUrl: imageUrl || null },
                { imageUrl: imageUrl || null },
              )
            }
          />
          <EntityPicker
            label="Company"
            value={contact.companyId}
            options={companyOptions}
            optional
            disabled={mutationBusy}
            placeholder="No company"
            onChange={(companyId) =>
              onUpdate({ companyId }, { companyId, company: null })
            }
          />
          <EntityPicker
            label="Owner"
            value={contact.ownerId}
            options={ownerOptions}
            optional
            disabled={mutationBusy}
            placeholder="Unassigned"
            onChange={(ownerId) =>
              onUpdate({ ownerId }, { ownerId, owner: null })
            }
          />
        </div>
      </section>
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
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
      <ContactRelationshipSummary
        relationship={contact.relationship}
        onOpenContact={onOpenContact}
      />
      <section
        className="space-y-3 border-t border-border pt-5"
        aria-label="Contact enrichment"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Enrichment &amp; research</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Social and work-history candidates remain proposals until their evidence is reviewed.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {contact.enrichmentStatus ?? "PENDING"}
          </span>
        </div>
        {contact.enrichmentError ? (
          <p className="text-xs text-destructive" role="alert">
            {contact.enrichmentError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={mutationBusy || Boolean(contact.archivedAt)} onClick={onEnrich}>
            Enrich contact
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={mutationBusy || Boolean(contact.archivedAt)} onClick={() => onResearch("socials")}>
            Research socials
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={mutationBusy || Boolean(contact.archivedAt) || !contact.linkedinUrl} onClick={() => onResearch("work-history")}>
            Research work history
          </Button>
        </div>
      </section>
      <RecordFieldsEditor entity="CONTACT" recordId={contact.id} />
      <ContactEvidence
        contact={contact}
        rpc={rpc as unknown as ContactEvidenceRpcClient}
        onChanged={onEvidenceChanged}
      />
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

export interface ContactDealsRpcClient {
  call(method: "deals_setStage", input: SetDealStageInput): Promise<Deal>;
}

export interface ContactDealsProps {
  contact: Contact;
  onOpenDeal?: (id: string) => void;
  rpc?: ContactDealsRpcClient;
  onChanged?: () => void;
}

export function ContactDeals({
  contact,
  onOpenDeal,
  rpc,
  onChanged,
}: ContactDealsProps) {
  type ContactDeal = NonNullable<Contact["deals"]>[number];
  const [deals, setDeals] = useState<ContactDeal[]>(() => [...(contact.deals ?? [])]);
  const [stageRequest, setStageRequest] = useState<{
    dealId: string;
    dealName: string;
    stage: DealStage;
  } | null>(null);
  const [stageBusyId, setStageBusyId] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);

  useEffect(() => {
    const incomingDeals = contact.deals ?? [];
    setDeals((current) =>
      JSON.stringify(current) === JSON.stringify(incomingDeals)
        ? current
        : [...incomingDeals],
    );
  }, [contact.deals, contact.id]);

  const runStageChange = useCallback(
    async (dealId: string, stage: DealStage, closedReason?: string) => {
      if (rpc === undefined) return;
      const previous = deals.find((deal) => deal.id === dealId);
      if (previous === undefined) return;
      setStageBusyId(dealId);
      setStageError(null);
      setDeals((current) =>
        current.map((deal) => (deal.id === dealId ? { ...deal, stage } : deal)),
      );
      try {
        const input: SetDealStageInput = {
          id: dealId,
          stage,
          ...(STAGES_REQUIRING_REASON.has(stage) && closedReason?.trim()
            ? { closedReason: closedReason.trim() }
            : {}),
        };
        const result = await rpc.call("deals_setStage", input);
        const settledStage = isDeal(result) ? result.stage : stage;
        setDeals((current) =>
          current.map((deal) =>
            deal.id === dealId ? { ...deal, stage: settledStage } : deal,
          ),
        );
        onChanged?.();
      } catch (cause) {
        setDeals((current) =>
          current.map((deal) =>
            deal.id === dealId ? { ...deal, stage: previous.stage } : deal,
          ),
        );
        setStageError(errorMessage(cause));
        throw cause;
      } finally {
        setStageBusyId(null);
      }
    },
    [deals, onChanged, rpc],
  );

  const selectStage = useCallback(
    (deal: ContactDeal, stage: DealStage) => {
      if (rpc === undefined) return;
      if (STAGES_REQUIRING_REASON.has(stage)) {
        setStageRequest({ dealId: deal.id, dealName: deal.name, stage });
        return;
      }
      void runStageChange(deal.id, stage).catch(() => {
        // The inline error keeps the row actionable after a failed mutation.
      });
    },
    [rpc, runStageChange],
  );

  if (deals.length === 0) {
    return (
      <EmptyState
        icon="Target"
        title="No deals linked"
        description="Deals for this contact will appear here."
        className="min-h-56 border-0 bg-transparent"
      />
    );
  }
  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Contact deals">
        {deals.map((deal) => (
          <li key={deal.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(5,minmax(0,0.7fr))] sm:items-center">
            <div className="min-w-0">
              {onOpenDeal ? (
                <button
                  type="button"
                  className="truncate rounded text-left text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => onOpenDeal(deal.id)}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="truncate">{deal.name}</span>
                    <ArchivedRelationshipBadge archivedAt={deal.archivedAt} />
                  </span>
                </button>
              ) : (
                <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                  <span className="truncate">{deal.name}</span>
                  <ArchivedRelationshipBadge archivedAt={deal.archivedAt} />
                </p>
              )}
              <p className="truncate text-xs text-muted-foreground">{deal.id}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Role</p>
              <p className="truncate text-sm">{displayValue(deal.role)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stage</p>
              {rpc === undefined ? (
                <p className="truncate text-sm">{displayValue(deal.stage)}</p>
              ) : (
                <DealStageMenu
                  deal={deal}
                  busy={stageBusyId === deal.id}
                  onSelect={(stage) => selectStage(deal, stage)}
                />
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Amount</p>
              <p className="truncate text-sm tabular-nums">{formatMinorAmount(deal.amountCents, deal.currency)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owner</p>
              <p className="truncate text-sm">{deal.owner?.name ?? displayValue(deal.ownerId)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Close date</p>
              <p className="truncate text-sm">{formatDate(deal.expectedCloseDate)}</p>
            </div>
          </li>
        ))}
      </ul>
      {stageError === null ? null : (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {stageError}
        </p>
      )}
      <DealStageReasonDialog
        request={stageRequest}
        busy={stageBusyId === stageRequest?.dealId}
        onOpenChange={(open) => {
          if (!open) setStageRequest(null);
        }}
        onSubmit={async (reason) => {
          if (stageRequest === null) return;
          await runStageChange(stageRequest.dealId, stageRequest.stage, reason);
          setStageRequest(null);
        }}
      />
    </>
  );
}

function StagedContactTab({ tab }: { tab: "agent" }) {
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
  /** Open the create-contact drawer from a routed header action. */
  initialCreate?: boolean;
  /** Reflects record drawer changes back into the BB panel sub-path. */
  onRecordIdChange?: (id: string | null) => void;
  /** Opens a linked company or deal through the owning BB route. */
  onOpenRelatedRecord?: (kind: "company" | "deal", id: string) => void;
  /** Clears a routed create action after the drawer closes or submits. */
  onCreateChange?: (open: boolean) => void;
  /** Reflects the active record drawer tab back into the BB panel sub-path. */
  initialTab?: string | null;
  onTabChange?: (tab: ContactTab, recordId: string) => void;
}

export function ContactsView({
  rpcClient,
  initialRecordId = null,
  initialCreate = false,
  onRecordIdChange,
  onOpenRelatedRecord,
  onCreateChange,
  initialTab,
  onTabChange,
}: ContactsViewProps) {
  const contextRpc = useContactsRpc();
  const rpc = rpcClient ?? contextRpc;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("createdAt");
  const [dir, setDir] = useState<SortDirection>("desc");
  const [filters, setFilters] = useState<ListFilters>({});
  const [showArchived, setShowArchived] = useState(false);
  const [list, setList] = useState<ContactListOutput>(EMPTY_LIST);
  const [companyOptions, setCompanyOptions] = useState<readonly EntityOption[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterDefinitions, setFilterDefinitions] = useState<readonly FieldDefinition[]>([]);
  const [tableDefinitions, setTableDefinitions] = useState<readonly FieldDefinition[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [bulkCompanyId, setBulkCompanyId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordId, setRecordId] = useState<string | null>(initialRecordId);
  const [record, setRecord] = useState<Contact | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordRefreshKey, setRecordRefreshKey] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<ContactTab>("overview");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<"archive" | "purge" | null>(null);
  const [createOpen, setCreateOpen] = useState(initialCreate);
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

  const columnDefinitions = useMemo<readonly TableColumnPreference[]>(
    () => [
      ...CONTACT_COLUMNS,
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
    "crm:table-columns:contact",
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
    let active = true;
    void listRpc(rpc)
      .call("companies_list", COMPANY_PICKER_INPUT)
      .then((next) => {
        if (active && isCompanyListOutput(next)) {
          setCompanyOptions(companyOptionsFromRows(next.rows));
        }
      })
      .catch(() => {
        // Company choices are optional; an unassigned contact remains valid.
      });
    return () => {
      active = false;
    };
  }, [rpc, refreshKey]);

  useEffect(() => {
    let active = true;
    void listRpc(rpc)
      .call("fields_filters", { entity: "CONTACT" })
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
      .call("fields_list", { entity: "CONTACT", includeArchived: false })
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
    if (recordId === null) return;
    let active = true;
    setRecordLoading(true);
    setRecordError(null);
    setMutationError(null);
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

  useEffect(() => {
    setRecordTab(contactTabFromRoute(initialTab));
  }, [initialTab, recordId]);

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
    async (data: ContactUpdateData, optimistic: Partial<Contact>) => {
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
        const result = await rpc.call("contacts_update", { id, data });
        const settled = isContact(result)
          ? {
              ...next,
              ...result,
              company: result.company === undefined ? next.company : result.company,
              owner: result.owner === undefined ? next.owner : result.owner,
              deals: result.deals ?? next.deals,
              facts: result.facts ?? next.facts,
              brief: result.brief ?? next.brief,
              workHistory: result.workHistory ?? next.workHistory,
              relationship: result.relationship ?? next.relationship,
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

  const makePrimaryContact = useCallback(async () => {
    if (record === null || !record.companyId || record.isPrimaryContact) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await rpc.call("companies_setPrimaryContact", {
        companyId: record.companyId,
        contactId: record.id,
      });
      setRecord((current) => current?.id === record.id
        ? { ...current, isPrimaryContact: true }
        : current);
      setList((current) => ({
        ...current,
        rows: current.rows.map((row) => row.id === record.id
          ? { ...row, isPrimaryContact: true }
          : row),
      }));
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setMutationError(errorMessage(cause));
    } finally {
      setMutationBusy(false);
    }
  }, [record, rpc]);

  const requestRecordEnrichment = useCallback(
    async (
      method: "contacts_enrich" | "contacts_research",
      focus?: "socials" | "work-history" | "brief",
    ) => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result = method === "contacts_research"
          ? await rpc.call(method, { id: record.id, focus: focus ?? "brief" })
          : await rpc.call(method, { id: record.id });
        setRecord({
          ...record,
          enrichmentStatus: result.status as Contact["enrichmentStatus"],
          enrichmentError: result.reason ?? null,
        });
        if (result.reason) setMutationError(result.reason);
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
      await rpc.call("contacts_purge", { id: record.id });
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
        closeCreate();
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
          .filter((contact) => contact.owner?.name)
          .map((contact) => [contact.ownerId, contact.owner?.name as string]),
      ),
    [list.rows],
  );
  const companyLabels = useMemo(
    () =>
      new Map(
        list.rows
          .filter((contact) => contact.company?.name)
          .map((contact) => [contact.companyId, contact.company?.name as string]),
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
        id: "company",
        label: "Company",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "company",
          filters.company,
          (value) => companyLabels.get(value) ?? facetValueLabel(value),
        ),
      },
      {
        id: "title",
        label: "Title",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "title",
          filters.title,
          facetValueLabel,
        ),
      },
      {
        id: "seniority",
        label: "Seniority",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "seniority",
          filters.seniority,
          facetValueLabel,
        ),
      },
      {
        id: "persona",
        label: "Persona",
        options: facetOptionsFromCounts(
          list.facetCounts,
          "persona",
          filters.persona,
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
      {
        id: "activity",
        label: "Activity",
        options: activityFacetOptions(list.facetCounts, filters.activity),
      },
      ...customFieldFacets(filterDefinitions, list.facetCounts, filters),
    ],
    [companyLabels, filterDefinitions, filters, list.facetCounts, ownerLabels],
  );
  const visibleIds = useMemo(() => list.rows.map((contact) => contact.id), [list.rows]);
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
    async (
      method: string,
      input: unknown,
      successMessage: string | ((result: unknown) => string),
    ) => {
      setBulkBusy(true);
      setBulkError(null);
      setBulkStatus(null);
      try {
        const result = await listRpc(rpc).call(method, input);
        setSelectedIds([]);
        setBulkStatus(
          typeof successMessage === "function" ? successMessage(result) : successMessage,
        );
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

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-background text-foreground">
      <PageHeader
        title="Contacts"
        className="border-b-0 pb-2 sm:pb-2"
        actions={
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
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 pt-2 sm:p-5 sm:pt-2">
        <ListToolbar
          aria-label="Contact table controls"
          summary={<span role="status" aria-live="polite">
            {list.total} {list.total === 1 ? "contact" : "contacts"}
            {showArchived ? " · archived" : ""}
          </span>}
        >
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
            placeholder="Search contacts by name, email, or company…"
            containerClassName="w-full sm:w-64"
          />
          <SavedViewBar
            compact
            entity="CONTACT"
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
                CONTACT_SORT_OPTIONS.some((option) => option.value === filters.sort)
                  ? filters.sort
                  : "name",
              );
              setDir(filters.dir);
              setFilters(cleanFilters(filters.filters));
              setShowArchived(filters.archived);
              if (filters.columns.length > 0) columnPreferences.apply(filters.columns);
              setPage(1);
            }}
          />
          <ListControls
            compact
            entityLabel="contacts"
            sort={sort}
            dir={dir}
            sortOptions={CONTACT_SORT_OPTIONS}
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
          <ColumnPreferences preference={columnPreferences} iconOnly />
          <Button
            type="button"
            variant={showArchived ? "secondary" : "outline"}
            size="icon"
            className="size-9"
            aria-label="Archived"
            aria-pressed={showArchived}
            onClick={() => {
              setShowArchived((value) => !value);
              setPage(1);
            }}
          >
            <Icon name="Archive" aria-hidden="true" />
          </Button>
        </ListToolbar>
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
            aria-label="Contact bulk actions"
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
                      "contacts_bulkAssignOwner",
                      { ids: selectedIds, ownerId: bulkOwnerId || null },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "contact" : "contacts"} reassigned.`,
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
                  onClick={() =>
                    void runBulk(
                      "contacts_bulkEnrich",
                      { ids: selectedIds },
                      enrichmentResultMessage,
                    )
                  }
                >
                  Enrich selected
                </Button>
                <Input
                  className="h-8 w-40 text-xs"
                  aria-label="Bulk company ID"
                  value={bulkCompanyId}
                  onChange={(event) => setBulkCompanyId(event.target.value)}
                  placeholder="Company ID"
                  disabled={bulkBusy}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy || bulkCompanyId.trim() === ""}
                  onClick={() =>
                    void runBulk(
                      "contacts_bulkAssignCompany",
                      { ids: selectedIds, companyId: bulkCompanyId.trim() || null },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "contact" : "contacts"} moved.`,
                    )
                  }
                >
                  Assign company
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
                      "contacts_bulkRestore",
                      { ids: selectedIds },
                      `${selectedIds.length} ${selectedIds.length === 1 ? "contact" : "contacts"} restored.`,
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
          caption="Contacts"
          columns={[
            {
              id: "select",
              label: (
                <SelectAllCheckbox
                  label="Select all visible contacts"
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
                <td
                  className="w-10 px-3 py-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Select ${name}`}
                    checked={selectedSet.has(contact.id)}
                    onChange={(event) => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(contact.id);
                        else next.delete(contact.id);
                        return [...next];
                      });
                    }}
                  />
                </td>
                {columnPreferences.visibleColumns.map((column) => (
                  <td
                    key={column.id}
                    className={
                      column.id === "contact"
                        ? "px-3 py-3 font-medium"
                        : column.id === "deals"
                          ? "px-3 py-3 text-right tabular-nums"
                          : column.id === "last-activity" || column.id.startsWith("field:")
                            ? "whitespace-nowrap px-3 py-3 text-muted-foreground"
                            : "px-3 py-3 text-muted-foreground"
                    }
                  >
                    {column.id === "contact" ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <PersonAvatar
                          src={contact.imageUrl}
                          name={name}
                          email={contact.email}
                          size="sm"
                        />
                        <span className="min-w-0 truncate">{name}</span>
                      </div>
                    ) : column.id === "last-activity" && contact.lastActivityAt ? (
                      <time dateTime={contact.lastActivityAt}>
                        {contactColumnValue(contact, column.id, tableDefinitions)}
                      </time>
                    ) : (
                      contactColumnValue(contact, column.id, tableDefinitions)
                    )}
                  </td>
                ))}
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

      <AlertDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={`Delete ${record ? contactName(record) : "contact"} permanently?`}
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
            ? `Delete ${selectedIds.length} ${selectedIds.length === 1 ? "contact" : "contacts"} permanently?`
            : `Archive ${selectedIds.length} ${selectedIds.length === 1 ? "contact" : "contacts"}?`
        }
        description={bulkConfirm === "purge" ? "This cannot be undone." : "Archived contacts can be restored later."}
        confirmLabel={bulkConfirm === "purge" ? "Delete permanently" : "Archive"}
        destructive={bulkConfirm === "purge"}
        onConfirm={async () => {
          if (bulkConfirm === "purge") {
            await runBulk(
              "contacts_bulkPurge",
              { ids: selectedIds },
              `${selectedIds.length} ${selectedIds.length === 1 ? "contact" : "contacts"} deleted.`,
            );
          } else if (bulkConfirm === "archive") {
            await runBulk(
              "contacts_bulkArchive",
              { ids: selectedIds },
              `${selectedIds.length} ${selectedIds.length === 1 ? "contact" : "contacts"} archived.`,
            );
          }
        }}
      />
      <RecordDrawer
        open={recordId !== null}
        onOpenChange={(open) => {
          if (!open) closeRecord();
        }}
        title={record === null ? "Contact" : contactName(record)}
        description={record?.email ?? record?.title ?? "Contact record"}
        media={
          record === null ? undefined : (
            <PersonAvatar
              src={record.imageUrl}
              name={contactName(record)}
              email={record.email}
              size="lg"
            />
          )
        }
        actions={
          record === null ? undefined : (
            <>
              {record.isPrimaryContact ? (
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  Primary contact
                </span>
              ) : record.companyId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={mutationBusy}
                  onClick={() => void makePrimaryContact()}
                >
                  Make primary
                </Button>
              ) : null}
              {record.companyId && onOpenRelatedRecord ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenRelatedRecord("company", record.companyId!)}
                >
                  Company
                </Button>
              ) : null}
              {record.email ? (
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${record.email}`}>Email</a>
                </Button>
              ) : null}
              {record.phone ? (
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:${record.phone}`}>Call</a>
                </Button>
              ) : null}
            </>
          )
        }
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
              <ContactOverview
                contact={record}
                rpc={rpc}
                companyOptions={selectableCompanyOptions}
                ownerOptions={ownerOptions}
                onUpdate={(data, optimistic) => void runRecordUpdate(data, optimistic)}
                onEvidenceChanged={() => setRecordRefreshKey((value) => value + 1)}
                mutationBusy={mutationBusy}
                mutationError={mutationError}
                onEnrich={() => void requestRecordEnrichment("contacts_enrich")}
                onResearch={(focus) => void requestRecordEnrichment("contacts_research", focus)}
                onArchive={() => void runArchiveMutation("contacts_archive")}
                onRestore={() => void runArchiveMutation("contacts_restore")}
                onPurge={() => setPurgeOpen(true)}
                onOpenContact={openRecord}
              />
            ) : recordTab === "deals" ? (
              <ContactDeals
                contact={record}
                rpc={rpc as unknown as ContactDealsRpcClient}
                onChanged={() => {
                  setRecordRefreshKey((value) => value + 1);
                  setRefreshKey((value) => value + 1);
                }}
                onOpenDeal={
                  onOpenRelatedRecord === undefined
                    ? undefined
                    : (id) => onOpenRelatedRecord("deal", id)
                }
              />
            ) : recordTab === "activity" ? (
              <ActivityTimeline
                anchor={{ contactId: record.id }}
                title="Contact activity"
                description="Notes, touchpoints, and follow-up work for this contact."
                onOpenRelatedRecord={
                  onOpenRelatedRecord === undefined
                    ? undefined
                    : (kind, id) => {
                        if (kind === "company" || kind === "deal") onOpenRelatedRecord(kind, id);
                      }
                }
              />
            ) : recordTab === "agent" ? (
              <RecordAgentTab
                rpc={rpc as unknown as RecordAgentRpcClient}
                recordType="CONTACT"
                recordId={record.id}
                recordLabel={contactName(record)}
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
        title="New contact"
        description="Add a person to your CRM workspace."
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
          companyOptions={companyOptions}
          ownerOptions={ownerOptions}
        />
      </RecordDrawer>
    </div>
  );
}
