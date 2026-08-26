import { useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Icon } from "../../../components/ui/icon.js";
import { CurrencySettingsView } from "./currency/index.js";
import type { CurrencyRpcClient } from "./currency/rpc.js";
import { CustomFieldsSettingsView } from "./custom-fields/index.js";
import type { CustomFieldsRpcClient } from "./custom-fields/rpc.js";

export type SettingsSection = "currency" | "custom-fields";

const SECTIONS = [
  { id: "currency", label: "Currency", icon: "ChartColumn" },
  { id: "custom-fields", label: "Custom fields", icon: "Edit" },
] as const;

export interface SettingsViewProps {
  initialSection?: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
  currencyRpcClient?: CurrencyRpcClient;
  customFieldsRpcClient?: CustomFieldsRpcClient;
}

export function SettingsView({
  initialSection = "currency",
  onSectionChange,
  currencyRpcClient,
  customFieldsRpcClient,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-5">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure reporting money and the fields shared by CRM records and agents.
        </p>
        <div
          className="mt-4 flex flex-wrap items-center gap-1"
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
        {section === "currency" ? (
          <CurrencySettingsView rpcClient={currencyRpcClient} />
        ) : (
          <CustomFieldsSettingsView rpcClient={customFieldsRpcClient} />
        )}
      </div>
    </div>
  );
}
