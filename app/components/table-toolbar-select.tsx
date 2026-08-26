import type { IconName } from "../../components/ui/icon.js";
import { Icon } from "../../components/ui/icon.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/beui/select.js";
import { cn } from "../../lib/utils.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip.js";

export interface TableToolbarSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface TableToolbarSelectProps {
  label: string;
  value: string;
  options: readonly TableToolbarSelectOption[];
  onValueChange: (value: string) => void;
  icon?: IconName;
  disabled?: boolean;
  iconOnly?: boolean;
  className?: string;
  contentClassName?: string;
}

/** Compact BB-themed adapter around the locally ejected beUI animated Select. */
export function TableToolbarSelect({
  label,
  value,
  options,
  onValueChange,
  icon,
  disabled = false,
  iconOnly = false,
  className,
  contentClassName,
}: TableToolbarSelectProps) {
  const selectedLabel = options.find((option) => option.value === value)?.label;
  const accessibleLabel = iconOnly && selectedLabel
    ? `${label}: ${selectedLabel}`
    : label;
  const trigger = (
    <SelectTrigger
      aria-label={accessibleLabel}
      showChevron={!iconOnly}
      className={cn(
        "h-9 rounded-md px-3 py-0 text-xs",
        iconOnly && "size-9 justify-center border-transparent bg-transparent p-0 text-muted-foreground hover:border-transparent hover:bg-state-hover hover:text-foreground",
      )}
    >
      {iconOnly ? (
        <Icon name={icon ?? "MoreHorizontal"} aria-hidden="true" className="size-4" />
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          {icon === undefined ? null : (
            <Icon
              name={icon}
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
          <SelectValue />
        </span>
      )}
    </SelectTrigger>
  );

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className={cn("shrink-0", className)}
    >
      {iconOnly ? (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{trigger}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {selectedLabel ? `${label}: ${selectedLabel}` : label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : trigger}
      <SelectContent className={cn("w-max", contentClassName)}>
        {options.map((option) => (
          <SelectItem
            key={option.value || "empty"}
            value={option.value}
            disabled={option.disabled}
            className="text-xs"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
