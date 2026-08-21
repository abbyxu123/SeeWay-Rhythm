import { z } from "zod";

const NonEmptyStringSchema = z.string().trim().min(1);

export const EvidenceEffectSchema = z.enum([
  "favorable",
  "caution",
  "context",
]);

export const EvidenceRefSchema = z
  .object({
    evidenceId: NonEmptyStringSchema,
    ruleId: NonEmptyStringSchema,
    ruleVersion: NonEmptyStringSchema,
    sourceId: NonEmptyStringSchema,
    factPath: NonEmptyStringSchema,
    explanation: NonEmptyStringSchema,
    effect: EvidenceEffectSchema.optional(),
  })
  .strict();

export const ConflictResolutionSchema = z.enum([
  "primary",
  "secondary",
  "unresolved",
]);

export const ConflictRefSchema = z
  .object({
    conflictId: NonEmptyStringSchema,
    evidenceIds: z.array(NonEmptyStringSchema).min(2),
    explanation: NonEmptyStringSchema,
    resolution: ConflictResolutionSchema,
  })
  .strict();

export type EvidenceEffect = z.infer<typeof EvidenceEffectSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;
export type ConflictRef = z.infer<typeof ConflictRefSchema>;
