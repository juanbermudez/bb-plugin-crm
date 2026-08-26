import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  archiveInputSchema,
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
  dealCreateInputSchema,
  dealListInputSchema,
  dealListOutputSchema,
  dealSchema,
  dealUpdateInputSchema,
  purgeInputSchema,
  recordIdInputSchema,
  rerateSummarySchema,
  restoreInputSchema,
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
});
