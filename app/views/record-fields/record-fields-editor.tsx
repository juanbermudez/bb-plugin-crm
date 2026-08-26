import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "../../../components/ui/button.js";
import { Card, CardContent } from "../../../components/ui/card.js";
import { Input } from "../../../components/ui/input.js";
import {
  type FieldDefinition,
  type FieldEntity,
  type FieldOption,
  type FieldValue,
  type FieldValueDto,
  type Id,
} from "../../../contracts/core.js";
import { cn } from "../../../lib/utils.js";
import {
  useRecordFieldsRpc,
  type RecordFieldsRpcClient,
} from "./rpc.js";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_CLASS =
  "flex min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** The editor keeps number input as text until it passes client validation. */
export type FieldDraft = string | boolean | null;

export interface RecordFieldsEditorProps {
  /** The record type whose active custom fields should be shown. */
  entity: FieldEntity;
  /** The CRM record id whose values are read and written. */
  recordId: Id;
  /** Optional injection keeps previews and tests independent of the BB host. */
  rpcClient?: RecordFieldsRpcClient;
  /** Allows the editor to be embedded in a record drawer or another card. */
  className?: string;
  /** Heading shown above the field list. */
  title?: string;
  /** Supporting copy shown below the heading. */
  description?: string;
  /** Called after a field value is successfully created, updated, or cleared. */
  onSaved?: (field: FieldDefinition, value: FieldValueDto | null) => void;
}

export interface ValidationResult {
  value: FieldValue | null;
  error: string | null;
}

interface FieldControlProps {
  definition: FieldDefinition;
  id: string;
  value: FieldDraft;
  disabled: boolean;
  describedBy?: string;
  invalid: boolean;
  onChange: (value: FieldDraft) => void;
}

const FIELD_TYPE_LABELS: Record<FieldDefinition["type"], string> = {
  TEXT: "Text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  CHECKBOX: "Checkbox",
  DATE: "Date",
  URL: "URL",
  EMAIL: "Email",
  PHONE: "Phone",
  SELECT: "Select",
  USER: "User",
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function fieldInputId(prefix: string, fieldId: string): string {
  return `${prefix}-${fieldId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function activeOptions(definition: FieldDefinition): FieldOption[] {
  return definition.options.filter(
    (option) => option.archived !== true && option.archivedAt == null,
  );
}

function blankDraft(definition: FieldDefinition): FieldDraft {
  return definition.type === "CHECKBOX" ? null : "";
}

function dateInputValue(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1] ?? value;
}

function draftFromValue(
  definition: FieldDefinition,
  value: FieldValue | undefined,
): FieldDraft {
  if (value === null || value === undefined) return blankDraft(definition);
  if (definition.type === "CHECKBOX") {
    return typeof value === "boolean" ? value : value === "true";
  }
  if (definition.type === "NUMBER") {
    return typeof value === "number" ? String(value) : String(value);
  }
  if (definition.type === "DATE") {
    return typeof value === "string" ? dateInputValue(value) : String(value);
  }
  return String(value);
}

function validCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateDate(label: string, value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validCalendarDate(value)) {
    return `${label} must be a valid date.`;
  }
  return null;
}

/**
 * Convert a control draft into the scalar accepted by the field-value RPC.
 * This helper is exported so host surfaces can apply the same validation in a
 * preview or in a focused unit test without mounting React.
 */
export function validateRecordFieldDraft(
  definition: FieldDefinition,
  draft: FieldDraft,
): ValidationResult {
  const label = definition.label;

  if (definition.type === "CHECKBOX") {
    if (draft === null) {
      return definition.required
        ? { value: null, error: `${label} is required.` }
        : { value: null, error: null };
    }
    if (typeof draft !== "boolean") {
      return { value: null, error: `${label} must be checked or unchecked.` };
    }
    return { value: draft, error: null };
  }

  const raw = typeof draft === "string" ? draft.trim() : "";
  if (!raw) {
    return definition.required
      ? { value: null, error: `${label} is required.` }
      : { value: null, error: null };
  }

  switch (definition.type) {
    case "NUMBER": {
      const parsed = Number(raw);
      return Number.isFinite(parsed)
        ? { value: parsed, error: null }
        : { value: null, error: `${label} must be a number.` };
    }
    case "DATE": {
      const error = validateDate(label, raw);
      return error === null
        ? { value: raw, error: null }
        : { value: null, error };
    }
    case "URL": {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { value: null, error: `${label} must be an http(s) URL.` };
        }
      } catch {
        return { value: null, error: `${label} must be a valid URL.` };
      }
      return { value: raw, error: null };
    }
    case "EMAIL":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
        ? { value: raw, error: null }
        : { value: null, error: `${label} must be a valid email address.` };
    case "PHONE":
      return /^(?=.*\d)[+()0-9./\-\s xX]{3,}$/.test(raw)
        ? { value: raw, error: null }
        : { value: null, error: `${label} must be a valid phone number.` };
    case "SELECT": {
      const option = activeOptions(definition).find(
        (candidate) => candidate.id === raw,
      );
      return option
        ? { value: option.id, error: null }
        : { value: null, error: `${label} must use an active option.` };
    }
    case "TEXT":
    case "LONG_TEXT":
    case "USER":
      return { value: raw, error: null };
    default:
      return { value: raw, error: null };
  }
}

function draftEqual(left: FieldDraft | undefined, right: FieldDraft | undefined): boolean {
  return Object.is(left, right);
}

function canonicalDraft(
  definition: FieldDefinition,
  value: FieldValue | null,
): FieldDraft {
  return draftFromValue(definition, value);
}

function formatCurrentValue(
  definition: FieldDefinition,
  draft: FieldDraft,
): string {
  if (draft === null || draft === "") return "Not set";
  if (definition.type === "CHECKBOX") return draft === true ? "Yes" : "No";
  if (definition.type === "SELECT" && typeof draft === "string") {
    const option = definition.options.find((candidate) => candidate.id === draft);
    if (option) {
      const archived = option.archived === true || option.archivedAt != null;
      return archived ? `${option.label} (archived)` : option.label;
    }
    return `${draft} (archived)`;
  }
  return String(draft);
}

function FieldControl({
  definition,
  id,
  value,
  disabled,
  describedBy,
  invalid,
  onChange,
}: FieldControlProps) {
  const common = {
    id,
    disabled,
    required: definition.required,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
  } as const;

  switch (definition.type) {
    case "LONG_TEXT":
      return (
        <textarea
          {...common}
          className={TEXTAREA_CLASS}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "NUMBER":
      return (
        <Input
          {...common}
          type="number"
          inputMode="decimal"
          step="any"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "DATE":
      return (
        <Input
          {...common}
          type="date"
          value={typeof value === "string" ? dateInputValue(value) : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "URL":
      return (
        <Input
          {...common}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://example.com"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "EMAIL":
      return (
        <Input
          {...common}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@example.com"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "PHONE":
      return (
        <Input
          {...common}
          type="tel"
          inputMode="tel"
          placeholder="+1 555 0100"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "SELECT": {
      const options = activeOptions(definition);
      const selectedValue = typeof value === "string" ? value : "";
      const selectedOption = definition.options.find(
        (option) => option.id === selectedValue,
      );
      const selectedOptionIsArchived =
        selectedValue !== "" &&
        (selectedOption === undefined ||
          selectedOption.archived === true ||
          selectedOption.archivedAt != null);
      return (
        <select
          {...common}
          className={SELECT_CLASS}
          value={selectedValue}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select an option…</option>
          {selectedOptionIsArchived ? (
            <option value={selectedValue} disabled>
              {selectedOption?.label ?? selectedValue} (archived)
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
          {options.length === 0 ? (
            <option value="" disabled>
              No active options
            </option>
          ) : null}
        </select>
      );
    }
    case "CHECKBOX":
      return (
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input
            {...common}
            type="checkbox"
            className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{value === true ? "Checked" : "Unchecked"}</span>
        </label>
      );
    case "USER":
      return (
        <Input
          {...common}
          type="text"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="BB user ID or email"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "TEXT":
    default:
      return (
        <Input
          {...common}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

function sortDefinitions(definitions: readonly FieldDefinition[]): FieldDefinition[] {
  return [...definitions]
    .filter((definition) => definition.archived !== true && definition.archivedAt == null)
    .filter((definition) => definition.showOnSheet)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

function definitionsById(
  definitions: readonly FieldDefinition[],
): Record<string, FieldDefinition> {
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
}

function valuesByFieldId(
  values: readonly FieldValueDto[],
  definitions: readonly FieldDefinition[],
): Record<string, FieldValueDto> {
  const allowed = definitionsById(definitions);
  return Object.fromEntries(
    values
      .filter((value) => allowed[value.fieldId] !== undefined)
      .map((value) => [value.fieldId, value]),
  );
}

function initialDrafts(
  definitions: readonly FieldDefinition[],
  values: readonly FieldValueDto[],
): Record<string, FieldDraft> {
  const byField = new Map(values.map((value) => [value.fieldId, value]));
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      draftFromValue(definition, byField.get(definition.id)?.value),
    ]),
  );
}

/**
 * A reusable, drawer-friendly editor for the active custom fields of one
 * company, contact, or deal. Values are saved explicitly per field, and the
 * form action provides an accessible save-all affordance for keyboard users.
 */
export function RecordFieldsEditor({
  entity,
  recordId,
  rpcClient,
  className,
  title = "Custom fields",
  description = "Edit the fields shown on this record.",
  onSaved,
}: RecordFieldsEditorProps) {
  const hostRpc = useRecordFieldsRpc();
  const rpc = rpcClient ?? hostRpc;
  const rpcRef = useRef<RecordFieldsRpcClient>(rpc);
  rpcRef.current = rpc;

  const idPrefix = useId().replace(/:/g, "");
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<FieldDefinition[] | null>(null);
  const [valueRows, setValueRows] = useState<Record<string, FieldValueDto>>({});
  const [draftValues, setDraftValues] = useState<Record<string, FieldDraft>>({});
  const [initialValues, setInitialValues] = useState<Record<string, FieldDraft>>({});
  const [dirtyFieldIds, setDirtyFieldIds] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDefinitions(null);
    setValueRows({});
    setDraftValues({});
    setInitialValues({});
    setDirtyFieldIds(new Set());
    setFieldErrors({});
    setSaveMessage(null);

    Promise.all([
      rpcRef.current.call("fields_list", {
        entity,
        includeArchived: false,
      }),
      rpcRef.current.call("fields_values_list", {
        entity,
        recordId,
        includeArchived: false,
      }),
    ])
      .then(([fieldResult, valueResult]) => {
        if (cancelled) return;
        const visibleDefinitions = sortDefinitions(fieldResult);
        setDefinitions(visibleDefinitions);
        setValueRows(valuesByFieldId(valueResult, visibleDefinitions));
        const nextDrafts = initialDrafts(visibleDefinitions, valueResult);
        setDraftValues(nextDrafts);
        setInitialValues(nextDrafts);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoadError(errorMessage(cause));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entity, recordId, reloadToken]);

  function updateDraft(definition: FieldDefinition, value: FieldDraft): void {
    setDraftValues((current) => ({ ...current, [definition.id]: value }));
    setDirtyFieldIds((current) => {
      const next = new Set(current);
      if (draftEqual(value, initialValues[definition.id])) next.delete(definition.id);
      else next.add(definition.id);
      return next;
    });
    setFieldErrors((current) => {
      if (current[definition.id] === undefined) return current;
      const next = { ...current };
      delete next[definition.id];
      return next;
    });
    setSaveMessage(null);
  }

  async function saveField(definition: FieldDefinition): Promise<boolean> {
    if (!dirtyFieldIds.has(definition.id)) return true;
    const draft = draftValues[definition.id] ?? blankDraft(definition);
    const result = validateRecordFieldDraft(definition, draft);
    if (result.error !== null) {
      setFieldErrors((current) => ({ ...current, [definition.id]: result.error! }));
      return false;
    }

    setSavingFieldId(definition.id);
    setFieldErrors((current) => {
      if (current[definition.id] === undefined) return current;
      const next = { ...current };
      delete next[definition.id];
      return next;
    });
    try {
      const currentValue = valueRows[definition.id];
      if (result.value === null) {
        if (currentValue !== undefined) {
          await rpcRef.current.call("fields_values_delete", {
            id: currentValue.id,
            entity,
            recordId,
            fieldId: definition.id,
          });
          setValueRows((current) => {
            const next = { ...current };
            delete next[definition.id];
            return next;
          });
        }
        const nextDraft = canonicalDraft(definition, null);
        setDraftValues((current) => ({ ...current, [definition.id]: nextDraft }));
        setInitialValues((current) => ({ ...current, [definition.id]: nextDraft }));
        setDirtyFieldIds((current) => {
          const next = new Set(current);
          next.delete(definition.id);
          return next;
        });
        onSaved?.(definition, null);
      } else {
        const saved = currentValue
          ? await rpcRef.current.call("fields_values_update", {
              id: currentValue.id,
              entity,
              recordId,
              fieldId: definition.id,
              value: result.value,
            })
          : await rpcRef.current.call("fields_values_create", {
              entity,
              recordId,
              fieldId: definition.id,
              value: result.value,
            });
        const nextDraft = canonicalDraft(definition, saved.value);
        setValueRows((current) => ({ ...current, [definition.id]: saved }));
        setDraftValues((current) => ({ ...current, [definition.id]: nextDraft }));
        setInitialValues((current) => ({ ...current, [definition.id]: nextDraft }));
        setDirtyFieldIds((current) => {
          const next = new Set(current);
          next.delete(definition.id);
          return next;
        });
        onSaved?.(definition, saved);
      }
      setSaveMessage(`${definition.label} saved.`);
      return true;
    } catch (cause: unknown) {
      setFieldErrors((current) => ({ ...current, [definition.id]: errorMessage(cause) }));
      setSaveMessage(null);
      return false;
    } finally {
      setSavingFieldId(null);
    }
  }

  async function saveAll(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (definitions === null) return;
    setSaveMessage(null);

    const nextErrors: Record<string, string> = {};
    for (const definition of definitions) {
      const draft = draftValues[definition.id] ?? blankDraft(definition);
      const result = validateRecordFieldDraft(definition, draft);
      if (result.error !== null) nextErrors[definition.id] = result.error;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const dirtyDefinitions = definitions.filter((definition) =>
      dirtyFieldIds.has(definition.id),
    );
    if (dirtyDefinitions.length === 0) {
      setSaveMessage("No changes to save.");
      return;
    }

    setSavingAll(true);
    let allSaved = true;
    try {
      for (const definition of dirtyDefinitions) {
        const saved = await saveField(definition);
        if (!saved) allSaved = false;
      }
      if (allSaved) setSaveMessage("All fields saved.");
      else setSaveMessage("Some fields could not be saved.");
    } finally {
      setSavingAll(false);
    }
  }

  const busy = savingAll || savingFieldId !== null;

  return (
    <section className={cn("space-y-4", className)} aria-labelledby={`${idPrefix}-title`}>
      <header className="space-y-1">
        <h2 id={`${idPrefix}-title`} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      {loading ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              Loading custom fields…
            </p>
          </CardContent>
        </Card>
      ) : loadError !== null ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive" role="alert">
              Could not load custom fields: {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadToken((current) => current + 1)}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : definitions !== null && definitions.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground" role="status">
              No custom fields are configured to show on this record.
            </p>
          </CardContent>
        </Card>
      ) : definitions !== null ? (
        <form className="space-y-4" noValidate onSubmit={saveAll}>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border" aria-label="Custom fields">
                {definitions.map((definition) => {
                  const inputId = fieldInputId(idPrefix, definition.id);
                  const hintId = `${inputId}-hint`;
                  const errorId = `${inputId}-error`;
                  const fieldError = fieldErrors[definition.id];
                  const describedBy = fieldError ? `${hintId} ${errorId}` : hintId;
                  const draft = draftValues[definition.id] ?? blankDraft(definition);
                  const dirty = dirtyFieldIds.has(definition.id);
                  const canClear =
                    !definition.required &&
                    !draftEqual(draft, blankDraft(definition));
                  return (
                    <li key={definition.id} className="space-y-3 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <label htmlFor={inputId} className="text-sm font-medium">
                              {definition.label}
                            </label>
                            <span className="text-[11px] text-muted-foreground">
                              {FIELD_TYPE_LABELS[definition.type]}
                            </span>
                            {definition.required ? (
                              <span className="text-[11px] font-medium text-destructive">
                                Required
                              </span>
                            ) : null}
                            <span
                              className="text-[11px] text-muted-foreground"
                              aria-label={`Agent-filled: ${definition.agentFilled ? "yes" : "no"}`}
                            >
                              {definition.agentFilled ? "Agent-filled" : "Manual"}
                            </span>
                          </div>
                          <p id={hintId} className="text-xs text-muted-foreground">
                            Current value: {formatCurrentValue(definition, draft)}
                            {definition.agentBrief
                              ? ` · Agent guidance: ${definition.agentBrief}`
                              : null}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground" aria-label="Field key">
                          {definition.key}
                        </span>
                      </div>
                      <FieldControl
                        definition={definition}
                        id={inputId}
                        value={draft}
                        disabled={busy}
                        describedBy={describedBy}
                        invalid={fieldError !== undefined}
                        onChange={(value) => updateDraft(definition, value)}
                      />
                      {fieldError ? (
                        <p id={errorId} className="text-sm text-destructive" role="alert">
                          {fieldError}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-h-5">
                          {savingFieldId === definition.id ? (
                            <p className="text-xs text-muted-foreground" role="status">
                              Saving…
                            </p>
                          ) : dirty ? (
                            <p className="text-xs text-muted-foreground">Unsaved changes</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {canClear ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => updateDraft(definition, blankDraft(definition))}
                            >
                              Clear {definition.label}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || !dirty}
                            onClick={() => void saveField(definition)}
                          >
                            Save {definition.label}
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-5">
              {saveMessage ? (
                <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  {saveMessage}
                </p>
              ) : null}
            </div>
            <Button type="submit" disabled={busy}>
              {savingAll ? "Saving fields…" : "Save all fields"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

/** Short aliases make the component convenient to consume from record views. */
export const RecordCustomFieldsEditor = RecordFieldsEditor;
export const RecordFields = RecordFieldsEditor;
export const RecordFieldsView = RecordFieldsEditor;

export default RecordFieldsEditor;
