import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { cn } from "../../lib/utils.js";

const CONTROL_CLASS =
  "h-9 w-full justify-start border border-transparent px-2 font-normal hover:border-input hover:bg-muted/40";
const TEXTAREA_CLASS =
  "min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm transition-colors hover:border-input hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type InlineInputType = "text" | "url" | "email" | "tel" | "number";

export interface InlineFieldProps {
  label: string;
  value: string | null;
  onSave: (next: string) => void;
  saving?: boolean;
  placeholder?: string;
  type?: InlineInputType;
  render?: (value: string) => ReactNode;
  className?: string;
}

export interface InlineTextAreaProps {
  label: string;
  value: string | null;
  onSave: (next: string) => void;
  saving?: boolean;
  placeholder?: string;
  className?: string;
}

export interface InlineDateFieldProps {
  label: string;
  value: string | null;
  onSave: (next: string) => void;
  saving?: boolean;
  placeholder?: string;
  className?: string;
}

export interface InlineSelectFieldProps {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onSave: (next: string) => void;
  saving?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * A compact drawer property that switches from a BB-tokenized value button
 * to an input on activation. Blur and Enter save the trimmed value; Escape
 * restores the value that was loaded from the record.
 */
export function InlineField({
  label,
  value,
  onSave,
  saving = false,
  placeholder = "Not set",
  type = "text",
  render,
  className,
}: InlineFieldProps) {
  const id = useId().replace(/:/g, "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editing && !saving) setDraft(value ?? "");
  }, [editing, saving, value]);

  const startEditing = () => {
    if (saving) return;
    setDraft(value ?? "");
    editingRef.current = true;
    setEditing(true);
  };

  const cancel = () => {
    editingRef.current = false;
    setDraft(value ?? "");
    setEditing(false);
  };

  const commit = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? "")) onSave(next);
  };

  const shown = saving ? draft.trim() : value ?? "";

  return (
    <div className={cn("grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-center", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {editing ? (
        <Input
          id={id}
          type={type}
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <Button
          id={id}
          type="button"
          variant="ghost"
          size="sm"
          className={CONTROL_CLASS}
          aria-label={label}
          disabled={saving}
          onClick={startEditing}
        >
          {shown ? (
            <span className="min-w-0 truncate">
              {render ? render(shown) : shown}
            </span>
          ) : (
            <span className="min-w-0 truncate text-muted-foreground">
              {placeholder}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}

/** A multiline variant used for descriptions and other prose properties. */
export function InlineTextArea({
  label,
  value,
  onSave,
  saving = false,
  placeholder = "Not set",
  className,
}: InlineTextAreaProps) {
  const id = useId().replace(/:/g, "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editing && !saving) setDraft(value ?? "");
  }, [editing, saving, value]);

  const commit = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? "")) onSave(next);
  };

  const cancel = () => {
    editingRef.current = false;
    setDraft(value ?? "");
    setEditing(false);
  };

  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {editing ? (
        <textarea
          id={id}
          autoFocus
          rows={3}
          className={TEXTAREA_CLASS}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <Button
          id={id}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(CONTROL_CLASS, "h-auto min-h-16 items-start whitespace-pre-wrap py-2 text-left leading-5")}
          aria-label={label}
          disabled={saving}
          onClick={() => {
            setDraft(value ?? "");
            editingRef.current = true;
            setEditing(true);
          }}
        >
          {value?.trim() ? (
            <span className="min-w-0 whitespace-pre-wrap">{value}</span>
          ) : (
            <span className="min-w-0 text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      )}
    </div>
  );
}

/** A native date control keeps keyboard and screen-reader interaction direct. */
export function InlineDateField({
  label,
  value,
  onSave,
  saving = false,
  placeholder = "Not set",
  className,
}: InlineDateFieldProps) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={cn("grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-center", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        aria-label={label}
        type="date"
        value={value?.slice(0, 10) ?? ""}
        placeholder={placeholder}
        disabled={saving}
        onChange={(event) => onSave(event.target.value)}
      />
    </div>
  );
}

/** A native select gives the drawer a typed, keyboard-friendly option editor. */
export function InlineSelectField({
  label,
  value,
  options,
  onSave,
  saving = false,
  placeholder = "Not set",
  className,
}: InlineSelectFieldProps) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={cn("grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:items-center", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        aria-label={label}
        className={SELECT_CLASS}
        value={value}
        disabled={saving}
        onChange={(event) => onSave(event.target.value)}
      >
        {options.length === 0 ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
