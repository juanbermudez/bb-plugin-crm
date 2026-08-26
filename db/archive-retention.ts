import { nowIso, type Db } from "./types.js";

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

    const deleteDeals = db.prepare(`
      DELETE FROM deals
      WHERE id IN (
        SELECT id
        FROM deals
        WHERE archived_at IS NOT NULL AND archived_at < ?
        ORDER BY archived_at ASC, id ASC
        LIMIT ?
      )
    `);
    if (remaining > 0) {
      dealsDeleted = Number(deleteDeals.run(cutoff, remaining).changes);
      remaining -= dealsDeleted;
    }

    const deleteContacts = db.prepare(`
      DELETE FROM contacts
      WHERE id IN (
        SELECT id
        FROM contacts
        WHERE archived_at IS NOT NULL AND archived_at < ?
        ORDER BY archived_at ASC, id ASC
        LIMIT ?
      )
    `);
    if (remaining > 0) {
      contactsDeleted = Number(deleteContacts.run(cutoff, remaining).changes);
      remaining -= contactsDeleted;
    }

    // Never delete a company while a deal still points at it. This also makes
    // the sweep safe if an operator archived the company before its deals.
    const deleteCompanies = db.prepare(`
      DELETE FROM companies
      WHERE id IN (
        SELECT c.id
        FROM companies c
        WHERE c.archived_at IS NOT NULL AND c.archived_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM deals d WHERE d.company_id = c.id
          )
        ORDER BY c.archived_at ASC, c.id ASC
        LIMIT ?
      )
    `);
    if (remaining > 0) {
      companiesDeleted = Number(deleteCompanies.run(cutoff, remaining).changes);
    }

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
