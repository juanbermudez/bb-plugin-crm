import * as React from "react";

import { Button } from "../../components/ui/button.js";
import { Icon } from "../../components/ui/icon.js";
import { Input } from "../../components/ui/input.js";
import { cn } from "../../lib/utils.js";

export interface SearchFieldProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Input>, "type"> {
  /** A visually hidden label used when no explicit aria-label is supplied. */
  label?: React.ReactNode;
  /** Optional clear affordance for controlled search inputs. */
  onClear?: () => void;
  /** Classes applied to the field wrapper rather than the input itself. */
  containerClassName?: string;
}

/**
 * Search input with the BB icon and control sizing conventions. It keeps the
 * label in the DOM for screen readers while leaving the compact toolbar quiet.
 */
export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  (
    {
      label,
      onClear,
      containerClassName,
      className,
      id,
      value,
      defaultValue,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? `crm-search-${generatedId}`;
    const clearableValue = value ?? defaultValue;
    const hasValue =
      clearableValue !== undefined && String(clearableValue).length > 0;

    return (
      <div
        className={cn("relative min-w-0", containerClassName)}
        data-component="search-field"
      >
        {label === undefined ? null : (
          <label className="sr-only" htmlFor={inputId}>
            {label}
          </label>
        )}
        <Icon
          name="Search"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={ref}
          id={inputId}
          type="search"
          value={value}
          defaultValue={defaultValue}
          aria-label={ariaLabel ?? (label === undefined ? "Search" : undefined)}
          className={cn("pl-9", onClear !== undefined && "pr-10", className)}
          {...props}
        />
        {onClear !== undefined && hasValue ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear search"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
            onClick={onClear}
          >
            <Icon name="X" aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </div>
    );
  },
);
SearchField.displayName = "SearchField";
