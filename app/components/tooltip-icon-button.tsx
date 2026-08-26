import * as React from "react";

import { Button, type ButtonProps } from "../../components/ui/button.js";
import { Icon, type IconName } from "../../components/ui/icon.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip.js";
import { cn } from "../../lib/utils.js";

export interface TooltipIconButtonProps
  extends Omit<ButtonProps, "children" | "aria-label" | "size" | "title"> {
  label: string;
  icon: IconName;
  iconClassName?: string;
}

/** BB-styled icon button with an accessible top tooltip. */
export const TooltipIconButton = React.forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(function TooltipIconButton(
  {
    label,
    icon,
    className,
    iconClassName,
    variant = "outline",
    ...props
  },
  ref,
) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant={variant}
            size="icon"
            className={cn("size-9", className)}
            aria-label={label}
            {...props}
          >
            <Icon name={icon} aria-hidden="true" className={iconClassName} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
TooltipIconButton.displayName = "TooltipIconButton";
