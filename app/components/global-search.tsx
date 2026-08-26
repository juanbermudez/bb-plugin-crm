import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  CompanyListInput,
  CompanyListOutput,
  ContactListInput,
  ContactListOutput,
  DealListInput,
  DealListOutput,
  RecordKind,
} from "../../contracts/core.js";
import { rpcContract } from "../../contracts/rpc.js";
import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import { SearchField } from "./search-field.js";

export type GlobalSearchRpcClient = {
  call(method: "companies_list", input: CompanyListInput): Promise<CompanyListOutput>;
  call(method: "contacts_list", input: ContactListInput): Promise<ContactListOutput>;
  call(method: "deals_list", input: DealListInput): Promise<DealListOutput>;
};

export interface GlobalSearchResult {
  id: string;
  kind: RecordKind;
  label: string;
  description: string;
}

export interface GlobalSearchProps {
  rpcClient?: GlobalSearchRpcClient;
  onOpen: (result: GlobalSearchResult) => void;
  onDismiss?: () => void;
  autoFocus?: boolean;
  resultsAlign?: "left" | "right";
  className?: string;
}

const EMPTY_RESULTS: readonly GlobalSearchResult[] = [];

function listRpc(rpc: GlobalSearchRpcClient): GlobalSearchRpcClient {
  return rpc;
}

function searchInputs(query: string): {
  company: CompanyListInput;
  contact: ContactListInput;
  deal: DealListInput;
} {
  return {
    company: {
      q: query,
      sort: "name",
      dir: "asc",
      page: 1,
      pageSize: 5,
      owner: [],
      industry: [],
      enrichment: [],
      source: [],
      activity: [],
      fields: {},
      archived: false,
    },
    contact: {
      q: query,
      sort: "name",
      dir: "asc",
      page: 1,
      pageSize: 5,
      owner: [],
      company: [],
      source: [],
      title: [],
      seniority: [],
      persona: [],
      activity: [],
      fields: {},
      archived: false,
    },
    deal: {
      q: query,
      sort: "createdAt",
      dir: "desc",
      page: 1,
      pageSize: 5,
      status: "all",
      owner: [],
      stage: [],
      closing: [],
      fields: {},
      archived: false,
    },
  };
}

function resultLabel(kind: RecordKind): string {
  return kind === "company" ? "Company" : kind === "contact" ? "Contact" : "Deal";
}

/**
 * Small global CRM lookup for the BB nav-panel header. It intentionally uses
 * the existing paginated list RPCs, so the header does not introduce a second
 * search/index contract while still opening records in their native drawer.
 */
export function GlobalSearch({
  rpcClient,
  onOpen,
  onDismiss,
  autoFocus = false,
  resultsAlign = "left",
  className,
}: GlobalSearchProps) {
  const contextRpc = useRpc<typeof rpcContract>() as unknown as GlobalSearchRpcClient;
  const rpc = rpcClient ?? contextRpc;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly GlobalSearchResult[]>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openQuickSwitcher = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey
      ) return;
      event.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", openQuickSwitcher);
    return () => window.removeEventListener("keydown", openQuickSwitcher);
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const inputs = searchInputs(normalized);
    void Promise.all([
      listRpc(rpc).call("companies_list", inputs.company),
      listRpc(rpc).call("contacts_list", inputs.contact),
      listRpc(rpc).call("deals_list", inputs.deal),
    ])
      .then(([companies, contacts, deals]) => {
        if (!active) return;
        const next: GlobalSearchResult[] = [
          ...companies.rows.map((company) => ({
            id: company.id,
            kind: "company" as const,
            label: company.name,
            description: company.domain ?? "Company",
          })),
          ...contacts.rows.map((contact) => ({
            id: contact.id,
            kind: "contact" as const,
            label: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
            description: contact.company?.name ?? contact.email ?? "Contact",
          })),
          ...deals.rows.map((deal) => ({
            id: deal.id,
            kind: "deal" as const,
            label: deal.name,
            description: deal.company?.name ?? "Deal",
          })),
        ];
        setResults(next);
        setActiveIndex(0);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, rpc]);

  const openResult = (result: GlobalSearchResult) => {
    onOpen(result);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      onDismiss?.();
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      const result = results[activeIndex];
      if (result) {
        event.preventDefault();
        openResult(result);
      }
    }
  };

  return (
    <div className={`relative min-w-0 ${className ?? ""}`}>
      <SearchField
        ref={inputRef}
        autoFocus={autoFocus}
        label="Search CRM"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onClear={() => {
          setQuery("");
          setOpen(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search CRM…"
        className="h-8 w-full bg-background text-xs"
      />
      {open && query.trim() ? (
        <div
          className={`absolute top-full z-40 mt-2 overflow-hidden rounded-lg border border-border bg-background shadow-lg sm:w-[min(28rem,calc(100vw-2rem))] ${resultsAlign === "right" ? "right-0" : "left-0"}`}
          role="listbox"
          aria-label="CRM search results"
        >
          {loading ? (
            <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
              Searching CRM…
            </p>
          ) : error !== null ? (
            <p className="px-3 py-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
              No CRM records found.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1">
              {results.map((result, index) => (
                <li key={`${result.kind}:${result.id}`} role="option" aria-selected={activeIndex === index}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={`h-auto w-full justify-start px-3 py-2 text-left ${activeIndex === index ? "bg-state-hover" : ""}`}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => openResult(result)}
                  >
                    <Icon
                      name={result.kind === "company" ? "Layers" : result.kind === "contact" ? "UserRound" : "Target"}
                      aria-hidden="true"
                      className="mt-0.5 self-start text-muted-foreground"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{result.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {resultLabel(result.kind)} · {result.description}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
