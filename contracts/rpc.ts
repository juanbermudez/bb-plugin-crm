import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

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
});
