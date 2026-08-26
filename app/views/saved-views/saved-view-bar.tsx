import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { Input } from "../../../components/ui/input.js";
import type {
  FieldEntity,
  Id,
  SavedView,
  SavedViewCreateInput,
  SavedViewFilters,
  SavedViewUpdateInput,
} from "../../../contracts/core.js";
import { AlertDialog, RecordDrawer } from "../../components/index.js";
import { cn } from "../../../lib/utils.js";
import { useSavedViewsRpc, type SavedViewsRpcClient } from "./rpc.js";

const DEFAULT_OWNER_ID = "local_user" as Id;

const SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const CHECKBOX_CLASS =
  "size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const DEFAULT_FILTERS: SavedViewFilters = {
  q: "",
  sort: "",
  dir: "asc",
  archived: false,
  filters: {},
  columns: [],
};

const ENTITY_LABELS: Record<FieldEntity, string> = {
  COMPANY: "companies",
  CONTACT: "contacts",
  DEAL: "deals",
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function cloneFilters(filters: SavedViewFilters): SavedViewFilters {
  return {
    q: filters.q,
    sort: filters.sort,
    dir: filters.dir,
    archived: filters.archived,
    filters: Object.fromEntries(
      Object.entries(filters.filters).map(([key, values]) => [key, [...values]]),
    ),
    columns: [...filters.columns],
  };
}

function isOwnedBy(view: SavedView, ownerId: Id): boolean {
  if (view.mine !== undefined) return view.mine;
  return view.ownerId === ownerId;
}

function sharingLabel(view: SavedView, ownerId: Id): string {
  if (view.shared) return "Shared";
  return isOwnedBy(view, ownerId) ? "Private" : "Private view";
}

export interface SavedViewBarProps {
  /** Entity whose table state is represented by these saved views. */
  entity: FieldEntity;
  /** The live list/search/filter state supplied by the parent workspace. */
  currentFilters: SavedViewFilters;
  /** Applies a saved or reset state back to the parent list view. */
  onApplyFilters?: (filters: SavedViewFilters, view: SavedView | null) => void;
  /** Optional injection keeps the control independently previewable/testable. */
  rpcClient?: SavedViewsRpcClient;
  /** BB app identity is not currently exposed to plugin UI code. */
  ownerId?: Id;
  className?: string;
}

export function SavedViewBar({
  entity,
  currentFilters,
  onApplyFilters,
  rpcClient,
  ownerId,
  className,
}: SavedViewBarProps) {
  const contextRpc = useSavedViewsRpc();
  const rpc = rpcClient ?? contextRpc;
  const barId = useId();
  const effectiveOwnerId = ownerId?.trim()
    ? (ownerId.trim() as Id)
    : DEFAULT_OWNER_ID;
  const entityLabel = ENTITY_LABELS[entity];
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [defaultViewId, setDefaultViewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "update" | "default" | "delete" | null
  >(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveShared, setSaveShared] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const onApplyFiltersRef = useRef(onApplyFilters);

  useEffect(() => {
    onApplyFiltersRef.current = onApplyFilters;
  }, [onApplyFilters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSelectedViewId(null);
    void rpc
      .call("savedViews_list", { entity })
      .then((next) => {
        if (!active) return;
        const defaultView = next.find((view) => view.isDefault) ?? null;
        setViews(next);
        setDefaultViewId(defaultView?.id ?? null);
        setSelectedViewId(defaultView?.id ?? null);
        if (defaultView) {
          setStatusMessage(`Showing default view ${defaultView.name}.`);
          onApplyFiltersRef.current?.(cloneFilters(defaultView.filters), defaultView);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entity, refreshKey, rpc]);

  const selectedView = useMemo(
    () =>
      selectedViewId === null
        ? null
        : views.find((view) => view.id === selectedViewId) ?? null,
    [selectedViewId, views],
  );

  const resetFilters = useCallback(() => {
    const defaultView = views.find((view) => view.id === defaultViewId) ?? null;
    if (defaultView) {
      setSelectedViewId(defaultView.id);
      setStatusMessage(`Showing default view ${defaultView.name}.`);
      onApplyFilters?.(cloneFilters(defaultView.filters), defaultView);
      return;
    }
    setSelectedViewId(null);
    setStatusMessage("Showing the base filters.");
    onApplyFilters?.(cloneFilters(DEFAULT_FILTERS), null);
  }, [defaultViewId, onApplyFilters, views]);

  const chooseView = (viewId: string) => {
    if (!viewId) {
      resetFilters();
      return;
    }
    const view = views.find((candidate) => candidate.id === viewId);
    if (!view) return;
    setSelectedViewId(view.id);
    setStatusMessage(`Showing ${view.name}.`);
    onApplyFilters?.(cloneFilters(view.filters), view);
  };

  const openSaveDrawer = () => {
    setSaveName("");
    setSaveShared(false);
    setSaveError(null);
    setSaveOpen(true);
  };

  const saveCurrentView = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = saveName.trim();
    if (!name) {
      setSaveError("A view name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setStatusMessage(null);
    const input: SavedViewCreateInput = {
      entity,
      name,
      shared: saveShared,
      filters: cloneFilters(currentFilters),
    };
    try {
      const created = await rpc.call("savedViews_create", input);
      setViews((current) =>
        [...current, created].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setSelectedViewId(created.id);
      setSaveOpen(false);
      setSaveName("");
      setSaveShared(false);
      setStatusMessage(`${created.name} saved.`);
      onApplyFilters?.(cloneFilters(created.filters), created);
    } catch (cause) {
      setSaveError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const updateCurrentView = async () => {
    if (!selectedView || !isOwnedBy(selectedView, effectiveOwnerId)) return;
    setBusyAction("update");
    setError(null);
    setStatusMessage(null);
    const input: SavedViewUpdateInput = {
      id: selectedView.id,
      data: { filters: cloneFilters(currentFilters) },
    };
    try {
      const updated = await rpc.call("savedViews_update", input);
      setViews((current) =>
        current.map((view) => (view.id === updated.id ? updated : view)),
      );
      setStatusMessage(`${updated.name} updated.`);
      onApplyFilters?.(cloneFilters(updated.filters), updated);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  };

  const setSelectedAsDefault = async () => {
    if (!selectedView || !isOwnedBy(selectedView, effectiveOwnerId)) return;
    setBusyAction("default");
    setError(null);
    setStatusMessage(null);
    try {
      const updated = await rpc.call("savedViews_setDefault", {
        id: selectedView.id,
      });
      setDefaultViewId(updated.id);
      setViews((current) =>
        current.map((view) => ({
          ...view,
          isDefault: view.id === updated.id,
        })),
      );
      setStatusMessage(`${updated.name} is now the default view.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  };

  const deleteSelectedView = async () => {
    if (!selectedView || !isOwnedBy(selectedView, effectiveOwnerId)) return;
    setBusyAction("delete");
    setError(null);
    setStatusMessage(null);
    try {
      await rpc.call("savedViews_delete", { id: selectedView.id });
      const deletedWasDefault = selectedView.id === defaultViewId;
      setViews((current) =>
        current.filter((view) => view.id !== selectedView.id),
      );
      setSelectedViewId(null);
      if (deletedWasDefault) setDefaultViewId(null);
      setStatusMessage(`${selectedView.name} deleted.`);
      onApplyFilters?.(cloneFilters(DEFAULT_FILTERS), null);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className={cn("min-w-0 space-y-3", className)}
      data-component="saved-view-bar"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2 sm:max-w-md">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`${barId}-chooser`}
          >
            Saved views
          </label>
          <div className="relative">
            <Icon
              name="ListView"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <select
              id={`${barId}-chooser`}
              className={cn(SELECT_CLASS, "pl-9")}
              value={selectedViewId ?? ""}
              disabled={loading}
              aria-label="Saved views"
              onChange={(event) => chooseView(event.target.value)}
            >
              <option value="">Base filters</option>
              {views.map((view) => {
                const isDefault = view.id === defaultViewId || view.isDefault;
                return (
                  <option key={view.id} value={view.id}>
                    {view.name} · {sharingLabel(view, effectiveOwnerId)}
                    {isDefault ? " · Default" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || selectedViewId === null}
            onClick={resetFilters}
          >
            <Icon name="RotateCcw" aria-hidden="true" />
            Reset
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={openSaveDrawer}
          >
            <Icon name="Plus" aria-hidden="true" />
            Save current view
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground" role="status">
          Loading saved views…
        </p>
      ) : views.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No saved views for {entityLabel} yet. Save the current table state to
          reuse it later.
        </p>
      ) : null}

      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {selectedView ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="truncate font-medium">{selectedView.name}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Icon
                name={selectedView.shared ? "Globe" : "Lock"}
                aria-hidden="true"
                className="size-3.5"
              />
              {sharingLabel(selectedView, effectiveOwnerId)}
            </span>
            <span className="text-muted-foreground">
              Owner: {selectedView.ownerId ?? effectiveOwnerId}
            </span>
            {selectedView.id === defaultViewId || selectedView.isDefault ? (
              <span className="text-muted-foreground">Default</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={
                busyAction !== null || !isOwnedBy(selectedView, effectiveOwnerId)
              }
              onClick={() => void updateCurrentView()}
            >
              <Icon name="Edit" aria-hidden="true" />
              {busyAction === "update" ? "Updating…" : "Update view"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={
                busyAction !== null ||
                selectedView.id === defaultViewId ||
                !isOwnedBy(selectedView, effectiveOwnerId)
              }
              onClick={() => void setSelectedAsDefault()}
            >
              <Icon name="Star" aria-hidden="true" />
              {busyAction === "default" ? "Saving…" : "Set as default"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={
                busyAction !== null || !isOwnedBy(selectedView, effectiveOwnerId)
              }
              onClick={() => setDeleteOpen(true)}
            >
              <Icon name="Trash2" aria-hidden="true" />
              {busyAction === "delete" ? "Deleting…" : "Delete view"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          Base filters are active.
        </p>
      )}

      {statusMessage ? (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {statusMessage}
        </p>
      ) : null}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete the saved view “${selectedView?.name ?? "this view"}”?`}
        description="This removes the saved filters for everyone who can access this view."
        confirmLabel="Delete view"
        destructive
        disabled={selectedView === null || busyAction !== null}
        onConfirm={deleteSelectedView}
      />

      <RecordDrawer
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save current view"
        description={`Save the current ${entityLabel} table state for reuse.`}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form={`${barId}-save-form`} disabled={saving}>
              {saving ? "Saving…" : "Save view"}
            </Button>
          </>
        }
      >
        <form
          id={`${barId}-save-form`}
          className="space-y-5"
          onSubmit={(event) => void saveCurrentView(event)}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${barId}-name`}>
              View name
            </label>
            <Input
              id={`${barId}-name`}
              autoFocus
              required
              maxLength={120}
              value={saveName}
              disabled={saving}
              onChange={(event) => {
                setSaveName(event.target.value);
                setSaveError(null);
              }}
              placeholder="Enterprise accounts"
            />
          </div>
          <label
            className="flex items-start gap-3 rounded-md border border-border px-3 py-3"
            htmlFor={`${barId}-shared`}
          >
            <input
              id={`${barId}-shared`}
              type="checkbox"
              className={CHECKBOX_CLASS}
              checked={saveShared}
              disabled={saving}
              onChange={(event) => setSaveShared(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Share with the workspace</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Shared views are visible to other CRM users. This view is
                created for {effectiveOwnerId}.
              </span>
            </span>
          </label>
          {saveError ? (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          ) : null}
        </form>
      </RecordDrawer>
    </div>
  );
}
