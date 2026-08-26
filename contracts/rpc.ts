import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
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
  contactListInputSchema,
  contactListOutputSchema,
  contactSchema,
  contactUpdateInputSchema,
  currencyDealRerateAllInputSchema,
  currencyDealRerateInputSchema,
  currencyRateAuditListInputSchema,
  currencyRateAuditListOutputSchema,
  currencyRateEffectiveListInputSchema,
  currencyRateListInputSchema,
  currencyRateListOutputSchema,
  currencyRateRemoveManualInputSchema,
  currencyRateSchema,
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
} from "./core.js";

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
});
