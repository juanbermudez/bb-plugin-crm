import { z } from "zod";

export const WORKSPACE_PROFILE_MAX_NARRATIVE = 320;
export const WORKSPACE_PROFILE_MAX_LINE = 140;

const optionalLineSchema = z.string().trim().max(WORKSPACE_PROFILE_MAX_LINE).nullable();

export const workspaceProfileSchema = z
  .object({
    website: z.string().url(),
    narrative: z.string().max(WORKSPACE_PROFILE_MAX_NARRATIVE),
    sells: optionalLineSchema,
    sellsTo: optionalLineSchema,
    edge: optionalLineSchema,
    sourceUrl: z.string().url().nullable(),
    refreshedAt: z.string().datetime(),
  })
  .strict();

export const workspaceIdentitySchema = z
  .object({
    workspaceName: z.string(),
    website: z.string().url().nullable(),
    profile: workspaceProfileSchema.nullable(),
  })
  .strict();

export const workspaceIdentityGetInputSchema = z.null();

export const workspaceIdentityUpdateInputSchema = z
  .object({
    website: z.string().trim().min(1).max(2048),
    narrative: z
      .string()
      .trim()
      .max(WORKSPACE_PROFILE_MAX_NARRATIVE)
      .refine((value) => value.length === 0 || value.length >= 40, {
        message: "Workspace profile must be empty or at least 40 characters.",
      }),
    sells: z.string().trim().max(WORKSPACE_PROFILE_MAX_LINE).optional(),
    sellsTo: z.string().trim().max(WORKSPACE_PROFILE_MAX_LINE).optional(),
    edge: z.string().trim().max(WORKSPACE_PROFILE_MAX_LINE).optional(),
    sourceUrl: z.string().trim().max(2048).optional(),
  })
  .strict();

export type WorkspaceProfile = z.infer<typeof workspaceProfileSchema>;
export type WorkspaceIdentity = z.infer<typeof workspaceIdentitySchema>;
export type WorkspaceIdentityUpdateInput = z.infer<
  typeof workspaceIdentityUpdateInputSchema
>;
