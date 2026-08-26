import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import type {
  Contact,
  ContactUpdateData,
  Deal,
  DealStage,
  DealUpdateData,
  EnrichmentStatus,
  SetDealStageInput,
} from "../../../contracts/core.js";
import {
  AlertDialog,
  EmptyState,
  PersonAvatar,
  RecordDrawer,
  type EntityOption,
} from "../../components/index.js";
import { RecordAgentTab, type RecordAgentRpcClient } from "../../components/record-agent-tab.js";
import { ActivityTimeline, type ActivityRpcClient } from "../activity/index.js";

/** A record in the parent company's push/pop relation history. */
export type RelatedRecord =
  | { kind: "contact"; id: string; value: Contact | null }
  | { kind: "deal"; id: string; value: Deal | null };

/** The BB host client is broader than any one record view's typed surface. */
export interface RelatedRecordRpcClient {
  call(method: string, input: unknown): Promise<unknown>;
}

export interface ContactRecordRendererProps {
  contact: Contact;
  rpc: RelatedRecordRpcClient;
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
  onOpenContact: (id: string) => void;
}

export interface ContactDealsRendererProps {
  contact: Contact;
  rpc: RelatedRecordRpcClient;
  onChanged: () => void;
  onOpenDeal: (id: string) => void;
}

export interface DealRecordRendererProps {
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

export interface DealContactsRendererProps {
  deal: Deal;
  rpc: RelatedRecordRpcClient;
  onChanged: () => void;
  onOpenContact: (id: string) => void;
}

export interface RelatedRecordRenderers {
  contactOverview: (props: ContactRecordRendererProps) => ReactNode;
  contactDeals: (props: ContactDealsRendererProps) => ReactNode;
  dealOverview: (props: DealRecordRendererProps) => ReactNode;
  dealContacts: (props: DealContactsRendererProps) => ReactNode;
}

export interface RelatedRecordStackProps {
  stack: readonly RelatedRecord[];
  rpc: RelatedRecordRpcClient;
  /** Existing companies used by the source-shaped relation editors. */
  companyOptions: readonly EntityOption[];
  /** Existing CRM owners used by the source-shaped relation editors. */
  ownerOptions: readonly EntityOption[];
  renderers: RelatedRecordRenderers;
  onPush: (kind: RelatedRecord["kind"], id: string) => void;
  onPop: () => void;
  onReplace: (kind: RelatedRecord["kind"], id: string, value: Contact | Deal) => void;
}

type RelatedRecordTab = "overview" | "deals" | "contacts" | "activity" | "agent";

const CONTACT_TABS: ReadonlyArray<{ id: Extract<RelatedRecordTab, "overview" | "deals" | "activity" | "agent">; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "deals", label: "Deals" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

const DEAL_TABS: ReadonlyArray<{ id: Extract<RelatedRecordTab, "overview" | "contacts" | "activity" | "agent">; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "activity", label: "Activity" },
  { id: "agent", label: "Agent" },
];

function contactName(contact: Pick<Contact, "firstName" | "lastName">): string {
  return [contact.firstName, contact.lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ") || "Contact";
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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
    typeof value.name === "string" &&
    "stage" in value
  );
}

function resultStatus(value: unknown): EnrichmentStatus | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const status = (value as { status?: unknown }).status;
  return typeof status === "string" ? (status as EnrichmentStatus) : undefined;
}

function resultReason(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const reason = (value as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? reason : null;
}

function relatedLabel(item: RelatedRecord): string {
  if (item.value === null) return item.kind === "contact" ? "Contact" : "Deal";
  return item.kind === "contact" ? contactName(item.value) : item.value.name;
}

function relatedDescription(item: RelatedRecord): string {
  if (item.value === null) return `${item.kind === "contact" ? "Contact" : "Deal"} record`;
  if (item.kind === "contact") return item.value.email ?? "Contact record";
  return `${item.value.stage} · Deal record`;
}

function addOption(
  options: EntityOption[],
  value: string | null | undefined,
  label: string | null | undefined,
  description?: string | null,
) {
  if (!value || options.some((option) => option.value === value)) return;
  options.push({ value, label: label?.trim() || value, ...(description ? { description } : {}) });
}

/**
 * Source-shaped detail stack for records opened from a company drawer.
 * Detail components remain shared with the top-level contacts/deals views;
 * this component owns only the nested fetch, mutation, and push/pop state.
 */
export function RelatedRecordStack({
  stack,
  rpc,
  companyOptions,
  ownerOptions,
  renderers,
  onPush,
  onPop,
  onReplace,
}: RelatedRecordStackProps) {
  const top = stack[stack.length - 1] ?? null;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<RelatedRecordTab>("overview");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);

  const topKey = top === null ? null : `${top.kind}:${top.id}`;

  useEffect(() => {
    setTab("overview");
    setLoadError(null);
    setMutationError(null);
    setPurgeOpen(false);
  }, [topKey]);

  useEffect(() => {
    if (top === null || top.value !== null) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    const method = top.kind === "contact" ? "contacts_get" : "deals_get";
    void rpc
      .call(method, { id: top.id })
      .then((next) => {
        if (!active) return;
        const value = top.kind === "contact"
          ? isContact(next)
            ? next
            : null
          : isDeal(next)
            ? next
            : null;
        if (value === null) {
          setLoadError(`Could not load ${top.kind}.`);
          return;
        }
        onReplace(top.kind, top.id, value);
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
  }, [onReplace, rpc, top]);

  const nestedCompanyOptions = useMemo(() => {
    const options = [...companyOptions];
    for (const item of stack) {
      if (item.value === null) continue;
      const company = item.kind === "contact" ? item.value.company : item.value.company;
      addOption(options, company?.id, company?.name, company?.domain ?? company?.id);
    }
    return options;
  }, [companyOptions, stack]);

  const nestedOwnerOptions = useMemo(() => {
    const options = [...ownerOptions];
    for (const item of stack) {
      if (item.value === null) continue;
      const owner = item.value.owner;
      addOption(options, owner?.id ?? item.value.ownerId, owner?.name, owner?.email ?? "Known CRM owner ID");
    }
    return options;
  }, [ownerOptions, stack]);

  const replace = useCallback(
    (value: Contact | Deal) => {
      if (top === null) return;
      onReplace(top.kind, top.id, value);
    },
    [onReplace, top],
  );

  const runContactUpdate = useCallback(
    async (data: ContactUpdateData, optimistic: Partial<Contact>) => {
      if (top?.kind !== "contact" || top.value === null) return;
      const previous = top.value;
      const next = { ...previous, ...optimistic };
      setMutationBusy(true);
      setMutationError(null);
      replace(next);
      try {
        const result = await rpc.call("contacts_update", { id: previous.id, data });
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
        replace(settled);
      } catch (cause) {
        replace(previous);
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [replace, rpc, top],
  );

  const runDealUpdate = useCallback(
    async (data: DealUpdateData, optimistic: Partial<Deal>) => {
      if (top?.kind !== "deal" || top.value === null) return;
      const previous = top.value;
      const next = { ...previous, ...optimistic };
      setMutationBusy(true);
      setMutationError(null);
      replace(next);
      try {
        const result = await rpc.call("deals_update", { id: previous.id, data });
        const settled = isDeal(result)
          ? {
              ...next,
              ...result,
              company: result.company === undefined ? next.company : result.company,
              owner: result.owner === undefined ? next.owner : result.owner,
              contacts: result.contacts ?? next.contacts,
            }
          : next;
        replace(settled);
      } catch (cause) {
        replace(previous);
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [replace, rpc, top],
  );

  const runArchiveMutation = useCallback(
    async (method: "contacts_archive" | "contacts_restore" | "deals_archive" | "deals_restore") => {
      if (top === null || top.value === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result = await rpc.call(method, { id: top.id });
        const archivedAt = method.endsWith("archive") ? new Date().toISOString() : null;
        replace(
          top.kind === "contact"
            ? isContact(result)
              ? result
              : { ...top.value, archivedAt }
            : isDeal(result)
              ? result
              : { ...top.value, archivedAt },
        );
      } catch (cause) {
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [replace, rpc, top],
  );

  const runContactEnrichment = useCallback(
    async (method: "contacts_enrich" | "contacts_research", focus?: "socials" | "work-history" | "brief") => {
      if (top?.kind !== "contact" || top.value === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const result = method === "contacts_research"
          ? await rpc.call(method, { id: top.id, focus: focus ?? "brief" })
          : await rpc.call(method, { id: top.id });
        replace({
          ...top.value,
          ...(resultStatus(result) ? { enrichmentStatus: resultStatus(result) } : {}),
          enrichmentError: resultReason(result),
        });
        if (resultReason(result)) setMutationError(resultReason(result));
      } catch (cause) {
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [replace, rpc, top],
  );

  const runDealStage = useCallback(
    async (stage: DealStage, closedReason?: string) => {
      if (top?.kind !== "deal" || top.value === null) return;
      setMutationBusy(true);
      setMutationError(null);
      try {
        const input: SetDealStageInput = {
          id: top.id,
          stage,
          ...(closedReason?.trim() ? { closedReason: closedReason.trim() } : {}),
        };
        const result = await rpc.call("deals_setStage", input);
        replace(
          isDeal(result)
            ? result
            : {
                ...top.value,
                stage,
                closedReason: stage === "CLOSED_LOST" ? closedReason?.trim() || null : null,
                closedAt: stage === "CLOSED_WON" || stage === "CLOSED_LOST"
                  ? top.value.closedAt ?? new Date().toISOString()
                  : null,
              },
        );
      } catch (cause) {
        setMutationError(errorMessage(cause));
      } finally {
        setMutationBusy(false);
      }
    },
    [replace, rpc, top],
  );

  const purgeRecord = useCallback(async () => {
    if (top === null || top.value === null) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await rpc.call(top.kind === "contact" ? "contacts_purge" : "deals_purge", { id: top.id });
      setPurgeOpen(false);
      onPop();
    } catch (cause) {
      setMutationError(errorMessage(cause));
      throw cause;
    } finally {
      setMutationBusy(false);
    }
  }, [onPop, rpc, top]);

  const refreshTop = useCallback(() => {
    if (top === null) return;
    const { kind, id } = top;
    const method = kind === "contact" ? "contacts_get" : "deals_get";
    setMutationError(null);
    void rpc
      .call(method, { id })
      .then((next) => {
        const value = kind === "contact"
          ? isContact(next)
            ? next
            : null
          : isDeal(next)
            ? next
            : null;
        if (value === null) {
          setMutationError(`Could not refresh ${kind}.`);
          return;
        }
        onReplace(kind, id, value);
      })
      .catch((cause: unknown) => setMutationError(errorMessage(cause)));
  }, [onReplace, rpc, top]);

  return (
    <>
      <RecordDrawer
        open={top !== null}
        onOpenChange={(open) => {
          if (!open) onPop();
        }}
        title={top === null ? "Record" : relatedLabel(top)}
        description={top === null ? undefined : relatedDescription(top)}
        media={top?.kind === "contact" && top.value !== null ? (
          <PersonAvatar
            src={top.value.imageUrl}
            name={contactName(top.value)}
            email={top.value.email}
            size="lg"
          />
        ) : undefined}
        actions={top === null ? undefined : (
          <Button type="button" variant="ghost" size="sm" onClick={onPop}>
            <Icon name="ChevronLeft" aria-hidden="true" />
            Back
          </Button>
        )}
      >
        {loading ? (
          <div className="flex min-h-56 items-center justify-center" role="status">
            Loading {top?.kind ?? "record"}…
          </div>
        ) : loadError !== null ? (
          <EmptyState
            title={`Could not load ${top?.kind ?? "record"}`}
            description={loadError}
            action={
              <Button type="button" variant="outline" onClick={refreshTop}>
                Retry
              </Button>
            }
          />
        ) : top?.value === null ? (
          <EmptyState title="Record not found" />
        ) : top?.kind === "contact" ? (
          <div className="space-y-5">
            <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label={`${contactName(top.value)} views`}>
              {CONTACT_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {tab === "overview" ? (
              renderers.contactOverview({
                contact: top.value,
                rpc,
                companyOptions: nestedCompanyOptions,
                ownerOptions: nestedOwnerOptions,
                onUpdate: (data, optimistic) => void runContactUpdate(data, optimistic),
                onEvidenceChanged: refreshTop,
                mutationBusy,
                mutationError,
                onEnrich: () => void runContactEnrichment("contacts_enrich"),
                onResearch: (focus) => void runContactEnrichment("contacts_research", focus),
                onArchive: () => void runArchiveMutation("contacts_archive"),
                onRestore: () => void runArchiveMutation("contacts_restore"),
                onPurge: () => setPurgeOpen(true),
                onOpenContact: (id) => onPush("contact", id),
              })
            ) : tab === "deals" ? (
              renderers.contactDeals({
                contact: top.value,
                rpc,
                onChanged: refreshTop,
                onOpenDeal: (id) => onPush("deal", id),
              })
            ) : tab === "activity" ? (
              <ActivityTimeline
                anchor={{ contactId: top.value.id }}
                rpcClient={rpc as unknown as ActivityRpcClient}
                title="Contact activity"
                description="Notes, touchpoints, and follow-up work for this contact."
                onOpenRelatedRecord={(kind, id) => {
                  if (kind === "deal" || kind === "contact") onPush(kind, id);
                }}
              />
            ) : (
              <RecordAgentTab
                rpc={rpc as unknown as RecordAgentRpcClient}
                recordType="CONTACT"
                recordId={top.value.id}
                recordLabel={contactName(top.value)}
              />
            )}
          </div>
        ) : top?.kind === "deal" ? (
          <div className="space-y-5">
            <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label={`${top.value.name} views`}>
              {DEAL_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {tab === "overview" ? (
              renderers.dealOverview({
                deal: top.value,
                companyOptions: nestedCompanyOptions,
                ownerOptions: nestedOwnerOptions,
                onUpdate: (data, optimistic) => void runDealUpdate(data, optimistic),
                mutationBusy,
                mutationError,
                onSetStage: runDealStage,
                onArchive: () => void runArchiveMutation("deals_archive"),
                onRestore: () => void runArchiveMutation("deals_restore"),
                onPurge: () => setPurgeOpen(true),
              })
            ) : tab === "contacts" ? (
              renderers.dealContacts({
                deal: top.value,
                rpc,
                onOpenContact: (id) => onPush("contact", id),
                onChanged: refreshTop,
              })
            ) : tab === "activity" ? (
              <ActivityTimeline
                anchor={{ dealId: top.value.id }}
                rpcClient={rpc as unknown as ActivityRpcClient}
                title="Deal activity"
                description="Notes, touchpoints, and follow-up work for this deal."
                onOpenRelatedRecord={(kind, id) => {
                  if (kind === "contact") onPush("contact", id);
                }}
              />
            ) : (
              <RecordAgentTab
                rpc={rpc as unknown as RecordAgentRpcClient}
                recordType="DEAL"
                recordId={top.value.id}
                recordLabel={top.value.name}
              />
            )}
          </div>
        ) : null}
      </RecordDrawer>
      <AlertDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={`Delete ${top ? relatedLabel(top) : "record"} permanently?`}
        description="This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={purgeRecord}
      />
    </>
  );
}
