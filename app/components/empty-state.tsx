import * as React from "react";

import { Icon, type IconName } from "../../components/ui/icon.js";
import { cn } from "../../lib/utils.js";

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: IconName;
}

/** Quiet zero state for a CRM list, detail section, or related-record panel. */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      title = "Nothing here yet",
      description,
      action,
      icon,
      className,
      role,
      "aria-live": ariaLive,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center",
        className,
      )}
      role={role ?? "status"}
      aria-live={ariaLive ?? "polite"}
      {...props}
    >
      {icon === undefined ? null : (
        <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon name={icon} aria-hidden="true" className="size-4" />
        </span>
      )}
      <h2 className="text-sm font-medium">{title}</h2>
      {description === undefined ? null : (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action === undefined ? null : (
        <div className="mt-2 flex items-center justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";
