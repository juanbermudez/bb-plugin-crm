import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { CurrencySettingsView } from "./currency/index.js";
import type { CurrencyRpcClient } from "./currency/rpc.js";
import { CustomFieldsSettingsView } from "./custom-fields/index.js";
import type { CustomFieldsRpcClient } from "./custom-fields/rpc.js";
import { ConnectionsSettingsView } from "./connections/index.js";
import type { ConnectionsRpcClient } from "./connections/rpc.js";
import { TrackingSettingsView } from "./tracking/index.js";
import type { TrackingRpcClient } from "./tracking/rpc.js";
import { WorkspaceSettingsView } from "./workspace/index.js";
import type { WorkspaceRpcClient } from "./workspace/rpc.js";

export type SettingsSection = "workspace" | "currency" | "custom-fields" | "connections" | "tracking";

const SECTIONS = [
  { id: "workspace", label: "Workspace", icon: "Layers" },
  { id: "currency", label: "Currency", icon: "ChartColumn" },
  { id: "custom-fields", label: "Custom fields", icon: "Edit" },
  { id: "connections", label: "Connections", icon: "ElectricPlugs" },
  { id: "tracking", label: "Tracking", icon: "Globe" },
] as const;

export interface SettingsViewProps {
  initialSection?: SettingsSection;
  /** Removes the duplicate page heading when BB owns the settings section. */
  embedded?: boolean;
  onSectionChange?: (section: SettingsSection) => void;
  currencyRpcClient?: CurrencyRpcClient;
  customFieldsRpcClient?: CustomFieldsRpcClient;
  connectionsRpcClient?: ConnectionsRpcClient;
  trackingRpcClient?: TrackingRpcClient;
  workspaceRpcClient?: WorkspaceRpcClient;
}

export function SettingsView({
  initialSection = "workspace",
  embedded = false,
  onSectionChange,
  currencyRpcClient,
  customFieldsRpcClient,
  connectionsRpcClient,
  trackingRpcClient,
  workspaceRpcClient,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <header className={embedded ? "shrink-0 border-b border-border pb-4" : "shrink-0 border-b border-border px-4 py-4 sm:px-5"}>
        {!embedded ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure reporting money, shared fields, provider connections, and site tracking.
            </p>
          </>
        ) : null}
        <div
          className={embedded ? "flex flex-wrap items-center gap-1" : "mt-4 flex flex-wrap items-center gap-1"}
          role="tablist"
          aria-label="CRM settings sections"
        >
          {SECTIONS.map((item) => (
            <Button
              key={item.id}
              type="button"
              role="tab"
              variant={section === item.id ? "secondary" : "ghost"}
              size="sm"
              aria-selected={section === item.id}
              onClick={() => {
                setSection(item.id);
                onSectionChange?.(item.id);
              }}
            >
              <Icon name={item.icon} aria-hidden="true" />
              {item.label}
            </Button>
          ))}
        </div>
      </header>
      <div className="min-h-0 min-w-0 flex-1" role="tabpanel">
        {section === "workspace" ? (
          <WorkspaceSettingsView rpcClient={workspaceRpcClient} />
        ) : section === "currency" ? (
          <CurrencySettingsView rpcClient={currencyRpcClient} />
        ) : section === "custom-fields" ? (
          <CustomFieldsSettingsView rpcClient={customFieldsRpcClient} />
        ) : section === "connections" ? (
          <ConnectionsSettingsView rpcClient={connectionsRpcClient} />
        ) : (
          <TrackingSettingsView rpcClient={trackingRpcClient} />
        )}
      </div>
    </div>
  );
}
