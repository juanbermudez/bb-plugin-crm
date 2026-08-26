import { z } from "zod";

/** BB renderer id used by the CRM-owned clarification form. */
export const CLARIFICATION_RENDERER_ID = "crm-question";

export const clarificationDisplaySchema = z.enum([
  "confirmation",
  "select",
  "text",
]);

const clarificationOptionSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/** The only input an agent may author for one blocking question. */
export const askQuestionInputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4_000),
    display: clarificationDisplaySchema.optional(),
    options: z.array(clarificationOptionSchema).max(4).default([]),
    allowFreeform: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const ids = input.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Option IDs must be unique.",
      });
    }
  });
export type AskQuestionInput = z.output<typeof askQuestionInputSchema>;

/** Payload persisted by BB while a CRM question is waiting for an answer. */
export const clarificationPayloadSchema = z
  .object({
    kind: z.literal("question"),
    requestId: z.string().trim().min(1).max(128),
    prompt: z.string().trim().min(1).max(4_000),
    display: clarificationDisplaySchema,
    options: z.array(clarificationOptionSchema).max(4),
    allowFreeform: z.boolean(),
  })
  .strict();
export type ClarificationPayload = z.output<typeof clarificationPayloadSchema>;

/** Value submitted by the renderer back through `bb.ui.requestInput`. */
export const clarificationResponseSchema = z.union([
  z
    .object({
      requestId: z.string().trim().min(1).max(128),
      optionId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      requestId: z.string().trim().min(1).max(128),
      text: z.string().trim().min(1).max(4_096),
    })
    .strict(),
]);
export type ClarificationResponse = z.output<typeof clarificationResponseSchema>;

