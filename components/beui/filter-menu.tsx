"use client";

/**
 * Ejected and adapted from the free beUI Combobox interaction pattern.
 * Source: https://beui.dev/components/motion/combobox
 *
 * The source combobox is single-select. CRM facets are grouped multi-select,
 * so this keeps its searchable vertical list, active/selected motion, and
 * compact surface while using BB's responsive Popover and theme primitives.
 */
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { Button } from "../ui/button.js";
import { Icon } from "../ui/icon.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover.js";

export interface FilterMenuOption {
  value: string;
  label: string;
  count?: number;
  selected: boolean;
}

export interface FilterMenuGroup {
  id: string;
  label: string;
  options: readonly FilterMenuOption[];
}

export interface FilterMenuProps {
  label: string;
  groups: readonly FilterMenuGroup[];
  activeCount: number;
  onCheckedChange: (groupId: string, value: string, checked: boolean) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function FilterMenu({
  label,
  groups,
  activeCount,
  onCheckedChange,
  onClear,
  disabled = false,
}: FilterMenuProps) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = useMemo(() => groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => (
        normalizedQuery === ""
        || option.label.toLocaleLowerCase().includes(normalizedQuery)
        || group.label.toLocaleLowerCase().includes(normalizedQuery)
      )),
    }))
    .filter((group) => group.options.length > 0), [groups, normalizedQuery]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          disabled={disabled}
        >
          <Icon name="SlidersHorizontal" aria-hidden="true" />
          Filter
          {activeCount > 0 ? (
            <span className="rounded-full bg-background/70 px-1.5 tabular-nums text-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        mobileTitle={`${label} filters`}
        className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden p-0"
        aria-label={`${label} filters`}
      >
        <div className="flex h-11 items-center gap-2 border-b border-border px-3">
          <Icon name="Search" aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            role="searchbox"
            aria-label="Search filters"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search filter options…"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {activeCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={onClear}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto overscroll-contain p-1.5" role="group">
          {visibleGroups.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">
              No filter options found.
            </p>
          ) : visibleGroups.map((group, groupIndex) => (
            <fieldset
              key={group.id}
              className={groupIndex === 0 ? "border-0 p-0 pb-1" : "border-0 border-t border-border p-0 pb-1 pt-1"}
            >
              <legend className="w-full px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                {group.label}
              </legend>
              <div className="grid grid-cols-1 gap-0.5">
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="checkbox"
                    aria-checked={option.selected}
                    onClick={() => onCheckedChange(group.id, option.value, !option.selected)}
                    className="group relative flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-state-hover hover:text-foreground focus-visible:bg-state-hover focus-visible:text-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-4 shrink-0 place-items-center rounded border border-input bg-background text-foreground"
                    >
                      <motion.span
                        initial={false}
                        animate={{
                          opacity: option.selected ? 1 : 0,
                          scale: option.selected ? 1 : 0.72,
                        }}
                        transition={reduce ? { duration: 0 } : { duration: 0.14 }}
                      >
                        <Icon name="Check" aria-hidden="true" className="size-3" />
                      </motion.span>
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.count === undefined ? null : (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {option.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
