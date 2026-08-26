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
  className,
  contentClassName,
}: TableToolbarSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className={cn("shrink-0", className)}
    >
      <SelectTrigger
        aria-label={label}
        className="h-9 rounded-md px-3 py-0 text-xs"
      >
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
      </SelectTrigger>
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
