import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { CrmAppShell } from "./app/shell.js";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "crm",
    title: "CRM",
    icon: "Target",
    path: "crm",
    component: CrmAppShell,
  });
});
