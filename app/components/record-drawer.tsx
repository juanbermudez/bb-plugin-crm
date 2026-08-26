import * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.js";
import { Icon } from "../../components/ui/icon.js";
import { cn } from "../../lib/utils.js";

export interface RecordDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

/**
 * Wide record surface for companies, contacts, and deals.
 *
 * The local BB Dialog is the vendored Radix-backed primitive: it renders a
 * right-side wide panel on desktop and delegates to BB's persistent bottom
 * drawer on compact viewports, including focus containment and escape/drag
 * close behavior.
 */
export function RecordDrawer({
  open,
  onOpenChange,
  title,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  footerClassName,
}: RecordDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-full max-w-none gap-0 p-0 sm:inset-y-0 sm:right-0 sm:bottom-0 sm:left-auto sm:top-0 sm:h-full sm:max-h-none sm:w-[min(56rem,calc(100vw-1.5rem))] sm:translate-x-0 sm:translate-y-0 sm:overflow-hidden sm:rounded-xl sm:rounded-r-none sm:border-l sm:border-t-0 sm:border-r-0 sm:border-b-0 sm:p-0",
          className,
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DialogHeader className="relative shrink-0 border-b border-border px-5 py-4 pr-14">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg">
                  {title}
                </DialogTitle>
                <DialogDescription
                  className={cn(
                    "mt-1 line-clamp-2",
                    description === undefined && "sr-only",
                  )}
                >
                  {description ?? "Record details"}
                </DialogDescription>
              </div>
              {actions === undefined ? null : (
                <div className="flex shrink-0 items-center gap-1">
                  {actions}
                </div>
              )}
            </div>
          </DialogHeader>
          <DialogClose
            type="button"
            aria-label="Close record drawer"
            className="absolute right-4 top-4 z-10 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:hidden"
          >
            <Icon name="X" aria-hidden="true" className="size-4" />
          </DialogClose>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-5 py-4",
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer === undefined ? null : (
            <DialogFooter
              className={cn(
                "shrink-0 border-t border-border px-5 py-3",
                footerClassName,
              )}
            >
              {footer}
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
