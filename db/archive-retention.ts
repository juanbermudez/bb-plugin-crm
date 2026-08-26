import { nowIso, type Db } from "./types.js";
import {
  collectActivityStampTargets,
  emptyActivityStampTargets,
  mergeActivityStampTargets,
  recomputeActivityStamps,
} from "./activity-stamps.js";
import { purgeRecordArtifacts } from "./purge-artifacts.js";

/** The retention setting is deliberately bounded so a bad setting cannot
 * turn a maintenance sweep into an unbounded delete. */
export const DEFAULT_ARCHIVE_RETENTION_DAYS = 365;
export const MIN_ARCHIVE_RETENTION_DAYS = 1;
export const MAX_ARCHIVE_RETENTION_DAYS = 3_650;
export const DEFAULT_ARCHIVE_PRUNE_BATCH_SIZE = 100;
export const MAX_ARCHIVE_PRUNE_BATCH_SIZE = 1_000;

export interface ArchivePruneOptions {
  retentionDays?: number;
  now?: string | Date;
  /** Maximum number of top-level CRM records removed by one call. */
  batchSize?: number;
}

export interface ArchivePruneResult {
  retentionDays: number;
  cutoffAt: string;
  batchSize: number;
  companiesDeleted: number;
  contactsDeleted: number;
  dealsDeleted: number;
  totalDeleted: number;
  hasMore: boolean;
}

function boundedInteger(
  value: number | undefined,
  label: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return resolved;
}

function normalizeTimestamp(value: string | Date | undefined): string {
  const date = value === undefined
    ? new Date()
    : value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Archive prune timestamp must be valid.");
  return date.toISOString();
}

function cutoffAt(now: string, retentionDays: number): string {
  return new Date(Date.parse(now) - retentionDays * 86_400_000).toISOString();
}

function expiredIds(
  db: Db,
  table: "deals" | "contacts",
  cutoff: string,
  limit: number,
): string[] {
  if (limit <= 0) return [];
  return (db.prepare(`
    SELECT id
    FROM ${table}
    WHERE archived_at IS NOT NULL AND archived_at < ?
    ORDER BY archived_at ASC, id ASC
    LIMIT ?
  `).all(cutoff, limit) as Array<{ id: string }>).map((row) => row.id);
}

function deleteIds(db: Db, table: "deals" | "contacts" | "companies", ids: readonly string[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  return Number(db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids).changes);
}

/**
 * Permanently remove expired archived CRM records in dependency order.
 *
 * Deals are removed before companies because the schema intentionally uses a
 * cascading company -> deal foreign key. A company is therefore only deleted
 * when it has no remaining deals; an active deal can never be removed as a
 * side effect of an archive-retention sweep. Contacts are independent of that
 * dependency and can be removed in the same bounded transaction.
 */
export function pruneArchivedRecords(
  db: Db,
  options: ArchivePruneOptions = {},
): ArchivePruneResult {
  const retentionDays = boundedInteger(
    options.retentionDays,
    "Archive retention days",
    DEFAULT_ARCHIVE_RETENTION_DAYS,
    MIN_ARCHIVE_RETENTION_DAYS,
    MAX_ARCHIVE_RETENTION_DAYS,
  );
  const batchSize = boundedInteger(
    options.batchSize,
    "Archive prune batch size",
    DEFAULT_ARCHIVE_PRUNE_BATCH_SIZE,
    1,
    MAX_ARCHIVE_PRUNE_BATCH_SIZE,
  );
  const now = normalizeTimestamp(options.now);
  const cutoff = cutoffAt(now, retentionDays);

  const result = db.transaction(() => {
    let remaining = batchSize;
    let companiesDeleted = 0;
    let contactsDeleted = 0;
    let dealsDeleted = 0;
    const targets = emptyActivityStampTargets();

    if (remaining > 0) {
      const ids = expiredIds(db, "deals", cutoff, remaining);
      mergeActivityStampTargets(
        targets,
        collectActivityStampTargets(
          db,
          ids.length === 0 ? "1 = 0" : `deal_id IN (${ids.map(() => "?").join(", ")})`,
          ids,
        ),
      );
      for (const id of ids) purgeRecordArtifacts(db, "DEAL", id);
      dealsDeleted = deleteIds(db, "deals", ids);
      remaining -= dealsDeleted;
    }

    if (remaining > 0) {
      const ids = expiredIds(db, "contacts", cutoff, remaining);
      mergeActivityStampTargets(
        targets,
        collectActivityStampTargets(
          db,
          ids.length === 0 ? "1 = 0" : `contact_id IN (${ids.map(() => "?").join(", ")})`,
          ids,
        ),
      );
      for (const id of ids) purgeRecordArtifacts(db, "CONTACT", id);
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(", ");
        db.prepare(`
          INSERT INTO suppressed_contacts (email, reason)
          SELECT
            lower(trim(email)),
            'Deleted from the CRM (' || trim(
            first_name || CASE
                WHEN last_name IS NULL OR trim(last_name) = '' THEN ''
                ELSE ' ' || trim(last_name)
              END
            ) || ')'
          FROM contacts
          WHERE id IN (${placeholders})
            AND email IS NOT NULL
            AND length(trim(email)) > 0
          ON CONFLICT(email) DO NOTHING
        `).run(...ids);
      }
      contactsDeleted = deleteIds(db, "contacts", ids);
      remaining -= contactsDeleted;
    }

    // Never delete a company while a deal still points at it. This also makes
    // the sweep safe if an operator archived the company before its deals.
    if (remaining > 0) {
      const ids = (db.prepare(`
        SELECT c.id
        FROM companies c
        WHERE c.archived_at IS NOT NULL AND c.archived_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM deals d WHERE d.company_id = c.id
          )
        ORDER BY c.archived_at ASC, c.id ASC
        LIMIT ?
      `).all(cutoff, remaining) as Array<{ id: string }>).map((row) => row.id);
      mergeActivityStampTargets(
        targets,
        collectActivityStampTargets(
          db,
          ids.length === 0
            ? "1 = 0"
            : `(company_id IN (${ids.map(() => "?").join(", ")}) OR
                deal_id IN (SELECT id FROM deals WHERE company_id IN (${ids.map(() => "?").join(", ")})))`,
          [...ids, ...ids],
        ),
      );
      for (const id of ids) purgeRecordArtifacts(db, "COMPANY", id);
      companiesDeleted = deleteIds(db, "companies", ids);
    }

    // The parent deletes above cascade activities, so all target ids must have
    // been captured before the cascades. Restamp only rows that survived.
    recomputeActivityStamps(db, targets);

    return {
      companiesDeleted,
      contactsDeleted,
      dealsDeleted,
    };
  })();

  const hasMore = Boolean(
    db.prepare(`
      SELECT 1
      FROM deals
      WHERE archived_at IS NOT NULL AND archived_at < ?
      LIMIT 1
    `).get(cutoff) ??
    db.prepare(`
      SELECT 1
      FROM contacts
      WHERE archived_at IS NOT NULL AND archived_at < ?
      LIMIT 1
    `).get(cutoff) ??
    db.prepare(`
      SELECT 1
      FROM companies c
      WHERE c.archived_at IS NOT NULL AND c.archived_at < ?
        AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.company_id = c.id)
      LIMIT 1
    `).get(cutoff),
  );

  return {
    retentionDays,
    cutoffAt: cutoff,
    batchSize,
    ...result,
    totalDeleted: result.companiesDeleted + result.contactsDeleted + result.dealsDeleted,
    hasMore,
  };
}

/** Small helper for callers that need a stable maintenance timestamp. */
export function archiveRetentionNow(): string {
  return nowIso();
}
