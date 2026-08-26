import type { Db } from "./types.js";

export interface ActivityStampTargets {
  companyIds: string[];
  contactIds: string[];
  dealIds: string[];
}

export function emptyActivityStampTargets(): ActivityStampTargets {
  return { companyIds: [], contactIds: [], dealIds: [] };
}

/**
 * Capture every record whose latest-activity aggregate may change when the
 * matching activity rows are removed. Call this before the parent delete,
 * because the foreign-key cascades remove those activity rows as part of it.
 */
export function collectActivityStampTargets(
  db: Db,
  where: string,
  params: readonly (string | number)[] = [],
): ActivityStampTargets {
  const rows = db
    .prepare(`
      SELECT DISTINCT
        company_id AS companyId,
        contact_id AS contactId,
        deal_id AS dealId
      FROM activities
      WHERE ${where}
    `)
    .all(...params) as Array<{
      companyId: string | null;
      contactId: string | null;
      dealId: string | null;
    }>;

  const companyIds = new Set<string>();
  const contactIds = new Set<string>();
  const dealIds = new Set<string>();
  for (const row of rows) {
    if (row.companyId) companyIds.add(row.companyId);
    if (row.contactId) contactIds.add(row.contactId);
    if (row.dealId) dealIds.add(row.dealId);
  }
  return {
    companyIds: [...companyIds],
    contactIds: [...contactIds],
    dealIds: [...dealIds],
  };
}

export function mergeActivityStampTargets(
  into: ActivityStampTargets,
  ...targets: ActivityStampTargets[]
): void {
  const companyIds = new Set(into.companyIds);
  const contactIds = new Set(into.contactIds);
  const dealIds = new Set(into.dealIds);
  for (const target of targets) {
    target.companyIds.forEach((id) => companyIds.add(id));
    target.contactIds.forEach((id) => contactIds.add(id));
    target.dealIds.forEach((id) => dealIds.add(id));
  }
  into.companyIds = [...companyIds];
  into.contactIds = [...contactIds];
  into.dealIds = [...dealIds];
}

function restamp(
  db: Db,
  table: "companies" | "contacts" | "deals",
  foreignKey: "company_id" | "contact_id" | "deal_id",
  ids: readonly string[],
): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(`
    UPDATE ${table} AS records
    SET last_activity_at = (
      SELECT MAX(created_at)
      FROM activities
      WHERE activities.${foreignKey} = records.id
    )
    WHERE records.id IN (${placeholders})
  `).run(...ids);
}

/** Recompute only surviving records, while the caller's transaction is open. */
export function recomputeActivityStamps(db: Db, targets: ActivityStampTargets): void {
  restamp(db, "companies", "company_id", targets.companyIds);
  restamp(db, "contacts", "contact_id", targets.contactIds);
  restamp(db, "deals", "deal_id", targets.dealIds);
}
