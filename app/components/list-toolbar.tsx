import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils.js";

export interface ListToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Compact controls rendered before the table. */
  children: ReactNode;
  /** Quiet table metadata pinned to the trailing edge on wide layouts. */
  summary?: ReactNode;
}

/** One restrained command row for CRM record tables. */
export function ListToolbar({ children, summary, className, ...props }: ListToolbarProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5", className)}
      role="toolbar"
      {...props}
    >
      {children}
      {summary === undefined ? null : (
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {summary}
        </div>
      )}
    </div>
  );
}
