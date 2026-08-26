import { useEffect, useState } from "react";

import { Button } from "../../../../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card.js";
import { Input } from "../../../../components/ui/input.js";
import type { WorkspaceIdentityUpdateInput } from "../../../../contracts/workspace.js";
import { useWorkspaceRpc, type WorkspaceRpcClient } from "./rpc.js";

const EMPTY_FORM: WorkspaceIdentityUpdateInput = {
  website: "",
  narrative: "",
  sells: "",
  sellsTo: "",
  edge: "",
  sourceUrl: "",
};

function displayWebsite(value: string | null): string {
  return value?.replace(/^https?:\/\//, "") ?? "";
}

export interface WorkspaceSettingsViewProps {
  rpcClient?: WorkspaceRpcClient;
}

export function WorkspaceSettingsView({ rpcClient }: WorkspaceSettingsViewProps) {
  const contextRpc = useWorkspaceRpc();
  const rpc = rpcClient ?? contextRpc;
  const [workspaceName, setWorkspaceName] = useState("CRM workspace");
  const [form, setForm] = useState<WorkspaceIdentityUpdateInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void rpc.call("workspace_identity_get", null).then((identity) => {
      if (!active) return;
      setWorkspaceName(identity.workspaceName);
      setForm({
        website: displayWebsite(identity.website),
        narrative: identity.profile?.narrative ?? "",
        sells: identity.profile?.sells ?? "",
        sellsTo: identity.profile?.sellsTo ?? "",
        edge: identity.profile?.edge ?? "",
        sourceUrl: identity.profile?.sourceUrl ?? "",
      });
      setError(null);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [rpc]);

  const edit = (key: keyof WorkspaceIdentityUpdateInput, value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const identity = await rpc.call("workspace_identity_update", form);
      setWorkspaceName(identity.workspaceName);
      setForm({
        website: displayWebsite(identity.website),
        narrative: identity.profile?.narrative ?? "",
        sells: identity.profile?.sells ?? "",
        sellsTo: identity.profile?.sellsTo ?? "",
        edge: identity.profile?.edge ?? "",
        sourceUrl: identity.profile?.sourceUrl ?? "",
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-5">
      <Card>
        <CardHeader>
          <CardTitle>Workspace identity</CardTitle>
          <CardDescription>
            Tell CRM which company this installation represents. The BB-managed workspace name is {workspaceName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block space-y-1.5 text-sm font-medium">
              Website
              <Input
                value={form.website}
                onChange={(event) => edit("website", event.target.value)}
                placeholder="acme.com"
                inputMode="url"
                disabled={loading || saving}
                required
              />
              <span className="block text-xs font-normal text-muted-foreground">
                CRM normalizes this to an HTTPS company URL.
              </span>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Company profile
              <textarea
                value={form.narrative}
                onChange={(event) => edit("narrative", event.target.value)}
                className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                placeholder="Optional: what the company does, how it makes money, and who it serves."
                maxLength={320}
                disabled={loading || saving}
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Optional. If supplied, use two or three factual sentences (at least 40 characters).
              </span>
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              {([
                ["sells", "What we sell"],
                ["sellsTo", "Who we sell to"],
                ["edge", "Why customers choose us"],
              ] as const).map(([key, label]) => (
                <label key={key} className="block space-y-1.5 text-sm font-medium">
                  {label}
                  <Input
                    value={form[key] ?? ""}
                    onChange={(event) => edit(key, event.target.value)}
                    maxLength={140}
                    disabled={loading || saving}
                  />
                </label>
              ))}
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              Profile source URL
              <Input
                value={form.sourceUrl ?? ""}
                onChange={(event) => edit("sourceUrl", event.target.value)}
                placeholder="https://acme.com/about"
                inputMode="url"
                disabled={loading || saving}
              />
            </label>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {saved ? <p role="status" className="text-sm text-foreground">Workspace profile saved.</p> : null}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  loading ||
                  saving ||
                  form.website.trim() === "" ||
                  (form.narrative.trim().length > 0 && form.narrative.trim().length < 40)
                }
              >
                {saving ? "Saving…" : "Save workspace"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
