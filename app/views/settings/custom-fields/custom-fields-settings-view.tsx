import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "../../../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card.js";
import { Icon } from "../../../../components/ui/icon.js";
import { Input } from "../../../../components/ui/input.js";
import type {
  FieldDefinition,
  FieldDefinitionCreateInput,
  FieldDefinitionUpdateData,
  FieldEntity,
  FieldOption,
  FieldType,
  FieldCoverageOutput,
} from "../../../../contracts/core.js";
import {
  EmptyState,
  PageHeader,
  RecordDrawer,
  TableShell,
} from "../../../components/index.js";
import { cn } from "../../../../lib/utils.js";
import {
  useCustomFieldsRpc,
  type CustomFieldsRpcClient,
} from "./rpc.js";

const SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_CLASS =
  "flex min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const CHECKBOX_CLASS =
  "size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const ENTITY_TABS: readonly {
  value: FieldEntity;
  label: string;
  description: string;
}[] = [
  {
    value: "COMPANY",
    label: "Companies",
    description: "Organizations and accounts",
  },
  {
    value: "CONTACT",
    label: "Contacts",
    description: "People and stakeholders",
  },
  {
    value: "DEAL",
    label: "Deals",
    description: "Pipeline opportunities",
  },
];

const FIELD_TYPE_OPTIONS: readonly { value: FieldType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "SELECT", label: "Select" },
  { value: "URL", label: "URL" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "USER", label: "User" },
];

const FIELD_TYPE_LABELS: Record<FieldType, string> = Object.fromEntries(
  FIELD_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<FieldType, string>;

const FIELD_COLUMNS = [
  { id: "field", label: "Field", className: "min-w-56" },
  { id: "type", label: "Type", className: "min-w-28" },
  { id: "placement", label: "Placement", className: "min-w-40" },
  { id: "agent", label: "Agent", className: "min-w-28" },
  { id: "coverage", label: "Coverage", className: "min-w-40" },
  { id: "actions", label: "Actions", className: "min-w-64" },
] as const;

type OptionDraft = {
  id?: string;
  label: string;
  archived?: boolean;
};

interface FieldFormValue {
  entity: FieldEntity;
  label: string;
  type: FieldType;
  agentFilled: boolean;
  agentBrief: string;
  required: boolean;
  showOnSheet: boolean;
  showOnTable: boolean;
  showOnFilter: boolean;
  options: OptionDraft[];
}

type OptionMutation = "archive" | "restore" | "delete";
type FieldMutation = "archive" | "restore" | "delete";
type CoverageState = FieldCoverageOutput | null;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function entityLabel(entity: FieldEntity): string {
  return ENTITY_TABS.find((tab) => tab.value === entity)?.label ?? entity;
}

function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_LABELS[type] ?? type;
}

function defaultFieldForm(entity: FieldEntity): FieldFormValue {
  return {
    entity,
    label: "",
    type: "TEXT",
    agentFilled: true,
    agentBrief: "",
    required: false,
    showOnSheet: true,
    showOnTable: false,
    showOnFilter: false,
    options: [],
  };
}

function fieldToForm(field: FieldDefinition): FieldFormValue {
  return {
    entity: field.entity,
    label: field.label,
    type: field.type,
    agentFilled: field.agentFilled,
    agentBrief: field.agentBrief ?? "",
    required: field.required,
    showOnSheet: field.showOnSheet,
    showOnTable: field.showOnTable,
    showOnFilter: field.showOnFilter,
    options: field.options.map((option) => ({
      id: option.id,
      label: option.label,
      archived: option.archived === true,
    })),
  };
}

function fieldOptionToDraft(option: FieldOption): OptionDraft {
  return {
    id: option.id,
    label: option.label,
    archived: option.archived === true,
  };
}

function coverageText(coverage: CoverageState): string {
  if (coverage === null) return "Unavailable";
  const total = Math.max(0, coverage.total);
  const filled = Math.min(Math.max(0, coverage.filled), total);
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  return `${filled} of ${total} (${percent}%)`;
}

function coveragePercent(coverage: CoverageState): number {
  if (coverage === null || coverage.total <= 0) return 0;
  return Math.min(100, Math.max(0, (coverage.filled / coverage.total) * 100));
}

function confirmationMessage(
  mutation: FieldMutation,
  field: FieldDefinition,
): string {
  if (mutation === "archive") {
    return `Archive the “${field.label}” field? It will be hidden from record forms and tables.`;
  }
  if (mutation === "restore") {
    return `Restore the “${field.label}” field? It will be available on ${entityLabel(field.entity).toLowerCase()} records again.`;
  }
  return `Delete the “${field.label}” field permanently? Its values and definition cannot be recovered.`;
}

function optionConfirmationMessage(
  mutation: OptionMutation,
  option: OptionDraft,
): string {
  if (mutation === "archive") {
    return `Archive the “${option.label}” option? Existing values will remain readable.`;
  }
  if (mutation === "restore") {
    return `Restore the “${option.label}” option?`;
  }
  return `Delete the “${option.label}” option permanently? Existing values may no longer resolve to a label.`;
}

function confirmInBrowser(message: string): boolean {
  return typeof window === "undefined" || window.confirm(message);
}

function optionsForInput(
  options: readonly OptionDraft[],
  type: FieldType,
): FieldDefinitionCreateInput["options"] {
  if (type !== "SELECT") return [];
  return options
    .filter((option) => option.archived !== true)
    .map((option, index) => ({
      ...(option.id === undefined ? {} : { id: option.id }),
      label: option.label.trim(),
      position: index,
    }));
}

interface FieldDefinitionFormProps {
  formId: string;
  value: FieldFormValue;
  fieldKey?: string;
  editing: boolean;
  saving: boolean;
  optionsLoading: boolean;
  optionBusyId: string | null;
  coverage: CoverageState;
  backfillBusy: boolean;
  error: string | null;
  optionError: string | null;
  onChange: (next: FieldFormValue) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  onOptionMutation: (option: OptionDraft, mutation: OptionMutation) => void;
  onFillRest: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function FieldDefinitionForm({
  formId,
  value,
  fieldKey,
  editing,
  saving,
  optionsLoading,
  optionBusyId,
  coverage,
  backfillBusy,
  error,
  optionError,
  onChange,
  onAddOption,
  onRemoveOption,
  onOptionMutation,
  onFillRest,
  onSubmit,
}: FieldDefinitionFormProps) {
  const update = <Key extends keyof FieldFormValue>(
    key: Key,
    next: FieldFormValue[Key],
  ) => onChange({ ...value, [key]: next });

  return (
    <form id={formId} className="space-y-6" onSubmit={onSubmit}>
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Field keys are generated from the label and stay stable when the label
        changes. Use the visibility flags to control where the field appears.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-label`}>
            Field label
          </label>
          <Input
            id={`${formId}-label`}
            required
            autoFocus
            maxLength={120}
            value={value.label}
            onChange={(event) => update("label", event.target.value)}
            placeholder="Customer tier"
          />
          {fieldKey === undefined ? null : (
            <p className="text-xs text-muted-foreground">
              Key: <code className="rounded bg-muted px-1 py-0.5">{fieldKey}</code>
            </p>
          )}
        </div>

        {!editing ? (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${formId}-entity`}>
              Record type
            </label>
            <select
              id={`${formId}-entity`}
              className={SELECT_CLASS}
              value={value.entity}
              onChange={(event) =>
                update("entity", event.target.value as FieldEntity)
              }
            >
              {ENTITY_TABS.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-sm font-medium">Record type</span>
            <p className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
              {entityLabel(value.entity)}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${formId}-type`}>
            Field type
          </label>
          <select
            id={`${formId}-type`}
            className={SELECT_CLASS}
            value={value.type}
            onChange={(event) =>
              update("type", event.target.value as FieldType)
            }
          >
            {FIELD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-medium">Field behavior</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              className={CHECKBOX_CLASS}
              type="checkbox"
              aria-label="Agent-filled"
              checked={value.agentFilled}
              onChange={(event) => update("agentFilled", event.target.checked)}
            />
            <span>
              <span className="font-medium">Agent-filled</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Allow CRM agents to populate this field.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              className={CHECKBOX_CLASS}
              type="checkbox"
              aria-label="Required"
              checked={value.required}
              onChange={(event) => update("required", event.target.checked)}
            />
            <span>
              <span className="font-medium">Required</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Records cannot leave this value blank.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              className={CHECKBOX_CLASS}
              type="checkbox"
              aria-label="Show on sheet"
              checked={value.showOnSheet}
              onChange={(event) => update("showOnSheet", event.target.checked)}
            />
            <span>
              <span className="font-medium">Show on sheet</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Include it in the record detail view.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              className={CHECKBOX_CLASS}
              type="checkbox"
              aria-label="Show in table"
              checked={value.showOnTable}
              onChange={(event) => update("showOnTable", event.target.checked)}
            />
            <span>
              <span className="font-medium">Show in table</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Add it to the default list columns.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              className={CHECKBOX_CLASS}
              type="checkbox"
              aria-label="Show in filters"
              checked={value.showOnFilter}
              onChange={(event) => update("showOnFilter", event.target.checked)}
            />
            <span>
              <span className="font-medium">Show in filters</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Make this field available as a list facet when its type supports
                filtering.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${formId}-brief`}>
          Agent brief / instructions
          <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={`${formId}-brief`}
          className={TEXTAREA_CLASS}
          maxLength={2000}
          value={value.agentBrief}
          onChange={(event) => update("agentBrief", event.target.value)}
          placeholder="Explain what an agent should look for and how to format the value."
        />
        <p className="text-xs text-muted-foreground">
          Give agents enough context to fill the field consistently.
        </p>
      </div>

      {editing && value.agentFilled && coverage !== null ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Fill missing values</p>
            <p className="mt-1 max-w-prose text-xs text-muted-foreground">
              Queue the configured live research agent for records without a
              value. It will use confirmed evidence and leave the field blank
              when no reliable value is available.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Current coverage: {coverageText(coverage)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              saving ||
              backfillBusy ||
              coverage.filled >= coverage.total
            }
            onClick={onFillRest}
          >
            <Icon name="Idea" aria-hidden="true" />
            {backfillBusy ? "Queuing…" : "Fill the rest"}
          </Button>
        </div>
      ) : null}

      {value.type === "SELECT" ? (
        <fieldset className="space-y-3 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium">Select options</legend>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mt-1 text-xs text-muted-foreground">
                Active options are shown to record editors. Archived options are
                kept for historical values.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddOption}
              disabled={saving}
            >
              <Icon name="Plus" aria-hidden="true" />
              Add option
            </Button>
          </div>
          {optionsLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading all options…
            </p>
          ) : null}
          <div className="space-y-2">
            {value.options.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Add at least one option before saving a select field.
              </p>
            ) : (
              value.options.map((option, index) => {
                const isArchived = option.archived === true;
                const optionLabel = option.label.trim() || `Option ${index + 1}`;
                return (
                  <div
                    key={option.id ?? `new-option-${index}`}
                    className={cn(
                      "flex items-center gap-2",
                      isArchived && "opacity-70",
                    )}
                  >
                    <label className="sr-only" htmlFor={`${formId}-option-${index}`}>
                      Option {index + 1}
                    </label>
                    <Input
                      id={`${formId}-option-${index}`}
                      aria-label={`Option ${index + 1}`}
                      value={option.label}
                      readOnly={isArchived}
                      disabled={saving || optionsLoading || isArchived}
                      onChange={(event) => {
                        const options = [...value.options];
                        options[index] = { ...option, label: event.target.value };
                        onChange({ ...value, options });
                      }}
                      placeholder={`Option ${index + 1}`}
                    />
                    {isArchived ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                        Archived
                      </span>
                    ) : null}
                    {option.id !== undefined ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={
                            saving ||
                            optionsLoading ||
                            optionBusyId === option.id
                          }
                          aria-label={`${isArchived ? "Restore" : "Archive"} option ${optionLabel}`}
                          onClick={() =>
                            onOptionMutation(option, isArchived ? "restore" : "archive")
                          }
                        >
                          <Icon
                            name={isArchived ? "ArchiveRestore" : "Archive"}
                            aria-hidden="true"
                          />
                          {isArchived ? "Restore" : "Archive"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={
                            saving ||
                            optionsLoading ||
                            optionBusyId === option.id
                          }
                          aria-label={`Delete option ${optionLabel}`}
                          onClick={() => onOptionMutation(option, "delete")}
                        >
                          <Icon name="Trash2" aria-hidden="true" />
                          Delete
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        aria-label={`Remove option ${optionLabel}`}
                        onClick={() => onRemoveOption(index)}
                      >
                        <Icon name="Trash2" aria-hidden="true" />
                        Remove
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {optionError === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {optionError}
            </p>
          )}
        </fieldset>
      ) : null}

      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saving ? (
        <p className="text-sm text-muted-foreground" role="status">
          {editing ? "Saving field…" : "Creating field…"}
        </p>
      ) : null}
    </form>
  );
}

export interface CustomFieldsSettingsViewProps {
  /** Optional client injection keeps settings tests and host previews small. */
  rpcClient?: CustomFieldsRpcClient;
  /** Initial tab used by deep-linked settings previews. */
  initialEntity?: FieldEntity;
}

export type CustomFieldsViewProps = CustomFieldsSettingsViewProps;

export function CustomFieldsSettingsView({
  rpcClient,
  initialEntity = "COMPANY",
}: CustomFieldsSettingsViewProps) {
  const contextRpc = useCustomFieldsRpc();
  const rpc = rpcClient ?? contextRpc;
  const formId = useId();
  const loadRequestRef = useRef(0);
  const optionRequestRef = useRef(0);
  const [entity, setEntity] = useState<FieldEntity>(initialEntity);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [fields, setFields] = useState<readonly FieldDefinition[]>([]);
  const [coverage, setCoverage] = useState<Record<string, CoverageState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [editorValue, setEditorValue] = useState<FieldFormValue>(
    defaultFieldForm(initialEntity),
  );
  const [editorError, setEditorError] = useState<string | null>(null);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [backfillBusyId, setBackfillBusyId] = useState<string | null>(null);
  const [optionBusyId, setOptionBusyId] = useState<string | null>(null);
  const [fieldBusy, setFieldBusy] = useState<{
    id: string;
    mutation: FieldMutation;
  } | null>(null);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const nextFields = await rpc.call("fields_list", {
        entity,
        includeArchived,
      });
      if (requestId !== loadRequestRef.current) return;
      setFields(nextFields);

      const coverageEntries = await Promise.all(
        nextFields.map(async (field) => {
          try {
            const value = await rpc.call("fields_coverage", { id: field.id });
            return [field.id, value] as const;
          } catch {
            return [field.id, null] as const;
          }
        }),
      );
      if (requestId !== loadRequestRef.current) return;
      setCoverage(Object.fromEntries(coverageEntries));
    } catch (cause) {
      if (requestId === loadRequestRef.current) {
        setError(errorMessage(cause));
        setFields([]);
        setCoverage({});
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [entity, includeArchived, rpc]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [load, refreshKey]);

  const activeFields = useMemo(
    () => fields.filter((field) => field.archived !== true),
    [fields],
  );

  const stats = useMemo(
    () => ({
      total: fields.length,
      active: activeFields.length,
      required: activeFields.filter((field) => field.required).length,
      onTable: activeFields.filter((field) => field.showOnTable).length,
      agentFilled: activeFields.filter((field) => field.agentFilled).length,
    }),
    [activeFields, fields.length],
  );

  const openCreateEditor = useCallback(() => {
    optionRequestRef.current += 1;
    setEditingField(null);
    setEditorValue(defaultFieldForm(entity));
    setEditorError(null);
    setOptionError(null);
    setOptionsLoading(false);
    setEditorOpen(true);
  }, [entity]);

  const openEditEditor = useCallback(
    (field: FieldDefinition) => {
      const requestId = ++optionRequestRef.current;
      setEditingField(field);
      setEditorValue(fieldToForm(field));
      setEditorError(null);
      setOptionError(null);
      setEditorOpen(true);
      if (field.type !== "SELECT") {
        setOptionsLoading(false);
        return;
      }
      setOptionsLoading(true);
      void rpc
        .call("fields_options_list", {
          fieldId: field.id,
          includeArchived: true,
        })
        .then((result) => {
          if (requestId !== optionRequestRef.current) return;
          const options = Array.isArray(result)
            ? result.map(fieldOptionToDraft)
            : field.options.map(fieldOptionToDraft);
          setEditorValue((current) => ({ ...current, options }));
        })
        .catch((cause: unknown) => {
          if (requestId === optionRequestRef.current) {
            setOptionError(errorMessage(cause));
          }
        })
        .finally(() => {
          if (requestId === optionRequestRef.current) setOptionsLoading(false);
        });
    },
    [rpc],
  );

  const closeEditor = useCallback((open: boolean) => {
    if (!open) optionRequestRef.current += 1;
    setEditorOpen(open);
  }, []);

  const fillRest = useCallback(
    async (field: FieldDefinition) => {
      if (field.archived || !field.agentFilled || backfillBusyId !== null) return;
      const fieldCoverage = coverage[field.id] ?? null;
      if (fieldCoverage === null || fieldCoverage.filled >= fieldCoverage.total) return;
      setBackfillBusyId(field.id);
      setEditorError(null);
      try {
        const result = await rpc.call("fields_backfill", { id: field.id });
        setStatusMessage(
          result.queued
            ? `Fill-rest research queued for ${field.label}.`
            : `No fill-rest runs were queued for ${field.label}; the field may already be complete or the live research agent is not configured.`,
        );
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setEditorError(errorMessage(cause));
      } finally {
        setBackfillBusyId(null);
      }
    },
    [backfillBusyId, coverage, rpc],
  );

  const submitEditor = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const label = editorValue.label.trim();
      if (!label) {
        setEditorError("A field label is required.");
        return;
      }
      const activeOptions = editorValue.options.filter(
        (option) => option.archived !== true,
      );
      if (
        editorValue.type === "SELECT" &&
        (activeOptions.length === 0 || activeOptions.some((option) => !option.label.trim()))
      ) {
        setEditorError("A select needs at least one non-empty option.");
        return;
      }
      setEditorSaving(true);
      setEditorError(null);
      const options = optionsForInput(editorValue.options, editorValue.type);
      try {
        if (editingField === null) {
          const input: FieldDefinitionCreateInput = {
            entity: editorValue.entity,
            label,
            type: editorValue.type,
            options,
            agentFilled: editorValue.agentFilled,
            agentBrief: editorValue.agentBrief.trim() || null,
            required: editorValue.required,
            showOnSheet: editorValue.showOnSheet,
            showOnTable: editorValue.showOnTable,
            showOnFilter: editorValue.showOnFilter,
          };
          await rpc.call("fields_create", input);
          setStatusMessage(`${label} created.`);
        } else {
          const data: FieldDefinitionUpdateData = {
            label,
            type: editorValue.type,
            options,
            agentFilled: editorValue.agentFilled,
            agentBrief: editorValue.agentBrief.trim() || null,
            required: editorValue.required,
            showOnSheet: editorValue.showOnSheet,
            showOnTable: editorValue.showOnTable,
            showOnFilter: editorValue.showOnFilter,
          };
          await rpc.call("fields_update", { id: editingField.id, data });
          setStatusMessage(`${label} updated.`);
        }
        setEditorOpen(false);
        optionRequestRef.current += 1;
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setEditorError(errorMessage(cause));
      } finally {
        setEditorSaving(false);
      }
    },
    [editingField, editorValue, rpc],
  );

  const mutateField = useCallback(
    async (field: FieldDefinition, mutation: FieldMutation) => {
      if (!confirmInBrowser(confirmationMessage(mutation, field))) return;
      setFieldBusy({ id: field.id, mutation });
      setError(null);
      try {
        if (mutation === "archive") {
          await rpc.call("fields_archive", { id: field.id });
        } else if (mutation === "restore") {
          await rpc.call("fields_restore", { id: field.id });
        } else {
          await rpc.call("fields_delete", { id: field.id });
          if (editingField?.id === field.id) {
            setEditorOpen(false);
            optionRequestRef.current += 1;
          }
        }
        setStatusMessage(
          `${field.label} ${mutation === "delete" ? "deleted" : `${mutation}d`}.`,
        );
        setRefreshKey((value) => value + 1);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setFieldBusy(null);
      }
    },
    [editingField, rpc],
  );

  const mutateOption = useCallback(
    async (option: OptionDraft, mutation: OptionMutation) => {
      if (option.id === undefined) return;
      if (!confirmInBrowser(optionConfirmationMessage(mutation, option))) return;
      setOptionBusyId(option.id);
      setOptionError(null);
      try {
        if (mutation === "archive") {
          await rpc.call("fields_options_archive", { id: option.id });
        } else if (mutation === "restore") {
          await rpc.call("fields_options_restore", { id: option.id });
        } else {
          await rpc.call("fields_options_delete", { id: option.id });
        }
        setEditorValue((current) => ({
          ...current,
          options:
            mutation === "delete"
              ? current.options.filter((candidate) => candidate.id !== option.id)
              : current.options.map((candidate) =>
                  candidate.id === option.id
                    ? { ...candidate, archived: mutation === "archive" }
                    : candidate,
                ),
        }));
        setStatusMessage(
          `Option “${option.label}” ${mutation === "delete" ? "deleted" : `${mutation}d`}.`,
        );
      } catch (cause) {
        setOptionError(errorMessage(cause));
      } finally {
        setOptionBusyId(null);
      }
    },
    [rpc],
  );

  const moveField = useCallback(
    async (field: FieldDefinition, direction: "up" | "down") => {
      if (field.archived === true || reorderBusyId !== null) return;
      const ordered = [...activeFields];
      const index = ordered.findIndex((candidate) => candidate.id === field.id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
      [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
      setReorderBusyId(field.id);
      setError(null);
      try {
        const reordered = await rpc.call("fields_reorder", {
          entity,
          ids: ordered.map((candidate) => candidate.id),
        });
        const archived = fields.filter((candidate) => candidate.archived === true);
        const activeReordered = reordered.filter(
          (candidate) => candidate.archived !== true,
        );
        setFields(
          [...activeReordered, ...archived].sort(
            (left, right) => left.position - right.position || left.id.localeCompare(right.id),
          ),
        );
        setStatusMessage(`${field.label} moved ${direction}.`);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setReorderBusyId(null);
      }
    },
    [activeFields, entity, fields, reorderBusyId, rpc],
  );

  const addOption = useCallback(() => {
    setEditorValue((current) => ({
      ...current,
      options: [...current.options, { label: "" }],
    }));
    setEditorError(null);
  }, []);

  const removeOption = useCallback((index: number) => {
    setEditorValue((current) => ({
      ...current,
      options: current.options.filter((_, optionIndex) => optionIndex !== index),
    }));
    setEditorError(null);
  }, []);

  const activeIndexById = useMemo(
    () => new Map(activeFields.map((field, index) => [field.id, index])),
    [activeFields],
  );

  const editingCoverage = editingField === null
    ? null
    : coverage[editingField.id] ?? null;

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-background text-foreground">
      <PageHeader
        title="Custom fields"
        description="Define the fields agents and teammates use across companies, contacts, and deals."
        actions={
          <Button type="button" size="sm" onClick={openCreateEditor}>
            <Icon name="Plus" aria-hidden="true" />
            Add custom field
          </Button>
        }
      />

      <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 sm:p-5">
        {error === null ? null : (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}
        {statusMessage === null ? null : (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm" role="status">
            {statusMessage}
          </div>
        )}

        <div
          className="flex min-w-0 flex-wrap gap-1 border-b border-border"
          role="tablist"
          aria-label="Custom field record types"
        >
          {ENTITY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={entity === tab.value}
              aria-controls={`custom-fields-panel-${tab.value.toLowerCase()}`}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                entity === tab.value
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-state-hover hover:text-foreground",
              )}
              onClick={() => {
                setEntity(tab.value);
                setStatusMessage(null);
              }}
            >
              <span className="block">{tab.label}</span>
              <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block">
                {tab.description}
              </span>
            </button>
          ))}
        </div>

        <div
          id={`custom-fields-panel-${entity.toLowerCase()}`}
          role="tabpanel"
          aria-label={`${entityLabel(entity)} custom fields`}
          tabIndex={0}
          className="min-w-0 space-y-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 p-4 pb-3">
              <div>
                <CardTitle className="text-sm">{entityLabel(entity)} fields</CardTitle>
                <CardDescription className="mt-1">
                  Order, visibility, agent guidance, and fill coverage for this record type.
                </CardDescription>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  className={CHECKBOX_CLASS}
                  type="checkbox"
                  aria-label="Show archived fields"
                  checked={includeArchived}
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                />
                Show archived fields
              </label>
            </CardHeader>
            <CardContent className="p-0">
              <TableShell
                caption={`${entityLabel(entity)} custom fields`}
                columns={FIELD_COLUMNS}
                loading={loading}
                empty={
                  <EmptyState
                    icon="SlidersHorizontal"
                    title={
                      includeArchived
                        ? `No ${entityLabel(entity).toLowerCase()} fields yet`
                        : `No active ${entityLabel(entity).toLowerCase()} fields`
                    }
                    description="Create a field to capture structured context for teammates and agents."
                    action={
                      <Button type="button" size="sm" onClick={openCreateEditor}>
                        <Icon name="Plus" aria-hidden="true" />
                        Add custom field
                      </Button>
                    }
                    className="min-h-48 rounded-none border-0 bg-transparent"
                  />
                }
                id={`custom-fields-table-${entity.toLowerCase()}`}
              >
                {fields.map((field) => {
                  const activeIndex = activeIndexById.get(field.id);
                  const isArchived = field.archived === true;
                  const isBusy = fieldBusy?.id === field.id;
                  const fieldCoverage = coverage[field.id] ?? null;
                  const text = coverageText(fieldCoverage);
                  return (
                    <tr key={field.id} className={cn(isArchived && "bg-muted/20 text-muted-foreground")}>
                      <td className="px-3 py-3 align-top">
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="min-w-0">
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto max-w-full justify-start p-0 text-left font-medium"
                              aria-label={`Edit field “${field.label}”`}
                              onClick={() => openEditEditor(field)}
                            >
                              <span className="truncate">{field.label}</span>
                            </Button>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              <code>{field.key}</code>
                            </p>
                          </div>
                          {isArchived ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                              Archived
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-muted-foreground">
                        <span className="rounded-full bg-muted px-2 py-1 text-xs">
                          {fieldTypeLabel(field.type)}
                        </span>
                        {field.type === "SELECT" ? (
                          <span className="mt-2 block text-xs text-muted-foreground">
                            {field.options.length} active {field.options.length === 1 ? "option" : "options"}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {field.showOnSheet ? (
                            <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                              Sheet
                            </span>
                          ) : null}
                          {field.showOnTable ? (
                            <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                              Table
                            </span>
                          ) : null}
                          {field.showOnFilter ? (
                            <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                              Filter
                            </span>
                          ) : null}
                          {!field.showOnSheet && !field.showOnTable && !field.showOnFilter ? (
                            <span className="text-xs text-muted-foreground">Hidden</span>
                          ) : null}
                        </div>
                        {field.required ? (
                          <p className="mt-2 text-xs font-medium text-foreground">Required</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="text-sm">{field.agentFilled ? "Enabled" : "Manual"}</span>
                        {field.agentBrief?.trim() ? (
                          <span className="mt-1 block text-xs text-muted-foreground">Brief set</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div
                          className="min-w-32"
                          aria-label={`Coverage for ${field.label}: ${text}`}
                        >
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="font-medium">{text}</span>
                            {fieldCoverage === null ? null : (
                              <span className="text-muted-foreground">
                                {Math.round(coveragePercent(fieldCoverage))}%
                              </span>
                            )}
                          </div>
                          <div
                            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                            aria-hidden="true"
                          >
                            <div
                              className="h-full rounded-full bg-foreground transition-[width]"
                              style={{ width: `${coveragePercent(fieldCoverage)}%` }}
                            />
                          </div>
                          {!isArchived && field.agentFilled && fieldCoverage !== null ? (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="mt-1 h-auto p-0 text-xs"
                              disabled={
                                backfillBusyId === field.id ||
                                fieldCoverage.filled >= fieldCoverage.total
                              }
                              onClick={() => void fillRest(field)}
                            >
                              {backfillBusyId === field.id ? "Queuing…" : "Fill the rest"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Move field “${field.label}” up`}
                            disabled={
                              isArchived ||
                              activeIndex === undefined ||
                              activeIndex === 0 ||
                              reorderBusyId !== null
                            }
                            onClick={() => void moveField(field, "up")}
                          >
                            <Icon name="ChevronUp" aria-hidden="true" />
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Move field “${field.label}” down`}
                            disabled={
                              isArchived ||
                              activeIndex === undefined ||
                              activeIndex === activeFields.length - 1 ||
                              reorderBusyId !== null
                            }
                            onClick={() => void moveField(field, "down")}
                          >
                            <Icon name="ChevronDown" aria-hidden="true" />
                            Down
                          </Button>
                          {isArchived ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Restore field “${field.label}”`}
                              disabled={isBusy}
                              onClick={() => void mutateField(field, "restore")}
                            >
                              <Icon name="ArchiveRestore" aria-hidden="true" />
                              Restore
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Archive field “${field.label}”`}
                              disabled={isBusy}
                              onClick={() => void mutateField(field, "archive")}
                            >
                              <Icon name="Archive" aria-hidden="true" />
                              Archive
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete field “${field.label}”`}
                            disabled={isBusy}
                            onClick={() => void mutateField(field, "delete")}
                          >
                            <Icon name="Trash2" aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </TableShell>
              <div className="grid gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:grid-cols-4">
                <span>
                  <strong className="font-medium text-foreground">{stats.active}</strong> active
                </span>
                <span>
                  <strong className="font-medium text-foreground">{stats.required}</strong> required
                </span>
                <span>
                  <strong className="font-medium text-foreground">{stats.onTable}</strong> on table
                </span>
                <span>
                  <strong className="font-medium text-foreground">{stats.agentFilled}</strong> agent-filled
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <RecordDrawer
        open={editorOpen}
        onOpenChange={closeEditor}
        title={editingField === null ? "Add custom field" : `Edit ${editingField.label}`}
        description={
          editingField === null
            ? "Add a structured field to the selected record type."
            : "Update how this field is captured, displayed, and filled."
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => closeEditor(false)}
              disabled={editorSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={editorSaving || optionsLoading}
            >
              {editorSaving
                ? editingField === null
                  ? "Creating…"
                  : "Saving…"
                : editingField === null
                  ? "Create field"
                  : "Save changes"}
            </Button>
          </>
        }
      >
        <FieldDefinitionForm
          formId={formId}
          value={editorValue}
          fieldKey={editingField?.key}
          editing={editingField !== null}
          saving={editorSaving}
          optionsLoading={optionsLoading}
          optionBusyId={optionBusyId}
          coverage={editingCoverage}
          backfillBusy={backfillBusyId === editingField?.id}
          error={editorError}
          optionError={optionError}
          onChange={setEditorValue}
          onAddOption={addOption}
          onRemoveOption={removeOption}
          onOptionMutation={(option, mutation) => void mutateOption(option, mutation)}
          onFillRest={() => {
            if (editingField !== null) void fillRest(editingField);
          }}
          onSubmit={submitEditor}
        />
      </RecordDrawer>
    </div>
  );
}

/** Short alias used by settings registries that call every view a screen. */
export const CustomFieldsView = CustomFieldsSettingsView;
