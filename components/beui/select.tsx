"use client";

/**
 * Ejected from the free beUI Select registry component.
 * Source: https://beui.dev/components/motion/select
 * Adapted only to use this extension's existing Icon and cn utilities.
 */
import {
  motion,
  type Transition,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "../ui/icon.js";
import { cn } from "../../lib/utils.js";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const INSTANT_TRANSITION: Transition = { duration: 0 };
const CHEVRON_TRANSITION: Transition = {
  type: "spring",
  duration: 0.4,
  bounce: 0.3,
};
const LIST_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
};
const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: -6, filter: "blur(3px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

type Placement = "bottom" | "top";

interface SelectContextValue {
  value: string | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
  select: (value: string) => void;
  register: (value: string, label: string) => void;
  unregister: (value: string) => void;
  labelFor: (value: string | undefined) => string | undefined;
  reduce: boolean;
  triggerId: string;
  listId: string;
  disabled: boolean;
  placement: Placement;
  setPlacement: (placement: Placement) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext(component: string) {
  const context = useContext(SelectContext);
  if (!context) throw new Error(`${component} must be used within <Select>`);
  return context;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  children,
}: SelectProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [internal, setInternal] = useState(defaultValue);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [placement, setPlacement] = useState<Placement>("bottom");

  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const openControlled = openProp !== undefined;
  const open = openControlled ? openProp : internalOpen;

  const setOpen = useCallback((next: boolean) => {
    if (!openControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange, openControlled]);

  const select = useCallback((next: string) => {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
  }, [controlled, onValueChange, setOpen]);

  const register = useCallback((nextValue: string, label: string) => {
    setLabels((currentLabels) => (
      currentLabels.get(nextValue) === label
        ? currentLabels
        : new Map(currentLabels).set(nextValue, label)
    ));
  }, []);
  const unregister = useCallback((nextValue: string) => {
    setLabels((currentLabels) => {
      if (!currentLabels.has(nextValue)) return currentLabels;
      const next = new Map(currentLabels);
      next.delete(nextValue);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      const list = document.getElementById(`${baseId}-list`);
      if (
        rootRef.current
        && !rootRef.current.contains(target)
        && !list?.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, setOpen]);

  const context = useMemo<SelectContextValue>(() => ({
    value: current,
    open,
    setOpen,
    select,
    register,
    unregister,
    labelFor: (nextValue) => (
      nextValue === undefined ? undefined : labels.get(nextValue)
    ),
    reduce,
    triggerId: `${baseId}-trigger`,
    listId: `${baseId}-list`,
    disabled,
    placement,
    setPlacement,
  }), [
    current,
    open,
    setOpen,
    select,
    register,
    unregister,
    labels,
    reduce,
    baseId,
    disabled,
    placement,
  ]);

  return (
    <SelectContext.Provider value={context}>
      <div ref={rootRef} className={cn("relative", className)}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export interface SelectTriggerProps {
  className?: string;
  children: ReactNode;
  showChevron?: boolean;
  "aria-label"?: string;
}

export function SelectTrigger({
  className,
  children,
  showChevron = true,
  "aria-label": ariaLabel,
}: SelectTriggerProps) {
  const context = useSelectContext("SelectTrigger");
  const isTop = context.placement === "top";
  const radiusKeyframes = context.open ? [0, 0, 12] : [12, 0, 12];
  const radiusTransition: Transition = context.reduce
    ? { duration: 0 }
    : context.open
      ? { duration: 0.6, times: [0, 0.4, 1], ease: EASE_OUT }
      : { duration: 0.42, times: [0, 0.5, 1], ease: EASE_OUT };

  return (
    <motion.button
      type="button"
      id={context.triggerId}
      disabled={context.disabled}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={context.open}
      aria-controls={context.listId}
      onClick={() => context.setOpen(!context.open)}
      initial={false}
      animate={{
        borderTopLeftRadius: isTop ? radiusKeyframes : 12,
        borderTopRightRadius: isTop ? radiusKeyframes : 12,
        borderBottomLeftRadius: isTop ? 12 : radiusKeyframes,
        borderBottomRightRadius: isTop ? 12 : radiusKeyframes,
      }}
      transition={{
        borderTopLeftRadius: isTop ? radiusTransition : INSTANT_TRANSITION,
        borderTopRightRadius: isTop ? radiusTransition : INSTANT_TRANSITION,
        borderBottomLeftRadius: isTop ? INSTANT_TRANSITION : radiusTransition,
        borderBottomRightRadius: isTop ? INSTANT_TRANSITION : radiusTransition,
      }}
      className={cn(
        "relative z-10 flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors",
        "hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
      {showChevron ? (
        <motion.span
          aria-hidden="true"
          animate={{ rotate: context.open ? 180 : 0 }}
          transition={context.reduce ? { duration: 0 } : CHEVRON_TRANSITION}
          className="text-muted-foreground"
        >
          <Icon name="ChevronDown" aria-hidden="true" className="size-4" />
        </motion.span>
      ) : null}
    </motion.button>
  );
}

export interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export function SelectValue({ placeholder, className }: SelectValueProps) {
  const context = useSelectContext("SelectValue");
  const label = context.labelFor(context.value);
  return (
    <span className={cn(
      "truncate",
      label ? "text-foreground" : "text-muted-foreground",
      className,
    )}
    >
      {label ?? placeholder ?? "Select"}
    </span>
  );
}

export interface SelectContentProps {
  className?: string;
  children: ReactNode;
}

export function SelectContent({ className, children }: SelectContentProps) {
  const context = useSelectContext("SelectContent");
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    minWidth: 0,
  });
  const { open, setPlacement } = context;

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });

  useLayoutEffect(() => {
    if (!open) return;

    const positionContent = () => {
      const trigger = document.getElementById(context.triggerId);
      const node = innerRef.current;
      if (!trigger || !node) return;

      const rect = trigger.getBoundingClientRect();
      const contentHeight = node.offsetHeight;
      const contentWidth = Math.max(rect.width, node.scrollWidth);
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const nextPlacement = below < contentHeight + 16 && above > below
        ? "top"
        : "bottom";
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - contentWidth - 8),
      );
      const top = nextPlacement === "top"
        ? Math.max(8, rect.top - contentHeight - 6)
        : Math.min(window.innerHeight - contentHeight - 8, rect.bottom + 6);

      setPlacement(nextPlacement);
      setPosition({ left, top, minWidth: rect.width });
    };

    positionContent();
    const frame = window.requestAnimationFrame(positionContent);
    window.addEventListener("resize", positionContent);
    window.addEventListener("scroll", positionContent, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionContent);
      window.removeEventListener("scroll", positionContent, true);
    };
  }, [open, context.triggerId, setPlacement, height]);

  const isTop = context.placement === "top";
  const nearGap = open ? 6 : 0;
  const nearRadius = open ? 8 : 0;
  const gapTransition: Transition = open
    ? { type: "spring", duration: 0.5, bounce: 0.35, delay: 0.1 }
    : { type: "spring", duration: 0.25, bounce: 0.05 };
  const radiusTransition: Transition = open
    ? { duration: 0.25, ease: EASE_OUT, delay: 0.1 }
    : { duration: 0.14, ease: EASE_OUT };

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      id={context.listId}
      role="listbox"
      aria-labelledby={context.triggerId}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={context.reduce
        ? { opacity: open ? 1 : 0, height: open ? height : 0 }
        : {
            opacity: open ? 1 : 0,
            height: open ? height : 0,
            marginTop: isTop ? 0 : nearGap,
            marginBottom: isTop ? nearGap : 0,
            borderTopLeftRadius: isTop ? 8 : nearRadius,
            borderTopRightRadius: isTop ? 8 : nearRadius,
            borderBottomLeftRadius: isTop ? nearRadius : 8,
            borderBottomRightRadius: isTop ? nearRadius : 8,
          }}
      transition={context.reduce
        ? { duration: 0.12 }
        : {
            opacity: open
              ? { duration: 0.18 }
              : { duration: 0.16, delay: 0.1 },
            height: open
              ? { type: "spring", duration: 0.38, bounce: 0.12 }
              : { duration: 0.22, ease: EASE_OUT, delay: 0.1 },
            marginTop: isTop ? INSTANT_TRANSITION : gapTransition,
            marginBottom: isTop ? gapTransition : INSTANT_TRANSITION,
            borderTopLeftRadius: isTop ? INSTANT_TRANSITION : radiusTransition,
            borderTopRightRadius: isTop ? INSTANT_TRANSITION : radiusTransition,
            borderBottomLeftRadius: isTop ? radiusTransition : INSTANT_TRANSITION,
            borderBottomRightRadius: isTop ? radiusTransition : INSTANT_TRANSITION,
          }}
      style={{
        transformOrigin: isTop ? "bottom" : "top",
        overflow: "hidden",
        pointerEvents: open ? "auto" : "none",
        position: "fixed",
        left: position.left,
        top: position.top,
        minWidth: position.minWidth,
      }}
      className={cn(
        "z-50 rounded-lg border border-border bg-background shadow-lg",
        className,
      )}
    >
      <motion.div
        ref={innerRef}
        variants={context.reduce ? undefined : LIST_VARIANTS}
        initial={false}
        animate={open ? "show" : "hidden"}
        className="max-h-72 overflow-y-auto p-1"
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export interface SelectItemProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function SelectItem({
  value,
  disabled = false,
  className,
  children,
}: SelectItemProps) {
  const context = useSelectContext("SelectItem");
  const selected = context.value === value;
  const label = typeof children === "string" ? children : value;

  useLayoutEffect(() => {
    context.register(value, label);
    return () => context.unregister(value);
  }, [context.register, context.unregister, value, label]);

  return (
    <motion.div variants={context.reduce ? undefined : ITEM_VARIANTS}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        onClick={() => context.select(value)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors",
          selected
            ? "bg-state-active text-foreground"
            : "text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:bg-state-hover",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        <span className="truncate">{children}</span>
        {selected ? (
          <Icon name="Check" aria-hidden="true" className="size-3.5 shrink-0" />
        ) : null}
      </button>
    </motion.div>
  );
}
