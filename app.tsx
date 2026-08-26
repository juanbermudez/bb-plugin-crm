import { definePluginApp } from "@get-bb/plugin-sdk/app";
import {
  CrmAppShell,
  CrmHeaderContent,
  type CrmPanelProps,
} from "./app/shell.js";
import { ClarificationQuestion } from "./app/components/clarification-question.js";
import { CLARIFICATION_RENDERER_ID } from "./contracts/clarification.js";
import type { CrmPanelKind } from "./app/routes.js";
import { SettingsView } from "./app/views/settings/index.js";

function panelComponent(panelKind: CrmPanelKind) {
  return function CrmPanel(props: CrmPanelProps) {
    return <CrmAppShell {...props} panelKind={panelKind} />;
  };
}

const DashboardPanel = panelComponent("dashboard");
const CompaniesPanel = panelComponent("companies");
const ContactsPanel = panelComponent("contacts");
const DealsPanel = panelComponent("deals");
const AgentsPanel = panelComponent("agents");

function CrmSettingsSection() {
  return <SettingsView embedded />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "crm",
    title: "CRM",
    icon: "Target",
    path: "crm",
    component: DashboardPanel,
    headerContent: CrmHeaderContent,
  });
  app.slots.navPanel({
    id: "crm-companies",
    title: "Companies",
    icon: "Layers",
    path: "companies",
    component: CompaniesPanel,
    headerContent: CrmHeaderContent,
  });
  app.slots.navPanel({
    id: "crm-contacts",
    title: "Contacts",
    icon: "UserRound",
    path: "contacts",
    component: ContactsPanel,
    headerContent: CrmHeaderContent,
  });
  app.slots.navPanel({
    id: "crm-deals",
    title: "Deals",
    icon: "Target",
    path: "deals",
    component: DealsPanel,
    headerContent: CrmHeaderContent,
  });
  app.slots.navPanel({
    id: "crm-agents",
    title: "Agents",
    icon: "Brain",
    path: "agents",
    component: AgentsPanel,
    headerContent: CrmHeaderContent,
  });
  app.slots.settingsSection({
    id: "crm-settings",
    title: "CRM",
    description: "Configure the CRM workspace, currency, fields, connections, and tracking.",
    component: CrmSettingsSection,
  });
  app.slots.pendingInteraction({
    id: CLARIFICATION_RENDERER_ID,
    component: ClarificationQuestion,
  });
});
