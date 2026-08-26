import * as React from "react";

import { cn } from "../../lib/utils.js";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** The primary heading for the current CRM workspace. */
  title: React.ReactNode;
  /** Supporting copy kept visually quiet below the heading. */
  description?: React.ReactNode;
  /** Controls for the page, such as create, export, or view actions. */
  actions?: React.ReactNode;
}

/**
 * Dense, responsive page heading shared by the companies, contacts, and deals
 * workspaces. The action slot wraps below the title on narrow panels so table
 * controls remain usable without making the page header taller than needed.
 */
export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ title, description, actions, className, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        "flex shrink-0 flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description === undefined ? null : (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions === undefined ? null : (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2"
          data-page-header-actions=""
        >
          {actions}
        </div>
      )}
    </header>
  ),
);
PageHeader.displayName = "PageHeader";
