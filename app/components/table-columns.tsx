import * as React from "react";

import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import { cn } from "../../lib/utils.js";

/**
 * The small amount of metadata the record tables need to expose their
 * standard and custom fields as user-configurable columns.
 *
 * `defaultVisible` is useful for custom fields: the field definition decides
 * whether a field is offered on a table, while an existing preference still
 * wins when one has been saved for the workspace.
 */
export interface TableColumnPreference {
  id: string;
  label: React.ReactNode;
  className?: string;
  required?: boolean;
  defaultVisible?: boolean;
}

export interface ColumnPreferenceSnapshot {
  order: string[];
  hidden: string[];
}

export interface PersistentColumnPreferences {
  /** All currently available columns in the user's preferred order. */
  orderedColumns: TableColumnPreference[];
  /** The subset that should be rendered in the table. */
  visibleColumns: TableColumnPreference[];
  hiddenIds: readonly string[];
  toggle: (id: string, visible: boolean) => void;
  move: (id: string, direction: "up" | "down") => void;
  apply: (ids: readonly string[]) => void;
  reset: () => void;
}

const EMPTY_SNAPSHOT: ColumnPreferenceSnapshot = { order: [], hidden: [] };

function availableIds(
  columns: readonly TableColumnPreference[],
): Set<string> {
  return new Set(columns.map((column) => column.id));
}

function defaultHiddenIds(
  columns: readonly TableColumnPreference[],
): string[] {
  return columns
    .filter((column) => column.defaultVisible === false && column.required !== true)
    .map((column) => column.id);
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "" || result.includes(item)) {
      continue;
    }
    result.push(item);
  }
  return result;
}

function readSnapshot(storageKey: string): ColumnPreferenceSnapshot | null {
  if (typeof window === "undefined" || window.localStorage === undefined) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const value = parsed as { order?: unknown; hidden?: unknown };
    return { order: cleanIds(value.order), hidden: cleanIds(value.hidden) };
  } catch {
    // A blocked/invalid browser storage should not make a CRM table unusable.
    return null;
  }
}

function writeSnapshot(storageKey: string, snapshot: ColumnPreferenceSnapshot): void {
  if (typeof window === "undefined" || window.localStorage === undefined) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Preferences are best effort. The current in-memory state remains useful.
  }
}

/**
 * Normalize a stored preference against the columns available right now.
 * Unknown columns are dropped, newly configured columns are appended, and a
 * table can never be left with every column hidden.
 */
export function normalizeColumnPreference(
  columns: readonly TableColumnPreference[],
  stored?: Partial<ColumnPreferenceSnapshot> | null,
): ColumnPreferenceSnapshot {
  const ids = availableIds(columns);
  const order = cleanIds(stored?.order).filter((id) => ids.has(id));
  for (const column of columns) {
    if (!order.includes(column.id)) order.push(column.id);
  }

  const requiredIds = new Set(
    columns.filter((column) => column.required === true).map((column) => column.id),
  );
  const hasStoredPreference = stored?.order !== undefined || stored?.hidden !== undefined;
  const hidden = hasStoredPreference
    ? cleanIds(stored?.hidden).filter((id) => ids.has(id) && !requiredIds.has(id))
    : defaultHiddenIds(columns);

  const visible = order.filter((id) => !hidden.includes(id));
  if (visible.length === 0 && order.length > 0) {
    const fallback = order.find((id) => requiredIds.has(id)) ?? order[0];
    if (fallback !== undefined) {
      return { order, hidden: hidden.filter((id) => id !== fallback) };
    }
  }
  return { order, hidden };
}

function snapshotForColumns(
  storageKey: string,
  columns: readonly TableColumnPreference[],
): ColumnPreferenceSnapshot {
  return normalizeColumnPreference(columns, readSnapshot(storageKey));
}

function optionSignature(columns: readonly TableColumnPreference[]): string {
  return columns
    .map((column) => `${column.id}:${column.defaultVisible === false ? "0" : "1"}`)
    .join("|");
}

/**
 * Persist table column visibility and ordering in the browser preference
 * store. The key is supplied by each record workspace so companies, contacts,
 * and deals keep independent layouts.
 */
export function usePersistentColumnPreferences(
  storageKey: string,
  columns: readonly TableColumnPreference[],
): PersistentColumnPreferences {
  const signature = optionSignature(columns);
  const [snapshot, setSnapshot] = React.useState<ColumnPreferenceSnapshot>(() =>
    snapshotForColumns(storageKey, columns),
  );

  React.useEffect(() => {
    setSnapshot((current) => normalizeColumnPreference(columns, current));
  }, [signature, storageKey]);

  React.useEffect(() => {
    writeSnapshot(storageKey, snapshot);
  }, [snapshot, storageKey]);

  const update = React.useCallback(
    (next: ColumnPreferenceSnapshot) => {
      setSnapshot(normalizeColumnPreference(columns, next));
    },
    [signature],
  );

  const toggle = React.useCallback(
    (id: string, visible: boolean) => {
      const column = columns.find((candidate) => candidate.id === id);
      if (column?.required === true) return;
      const hidden = new Set(snapshot.hidden);
      if (visible) hidden.delete(id);
      else hidden.add(id);
      update({ order: [...snapshot.order], hidden: [...hidden] });
    },
    [columns, snapshot, update],
  );

  const move = React.useCallback(
    (id: string, direction: "up" | "down") => {
      const index = snapshot.order.indexOf(id);
      if (index < 0) return;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= snapshot.order.length) return;
      const order = [...snapshot.order];
      const [moved] = order.splice(index, 1);
      if (moved === undefined) return;
      order.splice(target, 0, moved);
      update({ order, hidden: [...snapshot.hidden] });
    },
    [snapshot, update],
  );

  const reset = React.useCallback(() => {
    update({
      order: columns.map((column) => column.id),
      hidden: defaultHiddenIds(columns),
    });
  }, [columns, update]);

  const apply = React.useCallback(
    (ids: readonly string[]) => {
      const requested = cleanIds(ids);
      const available = new Set(columns.map((column) => column.id));
      const order = requested.filter((id) => available.has(id));
      for (const column of columns) {
        if (!order.includes(column.id)) order.push(column.id);
      }
      const requiredIds = new Set(
        columns.filter((column) => column.required === true).map((column) => column.id),
      );
      const hidden = columns
        .map((column) => column.id)
        .filter((id) => !requested.includes(id) && !requiredIds.has(id));
      update({ order, hidden });
    },
    [columns, signature, update],
  );

  const columnById = new Map(columns.map((column) => [column.id, column]));
  const orderedColumns = snapshot.order
    .map((id) => columnById.get(id))
    .filter((column): column is TableColumnPreference => column !== undefined);
  const hiddenSet = new Set(snapshot.hidden);
  const visibleColumns = orderedColumns.filter((column) => !hiddenSet.has(column.id));

  return {
    orderedColumns,
    visibleColumns,
    hiddenIds: snapshot.hidden,
    toggle,
    move,
    apply,
    reset,
  };
}

function labelText(label: React.ReactNode): string {
  if (typeof label === "string" || typeof label === "number") return String(label);
  return "column";
}

export interface ColumnPreferencesProps {
  preference: PersistentColumnPreferences;
  className?: string;
  /** Label for the trigger, kept explicit for small/compact host surfaces. */
  label?: string;
}

/** Compact visibility/order editor shared by all three CRM record tables. */
export function ColumnPreferences({
  preference,
  className,
  label = "Columns",
}: ColumnPreferencesProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="Columns2" aria-hidden="true" />
        {label}
      </Button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Customize columns"
          className="absolute right-0 z-30 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-3 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
            <div>
              <h2 className="text-sm font-medium">Customize columns</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Choose fields and arrange their order.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close column settings"
              onClick={() => setOpen(false)}
            >
              <Icon name="X" aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto" aria-label="Table columns">
            {preference.orderedColumns.map((column, index) => {
              const text = labelText(column.label);
              const visible = !preference.hiddenIds.includes(column.id);
              return (
                <li
                  key={column.id}
                  className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-state-hover"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Show ${text}`}
                    checked={visible}
                    disabled={column.required === true}
                    onChange={(event) => preference.toggle(column.id, event.target.checked)}
                  />
                  <span className={cn("min-w-0 flex-1 truncate text-sm", !visible && "text-muted-foreground")}>{column.label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Move ${text} up`}
                    disabled={index === 0}
                    onClick={() => preference.move(column.id, "up")}
                  >
                    <Icon name="ChevronUp" aria-hidden="true" className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Move ${text} down`}
                    disabled={index === preference.orderedColumns.length - 1}
                    onClick={() => preference.move(column.id, "down")}
                  >
                    <Icon name="ChevronDown" aria-hidden="true" className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={preference.reset}>
              Reset columns
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const TableColumnPreferences = ColumnPreferences;

export function emptyColumnPreference(): PersistentColumnPreferences {
  return {
    orderedColumns: [],
    visibleColumns: [],
    hiddenIds: [],
    toggle: () => {},
    move: () => {},
    apply: () => {},
    reset: () => {},
  };
}
