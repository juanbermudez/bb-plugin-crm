import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover.js";
import type { FieldDefinition, SortDirection } from "../../../contracts/core.js";
import { cn } from "../../../lib/utils.js";
import { TooltipIconButton } from "../../components/tooltip-icon-button.js";

export interface ListSortOption {
  value: string;
  label: string;
}

export interface ListFacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface ListFacet {
  id: string;
  label: string;
  options: readonly ListFacetOption[];
}

export type ListFilters = Record<string, string[]>;

export const ACTIVITY_FACET_OPTIONS: readonly ListFacetOption[] = [
  { value: "7", label: "Active within 7 days" },
  { value: "30", label: "Active within 30 days" },
  { value: "90", label: "Active within 90 days" },
];

const SELECT_CLASS =
  "flex h-9 min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const CHECKBOX_CLASS =
  "size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function cloneFilters(filters: ListFilters): ListFilters {
  return Object.fromEntries(
    Object.entries(filters).map(([key, values]) => [key, [...values]]),
  );
}

function toggleValue(
  filters: ListFilters,
  facetId: string,
  value: string,
  checked: boolean,
): ListFilters {
  const selected = filters[facetId] ?? [];
  const next = checked
    ? selected.includes(value)
      ? selected
      : [...selected, value]
    : selected.filter((candidate) => candidate !== value);
  const result = cloneFilters(filters);
  if (next.length === 0) delete result[facetId];
  else result[facetId] = next;
  return result;
}

function facetLabel(facet: ListFacet | undefined, value: string): string {
  return facet?.options.find((option) => option.value === value)?.label ?? value;
}

function facetName(facet: ListFacet | undefined, id: string): string {
  return facet?.label ?? id;
}

export interface ListControlsProps {
  entityLabel: string;
  sort: string;
  dir: SortDirection;
  sortOptions: readonly ListSortOption[];
  filters: ListFilters;
  facets: readonly ListFacet[];
  onSortChange: (sort: string) => void;
  onDirChange: (dir: SortDirection) => void;
  onFiltersChange: (filters: ListFilters) => void;
  className?: string;
  /** Use one label-free command cluster for table toolbars. */
  compact?: boolean;
  /** Places filtering and table-organization controls in their semantic toolbar groups. */
  compactMode?: "all" | "filters" | "sort";
}

/**
 * Quiet, keyboard-friendly list controls shared by the CRM record tables.
 * BB popovers, native selects, and checkboxes keep the control compact and
 * keyboard-friendly inside the host shell.
 */
export function ListControls({
  entityLabel,
  sort,
  dir,
  sortOptions,
  filters,
  facets,
  onSortChange,
  onDirChange,
  onFiltersChange,
  className,
  compact = false,
  compactMode = "all",
}: ListControlsProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const filtersId = useId();
  const activeFilters = Object.entries(filters).flatMap(([id, values]) =>
    values.map((value) => ({ id, value })),
  );
  const availableFacets = facets.filter(
    (facet) =>
      facet.options.length > 0 || (filters[facet.id]?.length ?? 0) > 0,
  );
  const facetById = new Map(facets.map((facet) => [facet.id, facet]));
  const facetOptions = (facet: ListFacet): ListFacetOption[] => {
    const selected = filters[facet.id] ?? [];
    return [
      ...facet.options,
      ...selected
        .filter((value) => !facet.options.some((option) => option.value === value))
        .map((value) => ({ value, label: value })),
    ];
  };
  const normalizedFilterQuery = filterQuery.trim().toLocaleLowerCase();
  const visibleFacets = availableFacets
    .map((facet) => ({
      facet,
      options: facetOptions(facet).filter(
        (option) =>
          normalizedFilterQuery === "" ||
          option.label.toLocaleLowerCase().includes(normalizedFilterQuery) ||
          facet.label.toLocaleLowerCase().includes(normalizedFilterQuery),
      ),
    }))
    .filter(({ options }) => options.length > 0);
  const searchable = availableFacets.reduce(
    (count, facet) => count + facetOptions(facet).length,
    0,
  ) >= 8;

  const handleFacetChange = (
    event: ChangeEvent<HTMLInputElement>,
    facetId: string,
    value: string,
  ) => {
    onFiltersChange(toggleValue(filters, facetId, value, event.target.checked));
  };

  if (compact) {
    const showFilters = compactMode !== "sort";
    const showSort = compactMode !== "filters";
    return (
      <div className={cn("flex shrink-0 items-center gap-1", className)}>
        {showFilters && facets.length > 0 ? (
          <Popover
            open={filtersOpen}
            onOpenChange={(open) => {
              setFiltersOpen(open);
              if (!open) setFilterQuery("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={activeFilters.length > 0 ? "secondary" : "outline"}
                size="sm"
                className="h-9"
                disabled={availableFacets.length === 0}
              >
                <Icon name="SlidersHorizontal" aria-hidden="true" />
                Filter
                {activeFilters.length > 0 ? (
                  <span className="rounded-full bg-background/70 px-1.5 tabular-nums text-foreground">
                    {activeFilters.length}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              id={filtersId}
              align="start"
              sideOffset={6}
              mobileTitle={`${entityLabel} filters`}
              className="w-[min(32rem,calc(100vw-2rem))] p-0"
              aria-label={`${entityLabel} filters`}
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-3">
                <div>
                  <p className="text-sm font-medium">Filter {entityLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Narrow the table without leaving the current view.
                  </p>
                </div>
                {activeFilters.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onFiltersChange({})}>
                    Clear all
                  </Button>
                ) : null}
              </div>
              {searchable ? (
                <div className="relative border-b border-border p-3">
                  <Icon
                    name="Search"
                    aria-hidden="true"
                    className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={filterQuery}
                    onChange={(event) => setFilterQuery(event.target.value)}
                    aria-label="Search filters"
                    placeholder="Search filter options…"
                    className="pl-9"
                  />
                </div>
              ) : null}
              <div className="max-h-[26rem] overflow-y-auto p-2">
                {visibleFacets.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No filter options match your search.
                  </p>
                ) : visibleFacets.map(({ facet, options }) => {
                  const selected = filters[facet.id] ?? [];
                  return (
                    <fieldset key={facet.id} className="border-b border-border px-1 py-3 last:border-b-0">
                      <legend className="px-2 text-xs font-medium text-muted-foreground">
                        {facet.label}
                      </legend>
                      <div className="mt-1 grid gap-0.5 sm:grid-cols-2">
                        {options.map((option) => (
                          <label
                            key={option.value}
                            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-state-hover"
                          >
                            <input
                              type="checkbox"
                              className={CHECKBOX_CLASS}
                              aria-label={option.label}
                              checked={selected.includes(option.value)}
                              onChange={(event) => handleFacetChange(event, facet.id, option.value)}
                            />
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            {option.count === undefined ? null : (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {option.count}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        {showSort ? <div className="relative">
          <Icon
            name="Sort"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label className="sr-only" htmlFor={`${filtersId}-sort`}>Sort {entityLabel}</label>
          <select
            id={`${filtersId}-sort`}
            className={cn(SELECT_CLASS, "w-36 pl-9")}
            aria-label={`Sort ${entityLabel}`}
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
          >
            {sortOptions.map((option) => (
              <option key={option.value || "default"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div> : null}
        {showSort ? <TooltipIconButton
          label={dir === "desc" ? "Sort descending" : "Sort ascending"}
          icon={dir === "desc" ? "ArrowDown" : "ArrowUp"}
          variant="ghost"
          className="size-9 text-muted-foreground"
          onClick={() => onDirChange(dir === "desc" ? "asc" : "desc")}
        /> : null}
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-36 flex-1 space-y-1 sm:flex-none">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`${filtersId}-sort`}
          >
            Sort by
          </label>
          <select
            id={`${filtersId}-sort`}
            className={cn(SELECT_CLASS, "w-full sm:w-44")}
            aria-label={`Sort ${entityLabel}`}
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
          >
            {sortOptions.map((option) => (
              <option key={option.value || "default"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-36 flex-1 space-y-1 sm:flex-none">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`${filtersId}-direction`}
          >
            Direction
          </label>
          <select
            id={`${filtersId}-direction`}
            className={cn(SELECT_CLASS, "w-full sm:w-36")}
            aria-label="Sort direction"
            value={dir}
            onChange={(event) =>
              onDirChange(event.target.value === "desc" ? "desc" : "asc")
            }
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        {availableFacets.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Icon name="SlidersHorizontal" aria-hidden="true" />
            Filters
            {activeFilters.length > 0 ? (
              <span className="tabular-nums text-muted-foreground">
                ({activeFilters.length})
              </span>
            ) : null}
          </Button>
        ) : null}
      </div>

      {filtersOpen && availableFacets.length > 0 ? (
        <div
          id={filtersId}
          className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3"
          role="group"
          aria-label={`${entityLabel} filters`}
        >
          {availableFacets.map((facet) => {
            const selected = filters[facet.id] ?? [];
            const options: ListFacetOption[] = [
              ...facet.options,
              ...selected
                .filter(
                  (value) => !facet.options.some((option) => option.value === value),
                )
                .map((value) => ({ value, label: value })),
            ];
            return (
              <fieldset key={facet.id} className="min-w-0 space-y-1">
                <legend className="text-xs font-medium text-muted-foreground">
                  {facet.label}
                </legend>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {options.map((option) => (
                    <label
                      key={option.value}
                      className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sm hover:bg-state-hover"
                    >
                      <input
                        type="checkbox"
                        className={CHECKBOX_CLASS}
                        aria-label={option.label}
                        checked={selected.includes(option.value)}
                        onChange={(event) =>
                          handleFacetChange(event, facet.id, option.value)
                        }
                      />
                      <span className="min-w-0 truncate">{option.label}</span>
                      {option.count === undefined ? null : (
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                          {option.count}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      ) : null}

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Selected filters">
          {activeFilters.map(({ id, value }) => {
            const facet = facetById.get(id);
            const label = facetLabel(facet, value);
            return (
              <button
                key={`${id}:${value}`}
                type="button"
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 text-xs transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Remove ${facetName(facet, id)} filter ${label}`}
                onClick={() =>
                  onFiltersChange(toggleValue(filters, id, value, false))
                }
              >
                <span className="truncate">
                  {facetName(facet, id)}: {label}
                </span>
                <Icon name="X" aria-hidden="true" className="size-3" />
              </button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onFiltersChange({})}
          >
            Clear all filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface SelectAllCheckboxProps {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** A native checkbox with the mixed state wired for assistive technology. */
export function SelectAllCheckbox({
  label,
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
}: SelectAllCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={CHECKBOX_CLASS}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      aria-checked={indeterminate ? "mixed" : checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function facetOptionsFromCounts(
  facetCounts: Record<string, Record<string, number>> | undefined,
  facetId: string,
  selected: readonly string[] = [],
  labelForValue: (value: string) => string = (value) => value,
): ListFacetOption[] {
  const counts = facetCounts?.[facetId] ?? {};
  const values = new Set([...Object.keys(counts), ...selected]);
  return [...values]
    .sort((left, right) => labelForValue(left).localeCompare(labelForValue(right)))
    .map((value) => ({
      value,
      label: labelForValue(value),
      count: counts[value],
    }));
}

export function activityFacetOptions(
  facetCounts: Record<string, Record<string, number>> | undefined,
  selected: readonly string[] = [],
): ListFacetOption[] {
  const counts = facetCounts?.activity ?? {};
  const values = new Set(
    ACTIVITY_FACET_OPTIONS
      .filter((option) => (counts[option.value] ?? 0) > 0)
      .map((option) => option.value),
  );
  for (const value of selected) values.add(value);
  return [...values].map((value) => ({
    value,
    label: ACTIVITY_FACET_OPTIONS.find((option) => option.value === value)?.label ?? value,
    count: counts[value],
  }));
}

/** Turns `fields_filters` definitions into facets while retaining saved values. */
export function customFieldFacets(
  definitions: readonly FieldDefinition[],
  facetCounts: Record<string, Record<string, number>> | undefined,
  selected: ListFilters,
): ListFacet[] {
  return definitions
    .filter((definition) => !definition.archived && definition.showOnFilter)
    .map((definition) => {
      const optionsByValue = new Map<string, ListFacetOption>();
      for (const option of definition.options ?? []) {
        if (option.archived || option.archivedAt) continue;
        optionsByValue.set(option.id, { value: option.id, label: option.label });
      }
      const counts = facetCounts?.[`field:${definition.key}`] ?? {};
      for (const value of Object.keys(counts)) {
        const existing = optionsByValue.get(value);
        optionsByValue.set(value, {
          value,
          label: existing?.label ?? value,
          count: counts[value],
        });
      }
      for (const value of selected[definition.key] ?? []) {
        if (!optionsByValue.has(value)) {
          optionsByValue.set(value, { value, label: value });
        }
      }
      return {
        id: definition.key,
        label: definition.label,
        options: [...optionsByValue.values()].sort((left, right) =>
          left.label.localeCompare(right.label),
        ),
      };
    })
    .filter(
      (facet) =>
        facet.options.length > 0 || (selected[facet.id]?.length ?? 0) > 0,
    );
}
