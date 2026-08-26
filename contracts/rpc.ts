import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  agentActionGetInputSchema,
  agentActionListInputSchema,
  agentActionSchema,
  agentAuditEventSchema,
  agentAuditListInputSchema,
  agentCancelledRunSchema,
  agentCreateInputSchema,
  agentDefinitionSchema,
  agentDeployInputSchema,
  agentDetailSchema,
  agentIdActionInputSchema,
  agentListInputSchema,
  agentListItemSchema,
  agentRunApprovalRequestInputSchema,
  agentRunApproveInputSchema,
  agentRunCancelInputSchema,
  agentRunDetailSchema,
  agentRunFailureInputSchema,
  agentRunGetInputSchema,
  agentRunListInputSchema,
  agentRunQueueInputSchema,
  agentRunRetryInputSchema,
  agentRunSuccessInputSchema,
  agentRunSchema,
  agentThreadGetInputSchema,
  agentThreadListInputSchema,
  agentThreadLinkSchema,
  agentThreadRecordCreateInputSchema,
  agentTriggerCreateInputSchema,
  agentTriggerDeleteInputSchema,
  agentTriggerEnableInputSchema,
  agentTriggerListInputSchema,
  agentTriggerSchema,
  agentTriggerUpdateInputSchema,
  agentWebhookTokenListInputSchema,
  agentWebhookTokenProvisionInputSchema,
  agentWebhookTokenRevokeInputSchema,
  agentWebhookTokenRotateInputSchema,
  agentWebhookTokenSchema,
  provisionedAgentWebhookTokenSchema,
  agentUpdateInputSchema,
  agentVersionCreateInputSchema,
  agentVersionListInputSchema,
  agentVersionSchema,
  agentVersionValidateInputSchema,
} from "./agents.js";
import {
  archiveInputSchema,
  activityCompleteInputSchema,
  activityCreateInputSchema,
  activityEntrySchema,
  activityGetInputSchema,
  activityListInputSchema,
  activityListOutputSchema,
  myTasksInputSchema,
  myTasksOutputSchema,
  timelineCountsInputSchema,
  timelineCountsOutputSchema,
  bulkIdsInputSchema,
  bulkOwnerInputSchema,
  bulkStageInputSchema,
  bulkResultSchema,
  bulkCompanyInputSchema,
  companyCreateInputSchema,
  companyListInputSchema,
  companyListOutputSchema,
  companySchema,
  companyUpdateInputSchema,
  contactCreateInputSchema,
  contactResearchInputSchema,
  contactFactCreateInputSchema,
  contactFactDecisionInputSchema,
  contactFactListInputSchema,
  contactFactRecordSchema,
  contactFactSupersedeInputSchema,
  contactBriefCreateInputSchema,
  contactBriefCurrentInputSchema,
  contactBriefListInputSchema,
  contactBriefRecordSchema,
  contactBriefVersionInputSchema,
  contactListInputSchema,
  contactListOutputSchema,
  contactSchema,
  contactUpdateInputSchema,
  contactWorkHistoryCreateInputSchema,
  contactWorkHistoryDecisionInputSchema,
  contactWorkHistoryListInputSchema,
  contactWorkHistorySchema,
  contactWorkHistorySupersedeInputSchema,
  currencyDealRerateAllInputSchema,
  currencyDealRerateInputSchema,
  currencyRateAuditListInputSchema,
  currencyRateAuditListOutputSchema,
  currencyRateEffectiveListInputSchema,
  currencyRateListInputSchema,
  currencyRateListOutputSchema,
  currencyRateRemoveManualInputSchema,
  currencyRateSchema,
  currencyRateUpsertFetchedInputSchema,
  currencyRateUpsertManualInputSchema,
  dashboardSummaryInputSchema,
  dashboardSummaryOutputSchema,
  dealCreateInputSchema,
  dealListInputSchema,
  dealListOutputSchema,
  dealSchema,
  dealUpdateInputSchema,
  fieldDefinitionArchiveInputSchema,
  fieldDefinitionCreateInputSchema,
  fieldDefinitionDeleteInputSchema,
  fieldDeleteOutputSchema,
  fieldIdInputSchema,
  fieldDefinitionListOutputSchema,
  fieldDefinitionRestoreInputSchema,
  fieldDefinitionReorderInputSchema,
  fieldDefinitionSchema,
  fieldDefinitionUpdateInputSchema,
  fieldByKeyInputSchema,
  fieldCoverageOutputSchema,
  fieldEntityInputSchema,
  fieldListInputSchema,
  fieldOptionArchiveInputSchema,
  fieldOptionCreateInputSchema,
  fieldOptionDeleteInputSchema,
  fieldOptionDeleteOutputSchema,
  fieldOptionListInputSchema,
  fieldOptionListOutputSchema,
  fieldOptionRestoreInputSchema,
  fieldOptionOutputSchema,
  fieldOptionUpdateInputSchema,
  fieldValueCreateInputSchema,
  fieldValueDeleteInputSchema,
  fieldValueDeleteOutputSchema,
  fieldValueListInputSchema,
  fieldValueListOutputSchema,
  fieldValueOutputSchema,
  fieldValueUpdateInputSchema,
  idSchema,
  purgeInputSchema,
  recordIdInputSchema,
  rerateSummarySchema,
  restoreInputSchema,
  savedViewCreateInputSchema,
  savedViewDeleteInputSchema,
  savedViewDeleteOutputSchema,
  savedViewListInputSchema,
  savedViewListOutputSchema,
  savedViewSchema,
  savedViewSetDefaultInputSchema,
  savedViewSetDefaultOutputSchema,
  savedViewUpdateInputSchema,
  setDealStageInputSchema,
  enrichmentRequestInputSchema,
  enrichmentRequestOutputSchema,
} from "./core.js";
import {
  connectionDiagnosticsSchema,
  connectionDisableInputSchema,
  connectionHealthSchema,
  connectionIdInputSchema,
  connectionListInputSchema,
  connectionListSchema,
  connectionSchema,
  connectionStatusInputSchema,
  connectionSyncResultInputSchema,
  connectionTimestampSchema,
  connectionUpsertInputSchema,
  provisionedTrackingSiteSchema,
  provisionedTrackingTokenSchema,
  syncCursorSchema,
  syncFailureInputSchema,
  syncSuccessInputSchema,
  trackingAggregateListInputSchema,
  trackingAggregateListSchema,
  trackingAggregateSchema,
  trackingEventBatchInputSchema,
  trackingEventIdInputSchema,
  trackingEventInputSchema,
  trackingEventListInputSchema,
  trackingEventListSchema,
  trackingEventSchema,
  trackingPruneInputSchema,
  trackingPruneResultSchema,
  trackingRollupInputSchema,
  trackingRollupResultSchema,
  trackingSiteCreateInputSchema,
  trackingSiteListInputSchema,
  trackingSiteListSchema,
  trackingSitePauseInputSchema,
  trackingSiteRotateInputSchema,
  trackingSiteSchema,
  trackingSiteVerifyInputSchema,
  trackingTokenListInputSchema,
  trackingTokenListSchema,
  trackingTokenProvisionInputSchema,
  trackingTokenRevokeInputSchema,
  trackingTokenRotateInputSchema,
  trackingTokenSchema,
} from "./connections.js";
import {
  archiveRetentionGetInputSchema,
  archiveRetentionPruneInputSchema,
  archiveRetentionPruneResultSchema,
  archiveRetentionSettingsSchema,
} from "./maintenance.js";

export const rpcContract = defineRpcContract({
  status: {
    input: z.null(),
    output: z
      .object({
        version: z.string(),
        schemaVersion: z.number().int().positive(),
        workspaceName: z.string(),
        reportingCurrency: z.string(),
      })
      .strict(),
  },
  connections_list: {
    input: connectionListInputSchema,
    output: connectionListSchema,
  },
  connections_get: {
    input: connectionIdInputSchema,
    output: connectionSchema,
  },
  connections_health: {
    input: connectionIdInputSchema,
    output: connectionHealthSchema,
  },
  connections_upsert: {
    input: connectionUpsertInputSchema,
    output: connectionSchema,
  },
  connections_disable: {
    input: connectionDisableInputSchema,
    output: connectionSchema,
  },
  connections_syncSuccess: {
    input: syncSuccessInputSchema,
    output: connectionSchema,
  },
  connections_syncFailure: {
    input: syncFailureInputSchema,
    output: connectionSchema,
  },
  connections_syncCursors: {
    input: connectionIdInputSchema,
    output: z.array(syncCursorSchema),
  },
  connections_syncResult: {
    input: connectionSyncResultInputSchema,
    output: connectionSchema,
  },
  connections_diagnostics: {
    input: connectionIdInputSchema,
    output: connectionDiagnosticsSchema,
  },
  tracking_sites_list: {
    input: trackingSiteListInputSchema,
    output: trackingSiteListSchema,
  },
  tracking_sites_get: {
    input: connectionIdInputSchema,
    output: trackingSiteSchema,
  },
  tracking_sites_create: {
    input: trackingSiteCreateInputSchema,
    output: trackingSiteSchema,
  },
  tracking_sites_verify: {
    input: trackingSiteVerifyInputSchema,
    output: trackingSiteSchema,
  },
  tracking_sites_pause: {
    input: trackingSitePauseInputSchema,
    output: trackingSiteSchema,
  },
  tracking_sites_rotate: {
    input: trackingSiteRotateInputSchema,
    output: provisionedTrackingSiteSchema,
  },
  tracking_tokens_list: {
    input: trackingTokenListInputSchema,
    output: trackingTokenListSchema,
  },
  tracking_tokens_provision: {
    input: trackingTokenProvisionInputSchema,
    output: provisionedTrackingTokenSchema,
  },
  tracking_tokens_rotate: {
    input: trackingTokenRotateInputSchema,
    output: provisionedTrackingTokenSchema,
  },
  tracking_tokens_revoke: {
    input: trackingTokenRevokeInputSchema,
    output: trackingTokenSchema,
  },
  tracking_events_get: {
    input: trackingEventIdInputSchema,
    output: trackingEventSchema,
  },
  tracking_events_list: {
    input: trackingEventListInputSchema,
    output: trackingEventListSchema,
  },
  tracking_events_ingest: {
    input: trackingEventInputSchema,
    output: trackingEventSchema,
  },
  tracking_events_ingestBatch: {
    input: trackingEventBatchInputSchema,
    output: trackingEventListSchema,
  },
  tracking_aggregates_list: {
    input: trackingAggregateListInputSchema,
    output: trackingAggregateListSchema,
  },
  tracking_aggregates_rollup: {
    input: trackingRollupInputSchema,
    output: trackingRollupResultSchema,
  },
  tracking_aggregates_prune: {
    input: trackingPruneInputSchema,
    output: trackingPruneResultSchema,
  },
  archive_retention_get: {
    input: archiveRetentionGetInputSchema,
    output: archiveRetentionSettingsSchema,
  },
  archive_retention_prune: {
    input: archiveRetentionPruneInputSchema,
    output: archiveRetentionPruneResultSchema,
  },
  companies_list: {
    input: companyListInputSchema,
    output: companyListOutputSchema,
  },
  companies_get: {
    input: recordIdInputSchema,
    output: companySchema,
  },
  companies_create: {
    input: companyCreateInputSchema,
    output: companySchema,
  },
  companies_update: {
    input: companyUpdateInputSchema,
    output: companySchema,
  },
  companies_archive: {
    input: archiveInputSchema,
    output: companySchema,
  },
  companies_restore: {
    input: restoreInputSchema,
    output: companySchema,
  },
  companies_purge: {
    input: purgeInputSchema,
    output: companySchema,
  },
  companies_bulkAssignOwner: {
    input: bulkOwnerInputSchema,
    output: bulkResultSchema,
  },
  companies_enrich: {
    input: enrichmentRequestInputSchema,
    output: enrichmentRequestOutputSchema,
  },
  companies_bulkEnrich: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  companies_research: {
    input: enrichmentRequestInputSchema,
    output: enrichmentRequestOutputSchema,
  },
  companies_bulkArchive: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  companies_bulkRestore: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  companies_bulkPurge: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  contacts_list: {
    input: contactListInputSchema,
    output: contactListOutputSchema,
  },
  contacts_get: {
    input: recordIdInputSchema,
    output: contactSchema,
  },
  contacts_create: {
    input: contactCreateInputSchema,
    output: contactSchema,
  },
  contacts_update: {
    input: contactUpdateInputSchema,
    output: contactSchema,
  },
  contacts_archive: {
    input: archiveInputSchema,
    output: contactSchema,
  },
  contacts_restore: {
    input: restoreInputSchema,
    output: contactSchema,
  },
  contacts_purge: {
    input: purgeInputSchema,
    output: contactSchema,
  },
  contacts_bulkAssignOwner: {
    input: bulkOwnerInputSchema,
    output: bulkResultSchema,
  },
  contacts_bulkAssignCompany: {
    input: bulkCompanyInputSchema,
    output: bulkResultSchema,
  },
  contacts_enrich: {
    input: enrichmentRequestInputSchema,
    output: enrichmentRequestOutputSchema,
  },
  contacts_bulkEnrich: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  contacts_research: {
    input: contactResearchInputSchema,
    output: enrichmentRequestOutputSchema,
  },
  contacts_bulkArchive: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  contacts_bulkRestore: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  contacts_bulkPurge: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  contacts_facts_list: {
    input: contactFactListInputSchema,
    output: z.array(contactFactRecordSchema),
  },
  contacts_facts_get: {
    input: recordIdInputSchema,
    output: contactFactRecordSchema,
  },
  contacts_facts_create: {
    input: contactFactCreateInputSchema,
    output: contactFactRecordSchema,
  },
  contacts_facts_decide: {
    input: contactFactDecisionInputSchema,
    output: contactFactRecordSchema,
  },
  contacts_facts_supersede: {
    input: contactFactSupersedeInputSchema,
    output: contactFactRecordSchema,
  },
  contacts_briefs_current: {
    input: contactBriefCurrentInputSchema,
    output: contactBriefRecordSchema.nullable(),
  },
  contacts_briefs_get: {
    input: recordIdInputSchema,
    output: contactBriefRecordSchema,
  },
  contacts_briefs_getVersion: {
    input: contactBriefVersionInputSchema,
    output: contactBriefRecordSchema.nullable(),
  },
  contacts_briefs_list: {
    input: contactBriefListInputSchema,
    output: z.array(contactBriefRecordSchema),
  },
  contacts_briefs_create: {
    input: contactBriefCreateInputSchema,
    output: contactBriefRecordSchema,
  },
  contacts_workHistory_list: {
    input: contactWorkHistoryListInputSchema,
    output: z.array(contactWorkHistorySchema),
  },
  contacts_workHistory_get: {
    input: recordIdInputSchema,
    output: contactWorkHistorySchema,
  },
  contacts_workHistory_create: {
    input: contactWorkHistoryCreateInputSchema,
    output: contactWorkHistorySchema,
  },
  contacts_workHistory_decide: {
    input: contactWorkHistoryDecisionInputSchema,
    output: contactWorkHistorySchema,
  },
  contacts_workHistory_supersede: {
    input: contactWorkHistorySupersedeInputSchema,
    output: contactWorkHistorySchema,
  },
  deals_list: {
    input: dealListInputSchema,
    output: dealListOutputSchema,
  },
  deals_get: {
    input: recordIdInputSchema,
    output: dealSchema,
  },
  deals_create: {
    input: dealCreateInputSchema,
    output: dealSchema,
  },
  deals_update: {
    input: dealUpdateInputSchema,
    output: dealSchema,
  },
  deals_setStage: {
    input: setDealStageInputSchema,
    output: dealSchema,
  },
  deals_archive: {
    input: archiveInputSchema,
    output: dealSchema,
  },
  deals_restore: {
    input: restoreInputSchema,
    output: dealSchema,
  },
  deals_purge: {
    input: purgeInputSchema,
    output: dealSchema,
  },
  deals_bulkAssignOwner: {
    input: bulkOwnerInputSchema,
    output: bulkResultSchema,
  },
  deals_bulkSetStage: {
    input: bulkStageInputSchema,
    output: bulkResultSchema,
  },
  deals_bulkArchive: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  deals_bulkRestore: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  deals_bulkPurge: {
    input: bulkIdsInputSchema,
    output: bulkResultSchema,
  },
  currency_rates_list: {
    input: currencyRateListInputSchema,
    output: currencyRateListOutputSchema,
  },
  currency_rates_listEffective: {
    input: currencyRateEffectiveListInputSchema,
    output: currencyRateListOutputSchema,
  },
  currency_rates_listAudit: {
    input: currencyRateAuditListInputSchema,
    output: currencyRateAuditListOutputSchema,
  },
  currency_rates_upsertManual: {
    input: currencyRateUpsertManualInputSchema,
    output: currencyRateSchema,
  },
  currency_rates_upsertFetched: {
    input: currencyRateUpsertFetchedInputSchema,
    output: currencyRateSchema,
  },
  currency_rates_removeManual: {
    input: currencyRateRemoveManualInputSchema,
    output: currencyRateSchema.nullable(),
  },
  currency_deals_rerate: {
    input: currencyDealRerateInputSchema,
    output: dealSchema,
  },
  currency_deals_rerateAll: {
    input: currencyDealRerateAllInputSchema,
    output: rerateSummarySchema,
  },
  activity_timeline: {
    input: activityListInputSchema,
    output: activityListOutputSchema,
  },
  activity_timelineCounts: {
    input: timelineCountsInputSchema,
    output: timelineCountsOutputSchema,
  },
  activity_myTasks: {
    input: myTasksInputSchema,
    output: myTasksOutputSchema,
  },
  activity_get: {
    input: activityGetInputSchema,
    output: activityEntrySchema,
  },
  activity_create: {
    input: activityCreateInputSchema,
    output: activityEntrySchema,
  },
  activity_complete: {
    input: activityCompleteInputSchema,
    output: activityEntrySchema,
  },
  dashboard_summary: {
    input: dashboardSummaryInputSchema,
    output: dashboardSummaryOutputSchema,
  },
  savedViews_list: {
    input: savedViewListInputSchema,
    output: savedViewListOutputSchema,
  },
  savedViews_create: {
    input: savedViewCreateInputSchema,
    output: savedViewSchema,
  },
  savedViews_update: {
    input: savedViewUpdateInputSchema,
    output: savedViewSchema,
  },
  savedViews_delete: {
    input: savedViewDeleteInputSchema,
    output: savedViewDeleteOutputSchema,
  },
  savedViews_setDefault: {
    input: savedViewSetDefaultInputSchema,
    output: savedViewSetDefaultOutputSchema,
  },
  fields_list: {
    input: fieldListInputSchema,
    output: fieldDefinitionListOutputSchema,
  },
  fields_byKey: {
    input: fieldByKeyInputSchema,
    output: fieldDefinitionSchema,
  },
  fields_filters: {
    input: fieldEntityInputSchema,
    output: fieldDefinitionListOutputSchema,
  },
  fields_coverage: {
    input: fieldIdInputSchema,
    output: fieldCoverageOutputSchema,
  },
  fields_create: {
    input: fieldDefinitionCreateInputSchema,
    output: fieldDefinitionSchema,
  },
  fields_update: {
    input: fieldDefinitionUpdateInputSchema,
    output: fieldDefinitionSchema,
  },
  fields_reorder: {
    input: fieldDefinitionReorderInputSchema,
    output: fieldDefinitionListOutputSchema,
  },
  fields_archive: {
    input: fieldDefinitionArchiveInputSchema,
    output: fieldDefinitionSchema,
  },
  fields_restore: {
    input: fieldDefinitionRestoreInputSchema,
    output: fieldDefinitionSchema,
  },
  fields_delete: {
    input: fieldDefinitionDeleteInputSchema,
    output: fieldDeleteOutputSchema,
  },
  fields_options_list: {
    input: fieldOptionListInputSchema,
    output: fieldOptionListOutputSchema,
  },
  fields_options_create: {
    input: fieldOptionCreateInputSchema,
    output: fieldOptionOutputSchema,
  },
  fields_options_update: {
    input: fieldOptionUpdateInputSchema,
    output: fieldOptionOutputSchema,
  },
  fields_options_archive: {
    input: fieldOptionArchiveInputSchema,
    output: fieldOptionOutputSchema,
  },
  fields_options_restore: {
    input: fieldOptionRestoreInputSchema,
    output: fieldOptionOutputSchema,
  },
  fields_options_delete: {
    input: fieldOptionDeleteInputSchema,
    output: fieldOptionDeleteOutputSchema,
  },
  fields_values_list: {
    input: fieldValueListInputSchema,
    output: fieldValueListOutputSchema,
  },
  fields_values_create: {
    input: fieldValueCreateInputSchema,
    output: fieldValueOutputSchema,
  },
  fields_values_update: {
    input: fieldValueUpdateInputSchema,
    output: fieldValueOutputSchema,
  },
  fields_values_delete: {
    input: fieldValueDeleteInputSchema,
    output: fieldValueDeleteOutputSchema,
  },
  agents_list: {
    input: agentListInputSchema,
    output: z.array(agentListItemSchema),
  },
  agents_get: {
    input: recordIdInputSchema,
    output: agentDetailSchema,
  },
  agents_create: {
    input: agentCreateInputSchema,
    output: agentDefinitionSchema,
  },
  agents_update: {
    input: agentUpdateInputSchema,
    output: agentDefinitionSchema,
  },
  agents_versions_list: {
    input: agentVersionListInputSchema,
    output: z.array(agentVersionSchema),
  },
  agents_versions_get: {
    input: recordIdInputSchema,
    output: agentVersionSchema,
  },
  agents_versions_create: {
    input: agentVersionCreateInputSchema,
    output: agentVersionSchema,
  },
  agents_versions_validate: {
    input: agentVersionValidateInputSchema,
    output: agentVersionSchema,
  },
  agents_deploy: {
    input: agentDeployInputSchema,
    output: z
      .object({ id: idSchema, versionId: idSchema, status: z.literal("LIVE") })
      .strict(),
  },
  agents_pause: {
    input: agentIdActionInputSchema,
    output: agentDefinitionSchema,
  },
  agents_resume: {
    input: agentIdActionInputSchema,
    output: agentDefinitionSchema,
  },
  agents_archive: {
    input: agentIdActionInputSchema,
    output: agentDefinitionSchema,
  },
  agents_restore: {
    input: agentIdActionInputSchema,
    output: agentDefinitionSchema,
  },
  agents_triggers_list: {
    input: agentTriggerListInputSchema,
    output: z.array(agentTriggerSchema),
  },
  agents_triggers_get: {
    input: recordIdInputSchema,
    output: agentTriggerSchema,
  },
  agents_triggers_create: {
    input: agentTriggerCreateInputSchema,
    output: agentTriggerSchema,
  },
  agents_triggers_update: {
    input: agentTriggerUpdateInputSchema,
    output: agentTriggerSchema,
  },
  agents_triggers_delete: {
    input: agentTriggerDeleteInputSchema,
    output: z.object({ id: idSchema }).strict(),
  },
  agents_triggers_enable: {
    input: agentTriggerEnableInputSchema,
    output: agentTriggerSchema,
  },
  agents_webhooks_list: {
    input: agentWebhookTokenListInputSchema,
    output: z.array(agentWebhookTokenSchema),
  },
  agents_webhooks_provision: {
    input: agentWebhookTokenProvisionInputSchema,
    output: provisionedAgentWebhookTokenSchema,
  },
  agents_webhooks_rotate: {
    input: agentWebhookTokenRotateInputSchema,
    output: provisionedAgentWebhookTokenSchema,
  },
  agents_webhooks_revoke: {
    input: agentWebhookTokenRevokeInputSchema,
    output: agentWebhookTokenSchema,
  },
  agents_runs_list: {
    input: agentRunListInputSchema,
    output: z.array(agentRunDetailSchema),
  },
  agents_runs_get: {
    input: agentRunGetInputSchema,
    output: agentRunDetailSchema,
  },
  agents_runs_queue: {
    input: agentRunQueueInputSchema,
    output: agentRunDetailSchema,
  },
  agents_runs_start: {
    input: agentIdActionInputSchema,
    output: agentRunDetailSchema,
  },
  agents_runs_requestApproval: {
    input: agentRunApprovalRequestInputSchema,
    output: agentRunDetailSchema,
  },
  agents_runs_approve: {
    input: agentRunApproveInputSchema,
    output: agentRunDetailSchema,
  },
  agents_runs_success: {
    input: agentRunSuccessInputSchema,
    output: agentRunDetailSchema,
  },
  agents_runs_fail: {
    input: agentRunFailureInputSchema,
    output: agentRunDetailSchema,
  },
  agents_runs_cancel: {
    input: agentRunCancelInputSchema,
    output: agentCancelledRunSchema,
  },
  agents_runs_retry: {
    input: agentRunRetryInputSchema,
    output: agentRunDetailSchema,
  },
  agents_actions_list: {
    input: agentActionListInputSchema,
    output: z.array(agentActionSchema),
  },
  agents_actions_get: {
    input: agentActionGetInputSchema,
    output: agentActionSchema,
  },
  agents_audit_list: {
    input: agentAuditListInputSchema,
    output: z.array(agentAuditEventSchema),
  },
  agents_threads_list: {
    input: agentThreadListInputSchema,
    output: z.array(agentThreadLinkSchema),
  },
  agents_threads_get: {
    input: agentThreadGetInputSchema,
    output: agentThreadLinkSchema,
  },
  agents_threads_createRecord: {
    input: agentThreadRecordCreateInputSchema,
    output: agentThreadLinkSchema,
  },
});
