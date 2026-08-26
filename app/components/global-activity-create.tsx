import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  ActivityCreateInput,
  ActivityEntry,
  CompanyListInput,
  CompanyListOutput,
  ContactListInput,
  ContactListOutput,
  DealListInput,
  DealListOutput,
} from "../../contracts/core.js";
import { rpcContract } from "../../contracts/rpc.js";
import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import { Input } from "../../components/ui/input.js";
import { EntityPicker, type EntityOption } from "./entity-picker.js";
import { RecordDrawer } from "./record-drawer.js";

type ActivityCreateKind = "note" | "task";
type ActivityRecordKind = "company" | "contact" | "deal";

export interface GlobalActivityRpcClient {
  call(method: "companies_list", input: CompanyListInput): Promise<CompanyListOutput>;
  call(method: "contacts_list", input: ContactListInput): Promise<ContactListOutput>;
  call(method: "deals_list", input: DealListInput): Promise<DealListOutput>;
  call(method: "activity_create", input: ActivityCreateInput): Promise<ActivityEntry>;
}

export interface GlobalActivityCreateProps {
  type: ActivityCreateKind;
  onClose: () => void;
  /** Stable header trigger used when this routed drawer outlives its menu. */
  returnFocusRef?: { readonly current: HTMLElement | null };
  rpcClient?: GlobalActivityRpcClient;
}

const COMPANY_LIST_INPUT: CompanyListInput = {
  q: "",
  sort: "name",
  dir: "asc",
  page: 1,
  pageSize: 100,
  owner: [],
  industry: [],
  enrichment: [],
  source: [],
  activity: [],
  fields: {},
  archived: false,
};

const CONTACT_LIST_INPUT: ContactListInput = {
  q: "",
  sort: "name",
  dir: "asc",
  page: 1,
  pageSize: 100,
  owner: [],
  company: [],
  source: [],
  title: [],
  seniority: [],
  persona: [],
  activity: [],
  fields: {},
  archived: false,
};

const DEAL_LIST_INPUT: DealListInput = {
  q: "",
  sort: "createdAt",
  dir: "desc",
  page: 1,
  pageSize: 100,
  status: "all",
  owner: [],
  stage: [],
  closing: [],
  fields: {},
  archived: false,
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function contactLabel(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].filter(Boolean).join(" ") || "Unnamed contact";
}

function createOptions(
  kind: ActivityRecordKind,
  companies: CompanyListOutput["rows"],
  contacts: ContactListOutput["rows"],
  deals: DealListOutput["rows"],
): EntityOption[] {
  if (kind === "company") {
    return companies.map((company) => ({
      value: company.id,
      label: company.name,
      description: company.domain ?? company.id,
    }));
  }
  if (kind === "contact") {
    return contacts.map((contact) => ({
      value: contact.id,
      label: contactLabel(contact.firstName, contact.lastName),
      description: contact.company?.name ?? contact.email ?? contact.id,
    }));
  }
  return deals.map((deal) => ({
    value: deal.id,
    label: deal.name,
    description: deal.company?.name ?? deal.id,
  }));
}

function normalizedDueAt(value: string): string | null | undefined {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

/**
 * Header-level note/task composer. Activities always belong to a real CRM
 * record, so the global action asks for that record before creating anything.
 */
export function GlobalActivityCreate({
  type,
  onClose,
  returnFocusRef,
  rpcClient,
}: GlobalActivityCreateProps) {
  const contextRpc = useRpc<typeof rpcContract>() as unknown as GlobalActivityRpcClient;
  const rpc = rpcClient ?? contextRpc;
  const formId = useId().replace(/:/g, "");
  const [recordKind, setRecordKind] = useState<ActivityRecordKind>("company");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyListOutput["rows"]>([]);
  const [contacts, setContacts] = useState<ContactListOutput["rows"]>([]);
  const [deals, setDeals] = useState<DealListOutput["rows"]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRequestRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      rpc.call("companies_list", COMPANY_LIST_INPUT),
      rpc.call("contacts_list", CONTACT_LIST_INPUT),
      rpc.call("deals_list", DEAL_LIST_INPUT),
    ])
      .then(([companyResult, contactResult, dealResult]) => {
        if (!active) return;
        setCompanies(companyResult.rows);
        setContacts(contactResult.rows);
        setDeals(dealResult.rows);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rpc]);

  const searchRecords = useCallback(async (kind: ActivityRecordKind, query: string) => {
    const requestId = ++searchRequestRef.current;
    setSearchLoading(true);
    setLoadError(null);
    try {
      const normalizedQuery = query.trim();
      if (kind === "company") {
        const result = await rpc.call("companies_list", { ...COMPANY_LIST_INPUT, q: normalizedQuery });
        if (requestId === searchRequestRef.current) setCompanies(result.rows);
      } else if (kind === "contact") {
        const result = await rpc.call("contacts_list", { ...CONTACT_LIST_INPUT, q: normalizedQuery });
        if (requestId === searchRequestRef.current) setContacts(result.rows);
      } else {
        const result = await rpc.call("deals_list", { ...DEAL_LIST_INPUT, q: normalizedQuery });
        if (requestId === searchRequestRef.current) setDeals(result.rows);
      }
    } catch (cause) {
      if (requestId === searchRequestRef.current) setLoadError(errorMessage(cause));
    } finally {
      if (requestId === searchRequestRef.current) setSearchLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    setRecordId(null);
    setSearchLoading(false);
    setSubject("");
    setBody("");
    setDueAt("");
    setError(null);
  }, [type]);

  const options = useMemo(
    () => createOptions(recordKind, companies, contacts, deals),
    [companies, contacts, deals, recordKind],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recordId === null) {
      setError("Choose a company, contact, or deal before saving.");
      return;
    }
    const normalizedSubject = subject.trim();
    if (type === "task" && normalizedSubject === "") {
      setError("Tasks need a subject.");
      return;
    }
    const normalizedDue = type === "task" ? normalizedDueAt(dueAt) : null;
    if (normalizedDue === undefined) {
      setError("Choose a valid due date.");
      return;
    }
    const anchor =
      recordKind === "company"
        ? { companyId: recordId }
        : recordKind === "contact"
          ? { contactId: recordId }
          : { dealId: recordId };
    const input: ActivityCreateInput = {
      ...anchor,
      type: type === "task" ? "TASK" : "NOTE",
      createdById: "local_user",
      ...(normalizedSubject ? { subject: normalizedSubject } : {}),
      ...(body.trim() ? { body: body.trim() } : {}),
      ...(type === "task" ? { dueAt: normalizedDue } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      await rpc.call("activity_create", input);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const title = type === "task" ? "New task" : "New note";

  return (
    <RecordDrawer
      open
      onOpenChange={(open) => {
        if (!open) {
          const target = returnFocusRef?.current;
          if (
            target?.isConnected &&
            target.closest('[aria-hidden="true"], [inert]') === null
          ) {
            target.focus({ preventScroll: true });
          }
          onClose();
        }
      }}
      returnFocusRef={returnFocusRef}
      title={title}
      description="Attach a CRM activity to an existing company, contact, or deal."
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={saving || loading}>
            {saving ? "Saving…" : `Create ${type}`}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-center">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${formId}-kind`}>
            Record type
          </label>
          <select
            id={`${formId}-kind`}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={recordKind}
            disabled={saving || loading}
            onChange={(event) => {
              setRecordKind(event.target.value as ActivityRecordKind);
              searchRequestRef.current += 1;
              setRecordId(null);
              setError(null);
            }}
          >
            <option value="company">Company</option>
            <option value="contact">Contact</option>
            <option value="deal">Deal</option>
          </select>
        </div>
        <EntityPicker
          label="Record"
          value={recordId}
          options={options}
          required
          disabled={saving || loading}
          placeholder={loading ? "Loading CRM records…" : "Choose a record"}
          emptyMessage={`No ${recordKind} records are available.`}
          loading={searchLoading}
          onQueryChange={(query) => {
            void searchRecords(recordKind, query);
          }}
          onChange={(value) => {
            setRecordId(value);
            setError(null);
          }}
        />
        {loadError ? (
          <p className="text-sm text-destructive" role="alert">
            Could not load CRM records: {loadError}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-center">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${formId}-subject`}>
            Subject{type === "task" ? " *" : ""}
          </label>
          <Input
            id={`${formId}-subject`}
            value={subject}
            required={type === "task"}
            disabled={saving}
            onChange={(event) => {
              setSubject(event.target.value);
              setError(null);
            }}
            placeholder={type === "task" ? "Follow up with the buying team" : "Short note title"}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-start">
          <label className="pt-2 text-xs font-medium text-muted-foreground" htmlFor={`${formId}-body`}>
            Details <span className="font-normal">(optional)</span>
          </label>
          <textarea
            id={`${formId}-body`}
            className="flex min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            rows={4}
            value={body}
            disabled={saving}
            onChange={(event) => {
              setBody(event.target.value);
              setError(null);
            }}
            placeholder="Add context for the next person who opens this record."
          />
        </div>
        {type === "task" ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-center">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${formId}-due-at`}>
              Due date <span className="font-normal">(optional)</span>
            </label>
            <Input
              id={`${formId}-due-at`}
              type="datetime-local"
              value={dueAt}
              disabled={saving}
              onChange={(event) => {
                setDueAt(event.target.value);
                setError(null);
              }}
            />
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            <Icon name="AlertCircle" aria-hidden="true" /> {error}
          </p>
        ) : null}
      </form>
    </RecordDrawer>
  );
}
