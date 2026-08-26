import type { BbPluginApi } from "@get-bb/plugin-sdk";

import type {
  WorkspaceIdentityUpdateInput,
  WorkspaceProfile,
} from "../contracts/workspace.js";

type Db = ReturnType<BbPluginApi["storage"]["database"]>;

interface WorkspaceRow {
  website: string;
  narrative: string | null;
  sells: string | null;
  sellsTo: string | null;
  edge: string | null;
  sourceUrl: string | null;
  refreshedAt: string;
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizedHttpUrl(value: string, label: string): string {
  const trimmed = value.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`${label} must be a valid website URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(parsed.hostname)) {
    throw new Error(`${label} must include a public hostname.`);
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function rowToProfile(row: WorkspaceRow): WorkspaceProfile {
  return {
    website: row.website,
    narrative: row.narrative!,
    sells: row.sells,
    sellsTo: row.sellsTo,
    edge: row.edge,
    sourceUrl: row.sourceUrl,
    refreshedAt: row.refreshedAt,
  };
}

export class WorkspaceIdentityStore {
  constructor(private readonly db: Db) {}

  get(): { website: string | null; profile: WorkspaceProfile | null } {
    const row = this.db.prepare(`
      SELECT website, narrative, sells, sells_to AS sellsTo, edge,
             source_url AS sourceUrl, refreshed_at AS refreshedAt
      FROM workspace_identity WHERE id = 'workspace'
    `).get() as WorkspaceRow | undefined;
    return row === undefined
      ? { website: null, profile: null }
      : {
          website: row.website,
          profile: row.narrative === null ? null : rowToProfile(row),
        };
  }

  update(input: WorkspaceIdentityUpdateInput): {
    website: string;
    profile: WorkspaceProfile | null;
  } {
    const website = normalizedHttpUrl(input.website, "Workspace website");
    const narrative = input.narrative.trim();
    if (narrative.length > 0 && narrative.length < 40) {
      throw new Error("Workspace profile must be empty or at least 40 characters.");
    }
    const sourceUrl = optionalText(input.sourceUrl);
    const value = {
      website,
      narrative: narrative || null,
      sells: narrative ? optionalText(input.sells) : null,
      sellsTo: narrative ? optionalText(input.sellsTo) : null,
      edge: narrative ? optionalText(input.edge) : null,
      sourceUrl: narrative && sourceUrl !== null
        ? normalizedHttpUrl(sourceUrl, "Profile source URL")
        : null,
      refreshedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO workspace_identity (
        id, website, narrative, sells, sells_to, edge, source_url, refreshed_at
      ) VALUES (
        'workspace', @website, @narrative, @sells, @sellsTo, @edge, @sourceUrl, @refreshedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        website = excluded.website,
        narrative = excluded.narrative,
        sells = excluded.sells,
        sells_to = excluded.sells_to,
        edge = excluded.edge,
        source_url = excluded.source_url,
        refreshed_at = excluded.refreshed_at
    `).run(value);
    return {
      website,
      profile: value.narrative === null ? null : rowToProfile(value),
    };
  }
}

export function createWorkspaceIdentityStore(db: Db): WorkspaceIdentityStore {
  return new WorkspaceIdentityStore(db);
}
