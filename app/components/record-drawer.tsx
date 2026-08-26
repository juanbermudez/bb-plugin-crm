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
import { useIsCompactViewport } from "../../components/ui/hooks/use-compact-viewport.js";
import { cn } from "../../lib/utils.js";

export interface RecordDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional stable opener for controlled drawers. This is useful when the
   * visible trigger is temporarily unmounted while a routed drawer is open
   * (for example, a header menu item), so focus can still return to the
   * persistent trigger after close.
   */
  returnFocusRef?: { readonly current: HTMLElement | null };
  title: React.ReactNode;
  description?: React.ReactNode;
  media?: React.ReactNode;
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
  returnFocusRef,
  title,
  description,
  media,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  footerClassName,
}: RecordDrawerProps) {
  const isCompactViewport = useIsCompactViewport();
  const wasOpenRef = React.useRef(false);
  const capturedReturnFocusRef = React.useRef<HTMLElement | null>(null);

  // Controlled dialogs do not have a Radix trigger to restore focus to.
  // Capture the actual opener before the portal/drawer moves focus, then
  // restore it after either the desktop dialog or compact drawer closes.
  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    capturedReturnFocusRef.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
  }
  React.useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open) return;
    const target = returnFocusRef?.current ?? capturedReturnFocusRef.current;
    queueMicrotask(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }, [open, returnFocusRef]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? capturedReturnFocusRef.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
        style={
          isCompactViewport
            ? undefined
            : {
                top: 0,
                right: 0,
                bottom: 0,
                left: "auto",
                height: "100dvh",
                maxHeight: "100dvh",
                width: "min(56rem, calc(100vw - 1.5rem))",
                translate: "0 0",
                overflow: "hidden",
              }
        }
        className={cn(
          "w-full max-w-none gap-0 p-0",
          !isCompactViewport &&
            "rounded-xl rounded-r-none border-l border-t-0 border-r-0 border-b-0",
          className,
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DialogHeader className="relative shrink-0 border-b border-border px-5 py-4 pr-14">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {media === undefined ? null : (
                  <div className="shrink-0">{media}</div>
                )}
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
            className="absolute right-4 top-4 z-10 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
