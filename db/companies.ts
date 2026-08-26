import { createActivity } from "./activities.js";
import { activityFilterClause, domainFromEmail, isSqliteUniqueConstraint, newRecordId, nowIso, nullableText, normalizeDomain, normalizeLimit, normalizeOffset, normalizeEmail, RecordConflictError, requiredText, RecordNotFoundError, type Db, type EnrichmentStatus, type ListOptions, type RecordSource, ENRICHMENT_STATUSES, RECORD_SOURCES } from "./types.js";

const SYSTEM_ACTIVITY_AUTHOR_ID = "local_user";

/**
 * Return the deterministic origin favicon URL for a normalized company domain.
 *
 * The plugin intentionally stores only the HTTPS source URL. It does not fetch,
 * proxy, or mirror the remote image into BB storage.
 */
export function companyFaviconUrl(domain: string | null | undefined): string | null {
  const normalized = normalizeDomain(domain);
  return normalized ? `https://${normalized}/favicon.ico` : null;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  description: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  iconUrl: string | null;
  iconDarkUrl: string | null;
  iconTone: string | null;
  brandColor: string | null;
  industry: string | null;
  subIndustry: string | null;
  city: string | null;
  stateCode: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  githubUrl: string | null;
  pricingUrl: string | null;
  careersUrl: string | null;
  ownerId: string | null;
  primaryContactId: string | null;
  enrichmentStatus: EnrichmentStatus;
  enrichedAt: string | null;
  enrichmentError: string | null;
  source: RecordSource;
  lastActivityAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CompanyCreateInput = Partial<Omit<Company, "id" | "createdAt" | "updatedAt" | "archivedAt">> & {
  id?: string;
  name: string;
};

export type CompanyUpdateInput = Partial<Omit<Company, "id" | "createdAt" | "updatedAt" | "archivedAt">>;

export interface CompanyListOptions extends ListOptions {
  ownerId?: string | null;
  ownerIds?: readonly string[];
  industries?: readonly string[];
  sources?: readonly RecordSource[];
  enrichmentStatuses?: readonly EnrichmentStatus[];
  source?: RecordSource;
  enrichmentStatus?: EnrichmentStatus;
  sortBy?: "name" | "domain" | "industry" | "owner" | "contacts" | "deals" | "createdAt" | "lastActivity" | "archivedAt";
  sortDirection?: "asc" | "desc";
}

const COMPANY_SELECT = `
  SELECT
    id,
    name,
    domain,
    website,
    description,
    logo_url AS logoUrl,
    logo_dark_url AS logoDarkUrl,
    icon_url AS iconUrl,
    icon_dark_url AS iconDarkUrl,
    icon_tone AS iconTone,
    brand_color AS brandColor,
    industry,
    sub_industry AS subIndustry,
    city,
    state_code AS stateCode,
    country,
    country_code AS countryCode,
    phone,
    email,
    linkedin_url AS linkedinUrl,
    twitter_url AS twitterUrl,
    github_url AS githubUrl,
    pricing_url AS pricingUrl,
    careers_url AS careersUrl,
    owner_id AS ownerId,
    primary_contact_id AS primaryContactId,
    enrichment_status AS enrichmentStatus,
    enriched_at AS enrichedAt,
    enrichment_error AS enrichmentError,
    source,
    last_activity_at AS lastActivityAt,
    archived_at AS archivedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM companies`;

const COMPANY_COLUMNS = [
  "name",
  "domain",
  "website",
  "description",
  "logo_url",
  "logo_dark_url",
  "icon_url",
  "icon_dark_url",
  "icon_tone",
  "brand_color",
  "industry",
  "sub_industry",
  "city",
  "state_code",
  "country",
  "country_code",
  "phone",
  "email",
  "linkedin_url",
  "twitter_url",
  "github_url",
  "pricing_url",
  "careers_url",
  "owner_id",
  "primary_contact_id",
  "enrichment_status",
  "enriched_at",
  "enrichment_error",
  "source",
  "last_activity_at",
] as const;

type CompanyColumn = (typeof COMPANY_COLUMNS)[number];

function assertEnum<T extends string>(value: string, values: readonly T[], label: string): T {
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${label}: ${value}.`);
}

function row(value: unknown): Company {
  return value as Company;
}

function normalizeCreate(input: CompanyCreateInput): Company {
  const now = nowIso();
  const domain = normalizeDomain(input.domain);
  const status = assertEnum(
    input.enrichmentStatus ?? "PENDING",
    ENRICHMENT_STATUSES,
    "enrichment status",
  );
  const source = assertEnum(input.source ?? "MANUAL", RECORD_SOURCES, "source");
  return {
    id: input.id?.trim() || newRecordId("cmp"),
    name: requiredText(input.name, "Company name"),
    domain,
    website:
      input.website === undefined
        ? domain
          ? `https://${domain}`
          : null
        : nullableText(input.website),
    description: nullableText(input.description),
    logoUrl: nullableText(input.logoUrl),
    logoDarkUrl: nullableText(input.logoDarkUrl),
    iconUrl:
      input.iconUrl === undefined
        ? companyFaviconUrl(domain)
        : nullableText(input.iconUrl),
    iconDarkUrl: nullableText(input.iconDarkUrl),
    iconTone: nullableText(input.iconTone),
    brandColor: nullableText(input.brandColor),
    industry: nullableText(input.industry),
    subIndustry: nullableText(input.subIndustry),
    city: nullableText(input.city),
    stateCode: nullableText(input.stateCode),
    country: nullableText(input.country),
    countryCode: nullableText(input.countryCode),
    phone: nullableText(input.phone),
    email: normalizeEmail(input.email),
    linkedinUrl: nullableText(input.linkedinUrl),
    twitterUrl: nullableText(input.twitterUrl),
    githubUrl: nullableText(input.githubUrl),
    pricingUrl: nullableText(input.pricingUrl),
    careersUrl: nullableText(input.careersUrl),
    ownerId: nullableText(input.ownerId),
    primaryContactId: nullableText(input.primaryContactId),
    enrichmentStatus: status,
    enrichedAt: input.enrichedAt ?? null,
    enrichmentError: nullableText(input.enrichmentError),
    source,
    lastActivityAt: input.lastActivityAt ?? null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function dbValues(value: Company): Record<string, string | null> {
  return {
    id: value.id,
    name: value.name,
    domain: value.domain,
    website: value.website,
    description: value.description,
    logo_url: value.logoUrl,
    logo_dark_url: value.logoDarkUrl,
    icon_url: value.iconUrl,
    icon_dark_url: value.iconDarkUrl,
    icon_tone: value.iconTone,
    brand_color: value.brandColor,
    industry: value.industry,
    sub_industry: value.subIndustry,
    city: value.city,
    state_code: value.stateCode,
    country: value.country,
    country_code: value.countryCode,
    phone: value.phone,
    email: value.email,
    linkedin_url: value.linkedinUrl,
    twitter_url: value.twitterUrl,
    github_url: value.githubUrl,
    pricing_url: value.pricingUrl,
    careers_url: value.careersUrl,
    owner_id: value.ownerId,
    primary_contact_id: value.primaryContactId,
    enrichment_status: value.enrichmentStatus,
    enriched_at: value.enrichedAt,
    enrichment_error: value.enrichmentError,
    source: value.source,
    last_activity_at: value.lastActivityAt,
    archived_at: value.archivedAt,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

function activeCompanyForDomain(
  db: Db,
  domain: string,
  excludeId?: string,
): { id: string; name: string } | undefined {
  const where = excludeId === undefined
    ? "domain = ? COLLATE NOCASE AND archived_at IS NULL"
    : "domain = ? COLLATE NOCASE AND archived_at IS NULL AND id <> ?";
  const params = excludeId === undefined ? [domain] : [domain, excludeId];
  return db.prepare(`SELECT id, name FROM companies WHERE ${where} LIMIT 1`).get(...params) as
    | { id: string; name: string }
    | undefined;
}

function assertCompanyDomainAvailable(db: Db, domain: string | null, excludeId?: string): void {
  if (!domain) return;
  const existing = activeCompanyForDomain(db, domain, excludeId);
  if (existing) {
    throw new RecordConflictError(
      "company",
      "domain",
      domain,
      `${existing.name} already uses the domain ${domain}.`,
    );
  }
}

function rethrowCompanyDomainConflict(error: unknown, domain: string | null): never {
  if (domain && isSqliteUniqueConstraint(error, "companies", "domain")) {
    throw new RecordConflictError(
      "company",
      "domain",
      domain,
      "Another company already uses that domain.",
    );
  }
  throw error;
}

/**
 * Keep the primary-contact relation scoped to the company that owns it.
 * SQLite's foreign key only proves that the contact exists; it cannot express
 * that the contact's company_id matches this company.
 */
function assertPrimaryContactForCompany(
  db: Db,
  companyId: string,
  contactId: string | null,
): void {
  if (contactId === null) return;
  const contact = db
    .prepare("SELECT company_id AS companyId FROM contacts WHERE id = ?")
    .get(contactId) as { companyId: string | null } | undefined;
  if (!contact) throw new RecordNotFoundError("contact", contactId);
  if (contact.companyId !== companyId) {
    throw new Error("That contact does not work at this company.");
  }
}

function insertCompany(db: Db, value: Company): void {
  db.prepare(`
    INSERT INTO companies (
      id, name, domain, website, description, logo_url, logo_dark_url,
      icon_url, icon_dark_url, icon_tone, brand_color, industry, sub_industry,
      city, state_code, country, country_code, phone, email, linkedin_url,
      twitter_url, github_url, pricing_url, careers_url, owner_id,
      primary_contact_id, enrichment_status, enriched_at, enrichment_error,
      source, last_activity_at, archived_at, created_at, updated_at
    ) VALUES (
      @id, @name, @domain, @website, @description, @logo_url, @logo_dark_url,
      @icon_url, @icon_dark_url, @icon_tone, @brand_color, @industry,
      @sub_industry, @city, @state_code, @country, @country_code, @phone,
      @email, @linkedin_url, @twitter_url, @github_url, @pricing_url,
      @careers_url, @owner_id, @primary_contact_id, @enrichment_status,
      @enriched_at, @enrichment_error, @source, @last_activity_at,
      @archived_at, @created_at, @updated_at
    )`).run(dbValues(value));
}

export class CompanyStore {
  constructor(private readonly db: Db) {}

  get(id: string, options: { includeArchived?: boolean } = {}): Company | null {
    const condition = options.includeArchived === false ? " AND archived_at IS NULL" : "";
    return row(
      this.db.prepare(`${COMPANY_SELECT} WHERE id = ?${condition}`).get(id),
    ) ?? null;
  }

  getRequired(id: string): Company {
    const value = this.get(id);
    if (!value) throw new RecordNotFoundError("company", id);
    return value;
  }

  create(input: CompanyCreateInput): Company {
    const value = normalizeCreate(input);
    return this.db.transaction(() => {
      assertPrimaryContactForCompany(this.db, value.id, value.primaryContactId);
      assertCompanyDomainAvailable(this.db, value.domain);
      try {
        insertCompany(this.db, value);
      } catch (error) {
        rethrowCompanyDomainConflict(error, value.domain);
      }
      return this.getRequired(value.id);
    })();
  }

  list(options: CompanyListOptions = {}): Company[] {
    const { where, params } = this.listWhere(options);
    params.limit = normalizeLimit(options.limit);
    params.offset = normalizeOffset(options.offset);
    const sortColumns: Record<NonNullable<CompanyListOptions["sortBy"]>, string> = {
      name: "name",
      domain: "domain",
      industry: "industry",
      // BB exposes no current-user/RBAC table to the plugin, so owner IDs are
      // the only stable local ordering available for this relation.
      owner: "owner_id",
      contacts: "(SELECT COUNT(*) FROM contacts AS related_contacts WHERE related_contacts.company_id = companies.id)",
      deals: "(SELECT COUNT(*) FROM deals AS related_deals WHERE related_deals.company_id = companies.id AND related_deals.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST'))",
      createdAt: "created_at",
      lastActivity: "last_activity_at",
      archivedAt: "archived_at",
    };
    const sortColumn = sortColumns[options.sortBy ?? "name"];
    const direction = options.sortDirection === "desc" ? "DESC" : "ASC";
    const nullLast = options.sortBy === "lastActivity" || options.sortBy === "archivedAt"
      ? `${sortColumn} IS NULL ASC, `
      : "";
    return this.db
      .prepare(`${COMPANY_SELECT}${where} ORDER BY ${nullLast}${sortColumn} COLLATE NOCASE ${direction}, name COLLATE NOCASE ${direction}, id ${direction} LIMIT @limit OFFSET @offset`)
      .all(params)
      .map(row);
  }

  count(options: Omit<CompanyListOptions, "limit" | "offset"> = {}): number {
    const { where, params } = this.listWhere(options);
    return (
      this.db.prepare(`SELECT COUNT(*) AS count FROM companies${where}`).get(params) as {
        count: number;
      }
    ).count;
  }

  private listWhere(options: CompanyListOptions): {
    where: string;
    params: Record<string, string | number>;
  } {
    const clauses: string[] = [];
    const params: Record<string, string | number> = {};
    if (options.recordIds !== undefined) {
      if (options.recordIds.length === 0) clauses.push("1 = 0");
      else {
        const placeholders = options.recordIds.map((value, index) => {
          const key = `recordId${index}`;
          params[key] = value;
          return `@${key}`;
        });
        clauses.push(`id IN (${placeholders.join(", ")})`);
      }
    }
    if (options.archivedOnly) clauses.push("archived_at IS NOT NULL");
    else if (!options.includeArchived) clauses.push("archived_at IS NULL");
    if (options.ownerId === null) clauses.push("owner_id IS NULL");
    else if (options.ownerId !== undefined) {
      clauses.push("owner_id = @ownerId");
      params.ownerId = options.ownerId;
    }
    if (options.ownerIds !== undefined && options.ownerIds.length > 0) {
      const conditions: string[] = [];
      const assigned = options.ownerIds.filter((value) => value !== "unassigned");
      if (options.ownerIds.includes("unassigned")) conditions.push("owner_id IS NULL");
      if (assigned.length > 0) {
        const placeholders = assigned.map((value, index) => {
          const key = `owner${index}`;
          params[key] = value;
          return `@${key}`;
        });
        conditions.push(`owner_id IN (${placeholders.join(", ")})`);
      }
      clauses.push(`(${conditions.join(" OR ")})`);
    }
    if (options.industries !== undefined && options.industries.length > 0) {
      const placeholders = options.industries.map((value, index) => {
        const key = `industry${index}`;
        params[key] = value;
        return `@${key}`;
      });
      clauses.push(`industry IN (${placeholders.join(", ")})`);
    }
    if (options.source !== undefined) {
      assertEnum(options.source, RECORD_SOURCES, "source");
      clauses.push("source = @source");
      params.source = options.source;
    }
    if (options.enrichmentStatus !== undefined) {
      assertEnum(options.enrichmentStatus, ENRICHMENT_STATUSES, "enrichment status");
      clauses.push("enrichment_status = @enrichmentStatus");
      params.enrichmentStatus = options.enrichmentStatus;
    }
    if (options.sources !== undefined && options.sources.length > 0) {
      const placeholders = options.sources.map((value, index) => {
        const key = `source${index}`;
        params[key] = assertEnum(value, RECORD_SOURCES, "source");
        return `@${key}`;
      });
      clauses.push(`source IN (${placeholders.join(", ")})`);
    }
    if (options.enrichmentStatuses !== undefined && options.enrichmentStatuses.length > 0) {
      const placeholders = options.enrichmentStatuses.map((value, index) => {
        const key = `enrichment${index}`;
        params[key] = assertEnum(value, ENRICHMENT_STATUSES, "enrichment status");
        return `@${key}`;
      });
      clauses.push(`enrichment_status IN (${placeholders.join(", ")})`);
    }
    const activity = activityFilterClause(options.activity, "last_activity_at", params);
    if (activity) clauses.push(activity);
    const search = options.search?.trim();
    if (search) {
      clauses.push(`(
        name LIKE @search COLLATE NOCASE OR
        domain LIKE @search COLLATE NOCASE OR
        email LIKE @search COLLATE NOCASE OR
        industry LIKE @search COLLATE NOCASE
      )`);
      params.search = `%${search}%`;
    }
    return {
      where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  update(id: string, input: CompanyUpdateInput): Company {
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      const next: Company = { ...current };
      let enrichmentStatusChanged = false;
      const has = (key: keyof CompanyUpdateInput): boolean =>
        input[key] !== undefined;
      if (has("name")) next.name = requiredText(input.name as string, "Company name");
      if (has("domain")) next.domain = normalizeDomain(input.domain);
      if (has("website")) next.website = nullableText(input.website);
      if (has("description")) next.description = nullableText(input.description);
      if (has("logoUrl")) next.logoUrl = nullableText(input.logoUrl);
      if (has("logoDarkUrl")) next.logoDarkUrl = nullableText(input.logoDarkUrl);
      if (has("iconUrl")) next.iconUrl = nullableText(input.iconUrl);
      if (has("iconDarkUrl")) next.iconDarkUrl = nullableText(input.iconDarkUrl);
      if (has("iconTone")) next.iconTone = nullableText(input.iconTone);
      if (has("brandColor")) next.brandColor = nullableText(input.brandColor);
      if (has("industry")) next.industry = nullableText(input.industry);
      if (has("subIndustry")) next.subIndustry = nullableText(input.subIndustry);
      if (has("city")) next.city = nullableText(input.city);
      if (has("stateCode")) next.stateCode = nullableText(input.stateCode);
      if (has("country")) next.country = nullableText(input.country);
      if (has("countryCode")) next.countryCode = nullableText(input.countryCode);
      if (has("phone")) next.phone = nullableText(input.phone);
      if (has("email")) next.email = normalizeEmail(input.email);
      if (has("linkedinUrl")) next.linkedinUrl = nullableText(input.linkedinUrl);
      if (has("twitterUrl")) next.twitterUrl = nullableText(input.twitterUrl);
      if (has("githubUrl")) next.githubUrl = nullableText(input.githubUrl);
      if (has("pricingUrl")) next.pricingUrl = nullableText(input.pricingUrl);
      if (has("careersUrl")) next.careersUrl = nullableText(input.careersUrl);
      if (has("ownerId")) next.ownerId = nullableText(input.ownerId);
      if (has("primaryContactId")) {
        next.primaryContactId = nullableText(input.primaryContactId);
        assertPrimaryContactForCompany(this.db, id, next.primaryContactId);
      }
      if (has("enrichmentStatus")) {
        next.enrichmentStatus = assertEnum(input.enrichmentStatus as string, ENRICHMENT_STATUSES, "enrichment status");
        enrichmentStatusChanged = next.enrichmentStatus !== current.enrichmentStatus;
      }
      if (has("enrichedAt")) next.enrichedAt = input.enrichedAt ?? null;
      if (has("enrichmentError")) next.enrichmentError = nullableText(input.enrichmentError);
      if (has("source")) next.source = assertEnum(input.source as string, RECORD_SOURCES, "source");
      if (has("lastActivityAt")) next.lastActivityAt = input.lastActivityAt ?? null;
      const domainChanged = has("domain") && next.domain !== current.domain;
      if (
        domainChanged &&
        !has("iconUrl") &&
        (current.iconUrl === null || current.iconUrl === companyFaviconUrl(current.domain))
      ) {
        next.iconUrl = companyFaviconUrl(next.domain);
      }
      next.updatedAt = nowIso();
      const values = dbValues(next);
      const changed: readonly CompanyColumn[] = COMPANY_COLUMNS;
      assertCompanyDomainAvailable(this.db, next.domain, id);
      try {
        this.db
          .prepare(`UPDATE companies SET ${changed.map((column) => `${column} = @${column}`).join(", ")}, updated_at = @updated_at WHERE id = @id`)
          .run(values);
      } catch (error) {
        rethrowCompanyDomainConflict(error, next.domain);
      }
      if (enrichmentStatusChanged) {
        const occurredAt = next.updatedAt;
        createActivity(
          this.db,
          {
            type: "ENRICHMENT",
            subject: "Enrichment status changed",
            body: next.enrichmentError,
            occurredAt,
            companyId: next.id,
            createdById: SYSTEM_ACTIVITY_AUTHOR_ID,
            meta: { from: current.enrichmentStatus, to: next.enrichmentStatus },
          },
          SYSTEM_ACTIVITY_AUTHOR_ID,
        );
        this.db
          .prepare(`
            UPDATE companies
            SET last_activity_at = CASE
              WHEN last_activity_at IS NULL OR last_activity_at < @occurredAt
                THEN @occurredAt
              ELSE last_activity_at
            END
            WHERE id = @id
          `)
          .run({ id: next.id, occurredAt });
      }
      return this.getRequired(id);
    })();
  }

  setPrimaryContact(companyId: string, contactId: string | null): Company {
    assertPrimaryContactForCompany(this.db, companyId, contactId);
    return this.update(companyId, { primaryContactId: contactId });
  }

  archive(id: string): Company {
    return this.setArchived(id, nowIso());
  }

  restore(id: string): Company {
    return this.setArchived(id, null);
  }

  private setArchived(id: string, archivedAt: string | null): Company {
    return this.db.transaction(() => {
      const current = this.getRequired(id);
      if (archivedAt === null) assertCompanyDomainAvailable(this.db, current.domain, id);
      try {
        this.db.prepare("UPDATE companies SET archived_at = @archivedAt, updated_at = @updatedAt WHERE id = @id").run({
          id,
          archivedAt,
          updatedAt: nowIso(),
        });
      } catch (error) {
        rethrowCompanyDomainConflict(error, current.domain);
      }
      return this.getRequired(id);
    })();
  }

  purge(id: string): Company {
    return this.db.transaction(() => {
      const value = this.getRequired(id);
      this.db.prepare("DELETE FROM companies WHERE id = ?").run(id);
      return value;
    })();
  }
}

export interface CompanyForEmailOptions {
  ownerId?: string | null;
  source?: RecordSource;
}

/**
 * Find or create the local company represented by a work email domain.
 * Free-mail and machine-generated domains intentionally return no company.
 */
export function companyForEmail(
  db: Db,
  email: string | null | undefined,
  options: CompanyForEmailOptions = {},
): string | null {
  const domain = domainFromEmail(email);
  if (!domain) return null;

  return db.transaction(() => {
    const existing = activeCompanyForDomain(db, domain);
    if (existing) return existing.id;

    const value = normalizeCreate({
      name: domain,
      domain,
      ownerId: options.ownerId,
      source: options.source === "CALENDAR" ? "CALENDAR" : "EMAIL",
    });
    try {
      insertCompany(db, value);
    } catch (error) {
      if (isSqliteUniqueConstraint(error, "companies", "domain")) {
        const raced = activeCompanyForDomain(db, domain);
        if (raced) return raced.id;
      }
      rethrowCompanyDomainConflict(error, domain);
    }
    return value.id;
  })();
}

export function createCompanyStore(db: Db): CompanyStore {
  return new CompanyStore(db);
}

export function createCompany(db: Db, input: CompanyCreateInput): Company {
  return new CompanyStore(db).create(input);
}

export function getCompany(db: Db, id: string, options?: { includeArchived?: boolean }): Company | null {
  return new CompanyStore(db).get(id, options);
}

export function listCompanies(db: Db, options?: CompanyListOptions): Company[] {
  return new CompanyStore(db).list(options);
}

export function updateCompany(db: Db, id: string, input: CompanyUpdateInput): Company {
  return new CompanyStore(db).update(id, input);
}

export function setPrimaryContact(db: Db, companyId: string, contactId: string | null): Company {
  return new CompanyStore(db).setPrimaryContact(companyId, contactId);
}

export function archiveCompany(db: Db, id: string): Company {
  return new CompanyStore(db).archive(id);
}

export function restoreCompany(db: Db, id: string): Company {
  return new CompanyStore(db).restore(id);
}

export function purgeCompany(db: Db, id: string): Company {
  return new CompanyStore(db).purge(id);
}

export const deleteCompany = purgeCompany;
