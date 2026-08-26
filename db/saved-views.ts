import {
  FIELD_ENTITIES,
  newRecordId,
  nowIso,
  RecordNotFoundError,
  requiredText,
  type Db,
  type FieldEntity,
} from "./types.js";

/** The record tables for which the source CRM exposes saved views. */
export const SAVED_VIEW_ENTITIES = FIELD_ENTITIES;
export type SavedViewEntity = FieldEntity;

export const SAVED_VIEW_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SavedViewSortDirection = (typeof SAVED_VIEW_SORT_DIRECTIONS)[number];

/**
 * The source CRM's initial table state.  A default is deliberately kept as
 * application state rather than a row: source saved views have no default
 * column, and this keeps the existing table schema/source semantics intact.
 */
export interface SavedViewFilters {
  q: string;
  sort: string;
  dir: SavedViewSortDirection;
  archived: boolean;
  filters: Record<string, string[]>;
  columns: string[];
}

export type SavedViewFiltersInput = Partial<{
  q: string;
  sort: string;
  dir: SavedViewSortDirection;
  archived: boolean;
  filters: Record<string, readonly string[]>;
  columns: readonly string[];
}>;

export const DEFAULT_SAVED_VIEW_FILTERS: SavedViewFilters = {
  q: "",
  sort: "",
  dir: "asc",
  archived: false,
  filters: {},
  columns: [],
};

export interface SavedView {
  id: string;
  entity: SavedViewEntity;
  name: string;
  shared: boolean;
  filters: SavedViewFilters;
  ownerId: string;
  /** Present when the caller supplied a viewer/owner context. */
  mine?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewCreateInput {
  id?: string;
  entity: SavedViewEntity;
  name: string;
  shared?: boolean;
  filters?: SavedViewFiltersInput;
  /** Convenience for direct store callers; RPC callers pass this separately. */
  ownerId?: string;
}

export interface SavedViewUpdateInput {
  name?: string;
  shared?: boolean;
  filters?: SavedViewFiltersInput;
}

export interface SavedViewUpdateArgs {
  id: string;
  data: SavedViewUpdateInput;
}

export interface SavedViewListOptions {
  entity: SavedViewEntity;
  /** The authenticated viewer.  `ownerId` is an alias retained for store callers. */
  ownerId?: string;
  viewerId?: string;
  /** Defaults to true for an authenticated viewer, matching source behavior. */
  includeShared?: boolean;
  /** Return only views owned by the authenticated viewer. */
  mineOnly?: boolean;
}

export interface SavedViewAccessOptions {
  ownerId?: string;
  viewerId?: string;
  includeShared?: boolean;
}

export class SavedViewConflictError extends Error {
  readonly code = "CONFLICT" as const;

  constructor(message = "You already have a saved view with that name.") {
    super(message);
    this.name = "SavedViewConflictError";
  }
}

const FILTER_KEYS = new Set([
  "q",
  "sort",
  "dir",
  "archived",
  "filters",
  "columns",
]);
const CREATE_KEYS = new Set(["id", "entity", "name", "shared", "filters", "ownerId"]);
const UPDATE_KEYS = new Set(["name", "shared", "filters"]);

const SAVED_VIEW_SELECT = `
  SELECT
    id,
    entity,
    name,
    shared,
    filters,
    owner_id AS ownerId,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM saved_views`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function entity(value: unknown): SavedViewEntity {
  const candidate = stringValue(value, "Saved view entity");
  if ((SAVED_VIEW_ENTITIES as readonly string[]).includes(candidate)) {
    return candidate as SavedViewEntity;
  }
  throw new Error(`Invalid saved view entity: ${candidate}.`);
}

function direction(value: unknown): SavedViewSortDirection {
  const candidate = stringValue(value, "Saved view sort direction");
  if ((SAVED_VIEW_SORT_DIRECTIONS as readonly string[]).includes(candidate)) {
    return candidate as SavedViewSortDirection;
  }
  throw new Error(`Invalid saved view sort direction: ${candidate}.`);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function normalizeColumns(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Saved view columns must be an array of strings.");
  return value.map((column, index) => {
    const normalized = stringValue(column, `Saved view column ${index}`).trim();
    if (!normalized) throw new Error(`Saved view column ${index} is required.`);
    return normalized;
  });
}

function normalizeFilterMap(value: unknown): Record<string, string[]> {
  if (!isPlainObject(value)) throw new Error("Saved view filters must be an object.");
  const result: Record<string, string[]> = {};
  for (const [key, selected] of Object.entries(value)) {
    if (!Array.isArray(selected)) {
      throw new Error(`Saved view filter ${key} must be an array of strings.`);
    }
    result[key] = selected.map((item, index) =>
      stringValue(item, `Saved view filter ${key}[${index}]`),
    );
  }
  return result;
}

/** Parse persisted or RPC filter JSON with the same defaults as the source contract. */
export function parseSavedViewFilters(value: unknown = {}): SavedViewFilters {
  if (!isPlainObject(value)) throw new Error("Saved view filters must be a JSON object.");
  assertKeys(value, FILTER_KEYS, "Saved view filters");

  const q = value.q === undefined ? "" : stringValue(value.q, "Saved view query");
  const sort = value.sort === undefined
    ? ""
    : stringValue(value.sort, "Saved view sort").trim();
  const dir = value.dir === undefined ? "asc" : direction(value.dir);
  const archived = value.archived === undefined
    ? false
    : booleanValue(value.archived, "Saved view archived flag");
  const filters = value.filters === undefined ? {} : normalizeFilterMap(value.filters);
  const columns = value.columns === undefined ? [] : normalizeColumns(value.columns);

  return { q, sort, dir, archived, filters, columns };
}

/** Alias used by callers that want to emphasize normalization before writing. */
export const normalizeSavedViewFilters = parseSavedViewFilters;

function cloneFilters(value: SavedViewFilters): SavedViewFilters {
  return {
    q: value.q,
    sort: value.sort,
    dir: value.dir,
    archived: value.archived,
    filters: Object.fromEntries(
      Object.entries(value.filters).map(([key, selected]) => [key, [...selected]]),
    ),
    columns: [...value.columns],
  };
}

function encodeFilters(value: unknown): string {
  const normalized = parseSavedViewFilters(value);
  const encoded = JSON.stringify(normalized);
  if (encoded === undefined) throw new Error("Saved view filters must be JSON serializable.");
  return encoded;
}

function decodeFilters(value: unknown): SavedViewFilters {
  if (typeof value !== "string") throw new Error("Saved view filters are not JSON text.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Saved view filters are not valid JSON.");
  }
  return parseSavedViewFilters(parsed);
}

function rowBoolean(value: unknown, label: string): boolean {
  if (value === 0 || value === false) return false;
  if (value === 1 || value === true) return true;
  throw new Error(`${label} must be 0 or 1 in SQLite.`);
}

function isUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (typeof candidate.message === "string" && candidate.message.includes("UNIQUE constraint failed: saved_views."));
}

function viewerFrom(options: SavedViewAccessOptions | undefined): string | undefined {
  if (!options) return undefined;
  const ownerId = options.ownerId === undefined ? undefined : identifier(options.ownerId, "Saved view owner");
  const viewerId = options.viewerId === undefined ? undefined : identifier(options.viewerId, "Saved view viewer");
  if (ownerId !== undefined && viewerId !== undefined && ownerId !== viewerId) {
    throw new Error("Saved view owner and viewer must match.");
  }
  return viewerId ?? ownerId;
}

function accessWhere(
  options: SavedViewAccessOptions | undefined,
  params: Record<string, string | number>,
): string {
  const viewer = viewerFrom(options);
  if (viewer !== undefined) {
    params.viewerId = viewer;
    if (options?.includeShared === false) return " AND owner_id = @viewerId";
    return " AND (owner_id = @viewerId OR shared = 1)";
  }
  if (options?.includeShared === false) return " AND shared = 0";
  return "";
}

function inputObject(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function normalizeName(value: unknown): string {
  const name = requiredText(stringValue(value, "Saved view name"), "Saved view name");
  if (name.length > 120) throw new Error("Saved view name must be at most 120 characters.");
  return name;
}

function rowToSavedView(value: unknown, viewerId?: string): SavedView {
  const row = inputObject(value, "Saved view row");
  const ownerId = identifier(row.ownerId, "Saved view owner");
  const result: SavedView = {
    id: identifier(row.id, "Saved view id"),
    entity: entity(row.entity),
    name: normalizeName(row.name),
    shared: rowBoolean(row.shared, "Saved view shared flag"),
    filters: decodeFilters(row.filters),
    ownerId,
    createdAt: identifier(row.createdAt, "Saved view created timestamp"),
    updatedAt: identifier(row.updatedAt, "Saved view updated timestamp"),
  };
  if (viewerId !== undefined) result.mine = ownerId === viewerId;
  return result;
}

function normalizeCreate(input: SavedViewCreateInput, ownerId?: string): {
  id: string;
  entity: SavedViewEntity;
  name: string;
  shared: boolean;
  filters: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
} {
  const object = inputObject(input, "Saved view input");
  assertKeys(object, CREATE_KEYS, "Saved view input");
  const inputOwner = object.ownerId === undefined ? undefined : identifier(object.ownerId, "Saved view owner");
  const owner = ownerId === undefined ? inputOwner : identifier(ownerId, "Saved view owner");
  if (owner === undefined) throw new Error("Saved view owner is required.");
  const id = object.id === undefined
    ? newRecordId("view")
    : identifier(object.id, "Saved view id");
  const normalizedName = normalizeName(object.name);
  const shared = object.shared === undefined ? false : booleanValue(object.shared, "Saved view shared flag");
  const filters = encodeFilters(object.filters);
  const timestamp = nowIso();
  return {
    id,
    entity: entity(object.entity),
    name: normalizedName,
    shared,
    filters,
    ownerId: owner,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeUpdate(input: SavedViewUpdateInput | SavedViewUpdateArgs): SavedViewUpdateInput {
  const object = inputObject(input, "Saved view update");
  if (Object.prototype.hasOwnProperty.call(object, "data")) {
    assertKeys(object, new Set(["data"]), "Saved view update");
    return normalizeUpdate(object.data as SavedViewUpdateInput);
  }
  assertKeys(object, UPDATE_KEYS, "Saved view update");
  const result: SavedViewUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(object, "name")) result.name = normalizeName(object.name);
  if (Object.prototype.hasOwnProperty.call(object, "shared")) {
    result.shared = booleanValue(object.shared, "Saved view shared flag");
  }
  if (Object.prototype.hasOwnProperty.call(object, "filters")) {
    result.filters = parseSavedViewFilters(object.filters);
  }
  return result;
}

export class SavedViewStore {
  constructor(private readonly db: Db) {}

  /** Return the source table's initial filter/sort/column state. */
  getDefault(entityValue?: SavedViewEntity): SavedViewFilters {
    if (entityValue !== undefined) entity(entityValue);
    return cloneFilters(DEFAULT_SAVED_VIEW_FILTERS);
  }

  default(entityValue?: SavedViewEntity): SavedViewFilters {
    return this.getDefault(entityValue);
  }

  list(input: SavedViewListOptions | SavedViewEntity, ownerId?: string): SavedView[] {
    const options: SavedViewListOptions = typeof input === "string"
      ? { entity: input, ownerId }
      : input;
    const record = inputObject(options, "Saved view list options");
    const entityValue = entity(record.entity);
    const access = record as unknown as SavedViewListOptions;
    const viewerId = viewerFrom(access);
    if (access.mineOnly && viewerId === undefined) {
      throw new Error("mineOnly saved view lists require an owner or viewer.");
    }
    const params: Record<string, string | number> = { entity: entityValue };
    let where = " WHERE entity = @entity";
    if (access.mineOnly) {
      params.viewerId = viewerId as string;
      where += " AND owner_id = @viewerId";
    } else {
      where += accessWhere(access, params);
    }
    const rows = this.db
      .prepare(`${SAVED_VIEW_SELECT}${where} ORDER BY name COLLATE NOCASE ASC, id ASC`)
      .all(params);
    return rows.map((row) => rowToSavedView(row, viewerId));
  }

  get(id: string, access?: SavedViewAccessOptions | string): SavedView | null {
    const recordId = identifier(id, "Saved view id");
    const options: SavedViewAccessOptions | undefined = typeof access === "string"
      ? { ownerId: access }
      : access;
    const params: Record<string, string | number> = { id: recordId };
    const where = ` WHERE id = @id${accessWhere(options, params)}`;
    const row = this.db.prepare(`${SAVED_VIEW_SELECT}${where}`).get(params);
    const viewerId = viewerFrom(options);
    return row ? rowToSavedView(row, viewerId) : null;
  }

  getRequired(id: string, access?: SavedViewAccessOptions | string): SavedView {
    const value = this.get(id, access);
    if (!value) throw new RecordNotFoundError("saved view", id);
    return value;
  }

  create(input: SavedViewCreateInput, ownerId?: string): SavedView {
    const value = normalizeCreate(input, ownerId);
    try {
      return this.db.transaction(() => {
        this.db.prepare(`
          INSERT INTO saved_views (
            id, entity, name, shared, filters, owner_id, created_at, updated_at
          ) VALUES (
            @id, @entity, @name, @shared, @filters, @ownerId, @createdAt, @updatedAt
          )
        `).run({
          id: value.id,
          entity: value.entity,
          name: value.name,
          shared: value.shared ? 1 : 0,
          filters: value.filters,
          ownerId: value.ownerId,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        });
        return this.getRequired(value.id, value.ownerId);
      })();
    } catch (error) {
      if (isUniqueConstraint(error)) throw new SavedViewConflictError();
      throw error;
    }
  }

  update(
    id: string,
    input: SavedViewUpdateInput | SavedViewUpdateArgs,
    ownerId?: string,
  ): SavedView {
    const recordId = identifier(id, "Saved view id");
    const data = normalizeUpdate(input);
    const viewerId = ownerId === undefined ? undefined : identifier(ownerId, "Saved view owner");
    try {
      return this.db.transaction(() => {
        const current = this.getRequired(recordId);
        if (viewerId !== undefined && current.ownerId !== viewerId) {
          throw new RecordNotFoundError("saved view", recordId);
        }
        const fields: string[] = [];
        const params: Record<string, string | number> = {
          id: recordId,
          updatedAt: nowIso(),
        };
        if (Object.prototype.hasOwnProperty.call(data, "name")) {
          fields.push("name = @name");
          params.name = data.name as string;
        }
        if (Object.prototype.hasOwnProperty.call(data, "shared")) {
          fields.push("shared = @shared");
          params.shared = data.shared ? 1 : 0;
        }
        if (Object.prototype.hasOwnProperty.call(data, "filters")) {
          fields.push("filters = @filters");
          params.filters = encodeFilters(data.filters);
        }
        if (fields.length > 0) {
          fields.push("updated_at = @updatedAt");
          this.db.prepare(`UPDATE saved_views SET ${fields.join(", ")} WHERE id = @id`).run(params);
        }
        return this.getRequired(recordId, viewerId);
      })();
    } catch (error) {
      if (isUniqueConstraint(error)) throw new SavedViewConflictError();
      throw error;
    }
  }

  delete(id: string, ownerId?: string): { id: string } {
    const recordId = identifier(id, "Saved view id");
    const viewerId = ownerId === undefined ? undefined : identifier(ownerId, "Saved view owner");
    return this.db.transaction(() => {
      const current = this.getRequired(recordId);
      if (viewerId !== undefined && current.ownerId !== viewerId) {
        throw new RecordNotFoundError("saved view", recordId);
      }
      this.db.prepare("DELETE FROM saved_views WHERE id = @id").run({ id: recordId });
      return { id: current.id };
    })();
  }

  remove(id: string, ownerId?: string): boolean {
    this.delete(id, ownerId);
    return true;
  }
}

export function createSavedViewStore(db: Db): SavedViewStore {
  return new SavedViewStore(db);
}

export function getDefaultSavedViewFilters(): SavedViewFilters {
  return cloneFilters(DEFAULT_SAVED_VIEW_FILTERS);
}

export function createSavedView(db: Db, input: SavedViewCreateInput, ownerId?: string): SavedView {
  return new SavedViewStore(db).create(input, ownerId);
}

export function getSavedView(
  db: Db,
  id: string,
  access?: SavedViewAccessOptions | string,
): SavedView | null {
  return new SavedViewStore(db).get(id, access);
}

export function listSavedViews(
  db: Db,
  input: SavedViewListOptions | SavedViewEntity,
  ownerId?: string,
): SavedView[] {
  return new SavedViewStore(db).list(input, ownerId);
}

export function updateSavedView(
  db: Db,
  id: string,
  input: SavedViewUpdateInput | SavedViewUpdateArgs,
  ownerId?: string,
): SavedView {
  return new SavedViewStore(db).update(id, input, ownerId);
}

export function deleteSavedView(db: Db, id: string, ownerId?: string): { id: string } {
  return new SavedViewStore(db).delete(id, ownerId);
}

export const getSavedViewDefault = getDefaultSavedViewFilters;
