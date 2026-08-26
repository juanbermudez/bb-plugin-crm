import {
  FIELD_ENTITIES,
  FIELD_TYPES,
  newRecordId,
  nullableText,
  nowIso,
  RecordNotFoundError,
  requiredText,
  type Db,
  type FieldEntity,
  type FieldType,
} from "./types.js";

export type CustomFieldEntity = FieldEntity;
export type CustomFieldType = FieldType;
export type FieldValue = string | number | boolean | null;

export const CUSTOM_FIELD_ENTITIES = FIELD_ENTITIES;
export const CUSTOM_FIELD_TYPES = FIELD_TYPES;

export interface FieldOption {
  id: string;
  fieldId: string;
  label: string;
  position: number;
  archived: boolean;
  archivedAt: string | null;
}

export interface FieldDefinition {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  agentFilled: boolean;
  agentBrief: string | null;
  required: boolean;
  showOnSheet: boolean;
  showOnTable: boolean;
  showOnFilter: boolean;
  position: number;
  archived: boolean;
  archivedAt: string | null;
  options: FieldOption[];
  createdAt: string;
  updatedAt: string;
}

export interface FieldOptionInput {
  id?: string;
  label: string;
  position?: number;
}

export interface FieldDefinitionCreateInput {
  id?: string;
  entity: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options?: readonly FieldOptionInput[];
  agentFilled?: boolean;
  agentBrief?: string | null;
  required?: boolean;
  showOnSheet?: boolean;
  showOnTable?: boolean;
  showOnFilter?: boolean;
}

export interface FieldDefinitionUpdateInput {
  label?: string;
  type?: CustomFieldType;
  options?: readonly FieldOptionInput[];
  agentFilled?: boolean;
  agentBrief?: string | null;
  required?: boolean;
  showOnSheet?: boolean;
  showOnTable?: boolean;
  showOnFilter?: boolean;
}

export interface FieldDefinitionUpdateArgs {
  id: string;
  data: FieldDefinitionUpdateInput;
}

export interface FieldDefinitionUpdateData {
  data: FieldDefinitionUpdateInput;
}

export interface FieldDefinitionListOptions {
  entity: CustomFieldEntity;
  includeArchived?: boolean;
}

export interface FieldOptionListOptions {
  fieldId: string;
  includeArchived?: boolean;
}

export interface FieldOptionCreateInput {
  id?: string;
  fieldId: string;
  label: string;
  position?: number;
}

export interface FieldOptionUpdateInput {
  label?: string;
  position?: number;
}

export interface FieldOptionUpdateArgs {
  id: string;
  data: FieldOptionUpdateInput;
}

export interface FieldOptionUpdateData {
  data: FieldOptionUpdateInput;
}

export interface FieldValueDto {
  id: string;
  fieldId: string;
  entity: CustomFieldEntity;
  recordId: string;
  value: FieldValue;
  updatedAt: string;
}

export interface FieldValueListOptions {
  entity: CustomFieldEntity;
  recordId: string;
  includeArchived?: boolean;
}

export interface FieldValueCreateInput {
  id?: string;
  entity: CustomFieldEntity;
  recordId: string;
  fieldId: string;
  value: FieldValue;
}

export interface FieldValueUpdateInput extends FieldValueCreateInput {
  id: string;
}

export class FieldConflictError extends Error {
  readonly code = "CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "FieldConflictError";
  }
}

export class FieldValueError extends Error {
  readonly code = "INVALID_FIELD_VALUE" as const;

  constructor(readonly key: string, message: string) {
    super(message);
    this.name = "FieldValueError";
  }
}

const DEFINITION_CREATE_KEYS = new Set([
  "id",
  "entity",
  "label",
  "type",
  "options",
  "agentFilled",
  "agentBrief",
  "required",
  "showOnSheet",
  "showOnTable",
  "showOnFilter",
]);
const DEFINITION_UPDATE_KEYS = new Set([
  "label",
  "type",
  "options",
  "agentFilled",
  "agentBrief",
  "required",
  "showOnSheet",
  "showOnTable",
  "showOnFilter",
]);
const OPTION_CREATE_KEYS = new Set(["id", "fieldId", "label", "position"]);
const OPTION_UPDATE_KEYS = new Set(["label", "position"]);
const VALUE_KEYS = new Set(["id", "entity", "recordId", "fieldId", "value"]);
const VALUE_DELETE_KEYS = new Set(["id", "entity", "recordId", "fieldId"]);

const ENTITY_TABLES = {
  COMPANY: { table: "companies", column: "company_id", label: "company" },
  CONTACT: { table: "contacts", column: "contact_id", label: "contact" },
  DEAL: { table: "deals", column: "deal_id", label: "deal" },
} as const satisfies Record<CustomFieldEntity, { table: string; column: string; label: string }>;

const FIELD_VALUE_COLUMNS = ["text", "number", "date", "bool", "option_id", "user_id"] as const;
type FieldValueColumn = (typeof FIELD_VALUE_COLUMNS)[number];

/** A fill-rest request is deliberately bounded to keep one click from
 * creating an unbounded queue of external research runs. */
export const CUSTOM_FIELD_BACKFILL_MAX_RECORDS = 500;

const DEFINITION_SELECT = `
  SELECT
    id,
    entity,
    key,
    label,
    type,
    agent_filled AS agentFilled,
    agent_brief AS agentBrief,
    required,
    show_on_sheet AS showOnSheet,
    show_on_table AS showOnTable,
    show_on_filter AS showOnFilter,
    position,
    archived_at AS archivedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM field_definitions`;

const OPTION_SELECT = `
  SELECT
    id,
    field_id AS fieldId,
    label,
    position,
    archived_at AS archivedAt
  FROM field_options`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function assertKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown key: ${key}.`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function identifier(value: unknown, label: string): string {
  return requiredText(stringValue(value, label), label);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  const candidate = stringValue(value, label);
  if ((values as readonly string[]).includes(candidate)) return candidate as T;
  throw new Error(`Invalid ${label}: ${candidate}.`);
}

function entity(value: unknown): CustomFieldEntity {
  return oneOf(value, CUSTOM_FIELD_ENTITIES, "field entity");
}

function fieldType(value: unknown): CustomFieldType {
  return oneOf(value, CUSTOM_FIELD_TYPES, "field type");
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function position(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function normalizeLabel(value: unknown, label: string): string {
  const normalized = requiredText(stringValue(value, label), label);
  if (normalized.length > 120) throw new Error(`${label} must be at most 120 characters.`);
  return normalized;
}

function normalizeNullableBrief(value: unknown): string | null {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new Error("Field agent brief must be a string or null.");
  }
  return nullableText(value as string | null | undefined);
}

function fieldKeyFromLabel(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[\u0027\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "f_$1")
    .slice(0, 60);
  const reserved = new Set(["id", "createdat", "updatedat", "fields", "owner", "ownerid", "new"]);
  return reserved.has(key) ? `${key}_field` : key;
}

export { fieldKeyFromLabel };

function optionInput(value: unknown, index: number): FieldOptionInput {
  const object = objectValue(value, `Field option ${index}`);
  assertKeys(object, OPTION_CREATE_KEYS, `Field option ${index}`);
  const result: FieldOptionInput = {
    label: normalizeLabel(object.label, `Field option ${index} label`),
  };
  if (object.id !== undefined) result.id = identifier(object.id, `Field option ${index} id`);
  if (object.position !== undefined) result.position = position(object.position, `Field option ${index} position`);
  return result;
}

function optionInputs(value: unknown): FieldOptionInput[] {
  if (!Array.isArray(value)) throw new Error("Field options must be an array.");
  const options = value.map(optionInput);
  const ids = options.map((option) => option.id).filter((id): id is string => id !== undefined);
  if (new Set(ids).size !== ids.length) throw new Error("Field options cannot repeat an id.");
  return options;
}

function normalizeDefinitionCreate(input: FieldDefinitionCreateInput): {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: FieldOptionInput[];
  agentFilled: boolean;
  agentBrief: string | null;
  required: boolean;
  showOnSheet: boolean;
  showOnTable: boolean;
  showOnFilter: boolean;
} {
  const object = objectValue(input, "Field definition input");
  assertKeys(object, DEFINITION_CREATE_KEYS, "Field definition input");
  const label = normalizeLabel(object.label, "Field label");
  const type = fieldType(object.type);
  const options = object.options === undefined ? [] : optionInputs(object.options);
  if (type === "SELECT" && options.length === 0) {
    throw new Error("A select needs at least one option.");
  }
  if (type !== "SELECT" && options.length > 0) {
    throw new Error("Only select fields can have options.");
  }
  const key = fieldKeyFromLabel(label);
  if (!key) throw new Error("That label does not make a usable key.");
  return {
    id: object.id === undefined ? newRecordId("field") : identifier(object.id, "Field id"),
    entity: entity(object.entity),
    key,
    label,
    type,
    options,
    agentFilled: object.agentFilled === undefined ? true : booleanValue(object.agentFilled, "Field agentFilled"),
    agentBrief: normalizeNullableBrief(object.agentBrief),
    required: object.required === undefined ? false : booleanValue(object.required, "Field required"),
    showOnSheet: object.showOnSheet === undefined ? true : booleanValue(object.showOnSheet, "Field showOnSheet"),
    showOnTable: object.showOnTable === undefined ? false : booleanValue(object.showOnTable, "Field showOnTable"),
    showOnFilter: object.showOnFilter === undefined ? false : booleanValue(object.showOnFilter, "Field showOnFilter"),
  };
}

function normalizeDefinitionUpdate(
  input: FieldDefinitionUpdateInput | FieldDefinitionUpdateArgs | FieldDefinitionUpdateData,
): FieldDefinitionUpdateInput {
  const object = objectValue(input, "Field definition update");
  if (Object.prototype.hasOwnProperty.call(object, "data")) {
    assertKeys(object, new Set(["data"]), "Field definition update");
    return normalizeDefinitionUpdate(object.data as FieldDefinitionUpdateInput);
  }
  assertKeys(object, DEFINITION_UPDATE_KEYS, "Field definition update");
  const result: FieldDefinitionUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(object, "label")) result.label = normalizeLabel(object.label, "Field label");
  if (Object.prototype.hasOwnProperty.call(object, "type")) result.type = fieldType(object.type);
  if (Object.prototype.hasOwnProperty.call(object, "options")) result.options = optionInputs(object.options);
  if (Object.prototype.hasOwnProperty.call(object, "agentFilled")) result.agentFilled = booleanValue(object.agentFilled, "Field agentFilled");
  if (Object.prototype.hasOwnProperty.call(object, "agentBrief")) result.agentBrief = normalizeNullableBrief(object.agentBrief);
  if (Object.prototype.hasOwnProperty.call(object, "required")) result.required = booleanValue(object.required, "Field required");
  if (Object.prototype.hasOwnProperty.call(object, "showOnSheet")) result.showOnSheet = booleanValue(object.showOnSheet, "Field showOnSheet");
  if (Object.prototype.hasOwnProperty.call(object, "showOnTable")) result.showOnTable = booleanValue(object.showOnTable, "Field showOnTable");
  if (Object.prototype.hasOwnProperty.call(object, "showOnFilter")) result.showOnFilter = booleanValue(object.showOnFilter, "Field showOnFilter");
  return result;
}

function normalizeOptionCreate(input: FieldOptionCreateInput): {
  id: string;
  fieldId: string;
  label: string;
  position: number | undefined;
} {
  const object = objectValue(input, "Field option input");
  assertKeys(object, OPTION_CREATE_KEYS, "Field option input");
  return {
    id: object.id === undefined ? newRecordId("option") : identifier(object.id, "Field option id"),
    fieldId: identifier(object.fieldId, "Field id"),
    label: normalizeLabel(object.label, "Field option label"),
    position: object.position === undefined ? undefined : position(object.position, "Field option position"),
  };
}

function normalizeOptionUpdate(
  input: FieldOptionUpdateInput | FieldOptionUpdateArgs | FieldOptionUpdateData,
): FieldOptionUpdateInput {
  const object = objectValue(input, "Field option update");
  if (Object.prototype.hasOwnProperty.call(object, "data")) {
    assertKeys(object, new Set(["data"]), "Field option update");
    return normalizeOptionUpdate(object.data as FieldOptionUpdateInput);
  }
  assertKeys(object, OPTION_UPDATE_KEYS, "Field option update");
  const result: FieldOptionUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(object, "label")) result.label = normalizeLabel(object.label, "Field option label");
  if (Object.prototype.hasOwnProperty.call(object, "position")) result.position = position(object.position, "Field option position");
  return result;
}

function normalizeValueInput(input: FieldValueCreateInput): {
  id: string;
  entity: CustomFieldEntity;
  recordId: string;
  fieldId: string;
  value: FieldValue;
} {
  const object = objectValue(input, "Field value input");
  assertKeys(object, VALUE_KEYS, "Field value input");
  if (object.value === undefined) throw new Error("Field value is required.");
  if (typeof object.value === "number" && !Number.isFinite(object.value)) {
    throw new Error("Field value must be finite.");
  }
  if (
    object.value !== null &&
    typeof object.value !== "string" &&
    typeof object.value !== "number" &&
    typeof object.value !== "boolean"
  ) {
    throw new Error("Field value must be text, a number, true or false, or null.");
  }
  return {
    id: object.id === undefined ? newRecordId("value") : identifier(object.id, "Field value id"),
    entity: entity(object.entity),
    recordId: identifier(object.recordId, "Field record id"),
    fieldId: identifier(object.fieldId, "Field id"),
    value: object.value as FieldValue,
  };
}

function rowBoolean(value: unknown, label: string): boolean {
  if (value === 0 || value === false) return false;
  if (value === 1 || value === true) return true;
  throw new Error(`${label} must be 0 or 1 in SQLite.`);
}

function rowInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer in SQLite.`);
  }
  return value;
}

function rowString(value: unknown, label: string): string {
  return identifier(value, label);
}

function rowNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return stringValue(value, label);
}

function fieldValueColumn(type: CustomFieldType): FieldValueColumn {
  return type === "CHECKBOX"
    ? "bool"
    : type === "NUMBER"
      ? "number"
      : type === "DATE"
        ? "date"
        : type === "SELECT"
          ? "option_id"
          : type === "USER"
            ? "user_id"
            : "text";
}

function optionFromRow(value: unknown): FieldOption {
  const row = objectValue(value, "Field option row");
  const archivedAt = rowNullableString(row.archivedAt, "Field option archived timestamp");
  return {
    id: rowString(row.id, "Field option id"),
    fieldId: rowString(row.fieldId, "Field option field id"),
    label: normalizeLabel(row.label, "Field option label"),
    position: rowInteger(row.position, "Field option position"),
    archived: archivedAt !== null,
    archivedAt,
  };
}

function definitionFromRow(value: unknown, options: FieldOption[]): FieldDefinition {
  const row = objectValue(value, "Field definition row");
  const archivedAt = rowNullableString(row.archivedAt, "Field archived timestamp");
  return {
    id: rowString(row.id, "Field id"),
    entity: entity(row.entity),
    key: requiredText(stringValue(row.key, "Field key"), "Field key"),
    label: normalizeLabel(row.label, "Field label"),
    type: fieldType(row.type),
    agentFilled: rowBoolean(row.agentFilled, "Field agentFilled"),
    agentBrief: rowNullableString(row.agentBrief, "Field agent brief"),
    required: rowBoolean(row.required, "Field required"),
    showOnSheet: rowBoolean(row.showOnSheet, "Field showOnSheet"),
    showOnTable: rowBoolean(row.showOnTable, "Field showOnTable"),
    showOnFilter: rowBoolean(row.showOnFilter, "Field showOnFilter"),
    position: rowInteger(row.position, "Field position"),
    archived: archivedAt !== null,
    archivedAt,
    options,
    createdAt: rowString(row.createdAt, "Field created timestamp"),
    updatedAt: rowString(row.updatedAt, "Field updated timestamp"),
  };
}

function normalizeStoredValue(value: unknown, definition: FieldDefinition, options: FieldOption[]): {
  column: FieldValueColumn | null;
  stored: string | number | null;
  value: FieldValue;
} {
  const blank = value === null || (typeof value === "string" && value.trim() === "");
  if (blank) {
    if (definition.required) {
      throw new FieldValueError(definition.key, `${definition.label} cannot be empty.`);
    }
    return { column: null, stored: null, value: null };
  }

  switch (definition.type) {
    case "CHECKBOX": {
      if (typeof value === "boolean") return { column: "bool", stored: value ? 1 : 0, value };
      if (value === "true" || value === "false") {
        const result = value === "true";
        return { column: "bool", stored: result ? 1 : 0, value: result };
      }
      throw new FieldValueError(definition.key, `${definition.label} takes true or false.`);
    }
    case "NUMBER": {
      const parsed = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(parsed)) {
        throw new FieldValueError(definition.key, `${definition.label} takes a number.`);
      }
      return { column: "number", stored: parsed, value: parsed };
    }
    case "DATE": {
      if (typeof value !== "string") {
        throw new FieldValueError(definition.key, `${definition.label} takes an ISO date.`);
      }
      const raw = value.trim();
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
      const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(raw);
      if (!dateOnly && !dateTime) {
        throw new FieldValueError(definition.key, `${definition.label} takes a date like 2027-03-31.`);
      }
      const parsed = new Date(dateOnly ? `${raw}T00:00:00.000Z` : raw);
      if (Number.isNaN(parsed.getTime())) {
        throw new FieldValueError(definition.key, `${definition.label} takes a date like 2027-03-31.`);
      }
      const iso = parsed.toISOString();
      return { column: "date", stored: iso, value: iso };
    }
    case "SELECT": {
      if (typeof value !== "string") {
        throw new FieldValueError(definition.key, `${definition.label} takes one of its options.`);
      }
      const raw = value.trim();
      const option = options.find(
        (entry) => !entry.archived && (entry.id === raw || entry.label.toLowerCase() === raw.toLowerCase()),
      );
      if (!option) {
        throw new FieldValueError(definition.key, `${definition.label} has no option "${raw}".`);
      }
      return { column: "option_id", stored: option.id, value: option.id };
    }
    case "USER": {
      const normalized = String(value).trim();
      if (!normalized) {
        if (definition.required) throw new FieldValueError(definition.key, `${definition.label} cannot be empty.`);
        return { column: null, stored: null, value: null };
      }
      return { column: "user_id", stored: normalized, value: normalized };
    }
    default: {
      const normalized = String(value).trim();
      if (!normalized) {
        if (definition.required) throw new FieldValueError(definition.key, `${definition.label} cannot be empty.`);
        return { column: null, stored: null, value: null };
      }
      return { column: "text", stored: normalized, value: normalized };
    }
  }
}

function readStoredValue(definition: FieldDefinition, row: Record<string, unknown>): FieldValue {
  switch (definition.type) {
    case "CHECKBOX":
      return row.bool === null || row.bool === undefined ? null : rowBoolean(row.bool, `${definition.key} checkbox`);
    case "NUMBER":
      if (row.number === null || row.number === undefined) return null;
      if (typeof row.number !== "number" || !Number.isFinite(row.number)) throw new Error(`${definition.key} number is invalid.`);
      return row.number;
    case "DATE":
      return rowNullableString(row.date, `${definition.key} date`);
    case "SELECT":
      return rowNullableString(row.optionId, `${definition.key} option`);
    case "USER":
      return rowNullableString(row.userId, `${definition.key} user`);
    default:
      return rowNullableString(row.text, `${definition.key} text`);
  }
}

function sqliteUnique(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (typeof candidate.message === "string" && candidate.message.includes("UNIQUE constraint failed"));
}

export class CustomFieldStore {
  constructor(private readonly db: Db) {}

  private queryOptions(fieldId: string, includeArchived: boolean): FieldOption[] {
    const rows = this.db
      .prepare(`${OPTION_SELECT} WHERE field_id = @fieldId${includeArchived ? "" : " AND archived_at IS NULL"} ORDER BY position ASC, id ASC`)
      .all({ fieldId });
    return rows.map(optionFromRow);
  }

  private rawDefinition(id: string): Record<string, unknown> | null {
    const row = this.db.prepare(`${DEFINITION_SELECT} WHERE id = @id`).get({ id });
    return row ? objectValue(row, "Field definition row") : null;
  }

  private definition(id: string, includeArchived = true): FieldDefinition | null {
    const recordId = identifier(id, "Field id");
    const row = this.rawDefinition(recordId);
    if (!row) return null;
    const archivedAt = row.archivedAt;
    if (!includeArchived && archivedAt !== null && archivedAt !== undefined) return null;
    const options = this.queryOptions(recordId, false);
    return definitionFromRow(row, options);
  }

  private requiredDefinition(id: string, includeArchived = true): FieldDefinition {
    const value = this.definition(id, includeArchived);
    if (!value) throw new RecordNotFoundError("field", id);
    return value;
  }

  private activeDefinition(id: string): FieldDefinition {
    return this.requiredDefinition(id, false);
  }

  private recordExists(recordEntity: CustomFieldEntity, recordId: string): void {
    const target = ENTITY_TABLES[recordEntity];
    const row = this.db.prepare(`SELECT 1 AS present FROM ${target.table} WHERE id = @recordId LIMIT 1`).get({ recordId });
    if (!row) throw new RecordNotFoundError(target.label, recordId);
  }

  private valueRow(
    entityValue: CustomFieldEntity,
    recordId: string,
    fieldId: string,
  ): Record<string, unknown> | null {
    const target = ENTITY_TABLES[entityValue];
    const row = this.db
      .prepare(`
        SELECT
          id,
          field_id AS fieldId,
          ${target.column} AS recordId,
          text,
          number,
          date,
          bool,
          option_id AS optionId,
          user_id AS userId,
          updated_at AS updatedAt
        FROM field_values
        WHERE field_id = @fieldId AND ${target.column} = @recordId
        LIMIT 1
      `)
      .get({ fieldId, recordId });
    return row ? objectValue(row, "Field value row") : null;
  }

  private valueDto(
    entityValue: CustomFieldEntity,
    recordId: string,
    definition: FieldDefinition,
    row: Record<string, unknown>,
  ): FieldValueDto {
    return {
      id: rowString(row.id, "Field value id"),
      fieldId: rowString(row.fieldId, "Field value field id"),
      entity: entityValue,
      recordId: identifier(recordId, "Field record id"),
      value: readStoredValue(definition, row),
      updatedAt: rowString(row.updatedAt, "Field value updated timestamp"),
    };
  }

  list(input: FieldDefinitionListOptions | CustomFieldEntity, includeArchived = false): FieldDefinition[] {
    const options: FieldDefinitionListOptions = typeof input === "string"
      ? { entity: input, includeArchived }
      : input;
    const object = objectValue(options, "Field list options");
    const entityValue = entity(object.entity);
    const archived = object.includeArchived === undefined
      ? false
      : booleanValue(object.includeArchived, "includeArchived");
    const rows = this.db
      .prepare(`${DEFINITION_SELECT} WHERE entity = @entity${archived ? "" : " AND archived_at IS NULL"} ORDER BY position ASC, id ASC`)
      .all({ entity: entityValue });
    return rows.map((row) => {
      const record = objectValue(row, "Field definition row");
      return definitionFromRow(record, this.queryOptions(rowString(record.id, "Field id"), false));
    });
  }

  get(id: string, options: { includeArchived?: boolean } = {}): FieldDefinition | null {
    const includeArchived = options.includeArchived === undefined
      ? true
      : booleanValue(options.includeArchived, "includeArchived");
    return this.definition(id, includeArchived);
  }

  getRequired(id: string, options: { includeArchived?: boolean } = {}): FieldDefinition {
    const value = this.get(id, options);
    if (!value) throw new RecordNotFoundError("field", id);
    return value;
  }

  byKey(recordEntity: CustomFieldEntity, key: string): FieldDefinition {
    const entityValue = entity(recordEntity);
    const normalizedKey = requiredText(stringValue(key, "Field key"), "Field key");
    const row = this.db.prepare(`${DEFINITION_SELECT} WHERE entity = @entity AND key = @key`).get({
      entity: entityValue,
      key: normalizedKey,
    });
    if (!row) throw new RecordNotFoundError("field", `${entityValue}:${normalizedKey}`);
    const record = objectValue(row, "Field definition row");
    return definitionFromRow(record, this.queryOptions(rowString(record.id, "Field id"), false));
  }

  filterable(recordEntity: CustomFieldEntity): FieldDefinition[] {
    const entityValue = entity(recordEntity);
    const rows = this.db
      .prepare(`${DEFINITION_SELECT}
        WHERE entity = @entity AND archived_at IS NULL AND show_on_filter = 1
          AND type IN ('SELECT', 'USER')
        ORDER BY position ASC, id ASC`)
      .all({ entity: entityValue });
    return rows.map((row) => {
      const record = objectValue(row, "Field definition row");
      return definitionFromRow(record, this.queryOptions(rowString(record.id, "Field id"), false));
    });
  }

  filters(recordEntity: CustomFieldEntity): FieldDefinition[] {
    return this.filterable(recordEntity);
  }

  coverage(id: string): { filled: number; total: number } {
    const definition = this.requiredDefinition(id);
    const target = ENTITY_TABLES[definition.entity];
    const column = fieldValueColumn(definition.type);
    const filled = (this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM field_values
      WHERE field_id = @fieldId AND ${target.column} IS NOT NULL AND ${column} IS NOT NULL
    `).get({ fieldId: definition.id }) as { count: number }).count;
    const total = (this.db.prepare(`SELECT COUNT(*) AS count FROM ${target.table}`).get() as { count: number }).count;
    return { filled, total };
  }

  /**
   * Return a stable, bounded batch of active records without a non-null value
   * in the selected field's typed column. A value row with a null typed value
   * is treated as missing, which keeps this safe in the presence of legacy or
   * partially written rows.
   */
  missingRecordIds(id: string, limit = CUSTOM_FIELD_BACKFILL_MAX_RECORDS): string[] {
    const definition = this.activeDefinition(id);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > CUSTOM_FIELD_BACKFILL_MAX_RECORDS) {
      throw new Error(`Field backfill limit must be an integer from 1 to ${CUSTOM_FIELD_BACKFILL_MAX_RECORDS}.`);
    }
    const target = ENTITY_TABLES[definition.entity];
    const column = fieldValueColumn(definition.type);
    const rows = this.db.prepare(`
      SELECT records.id AS id
      FROM ${target.table} AS records
      WHERE records.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM field_values AS fieldValues
          WHERE fieldValues.field_id = @fieldId
            AND fieldValues.${target.column} = records.id
            AND fieldValues.${column} IS NOT NULL
        )
      ORDER BY records.created_at ASC, records.id ASC
      LIMIT @limit
    `).all({ fieldId: definition.id, limit });
    return rows.map((row) => rowString(objectValue(row, "Missing field record row").id, "Field record id"));
  }

  create(input: FieldDefinitionCreateInput): FieldDefinition {
    const value = normalizeDefinitionCreate(input);
    const timestamp = nowIso();
    try {
      return this.db.transaction(() => {
        const existing = this.db.prepare("SELECT id FROM field_definitions WHERE entity = @entity AND key = @key").get({
          entity: value.entity,
          key: value.key,
        });
        if (existing) throw new FieldConflictError(`There is already a field called "${value.key}".`);
        const last = this.db.prepare("SELECT position FROM field_definitions WHERE entity = @entity ORDER BY position DESC, id DESC LIMIT 1").get({
          entity: value.entity,
        }) as { position?: number } | undefined;
        const fieldPosition = last?.position === undefined ? 0 : rowInteger(last.position, "Field position") + 1;
        this.db.prepare(`
          INSERT INTO field_definitions (
            id, entity, key, label, type, agent_filled, agent_brief, required,
            show_on_sheet, show_on_table, show_on_filter, position, archived_at,
            created_at, updated_at
          ) VALUES (
            @id, @entity, @key, @label, @type, @agentFilled, @agentBrief, @required,
            @showOnSheet, @showOnTable, @showOnFilter, @position, NULL,
            @createdAt, @updatedAt
          )
        `).run({
          id: value.id,
          entity: value.entity,
          key: value.key,
          label: value.label,
          type: value.type,
          agentFilled: value.agentFilled ? 1 : 0,
          agentBrief: value.agentBrief,
          required: value.required ? 1 : 0,
          showOnSheet: value.showOnSheet ? 1 : 0,
          showOnTable: value.showOnTable ? 1 : 0,
          showOnFilter: value.showOnFilter ? 1 : 0,
          position: fieldPosition,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        const insertOption = this.db.prepare(`
          INSERT INTO field_options (id, field_id, label, position, archived_at)
          VALUES (@id, @fieldId, @label, @position, NULL)
        `);
        value.options.forEach((option, index) => {
          insertOption.run({
            id: option.id ?? newRecordId("option"),
            fieldId: value.id,
            label: option.label,
            position: index,
          });
        });
        return this.requiredDefinition(value.id);
      })();
    } catch (error) {
      if (error instanceof FieldConflictError) throw error;
      if (sqliteUnique(error)) throw new FieldConflictError(`There is already a field called "${value.key}".`);
      throw error;
    }
  }

  update(
    id: string,
    input: FieldDefinitionUpdateInput | FieldDefinitionUpdateArgs | FieldDefinitionUpdateData,
  ): FieldDefinition {
    const fieldId = identifier(id, "Field id");
    const data = normalizeDefinitionUpdate(input);
    return this.db.transaction(() => {
      const existing = this.requiredDefinition(fieldId);
      const nextType = data.type ?? existing.type;
      if (data.type !== undefined && data.type !== existing.type) {
        const count = (this.db.prepare("SELECT COUNT(*) AS count FROM field_values WHERE field_id = @fieldId").get({ fieldId }) as { count: number }).count;
        if (count > 0) {
          throw new FieldConflictError("This field already holds values, so its type cannot change. Archive it and make a new one.");
        }
      }
      if (data.options !== undefined && nextType !== "SELECT") {
        if (data.options.length > 0) throw new Error("Only select fields can have options.");
      }
      const activeOptions = this.queryOptions(fieldId, false);
      if (nextType === "SELECT" && (data.options?.length ?? activeOptions.length) === 0) {
        throw new Error("A select needs at least one option.");
      }

      const fields: string[] = [];
      const params: Record<string, string | number | null> = { id: fieldId, updatedAt: nowIso() };
      if (data.label !== undefined) {
        fields.push("label = @label");
        params.label = normalizeLabel(data.label, "Field label");
      }
      if (data.type !== undefined) {
        fields.push("type = @type");
        params.type = data.type;
      }
      if (data.agentFilled !== undefined) {
        fields.push("agent_filled = @agentFilled");
        params.agentFilled = data.agentFilled ? 1 : 0;
      }
      if (Object.prototype.hasOwnProperty.call(data, "agentBrief")) {
        fields.push("agent_brief = @agentBrief");
        params.agentBrief = data.agentBrief ?? null;
      }
      if (data.required !== undefined) {
        fields.push("required = @required");
        params.required = data.required ? 1 : 0;
      }
      if (data.showOnSheet !== undefined) {
        fields.push("show_on_sheet = @showOnSheet");
        params.showOnSheet = data.showOnSheet ? 1 : 0;
      }
      if (data.showOnTable !== undefined) {
        fields.push("show_on_table = @showOnTable");
        params.showOnTable = data.showOnTable ? 1 : 0;
      }
      if (data.showOnFilter !== undefined) {
        fields.push("show_on_filter = @showOnFilter");
        params.showOnFilter = data.showOnFilter ? 1 : 0;
      }
      if (fields.length > 0) {
        fields.push("updated_at = @updatedAt");
        this.db.prepare(`UPDATE field_definitions SET ${fields.join(", ")} WHERE id = @id`).run(params);
      }

      if (data.options !== undefined && nextType === "SELECT") {
        const providedIds = new Set(data.options.flatMap((option) => option.id ? [option.id] : []));
        this.db.prepare(`UPDATE field_options SET archived_at = @archivedAt WHERE field_id = @fieldId AND archived_at IS NULL${providedIds.size === 0 ? "" : ` AND id NOT IN (${[...providedIds].map((_, index) => `@keep${index}`).join(", ")})`}`).run({
          fieldId,
          archivedAt: nowIso(),
          ...Object.fromEntries([...providedIds].map((idValue, index) => [`keep${index}`, idValue])),
        });
        const updateExisting = this.db.prepare("UPDATE field_options SET label = @label, position = @position WHERE id = @id AND field_id = @fieldId");
        const insertNew = this.db.prepare("INSERT INTO field_options (id, field_id, label, position, archived_at) VALUES (@id, @fieldId, @label, @position, NULL)");
        data.options.forEach((option, index) => {
          if (option.id !== undefined) {
            const result = updateExisting.run({ id: option.id, fieldId, label: option.label, position: index });
            if (result.changes !== 1) throw new RecordNotFoundError("field option", option.id);
          } else {
            insertNew.run({ id: newRecordId("option"), fieldId, label: option.label, position: index });
          }
        });
      }
      return this.requiredDefinition(fieldId);
    })();
  }

  reorder(input: { entity: CustomFieldEntity; ids: readonly string[] }): FieldDefinition[] {
    const object = objectValue(input, "Field reorder input");
    if (!Array.isArray(object.ids) || object.ids.length === 0) throw new Error("Field reorder requires at least one id.");
    const entityValue = entity(object.entity);
    const ids = object.ids.map((id, index) => identifier(id, `Field id ${index}`));
    if (new Set(ids).size !== ids.length) throw new Error("Field reorder cannot repeat an id.");
    return this.db.transaction(() => {
      const placeholders = ids.map((_, index) => `@id${index}`).join(", ");
      const rows = this.db.prepare(`SELECT id FROM field_definitions WHERE entity = @entity AND id IN (${placeholders})`).all({
        entity: entityValue,
        ...Object.fromEntries(ids.map((idValue, index) => [`id${index}`, idValue])),
      }) as Array<{ id: string }>;
      if (rows.length !== ids.length) throw new Error("That order names a field which is not on this record type.");
      const update = this.db.prepare("UPDATE field_definitions SET position = @position, updated_at = @updatedAt WHERE id = @id AND entity = @entity");
      ids.forEach((idValue, index) => update.run({ id: idValue, entity: entityValue, position: index, updatedAt: nowIso() }));
      return this.list({ entity: entityValue, includeArchived: false });
    })();
  }

  archive(id: string): FieldDefinition {
    return this.setArchived(id, nowIso());
  }

  restore(id: string): FieldDefinition {
    return this.setArchived(id, null);
  }

  private setArchived(id: string, archivedAt: string | null): FieldDefinition {
    const fieldId = identifier(id, "Field id");
    return this.db.transaction(() => {
      this.requiredDefinition(fieldId);
      this.db.prepare("UPDATE field_definitions SET archived_at = @archivedAt, updated_at = @updatedAt WHERE id = @id").run({
        id: fieldId,
        archivedAt,
        updatedAt: nowIso(),
      });
      return this.requiredDefinition(fieldId);
    })();
  }

  delete(id: string): { id: string } {
    const fieldId = identifier(id, "Field id");
    return this.db.transaction(() => {
      this.requiredDefinition(fieldId);
      this.db.prepare("DELETE FROM field_definitions WHERE id = @id").run({ id: fieldId });
      return { id: fieldId };
    })();
  }

  listOptions(input: FieldOptionListOptions | string, includeArchived = false): FieldOption[] {
    const options: FieldOptionListOptions = typeof input === "string"
      ? { fieldId: input, includeArchived }
      : input;
    const object = objectValue(options, "Field option list options");
    const fieldId = identifier(object.fieldId, "Field id");
    const archived = object.includeArchived === undefined
      ? false
      : booleanValue(object.includeArchived, "includeArchived");
    this.requiredDefinition(fieldId);
    return this.queryOptions(fieldId, archived);
  }

  createOption(input: FieldOptionCreateInput): FieldOption {
    const value = normalizeOptionCreate(input);
    return this.db.transaction(() => {
      const definition = this.requiredDefinition(value.fieldId);
      if (definition.type !== "SELECT") throw new Error("Only select fields can have options.");
      const nextPosition = value.position ?? ((this.db.prepare("SELECT COALESCE(MAX(position), -1) AS position FROM field_options WHERE field_id = @fieldId").get({ fieldId: value.fieldId }) as { position: number }).position + 1);
      try {
        this.db.prepare("INSERT INTO field_options (id, field_id, label, position, archived_at) VALUES (@id, @fieldId, @label, @position, NULL)").run({
          id: value.id,
          fieldId: value.fieldId,
          label: value.label,
          position: nextPosition,
        });
      } catch (error) {
        if (sqliteUnique(error)) throw new FieldConflictError("That field option already exists.");
        throw error;
      }
      return this.queryOptions(value.fieldId, true).find((option) => option.id === value.id) as FieldOption;
    })();
  }

  updateOption(
    id: string,
    input: FieldOptionUpdateInput | FieldOptionUpdateArgs | FieldOptionUpdateData,
  ): FieldOption {
    const optionId = identifier(id, "Field option id");
    const data = normalizeOptionUpdate(input);
    return this.db.transaction(() => {
      const current = this.db.prepare(`${OPTION_SELECT} WHERE id = @id`).get({ id: optionId });
      if (!current) throw new RecordNotFoundError("field option", optionId);
      const row = optionFromRow(current);
      const fields: string[] = [];
      const params: Record<string, string | number> = { id: optionId };
      if (data.label !== undefined) {
        fields.push("label = @label");
        params.label = normalizeLabel(data.label, "Field option label");
      }
      if (data.position !== undefined) {
        fields.push("position = @position");
        params.position = position(data.position, "Field option position");
      }
      if (fields.length > 0) this.db.prepare(`UPDATE field_options SET ${fields.join(", ")} WHERE id = @id`).run(params);
      return this.queryOptions(row.fieldId, true).find((option) => option.id === optionId) as FieldOption;
    })();
  }

  archiveOption(id: string): FieldOption {
    return this.setOptionArchived(id, nowIso());
  }

  restoreOption(id: string): FieldOption {
    return this.setOptionArchived(id, null);
  }

  private setOptionArchived(id: string, archivedAt: string | null): FieldOption {
    const optionId = identifier(id, "Field option id");
    return this.db.transaction(() => {
      const current = this.db.prepare(`${OPTION_SELECT} WHERE id = @id`).get({ id: optionId });
      if (!current) throw new RecordNotFoundError("field option", optionId);
      const fieldId = optionFromRow(current).fieldId;
      this.db.prepare("UPDATE field_options SET archived_at = @archivedAt WHERE id = @id").run({ id: optionId, archivedAt });
      return this.queryOptions(fieldId, true).find((option) => option.id === optionId) as FieldOption;
    })();
  }

  deleteOption(id: string): { id: string } {
    const optionId = identifier(id, "Field option id");
    return this.db.transaction(() => {
      const current = this.db.prepare(`${OPTION_SELECT} WHERE id = @id`).get({ id: optionId });
      if (!current) throw new RecordNotFoundError("field option", optionId);
      this.db.prepare("DELETE FROM field_options WHERE id = @id").run({ id: optionId });
      return { id: optionId };
    })();
  }

  listValues(input: FieldValueListOptions | CustomFieldEntity, recordId?: string, includeArchived = false): FieldValueDto[] {
    const options: FieldValueListOptions = typeof input === "string"
      ? { entity: input, recordId: recordId as string, includeArchived }
      : input;
    const object = objectValue(options, "Field value list options");
    const entityValue = entity(object.entity);
    const targetRecordId = identifier(object.recordId, "Field record id");
    const archived = object.includeArchived === undefined
      ? false
      : booleanValue(object.includeArchived, "includeArchived");
    this.recordExists(entityValue, targetRecordId);
    const target = ENTITY_TABLES[entityValue];
    const rows = this.db.prepare(`
      SELECT
        v.id,
        v.field_id AS fieldId,
        v.${target.column} AS recordId,
        v.text,
        v.number,
        v.date,
        v.bool,
        v.option_id AS optionId,
        v.user_id AS userId,
        v.updated_at AS updatedAt,
        d.entity,
        d.type,
        d.key,
        d.label,
        d.agent_filled AS agentFilled,
        d.agent_brief AS agentBrief,
        d.required,
        d.show_on_sheet AS showOnSheet,
        d.show_on_table AS showOnTable,
        d.show_on_filter AS showOnFilter,
        d.position,
        d.archived_at AS archivedAt,
        d.created_at AS createdAt,
        d.updated_at AS definitionUpdatedAt
      FROM field_values AS v
      JOIN field_definitions AS d ON d.id = v.field_id
      WHERE v.${target.column} = @recordId${archived ? "" : " AND d.archived_at IS NULL"}
      ORDER BY d.position ASC, d.id ASC
    `).all({ recordId: targetRecordId });
    return rows.map((value) => {
      const row = objectValue(value, "Field value row");
      const definition = definitionFromRow({
        id: row.fieldId,
        entity: row.entity,
        key: row.key,
        label: row.label,
        type: row.type,
        agentFilled: row.agentFilled,
        agentBrief: row.agentBrief,
        required: row.required,
        showOnSheet: row.showOnSheet,
        showOnTable: row.showOnTable,
        showOnFilter: row.showOnFilter,
        position: row.position,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.definitionUpdatedAt,
      }, []);
      return this.valueDto(entityValue, targetRecordId, definition, row);
    });
  }

  valuesFor(entityValue: CustomFieldEntity, recordId: string, includeArchived = false): FieldValueDto[] {
    return this.listValues({ entity: entityValue, recordId, includeArchived });
  }

  upsertValue(input: FieldValueCreateInput): FieldValueDto {
    const value = normalizeValueInput(input);
    return this.db.transaction(() => {
      this.recordExists(value.entity, value.recordId);
      const definition = this.activeDefinition(value.fieldId);
      if (definition.entity !== value.entity) {
        throw new FieldValueError(definition.key, `That field belongs to ${definition.entity}, not ${value.entity}.`);
      }
      const options = this.queryOptions(value.fieldId, true);
      const normalized = normalizeStoredValue(value.value, definition, options);
      const existing = this.valueRow(value.entity, value.recordId, value.fieldId);
      if (normalized.column === null) {
        if (existing) this.db.prepare("DELETE FROM field_values WHERE id = @id").run({ id: rowString(existing.id, "Field value id") });
        return {
          id: existing ? rowString(existing.id, "Field value id") : value.id,
          fieldId: value.fieldId,
          entity: value.entity,
          recordId: value.recordId,
          value: null,
          updatedAt: nowIso(),
        };
      }
      const columns = Object.fromEntries(FIELD_VALUE_COLUMNS.map((column) => [column, null])) as Record<FieldValueColumn, string | number | null>;
      columns[normalized.column] = normalized.stored;
      const updatedAt = nowIso();
      if (existing) {
        this.db.prepare(`
          UPDATE field_values
          SET text = @text, number = @number, date = @date, bool = @bool,
              option_id = @optionId, user_id = @userId, updated_at = @updatedAt
          WHERE id = @id
        `).run({
          id: rowString(existing.id, "Field value id"),
          text: columns.text,
          number: columns.number,
          date: columns.date,
          bool: columns.bool,
          optionId: columns.option_id,
          userId: columns.user_id,
          updatedAt,
        });
      } else {
        const target = ENTITY_TABLES[value.entity];
        this.db.prepare(`
          INSERT INTO field_values (
            id, field_id, ${target.column}, text, number, date, bool, option_id, user_id, updated_at
          ) VALUES (
            @id, @fieldId, @recordId, @text, @number, @date, @bool, @optionId, @userId, @updatedAt
          )
        `).run({
          id: value.id,
          fieldId: value.fieldId,
          recordId: value.recordId,
          text: columns.text,
          number: columns.number,
          date: columns.date,
          bool: columns.bool,
          optionId: columns.option_id,
          userId: columns.user_id,
          updatedAt,
        });
      }
      const row = this.valueRow(value.entity, value.recordId, value.fieldId);
      if (!row) throw new Error("Field value could not be read after write.");
      return this.valueDto(value.entity, value.recordId, definition, row);
    })();
  }

  createValue(input: FieldValueCreateInput): FieldValueDto {
    return this.upsertValue(input);
  }

  updateValue(input: FieldValueUpdateInput): FieldValueDto {
    const value = normalizeValueInput(input);
    return this.db.transaction(() => {
      const target = this.valueRow(value.entity, value.recordId, value.fieldId);
      if (!target || rowString(target.id, "Field value id") !== value.id) {
        throw new RecordNotFoundError("field value", value.id);
      }
      return this.upsertValue(value);
    })();
  }

  deleteValue(input: { id: string; entity: CustomFieldEntity; recordId: string; fieldId: string }): { id: string } {
    const object = objectValue(input, "Field value delete input");
    assertKeys(object, VALUE_DELETE_KEYS, "Field value delete input");
    const valueId = identifier(object.id, "Field value id");
    const entityValue = entity(object.entity);
    const record = identifier(object.recordId, "Field record id");
    const fieldId = identifier(object.fieldId, "Field id");
    return this.db.transaction(() => {
      const current = this.valueRow(entityValue, record, fieldId);
      if (!current || rowString(current.id, "Field value id") !== valueId) {
        throw new RecordNotFoundError("field value", valueId);
      }
      this.db.prepare("DELETE FROM field_values WHERE id = @id").run({ id: valueId });
      return { id: valueId };
    })();
  }
}

export function createCustomFieldStore(db: Db): CustomFieldStore {
  return new CustomFieldStore(db);
}

export const createFieldStore = createCustomFieldStore;

export function listFieldDefinitions(db: Db, input: FieldDefinitionListOptions | CustomFieldEntity, includeArchived = false): FieldDefinition[] {
  return new CustomFieldStore(db).list(input, includeArchived);
}

export function getFieldDefinition(db: Db, id: string, options?: { includeArchived?: boolean }): FieldDefinition | null {
  return new CustomFieldStore(db).get(id, options);
}

export function getFieldByKey(db: Db, entityValue: CustomFieldEntity, key: string): FieldDefinition {
  return new CustomFieldStore(db).byKey(entityValue, key);
}

export function listFilterableFields(db: Db, entityValue: CustomFieldEntity): FieldDefinition[] {
  return new CustomFieldStore(db).filterable(entityValue);
}

export function getFieldCoverage(db: Db, id: string): { filled: number; total: number } {
  return new CustomFieldStore(db).coverage(id);
}

export function listMissingFieldRecordIds(
  db: Db,
  id: string,
  limit = CUSTOM_FIELD_BACKFILL_MAX_RECORDS,
): string[] {
  return new CustomFieldStore(db).missingRecordIds(id, limit);
}

export function createFieldDefinition(db: Db, input: FieldDefinitionCreateInput): FieldDefinition {
  return new CustomFieldStore(db).create(input);
}

export function updateFieldDefinition(
  db: Db,
  id: string,
  input: FieldDefinitionUpdateInput | FieldDefinitionUpdateArgs | FieldDefinitionUpdateData,
): FieldDefinition {
  return new CustomFieldStore(db).update(id, input);
}

export function reorderFieldDefinitions(db: Db, input: { entity: CustomFieldEntity; ids: readonly string[] }): FieldDefinition[] {
  return new CustomFieldStore(db).reorder(input);
}

export function archiveFieldDefinition(db: Db, id: string): FieldDefinition {
  return new CustomFieldStore(db).archive(id);
}

export function restoreFieldDefinition(db: Db, id: string): FieldDefinition {
  return new CustomFieldStore(db).restore(id);
}

export function deleteFieldDefinition(db: Db, id: string): { id: string } {
  return new CustomFieldStore(db).delete(id);
}

export function listFieldOptions(db: Db, input: FieldOptionListOptions | string, includeArchived = false): FieldOption[] {
  return new CustomFieldStore(db).listOptions(input, includeArchived);
}

export function createFieldOption(db: Db, input: FieldOptionCreateInput): FieldOption {
  return new CustomFieldStore(db).createOption(input);
}

export function updateFieldOption(
  db: Db,
  id: string,
  input: FieldOptionUpdateInput | FieldOptionUpdateArgs | FieldOptionUpdateData,
): FieldOption {
  return new CustomFieldStore(db).updateOption(id, input);
}

export function archiveFieldOption(db: Db, id: string): FieldOption {
  return new CustomFieldStore(db).archiveOption(id);
}

export function restoreFieldOption(db: Db, id: string): FieldOption {
  return new CustomFieldStore(db).restoreOption(id);
}

export function deleteFieldOption(db: Db, id: string): { id: string } {
  return new CustomFieldStore(db).deleteOption(id);
}

export function listFieldValues(db: Db, input: FieldValueListOptions | CustomFieldEntity, recordId?: string, includeArchived = false): FieldValueDto[] {
  return new CustomFieldStore(db).listValues(input, recordId, includeArchived);
}

export function upsertFieldValue(db: Db, input: FieldValueCreateInput): FieldValueDto {
  return new CustomFieldStore(db).upsertValue(input);
}

export function createFieldValue(db: Db, input: FieldValueCreateInput): FieldValueDto {
  return new CustomFieldStore(db).createValue(input);
}

export function updateFieldValue(db: Db, input: FieldValueUpdateInput): FieldValueDto {
  return new CustomFieldStore(db).updateValue(input);
}

export function deleteFieldValue(db: Db, input: { id: string; entity: CustomFieldEntity; recordId: string; fieldId: string }): { id: string } {
  return new CustomFieldStore(db).deleteValue(input);
}
