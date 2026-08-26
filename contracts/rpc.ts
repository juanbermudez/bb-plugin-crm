import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  archiveInputSchema,
  bulkIdsInputSchema,
  bulkOwnerInputSchema,
  bulkResultSchema,
  companyCreateInputSchema,
  companyListInputSchema,
  companyListOutputSchema,
  companySchema,
  companyUpdateInputSchema,
  purgeInputSchema,
  recordIdInputSchema,
  restoreInputSchema,
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
});
