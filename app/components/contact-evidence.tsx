import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import type {
  Contact,
  ContactBriefRecord,
  ContactFactRecord,
  ContactWorkHistory,
} from "../../contracts/core.js";

export interface ContactEvidenceRpcClient {
  call(method: string, input: unknown): Promise<unknown>;
}

interface ContactEvidenceProps {
  contact: Contact;
  rpc: ContactEvidenceRpcClient;
  onChanged?: () => void;
}

type DisplayBrief = {
  id: string | null;
  contactId: string;
  version: number | null;
  narrative: string;
  sections: ContactBriefRecord["sections"];
  score: number;
  sourceUrl: string | null;
  refreshedAt: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackFacts(contact: Contact): ContactFactRecord[] {
  return (contact.facts ?? []).map((fact) => ({
    ...fact,
    contactId: contact.id,
    sourceUrl: fact.sourceUrl ?? null,
    sessionId: null,
    decidedById: null,
    decidedAt: null,
    supersededAt: null,
    supersedesId: null,
    supersededById: null,
    createdAt: fact.observedAt,
  }));
}

function validFacts(value: unknown): ContactFactRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ContactFactRecord =>
    isRecord(item) &&
    typeof item.id === "string" &&
    typeof item.contactId === "string" &&
    typeof item.field === "string" &&
    typeof item.value === "string" &&
    typeof item.status === "string" &&
    Array.isArray(item.evidence),
  );
}

function validWorkHistory(value: unknown): ContactWorkHistory[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ContactWorkHistory =>
    isRecord(item) &&
    typeof item.id === "string" &&
    typeof item.contactId === "string" &&
    typeof item.status === "string" &&
    Array.isArray(item.evidence),
  );
}

function validBrief(value: unknown): ContactBriefRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.contactId !== "string") return null;
  if (typeof value.narrative !== "string" || typeof value.version !== "number") return null;
  return value as unknown as ContactBriefRecord;
}

function projectionBrief(contact: Contact): DisplayBrief | null {
  if (!contact.brief) return null;
  return {
    id: null,
    contactId: contact.id,
    version: null,
    narrative: contact.brief.narrative,
    sections: contact.brief.sections,
    score: contact.brief.score,
    sourceUrl: contact.brief.sourceUrl,
    refreshedAt: contact.brief.refreshedAt,
    createdAt: contact.brief.refreshedAt,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function sourceLink(url: string | null | undefined): ReactNode {
  if (!url) return null;
  return (
    <a className="break-all text-primary underline" href={url} target="_blank" rel="noreferrer">
      Source
    </a>
  );
}

function statusClass(status: string): string {
  if (status === "PROPOSED") return "text-amber-700 dark:text-amber-300";
  if (status === "APPLIED") return "text-emerald-700 dark:text-emerald-300";
  if (status === "DISMISSED") return "text-muted-foreground";
  return "text-destructive";
}

export function ContactEvidence({ contact, rpc, onChanged }: ContactEvidenceProps) {
  const [facts, setFacts] = useState<ContactFactRecord[]>(() => fallbackFacts(contact));
  const [workHistory, setWorkHistory] = useState<ContactWorkHistory[]>(contact.workHistory ?? []);
  const [brief, setBrief] = useState<DisplayBrief | null>(() => projectionBrief(contact));
  const [briefHistory, setBriefHistory] = useState<ContactBriefRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showBriefForm, setShowBriefForm] = useState(false);
  const [briefNarrative, setBriefNarrative] = useState("");
  const [briefRole, setBriefRole] = useState("");
  const [briefSourceUrl, setBriefSourceUrl] = useState("");
  const [briefScore, setBriefScore] = useState("0.5");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [factsResult, historyResult, briefResult] = await Promise.all([
        rpc.call("contacts_facts_list", { contactId: contact.id, includeSuperseded: false, limit: 1_000 }),
        rpc.call("contacts_workHistory_list", { contactId: contact.id, includeSuperseded: false, limit: 1_000 }),
        rpc.call("contacts_briefs_current", { contactId: contact.id }),
      ]);
      const nextFacts = validFacts(factsResult);
      const nextHistory = validWorkHistory(historyResult);
      setFacts(nextFacts.length > 0 || (Array.isArray(factsResult) && factsResult.length === 0) ? nextFacts : fallbackFacts(contact));
      setWorkHistory(nextHistory.length > 0 || (Array.isArray(historyResult) && historyResult.length === 0) ? nextHistory : contact.workHistory ?? []);
      setBrief(validBrief(briefResult) ?? projectionBrief(contact));
    } catch (cause) {
      setError(errorMessage(cause));
      setFacts(fallbackFacts(contact));
      setWorkHistory(contact.workHistory ?? []);
      setBrief(projectionBrief(contact));
    } finally {
      setLoading(false);
    }
  }, [contact, rpc]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mutate = async (key: string, method: string, input: unknown) => {
    setBusy(key);
    setError(null);
    try {
      await rpc.call(method, input);
      await reload();
      onChanged?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const loadHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setBusy("brief-history");
    setError(null);
    try {
      const result = await rpc.call("contacts_briefs_list", { contactId: contact.id, limit: 100 });
      setBriefHistory(Array.isArray(result) ? result.filter((item): item is ContactBriefRecord => validBrief(item) !== null) : []);
      setShowHistory(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const saveBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const score = Number(briefScore);
    if (!briefNarrative.trim() || !Number.isFinite(score) || score < 0 || score > 1) {
      setError("A brief narrative and a confidence score from 0 to 1 are required.");
      return;
    }
    setBusy("brief-save");
    setError(null);
    try {
      const result = await rpc.call("contacts_briefs_create", {
        contactId: contact.id,
        narrative: briefNarrative.trim(),
        sections: briefRole.trim() ? { currentRole: briefRole.trim() } : {},
        score,
        sourceUrl: briefSourceUrl.trim() || null,
        sessionId: null,
      });
      const nextBrief = validBrief(result);
      if (!nextBrief) throw new Error("The host returned an invalid background brief.");
      setBrief(nextBrief);
      setBriefNarrative("");
      setBriefRole("");
      setBriefSourceUrl("");
      setShowBriefForm(false);
      onChanged?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-5 border-t border-border pt-5" aria-label="Contact evidence">
      <div>
        <h2 className="text-sm font-semibold">Evidence &amp; background brief</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Review proposed facts and immutable, sourced brief versions before they affect the contact projection.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {loading && facts.length === 0 && workHistory.length === 0 && brief === null ? (
        <p className="text-sm text-muted-foreground" role="status">Loading evidence…</p>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-xs font-semibold">Proposed facts</h3>
        {facts.length === 0 ? <p className="text-sm text-muted-foreground">No contact facts recorded.</p> : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {facts.map((fact) => (
              <div key={fact.id} className="space-y-2 px-3 py-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{fact.field}: {fact.value}</p>
                    <p className={`mt-1 font-medium ${statusClass(fact.status)}`}>{fact.status} · confidence {fact.score.toFixed(2)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {fact.status === "PROPOSED" ? (
                      <>
                        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void mutate(`fact-accept-${fact.id}`, "contacts_facts_decide", { id: fact.id, decision: "accept" })}>Accept</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void mutate(`fact-dismiss-${fact.id}`, "contacts_facts_decide", { id: fact.id, decision: "dismiss" })}>Dismiss</Button>
                      </>
                    ) : null}
                    {fact.status === "PROPOSED" || fact.status === "APPLIED" ? <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void mutate(`fact-supersede-${fact.id}`, "contacts_facts_supersede", { id: fact.id })}>Supersede</Button> : null}
                  </div>
                </div>
                {fact.evidence.map((item, index) => <p key={`${fact.id}-evidence-${index}`} className="text-muted-foreground">{item.detail} {sourceLink(item.sourceUrl)}</p>)}
                <p className="text-muted-foreground">Observed {formatDate(fact.observedAt)} · {fact.method}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold">Work history</h3>
        {workHistory.length === 0 ? <p className="text-sm text-muted-foreground">No work history recorded.</p> : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {workHistory.map((role) => (
              <div key={role.id} className="space-y-2 px-3 py-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{role.title ?? "Role"}{role.organizationName ? ` · ${role.organizationName}` : ""}</p>
                    <p className={`mt-1 font-medium ${statusClass(role.status)}`}>{role.status} · confidence {role.score.toFixed(2)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {role.status === "PROPOSED" ? (
                      <>
                        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void mutate(`role-accept-${role.id}`, "contacts_workHistory_decide", { id: role.id, decision: "accept" })}>Accept</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void mutate(`role-dismiss-${role.id}`, "contacts_workHistory_decide", { id: role.id, decision: "dismiss" })}>Dismiss</Button>
                      </>
                    ) : null}
                    {role.status === "PROPOSED" || role.status === "APPLIED" ? <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void mutate(`role-supersede-${role.id}`, "contacts_workHistory_supersede", { id: role.id })}>Supersede</Button> : null}
                  </div>
                </div>
                {role.description ? <p className="text-muted-foreground">{role.description}</p> : null}
                {role.evidence.map((item, index) => <p key={`${role.id}-evidence-${index}`} className="text-muted-foreground">{item.detail} {sourceLink(item.sourceUrl)}</p>)}
                <p className="text-muted-foreground">Observed {formatDate(role.observedAt)} · {role.method}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold">Background brief</h3>
            <p className="mt-1 text-xs text-muted-foreground">Briefs are immutable versions; add a sourced version when research changes.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setShowBriefForm((value) => !value)}>{showBriefForm ? "Close" : "Add brief version"}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void loadHistory()}>{showHistory ? "Hide history" : "View history"}</Button>
          </div>
        </div>
        {brief ? (
          <div className="rounded-lg border border-border px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{brief.version === null ? "Current brief" : `Version ${brief.version}`}</span><span className="text-xs text-muted-foreground">Confidence {brief.score.toFixed(2)} · {formatDate(brief.refreshedAt)}</span></div>
            <p className="mt-2 whitespace-pre-wrap">{brief.narrative}</p>
            {brief.sections.currentRole ? <p className="mt-2 text-xs text-muted-foreground">Current role: {brief.sections.currentRole}</p> : null}
            {sourceLink(brief.sourceUrl) ? <p className="mt-2 text-xs">{sourceLink(brief.sourceUrl)}</p> : null}
          </div>
        ) : <p className="text-sm text-muted-foreground">No background brief yet.</p>}
        {showBriefForm ? (
          <form className="space-y-3 rounded-lg border border-border bg-muted/10 p-3" onSubmit={(event) => void saveBrief(event)}>
            <label className="block space-y-1 text-xs font-medium" htmlFor={`brief-narrative-${contact.id}`}>Brief narrative<textarea id={`brief-narrative-${contact.id}`} className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal" value={briefNarrative} onChange={(event) => setBriefNarrative(event.target.value)} required /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-medium" htmlFor={`brief-role-${contact.id}`}>Current role<Input id={`brief-role-${contact.id}`} value={briefRole} onChange={(event) => setBriefRole(event.target.value)} /></label>
              <label className="space-y-1 text-xs font-medium" htmlFor={`brief-score-${contact.id}`}>Confidence (0–1)<Input id={`brief-score-${contact.id}`} type="number" min="0" max="1" step="0.01" value={briefScore} onChange={(event) => setBriefScore(event.target.value)} required /></label>
              <label className="space-y-1 text-xs font-medium" htmlFor={`brief-source-${contact.id}`}>Source URL<Input id={`brief-source-${contact.id}`} type="url" value={briefSourceUrl} onChange={(event) => setBriefSourceUrl(event.target.value)} /></label>
            </div>
            <Button type="submit" size="sm" disabled={busy !== null}>{busy === "brief-save" ? "Saving…" : "Save brief version"}</Button>
          </form>
        ) : null}
        {showHistory ? (
          <ol className="divide-y divide-border rounded-lg border border-border text-xs">
            {briefHistory.length === 0 ? <li className="px-3 py-3 text-muted-foreground">No prior versions.</li> : briefHistory.map((version) => <li key={version.id} className="px-3 py-3"><span className="font-medium">Version {version.version}</span> · {formatDate(version.createdAt)}<p className="mt-1 whitespace-pre-wrap text-muted-foreground">{version.narrative}</p></li>)}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
