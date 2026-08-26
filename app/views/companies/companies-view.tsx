import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import { CURRENCY_CODES } from "../../../contracts/core.js";
import {
  EmptyState,
  AlertDialog,
  ColumnPreferences,
  EntityPicker,
  InlineField,
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
import type {
  Company,
  CompanyCreateInput,
  CompanyUpdateData,
  CompanyListInput,
  CompanyListOutput,
  ContactCreateInput,
  Contact,
  Deal,
  DealCreateInput,
  DealStage,
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

const COMPANY_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: "name", label: "Company" },
  { value: "domain", label: "Domain" },
  { value: "industry", label: "Industry" },
  { value: "owner", label: "Owner" },
  { value: "contacts", label: "Contacts" },
  { value: "deals", label: "Open deals" },
  { value: "createdAt", label: "Created" },
  { value: "lastActivity", label: "Last activity" },
  { value: "archivedAt", label: "Archived" },
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

function companyTabFromRoute(value: string | null | undefined): CompanyTab {
  return COMPANY_TABS.some((tab) => tab.id === value)
    ? (value as CompanyTab)
    : "overview";
}

const COMPANY_COLUMNS = [
  { id: "company", label: "Company", className: "min-w-52", required: true },
  { id: "domain", label: "Domain", className: "min-w-40" },
  { id: "industry", label: "Industry", className: "min-w-36" },
  { id: "owner", label: "Owner", className: "min-w-32" },
  { id: "contacts", label: "Contacts", className: "text-right" },
  { id: "open-deals", label: "Open deals", className: "text-right" },
  { id: "last-activity", label: "Last activity", className: "min-w-32" },
  { id: "createdAt", label: "Created", className: "min-w-32", defaultVisible: false },
  { id: "enrichment", label: "Enrichment", className: "min-w-32", defaultVisible: false },
] as const;

const COMPANY_ARCHIVED_COLUMN = {
  id: "archivedAt",
  label: "Archived",
  className: "min-w-32",
  defaultVisible: false,
} as const;

const EMPTY_LIST: CompanyListOutput = {
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

const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  DEMO_BOOKED: "Demo booked",
  QUALIFIED_TO_BUY: "Qualified to buy",
  UNQUALIFIED_TO_BUY: "Unqualified to buy",
  DECISION_MAKER_BOUGHT_IN: "Decision maker bought in",
  CONTRACT_SENT: "Contract sent",
  CLOSED_WON: "Closed won",
  CLOSED_LOST: "Closed lost",
};

function stageLabel(stage: DealStage | null | undefined): string {
  return stage === undefined || stage === null ? "—" : DEAL_STAGE_LABELS[stage];
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
    case "createdAt":
      return formatDate(company.createdAt);
    case "enrichment":
      return company.enrichmentStatus ?? "PENDING";
    case "archivedAt":
      return formatDate(company.archivedAt);
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

function enrichmentResultMessage(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    return "Company enrichment completed.";
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
    `Company enrichment: requested ${requested}`,
    `succeeded ${succeeded}`,
    `skipped ${skipped}`,
    `failed ${failed}`,
    ...(message ? [message] : []),
  ].join(" · ");
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
  ownerOptions: readonly EntityOption[];
}

function CompanyForm({
  formId,
  value,
  error,
  saving,
  onChange,
  onSubmit,
  ownerOptions,
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
      <EntityPicker
        id={`${formId}-owner`}
        label="Owner"
        value={value.ownerId}
        options={ownerOptions}
        optional
        placeholder="Leave blank for unassigned"
        onChange={(ownerId) => onChange({ ...value, ownerId })}
      />
      <p className="text-xs text-muted-foreground">
        Choices are limited to owner IDs already present on CRM records; BB member lookup is not exposed here.
      </p>
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

interface QuickAddContactFormProps {
  formId: string;
  value: ContactCreateInput;
  error: string | null;
  saving: boolean;
  ownerOptions: readonly EntityOption[];
  onChange: (next: ContactCreateInput) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function QuickAddContactForm({
  formId,
  value,
  error,
  saving,
  ownerOptions,
  onChange,
  onSubmit,
}: QuickAddContactFormProps) {
  return (
    <form id={formId} className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-first-name`}>First name</label>
          <Input
            id={`${formId}-first-name`}
            required
            autoFocus
            value={value.firstName}
            onChange={(event) => onChange({ ...value, firstName: event.target.value })}
            placeholder="Ada"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-last-name`}>Last name <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input
            id={`${formId}-last-name`}
            value={value.lastName ?? ""}
            onChange={(event) => onChange({ ...value, lastName: event.target.value || undefined })}
            placeholder="Lovelace"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-email`}>Email <span className="font-normal text-muted-foreground">(optional)</span></label>
        <Input
          id={`${formId}-email`}
          type="email"
          value={value.email ?? ""}
          onChange={(event) => onChange({ ...value, email: event.target.value || undefined })}
          placeholder="ada@example.com"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-title`}>Title <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input
            id={`${formId}-title`}
            value={value.title ?? ""}
            onChange={(event) => onChange({ ...value, title: event.target.value || undefined })}
            placeholder="VP of Sales"
          />
        </div>
        <EntityPicker
          id={`${formId}-owner`}
          label="Owner"
          value={value.ownerId}
          options={ownerOptions}
          optional
          disabled={saving}
          placeholder="Unassigned"
          onChange={(ownerId) => onChange({ ...value, ownerId })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        This contact is linked to the company that opened this form. Owner choices come only from existing CRM records.
      </p>
      {error === null ? null : <p className="text-sm text-destructive" role="alert">{error}</p>}
      {saving ? <p className="text-sm text-muted-foreground" role="status">Creating contact…</p> : null}
    </form>
  );
}

interface QuickAddDealFormValue {
  name: string;
  ownerId: string;
  stage: DealStage;
  amountCents: string;
  currency: (typeof CURRENCY_CODES)[number];
  expectedCloseDate: string;
}

interface QuickAddDealFormProps {
  formId: string;
  companyName: string;
  value: QuickAddDealFormValue;
  error: string | null;
  saving: boolean;
  ownerOptions: readonly EntityOption[];
  onChange: (next: QuickAddDealFormValue) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function QuickAddDealForm({
  formId,
  companyName,
  value,
  error,
  saving,
  ownerOptions,
  onChange,
  onSubmit,
}: QuickAddDealFormProps) {
  return (
    <form id={formId} className="space-y-5" onSubmit={onSubmit}>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        Company: <span className="font-medium">{companyName}</span>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-name`}>Deal name</label>
        <Input
          id={`${formId}-name`}
          required
          autoFocus
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="Enterprise expansion"
        />
      </div>
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
      {ownerOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No existing CRM owner is available. Assign an owner to a CRM record first, then retry this quick-add.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-stage`}>Stage</label>
          <select
            id={`${formId}-stage`}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={value.stage}
            disabled={saving}
            onChange={(event) => onChange({ ...value, stage: event.target.value as DealStage })}
          >
            {(["DEMO_BOOKED", "QUALIFIED_TO_BUY", "UNQUALIFIED_TO_BUY", "DECISION_MAKER_BOUGHT_IN", "CONTRACT_SENT", "CLOSED_WON", "CLOSED_LOST"] as const).map((stage) => (
              <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-currency`}>Currency</label>
          <select
            id={`${formId}-currency`}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={value.currency}
            disabled={saving}
            onChange={(event) => onChange({ ...value, currency: event.target.value as QuickAddDealFormValue["currency"] })}
          >
            {CURRENCY_CODES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-amount`}>Amount (minor units) <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input
            id={`${formId}-amount`}
            type="number"
            min="0"
            step="1"
            value={value.amountCents}
            disabled={saving}
            onChange={(event) => onChange({ ...value, amountCents: event.target.value })}
            placeholder="125000"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-close-date`}>Expected close date <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input
            id={`${formId}-close-date`}
            type="date"
            value={value.expectedCloseDate}
            disabled={saving}
            onChange={(event) => onChange({ ...value, expectedCloseDate: event.target.value })}
          />
        </div>
      </div>
      {error === null ? null : <p className="text-sm text-destructive" role="alert">{error}</p>}
      {saving ? <p className="text-sm text-muted-foreground" role="status">Creating deal…</p> : null}
    </form>
  );
}

interface CompanyOverviewProps {
  company: Company;
  ownerOptions: readonly EntityOption[];
  onUpdate: (data: CompanyUpdateData, optimistic: Partial<Company>) => void;
  mutationBusy: boolean;
  mutationError: string | null;
  onEnrich: () => void;
  onResearch: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

const COMPANY_SOCIAL_FIELDS = [
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "twitterUrl", label: "X" },
  { key: "githubUrl", label: "GitHub" },
  { key: "pricingUrl", label: "Pricing" },
  { key: "careersUrl", label: "Careers" },
] as const;

function validExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
}

function CompanyMark({
  company,
  className = "size-8",
}: {
  company: Pick<Company, "name" | "iconUrl" | "logoUrl">;
  className?: string;
}) {
  const imageUrl = validExternalUrl(company.iconUrl) ?? validExternalUrl(company.logoUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const classes = `flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground ${className}`;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imageFailed) {
    return (
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        className={classes}
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <span className={classes} aria-hidden="true">
      {companyInitials(company.name)}
    </span>
  );
}

function CompanySocialLinks({ company }: { company: Company }) {
  const links = COMPANY_SOCIAL_FIELDS.flatMap(({ key, label }) => {
    const href = validExternalUrl(company[key]);
    return href ? [{ key, label, href }] : [];
  });
  if (links.length === 0) return null;
  return (
    <section className="space-y-3 border-t border-border pt-5" aria-label="Company social links">
      <h3 className="text-sm font-medium">Links</h3>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {link.label}
            <Icon name="ExternalLink" aria-hidden="true" className="size-3.5" />
          </a>
        ))}
      </div>
    </section>
  );
}

function CompanyOverview({
  company,
  ownerOptions,
  onUpdate,
  mutationBusy,
  mutationError,
  onEnrich,
  onResearch,
  onArchive,
  onRestore,
  onPurge,
}: CompanyOverviewProps) {
  const primaryContact = company.primaryContact ?? company.contacts?.find(
    (contact) => contact.id === company.primaryContactId,
  );
  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Company details">
        <h3 className="text-sm font-medium">Details</h3>
        <div className="grid gap-4 rounded-lg border border-border p-4">
          <InlineField
            label="Name"
            value={company.name}
            saving={mutationBusy}
            onSave={(name) => {
              if (name) onUpdate({ name }, { name });
            }}
          />
          <InlineField
            label="Domain"
            value={company.domain ?? null}
            type="url"
            placeholder="acme.example"
            saving={mutationBusy}
            onSave={(domain) => onUpdate({ domain: domain || null }, { domain: domain || null })}
          />
          <InlineField
            label="Website"
            value={company.website ?? null}
            type="url"
            placeholder="https://acme.example"
            saving={mutationBusy}
            onSave={(website) => onUpdate({ website: website || null }, { website: website || null })}
          />
          <InlineField
            label="Phone"
            value={company.phone ?? null}
            type="tel"
            placeholder="+1 555 0100"
            saving={mutationBusy}
            onSave={(phone) => onUpdate({ phone: phone || null }, { phone: phone || null })}
          />
          <InlineField
            label="Email"
            value={company.email ?? null}
            type="email"
            placeholder="sales@acme.example"
            saving={mutationBusy}
            onSave={(email) => onUpdate({ email: email || null }, { email: email || null })}
          />
          <InlineField
            label="LinkedIn"
            value={company.linkedinUrl ?? null}
            type="url"
            placeholder="https://linkedin.com/company/acme"
            saving={mutationBusy}
            onSave={(linkedinUrl) =>
              onUpdate({ linkedinUrl: linkedinUrl || null }, { linkedinUrl: linkedinUrl || null })
            }
          />
          <InlineField
            label="X"
            value={company.twitterUrl ?? null}
            type="url"
            placeholder="https://x.com/acme"
            saving={mutationBusy}
            onSave={(twitterUrl) =>
              onUpdate({ twitterUrl: twitterUrl || null }, { twitterUrl: twitterUrl || null })
            }
          />
          <InlineField
            label="GitHub"
            value={company.githubUrl ?? null}
            type="url"
            placeholder="https://github.com/acme"
            saving={mutationBusy}
            onSave={(githubUrl) =>
              onUpdate({ githubUrl: githubUrl || null }, { githubUrl: githubUrl || null })
            }
          />
          <InlineField
            label="Pricing"
            value={company.pricingUrl ?? null}
            type="url"
            placeholder="https://acme.example/pricing"
            saving={mutationBusy}
            onSave={(pricingUrl) =>
              onUpdate({ pricingUrl: pricingUrl || null }, { pricingUrl: pricingUrl || null })
            }
          />
          <InlineField
            label="Careers"
            value={company.careersUrl ?? null}
            type="url"
            placeholder="https://acme.example/careers"
            saving={mutationBusy}
            onSave={(careersUrl) =>
              onUpdate({ careersUrl: careersUrl || null }, { careersUrl: careersUrl || null })
            }
          />
          <InlineField
            label="Industry"
            value={company.industry ?? null}
            placeholder="Software"
            saving={mutationBusy}
            onSave={(industry) => onUpdate({ industry: industry || null }, { industry: industry || null })}
          />
          <InlineField
            label="City"
            value={company.city ?? null}
            placeholder="San Francisco"
            saving={mutationBusy}
            onSave={(city) => onUpdate({ city: city || null }, { city: city || null })}
          />
          <InlineField
            label="Country"
            value={company.country ?? null}
            placeholder="United States"
            saving={mutationBusy}
            onSave={(country) => onUpdate({ country: country || null }, { country: country || null })}
          />
          <EntityPicker
            label="Owner"
            value={company.ownerId}
            options={ownerOptions}
            optional
            disabled={mutationBusy}
            placeholder="Unassigned"
            onChange={(ownerId) =>
              onUpdate(
                { ownerId },
                { ownerId, owner: null },
              )
            }
          />
          <InlineTextArea
            label="Description"
            value={company.description ?? null}
            placeholder="What this company does and why it matters."
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
      <CompanySocialLinks company={company} />
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
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
      <section
        className="space-y-3 border-t border-border pt-5"
        aria-label="Company enrichment"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Enrichment</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Provider-backed work is queued only when a research boundary is configured.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {company.enrichmentStatus ?? "PENDING"}
          </span>
        </div>
        {company.enrichmentError ? (
          <p className="text-xs text-destructive" role="alert">
            {company.enrichmentError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={mutationBusy || Boolean(company.archivedAt)} onClick={onEnrich}>
            Enrich company
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={mutationBusy || Boolean(company.archivedAt) || (!company.domain && !company.website)} onClick={onResearch}>
            Research company
          </Button>
        </div>
      </section>
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
  onAddContact?: () => void;
}

function CompanyContacts({
  company,
  busy = false,
  onOpenContact,
  onSetPrimary,
  onAddContact,
}: CompanyContactsProps) {
  const contacts = company.contacts ?? [];
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon="UserRound"
        title="No contacts linked"
        description="Contacts assigned to this company will appear here."
        action={onAddContact ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddContact}>
            <Icon name="Plus" aria-hidden="true" />
            Add contact
          </Button>
        ) : undefined}
        className="min-h-56 border-0 bg-transparent"
      />
    );
  }
  return (
    <section className="space-y-3" aria-label="Company contacts">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Contacts</h3>
        {onAddContact ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddContact}>
            <Icon name="Plus" aria-hidden="true" />
            Add contact
          </Button>
        ) : null}
      </div>
      <div className="hidden grid-cols-[auto_minmax(0,1.8fr)_minmax(8rem,0.8fr)] gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span aria-hidden="true" />
        <span>Contact</span>
        <span>Owner</span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Company contacts list">
        {contacts.map((contact) => {
          const name = contactName(contact);
          const isPrimary = contact.id === company.primaryContactId;
          return (
            <li
              key={contact.id}
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1.8fr)_minmax(8rem,0.8fr)]"
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
                className="min-w-0 rounded px-1 py-1 text-left outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
                onClick={() => onOpenContact?.(contact.id)}
                disabled={onOpenContact === undefined}
                aria-label={`Open ${name}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <ArchivedRelationshipBadge archivedAt={contact.archivedAt} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {displayValue(contact.title)} · {displayValue(contact.email)}
                </span>
              </button>
              <div className="col-span-2 min-w-0 px-1 sm:col-span-1 sm:px-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Owner</p>
                <p className="truncate text-sm">{contact.owner?.name ?? displayValue(contact.ownerId)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CompanyDeals({
  company,
  onOpenDeal,
  onAddDeal,
}: {
  company: Company;
  onOpenDeal?: (id: string) => void;
  onAddDeal?: () => void;
}) {
  const deals = company.deals ?? [];
  if (deals.length === 0) {
    return (
      <EmptyState
        icon="Target"
        title="No deals linked"
        description="Deals for this company will appear here."
        action={onAddDeal ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddDeal}>
            <Icon name="Plus" aria-hidden="true" />
            New deal
          </Button>
        ) : undefined}
        className="min-h-56 border-0 bg-transparent"
      />
    );
  }
  return (
    <section className="space-y-3" aria-label="Company deals">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Deals</h3>
        {onAddDeal ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddDeal}>
            <Icon name="Plus" aria-hidden="true" />
            New deal
          </Button>
        ) : null}
      </div>
      <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(7rem,0.9fr)_minmax(7rem,0.8fr)_minmax(8rem,0.9fr)_minmax(8rem,0.9fr)] gap-3 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Deal</span>
        <span>Stage</span>
        <span>Value</span>
        <span>Owner</span>
        <span>Close date</span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Company deals list">
        {deals.map((deal) => (
          <li
            key={deal.id}
            className="grid min-w-0 gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1.8fr)_minmax(7rem,0.9fr)_minmax(7rem,0.8fr)_minmax(8rem,0.9fr)_minmax(8rem,0.9fr)] sm:items-center"
          >
            <button
              type="button"
              className="min-w-0 rounded px-1 py-1 text-left outline-none transition-colors hover:bg-state-hover focus-visible:bg-state-hover"
              onClick={() => onOpenDeal?.(deal.id)}
              disabled={onOpenDeal === undefined}
              aria-label={`Open ${deal.name}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{deal.name}</span>
                <ArchivedRelationshipBadge archivedAt={deal.archivedAt} />
              </span>
              <span className="block truncate text-xs text-muted-foreground">{deal.id}</span>
            </button>
            <div className="grid grid-cols-[minmax(7rem,auto),minmax(0,1fr)] gap-2 sm:block">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Stage</p>
              <p className="truncate text-sm">{stageLabel(deal.stage)}</p>
            </div>
            <div className="grid grid-cols-[minmax(7rem,auto),minmax(0,1fr)] gap-2 sm:block">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Value</p>
              <p className="truncate text-sm tabular-nums">{formatMinorAmount(deal.amountCents, deal.currency)}</p>
            </div>
            <div className="grid grid-cols-[minmax(7rem,auto),minmax(0,1fr)] gap-2 sm:block">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Owner</p>
              <p className="truncate text-sm">{deal.owner?.name ?? displayValue(deal.ownerId)}</p>
            </div>
            <div className="grid grid-cols-[minmax(7rem,auto),minmax(0,1fr)] gap-2 sm:block">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Close date</p>
              <p className="truncate text-sm">{formatDate(deal.expectedCloseDate)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
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
                    className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-sm font-medium outline-none hover:bg-state-hover focus-visible:bg-state-hover"
                    onClick={() => onOpenDeal(deal.id)}
                  >
                    <span className="min-w-0 truncate">{deal.name}</span>
                    <ArchivedRelationshipBadge archivedAt={deal.archivedAt} />
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
  /** Open the create-company drawer from a routed header action. */
  initialCreate?: boolean;
  /** Reflects record drawer changes back into the BB panel sub-path. */
  onRecordIdChange?: (id: string | null) => void;
  /** Clears a routed create action after the drawer closes or submits. */
  onCreateChange?: (open: boolean) => void;
  /** Reflects the active record drawer tab back into the BB panel sub-path. */
  initialTab?: string | null;
  onTabChange?: (tab: CompanyTab, recordId: string) => void;
}

export function CompaniesView({
  rpcClient,
  savedViewsRpcClient,
  initialRecordId = null,
  initialCreate = false,
  onRecordIdChange,
  onCreateChange,
  initialTab,
  onTabChange,
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
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<"archive" | "purge" | null>(null);
  const [nestedStack, setNestedStack] = useState<NestedCompanyRecord[]>([]);
  const [nestedLoading, setNestedLoading] = useState(false);
  const [nestedError, setNestedError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(initialCreate);
  const [createValue, setCreateValue] = useState<CompanyCreateInput>({
    name: "",
    domain: undefined,
    ownerId: null,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [quickAddKind, setQuickAddKind] = useState<"contact" | "deal" | null>(null);
  const [quickAddContactValue, setQuickAddContactValue] = useState<ContactCreateInput>({
    firstName: "",
    companyId: null,
    ownerId: null,
  });
  const [quickAddDealValue, setQuickAddDealValue] = useState<QuickAddDealFormValue>({
    name: "",
    ownerId: "",
    stage: "DEMO_BOOKED",
    amountCents: "",
    currency: "USD",
    expectedCloseDate: "",
  });
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const columnDefinitions = useMemo<readonly TableColumnPreference[]>(
    () => [
      ...(showArchived ? [...COMPANY_COLUMNS, COMPANY_ARCHIVED_COLUMN] : COMPANY_COLUMNS),
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
    [showArchived, tableDefinitions],
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
    setCreateError(null);
    setCreateOpen(initialCreate);
  }, [initialCreate]);

  useEffect(() => {
    setRecordTab(companyTabFromRoute(initialTab));
  }, [initialTab, recordId]);

  useEffect(() => {
    if (recordId === null) return;
    let active = true;
    setRecordLoading(true);
    setRecordError(null);
    setMutationError(null);
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

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateError(null);
    onCreateChange?.(false);
  }, [onCreateChange]);

  const runRecordUpdate = useCallback(
    async (data: CompanyUpdateData, optimistic: Partial<Company>) => {
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
        const result = await rpc.call("companies_update", { id, data });
        const settled = isCompany(result)
          ? {
              ...next,
              ...result,
              owner: result.owner === undefined ? next.owner : result.owner,
              contacts: result.contacts ?? next.contacts,
              deals: result.deals ?? next.deals,
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

  const requestRecordEnrichment = useCallback(
    async (method: "companies_enrich" | "companies_research") => {
      if (record === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result = await rpc.call(method, { id: record.id });
        setRecord({
          ...record,
          enrichmentStatus: result.status as Company["enrichmentStatus"],
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
      await rpc.call("companies_purge", { id: record.id });
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
        closeCreate();
        setCreateValue({ name: "", domain: undefined, ownerId: null });
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
        const result = await rpc.call("companies_setPrimaryContact", {
          companyId: record.id,
          contactId,
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

  const ownerLabels = useMemo(
    () =>
      new Map(
        list.rows
          .filter((company) => company.owner?.name)
          .map((company) => [company.ownerId, company.owner?.name as string]),
      ),
    [list.rows],
  );
  const ownerOptions = useMemo(
    () => ownerOptionsFromRecords(record ? [...list.rows, record] : list.rows),
    [list.rows, record],
  );
  const openQuickAdd = useCallback(
    (kind: "contact" | "deal") => {
      if (record === null) return;
      setQuickAddError(null);
      setQuickAddKind(kind);
      if (kind === "contact") {
        setQuickAddContactValue({
          firstName: "",
          lastName: undefined,
          email: undefined,
          phone: undefined,
          title: undefined,
          companyId: record.id,
          ownerId: null,
        });
      } else {
        setQuickAddDealValue({
          name: "",
          ownerId: record.ownerId ?? ownerOptions[0]?.value ?? "",
          stage: "DEMO_BOOKED",
          amountCents: "",
          currency: "USD",
          expectedCloseDate: "",
        });
      }
    },
    [ownerOptions, record],
  );
  const submitQuickAdd = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (record === null || quickAddKind === null) return;
      setQuickAddSaving(true);
      setQuickAddError(null);
      try {
        if (quickAddKind === "contact") {
          const firstName = quickAddContactValue.firstName.trim();
          if (!firstName) {
            setQuickAddError("First name is required.");
            return;
          }
          await listRpc(rpc).call("contacts_create", {
            firstName,
            ...(quickAddContactValue.lastName?.trim()
              ? { lastName: quickAddContactValue.lastName.trim() }
              : {}),
            ...(quickAddContactValue.email?.trim()
              ? { email: quickAddContactValue.email.trim() }
              : {}),
            ...(quickAddContactValue.phone?.trim()
              ? { phone: quickAddContactValue.phone.trim() }
              : {}),
            ...(quickAddContactValue.title?.trim()
              ? { title: quickAddContactValue.title.trim() }
              : {}),
            companyId: record.id,
            ownerId: quickAddContactValue.ownerId ?? null,
          });
        } else {
          const name = quickAddDealValue.name.trim();
          const ownerId = quickAddDealValue.ownerId.trim();
          const amountText = quickAddDealValue.amountCents.trim();
          const amountCents = amountText === "" ? null : Number(amountText);
          if (!name) {
            setQuickAddError("Deal name is required.");
            return;
          }
          if (!ownerId) {
            setQuickAddError("Choose an existing CRM owner before creating a deal.");
            return;
          }
          if (
            amountCents !== null &&
            (!Number.isSafeInteger(amountCents) || amountCents < 0)
          ) {
            setQuickAddError("Amount must be a non-negative integer in minor units.");
            return;
          }
          await listRpc(rpc).call("deals_create", {
            name,
            companyId: record.id,
            ownerId,
            stage: quickAddDealValue.stage,
            amountCents,
            currency: quickAddDealValue.currency,
            expectedCloseDate: quickAddDealValue.expectedCloseDate || null,
          } satisfies DealCreateInput);
        }
        setQuickAddKind(null);
        setQuickAddError(null);
        setRecordRefreshKey((value) => value + 1);
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setQuickAddError(errorMessage(cause));
      } finally {
        setQuickAddSaving(false);
      }
    },
    [quickAddContactValue, quickAddDealValue, quickAddKind, record, rpc],
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
      {
        id: "activity",
        label: "Activity",
        options: activityFacetOptions(list.facetCounts, filters.activity),
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
                  onClick={() =>
                    void runBulk(
                      "companies_bulkEnrich",
                      { ids: selectedIds },
                      enrichmentResultMessage,
                    )
                  }
                >
                  Enrich selected
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
                        : column.id === "last-activity" || column.id === "createdAt" || column.id === "archivedAt" || column.id.startsWith("field:")
                          ? "whitespace-nowrap px-3 py-3 text-muted-foreground"
                          : "px-3 py-3 text-muted-foreground"
                  }
                >
                  {column.id === "company" ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <CompanyMark company={company} />
                      <span className="truncate">{companyColumnValue(company, column.id, tableDefinitions)}</span>
                    </div>
                  ) : column.id === "last-activity" && company.lastActivityAt ? (
                    <time dateTime={company.lastActivityAt}>
                      {companyColumnValue(company, column.id, tableDefinitions)}
                    </time>
                  ) : column.id === "createdAt" && company.createdAt ? (
                    <time dateTime={company.createdAt}>
                      {companyColumnValue(company, column.id, tableDefinitions)}
                    </time>
                  ) : column.id === "archivedAt" && company.archivedAt ? (
                    <time dateTime={company.archivedAt}>
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

      <AlertDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={`Delete ${record?.name ?? "company"} permanently?`}
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
            ? `Delete ${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} permanently?`
            : `Archive ${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"}?`
        }
        description={bulkConfirm === "purge" ? "This cannot be undone." : "Archived companies can be restored later."}
        confirmLabel={bulkConfirm === "purge" ? "Delete permanently" : "Archive"}
        destructive={bulkConfirm === "purge"}
        onConfirm={async () => {
          if (bulkConfirm === "purge") {
            await runBulk(
              "companies_bulkPurge",
              { ids: selectedIds },
              `${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} deleted.`,
            );
          } else if (bulkConfirm === "archive") {
            await runBulk(
              "companies_bulkArchive",
              { ids: selectedIds },
              `${selectedIds.length} ${selectedIds.length === 1 ? "company" : "companies"} archived.`,
            );
          }
        }}
      />
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
              <CompanyOverview
                company={record}
                ownerOptions={ownerOptions}
                onUpdate={(data, optimistic) => void runRecordUpdate(data, optimistic)}
                mutationBusy={mutationBusy}
                mutationError={mutationError}
                onEnrich={() => void requestRecordEnrichment("companies_enrich")}
                onResearch={() => void requestRecordEnrichment("companies_research")}
                onArchive={() => void runArchiveMutation("companies_archive")}
                onRestore={() => void runArchiveMutation("companies_restore")}
                onPurge={() => setPurgeOpen(true)}
              />
            ) : recordTab === "contacts" ? (
              <CompanyContacts
                company={record}
                busy={mutationBusy}
                onOpenContact={(id) => openNestedRecord("contact", id)}
                onSetPrimary={(id) => void setPrimaryContact(id)}
                onAddContact={() => openQuickAdd("contact")}
              />
            ) : recordTab === "deals" ? (
              <CompanyDeals
                company={record}
                onOpenDeal={(id) => openNestedRecord("deal", id)}
                onAddDeal={() => openQuickAdd("deal")}
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
          if (open) {
            setCreateError(null);
            setCreateOpen(true);
          } else {
            closeCreate();
          }
        }}
        title="New company"
        description="Add an organization to your CRM workspace."
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
          ownerOptions={ownerOptions}
          onChange={setCreateValue}
          onSubmit={submitCreate}
        />
      </RecordDrawer>

      <RecordDrawer
        open={quickAddKind !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQuickAddKind(null);
            setQuickAddError(null);
          }
        }}
        title={quickAddKind === "deal" ? "New deal" : "Add contact"}
        description={record ? `Link a record to ${record.name}.` : "Add a related CRM record."}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={quickAddSaving}
              onClick={() => setQuickAddKind(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={quickAddKind === "deal" ? "quick-add-deal-form" : "quick-add-contact-form"}
              disabled={quickAddSaving}
            >
              {quickAddSaving
                ? "Creating…"
                : quickAddKind === "deal"
                  ? "Create deal"
                  : "Add contact"}
            </Button>
          </>
        }
      >
        {record === null ? null : quickAddKind === "deal" ? (
          <QuickAddDealForm
            formId="quick-add-deal-form"
            companyName={record.name}
            value={quickAddDealValue}
            error={quickAddError}
            saving={quickAddSaving}
            ownerOptions={ownerOptions}
            onChange={setQuickAddDealValue}
            onSubmit={submitQuickAdd}
          />
        ) : (
          <QuickAddContactForm
            formId="quick-add-contact-form"
            value={quickAddContactValue}
            error={quickAddError}
            saving={quickAddSaving}
            ownerOptions={ownerOptions}
            onChange={setQuickAddContactValue}
            onSubmit={submitQuickAdd}
          />
        )}
      </RecordDrawer>
    </div>
  );
}
