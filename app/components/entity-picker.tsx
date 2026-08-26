import { useEffect, useId, useMemo, useState } from "react";

import type { Company, CompanyListInput } from "../../contracts/core.js";
import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import { Input } from "../../components/ui/input.js";
import { cn } from "../../lib/utils.js";

/** A selectable CRM reference. Values always come from persisted CRM data. */
export interface EntityOption {
  value: string;
  label: string;
  description?: string;
}

export interface EntityPickerProps {
  label: string;
  value: string | null | undefined;
  options: readonly EntityOption[];
  onChange: (value: string | null) => void;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  /** Optional server-backed search hook for selectors with large datasets. */
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  className?: string;
  id?: string;
}

/**
 * Compact, keyboard-friendly searchable picker used by CRM relationship and
 * assignment forms. It intentionally has no free-form fallback: a selected
 * value must be an existing CRM reference (or the explicit unassigned value).
 */
export function EntityPicker({
  label,
  value,
  options,
  onChange,
  optional = false,
  required = false,
  disabled = false,
  placeholder = "Choose a record",
  emptyMessage = "No matching CRM records.",
  onQueryChange,
  loading = false,
  className,
  id: providedId,
}: EntityPickerProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = providedId ?? `crm-entity-picker-${generatedId}`;
  const listboxId = `${id}-options`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? (value ? value : "");
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      [option.label, option.value, option.description]
        .filter(Boolean)
        .some((candidate) => candidate!.toLocaleLowerCase().includes(normalized)),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [open, selectedLabel]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions, open, value]);

  const select = (next: string | null) => {
    onChange(next);
    setQuery(next === null ? "" : options.find((option) => option.value === next)?.label ?? next);
    setOpen(false);
  };

  return (
    <div className={cn("grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-start", className)}>
      <label htmlFor={id} className="pt-2 text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
        {optional ? <span className="ml-1 font-normal">(optional)</span> : null}
      </label>
      <div className="relative min-w-0">
        <div className="relative">
          <Input
            id={id}
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={
              open && filteredOptions[activeIndex]
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            aria-autocomplete="list"
            required={required && !value}
            disabled={disabled}
            value={open ? query : selectedLabel}
            placeholder={value ? undefined : placeholder}
            onFocus={() => {
              // Opening a selected picker should expose every valid choice;
              // typing immediately narrows the list again.
              setQuery("");
              setOpen(true);
            }}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setOpen(true);
              onQueryChange?.(nextQuery);
              // Typing an existing identifier remains a valid shortcut while
              // preventing arbitrary/unverified user or record IDs.
              const exact = options.find((option) => option.value === nextQuery.trim());
              if (exact) onChange(exact.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setQuery(selectedLabel);
                setOpen(false);
                return;
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!open) setOpen(true);
                if (filteredOptions.length > 0) {
                  setActiveIndex((current) =>
                    event.key === "ArrowDown"
                      ? (current + 1) % filteredOptions.length
                      : (current - 1 + filteredOptions.length) % filteredOptions.length,
                  );
                }
                return;
              }
              if (event.key === "Home" && open && filteredOptions.length > 0) {
                event.preventDefault();
                setActiveIndex(0);
                return;
              }
              if (event.key === "End" && open && filteredOptions.length > 0) {
                event.preventDefault();
                setActiveIndex(filteredOptions.length - 1);
                return;
              }
              if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
                event.preventDefault();
                select(filteredOptions[activeIndex].value);
              }
            }}
            onBlur={() => {
              // Let an option click run before dismissing the listbox.
              window.setTimeout(() => setOpen(false), 0);
            }}
            className="pr-9"
          />
          <Icon
            name={open ? "ChevronUp" : "ChevronDown"}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        {open ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={`${label} options`}
            className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-lg"
          >
            {optional ? (
              <Button
                type="button"
                role="option"
                aria-selected={value == null}
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-start px-3 py-2 text-left"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(null)}
              >
                <Icon name="CircleX" aria-hidden="true" className="text-muted-foreground" />
                <span>
                  <span className="block text-sm font-medium">Unassigned</span>
                  <span className="block text-xs text-muted-foreground">Clear this assignment</span>
                </span>
              </Button>
            ) : null}
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground" role="status">
                {loading
                  ? "Searching CRM records…"
                  : options.length === 0
                    ? "No CRM choices are available yet."
                    : emptyMessage}
              </p>
            ) : (
              filteredOptions.map((option, index) => (
                <Button
                  key={option.value}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-start px-3 py-2 text-left"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(option.value)}
                >
                  <Icon name="Check" aria-hidden="true" className={option.value === value ? "text-foreground" : "text-transparent"} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
                    ) : null}
                  </span>
                </Button>
              ))
            )}
          </div>
        ) : null}
        {options.length === 0 && optional ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Only records already present in this CRM workspace can be selected.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface OwnerOptionSource {
  ownerId?: string | null;
  owner?: { id: string; name: string; email?: string | null } | null;
}

/** Stable owner used for work assigned to the person running this BB installation. */
export const LOCAL_OWNER_ID = "local_user";

/** Build owner choices from the installation owner and IDs already returned by CRM data. */
export function ownerOptionsFromRecords(
  records: readonly OwnerOptionSource[],
): EntityOption[] {
  const seen = new Set<string>([LOCAL_OWNER_ID]);
  const result: EntityOption[] = [{
    value: LOCAL_OWNER_ID,
    label: "You",
    description: "This BB installation",
  }];
  for (const record of records) {
    const ownerId = record.owner?.id ?? record.ownerId ?? null;
    if (!ownerId || seen.has(ownerId)) continue;
    seen.add(ownerId);
    result.push({
      value: ownerId,
      label: record.owner?.name?.trim() || ownerId,
      description: record.owner?.email ?? "Known CRM owner ID",
    });
  }
  return result;
}

export function companyOptionsFromRows(
  rows: readonly Pick<Company, "id" | "name" | "domain">[],
): EntityOption[] {
  return rows.map((company) => ({
    value: company.id,
    label: company.name,
    description: company.domain ?? company.id,
  }));
}

export const COMPANY_PICKER_INPUT: CompanyListInput = {
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
