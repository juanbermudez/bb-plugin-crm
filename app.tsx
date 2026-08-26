import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { CrmAppShell } from "./app/shell.js";
import { ClarificationQuestion } from "./app/components/clarification-question.js";
import { CLARIFICATION_RENDERER_ID } from "./contracts/clarification.js";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "crm",
    title: "CRM",
    icon: "Target",
    path: "crm",
    component: CrmAppShell,
  });
  app.slots.pendingInteraction({
    id: CLARIFICATION_RENDERER_ID,
    component: ClarificationQuestion,
  });
});
