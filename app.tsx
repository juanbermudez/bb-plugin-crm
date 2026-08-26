import { definePluginApp } from "@get-bb/plugin-sdk/app";
import {
  CrmAppShell,
  CrmHeaderContent,
} from "./app/shell.js";
import { ClarificationQuestion } from "./app/components/clarification-question.js";
import { CLARIFICATION_RENDERER_ID } from "./contracts/clarification.js";
import { SettingsView } from "./app/views/settings/index.js";
import "./app.css";

function CrmSettingsSection() {
  return <SettingsView embedded />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "crm",
    title: "CRM",
    icon: "Layers",
    path: "crm",
    component: CrmAppShell,
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
