import { z } from "zod";
import { ConflictRefSchema, EvidenceRefSchema } from "./evidence";
import { MemoryScopeSchema, ProfileScopeSchema } from "./memory";

const NonEmptyStringSchema = z.string().trim().min(1);

export const AgentIdSchema = z.enum([
  "orchestrator",
  "qimen-rhythm",
  "qimen-query",
  "ziwei-timeline",
  "bazi-profile",
  "qimen-finance",
  "meihua",
]);

export const IntentCategorySchema = z.enum([
  "rhythm",
  "query",
  "timeline",
  "profile",
  "finance",
  "meihua",
]);

export const AgentRequestSchema = z
  .object({
    requestId: NonEmptyStringSchema,
    intent: NonEmptyStringSchema,
    category: IntentCategorySchema,
    questionTime: z.iso.datetime({ offset: true }),
    targetTime: z.iso.datetime({ offset: true }).optional(),
    timezone: NonEmptyStringSchema,
    location: NonEmptyStringSchema.optional(),
    actors: z
      .array(
        z
          .object({
            role: NonEmptyStringSchema,
            relation: NonEmptyStringSchema.optional(),
          })
          .strict(),
      )
      .optional(),
    profileScopes: z.array(ProfileScopeSchema),
    memoryScopes: z.array(MemoryScopeSchema),
    requestedAgent: AgentIdSchema.optional(),
  })
  .strict();

export const TendencySchema = z.enum([
  "favorable",
  "caution",
  "mixed",
  "insufficient",
]);

export const ConclusionSchema = z
  .object({
    favorable: z.array(NonEmptyStringSchema),
    cautions: z.array(NonEmptyStringSchema),
    supportiveDirection: NonEmptyStringSchema.optional(),
    avoidDirection: NonEmptyStringSchema.optional(),
    action: NonEmptyStringSchema,
    tendency: TendencySchema,
  })
  .strict();

const ReportCommonShape = {
  agentId: AgentIdSchema,
  agentVersion: NonEmptyStringSchema,
  chartSnapshotId: NonEmptyStringSchema.optional(),
  conflicts: z.array(ConflictRefSchema),
  requiredInputs: z.array(NonEmptyStringSchema),
  ruleVersion: NonEmptyStringSchema,
  generatedAt: z.iso.datetime({ offset: true }),
};

export const CompleteAgentReportSchema = z
  .object({
    ...ReportCommonShape,
    status: z.literal("complete"),
    conclusion: ConclusionSchema,
    evidence: z.array(EvidenceRefSchema).min(1),
    requiredInputs: z.array(NonEmptyStringSchema).max(0),
  })
  .strict();

export const NeedsInputAgentReportSchema = z
  .object({
    ...ReportCommonShape,
    status: z.literal("needs_input"),
    evidence: z.array(EvidenceRefSchema),
    requiredInputs: z.array(NonEmptyStringSchema).min(1),
  })
  .strict();

export const UnsupportedAgentReportSchema = z
  .object({
    ...ReportCommonShape,
    status: z.literal("unsupported"),
    evidence: z.array(EvidenceRefSchema).max(0),
    requiredInputs: z.array(NonEmptyStringSchema).max(0),
    reasonCode: NonEmptyStringSchema,
    reason: NonEmptyStringSchema,
    prerequisites: z.array(NonEmptyStringSchema),
  })
  .strict();

export const ErrorAgentReportSchema = z
  .object({
    ...ReportCommonShape,
    status: z.literal("error"),
    evidence: z.array(EvidenceRefSchema).max(0),
    requiredInputs: z.array(NonEmptyStringSchema).max(0),
    errorCode: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
  })
  .strict();

export const AgentReportSchema = z.discriminatedUnion("status", [
  CompleteAgentReportSchema,
  NeedsInputAgentReportSchema,
  UnsupportedAgentReportSchema,
  ErrorAgentReportSchema,
]);

export type AgentId = z.infer<typeof AgentIdSchema>;
export type IntentCategory = z.infer<typeof IntentCategorySchema>;
export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type Tendency = z.infer<typeof TendencySchema>;
export type Conclusion = z.infer<typeof ConclusionSchema>;
export type CompleteAgentReport = z.infer<typeof CompleteAgentReportSchema>;
export type NeedsInputAgentReport = z.infer<
  typeof NeedsInputAgentReportSchema
>;
export type UnsupportedAgentReport = z.infer<
  typeof UnsupportedAgentReportSchema
>;
export type ErrorAgentReport = z.infer<typeof ErrorAgentReportSchema>;
export type AgentReport = z.infer<typeof AgentReportSchema>;
