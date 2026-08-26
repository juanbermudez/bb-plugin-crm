import * as React from "react";

import { EmptyState } from "./empty-state.js";
import { cn } from "../../lib/utils.js";

export interface TableColumn {
  id?: string;
  label: React.ReactNode;
  className?: string;
}

export type TableColumnDefinition = React.ReactNode | TableColumn;

export interface TableShellProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Accessible caption and region label for the table. */
  caption: string;
  /** Column headings rendered with semantic `scope="col"` headers. */
  columns: readonly TableColumnDefinition[];
  /** Table rows (`tr` elements) supplied by the record view. */
  children?: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  /** Custom zero state; the default is an EmptyState with no extra chrome. */
  empty?: React.ReactNode;
}

function normalizeColumn(column: TableColumnDefinition): TableColumn {
  if (
    typeof column === "object" &&
    column !== null &&
    !React.isValidElement(column) &&
    "label" in column
  ) {
    return column as TableColumn;
  }
  return { label: column };
}

/**
 * Table-first workspace frame. It keeps loading and zero states inside the
 * same semantic table so column context remains available to assistive tech.
 */
export const TableShell = React.forwardRef<HTMLDivElement, TableShellProps>(
  (
    {
      caption,
      columns,
      children,
      loading = false,
      loadingLabel = `Loading ${caption}…`,
      empty,
      className,
      role,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const hasRows =
      children !== undefined &&
      children !== null &&
      children !== false &&
      React.Children.count(children) > 0;
    const state = loading ? "loading" : hasRows ? "ready" : "empty";
    const columnCount = Math.max(columns.length, 1);
    const emptyContent =
      empty === undefined ? (
        <EmptyState
          title={`No ${caption.toLowerCase()} found`}
          className="min-h-36 rounded-none border-0 bg-transparent"
        />
      ) : (
        empty
      );

    return (
      <div
        ref={ref}
        className={cn(
          "overflow-x-auto rounded-lg border border-border",
          className,
        )}
        role={role ?? "region"}
        aria-label={ariaLabel ?? caption}
        aria-busy={loading || undefined}
        data-state={state}
        {...props}
      >
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border-hairline text-xs text-muted-foreground">
              {columns.map((column, index) => {
                const normalized = normalizeColumn(column);
                return (
                  <th
                    key={normalized.id ?? index}
                    scope="col"
                    className={cn("px-3 py-2.5 font-medium", normalized.className)}
                  >
                    {normalized.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-hairline">
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-10 text-center">
                  <div className="space-y-3" role="status" aria-live="polite">
                    <span>{loadingLabel}</span>
                    <div
                      aria-hidden="true"
                      className="mx-auto h-1.5 w-40 animate-pulse rounded-full bg-muted"
                    />
                  </div>
                </td>
              </tr>
            ) : hasRows ? (
              children
            ) : (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  {emptyContent}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  },
);
TableShell.displayName = "TableShell";
