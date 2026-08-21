import { z } from "zod";
import { ConflictRefSchema, EvidenceRefSchema } from "./evidence";
import { MemoryScopeSchema, ProfileScopeSchema } from "./memory";

const NonEmptyStringSchema = z.string().trim().min(1);
const TimezoneSchema = NonEmptyStringSchema.refine(
  (timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  },
  { message: "Timezone must be a valid IANA timezone identifier." },
);

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
    timezone: TimezoneSchema,
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
    instrument: NonEmptyStringSchema.optional(),
    investmentHorizon: NonEmptyStringSchema.optional(),
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

export const TraceableClaimSchema = z
  .object({
    text: NonEmptyStringSchema,
    evidenceIds: z
      .array(NonEmptyStringSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Claim evidence IDs must be distinct.",
      }),
  })
  .strict();

export const ConclusionSchema = z
  .object({
    favorable: z.array(TraceableClaimSchema),
    cautions: z.array(TraceableClaimSchema),
    supportiveDirection: TraceableClaimSchema.optional(),
    avoidDirection: TraceableClaimSchema.optional(),
    action: TraceableClaimSchema,
    tendency: TendencySchema,
    tendencyEvidenceIds: z
      .array(NonEmptyStringSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Tendency evidence IDs must be distinct.",
      }),
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

export const AgentReportSchema = z
  .discriminatedUnion("status", [
    CompleteAgentReportSchema,
    NeedsInputAgentReportSchema,
    UnsupportedAgentReportSchema,
    ErrorAgentReportSchema,
  ])
  .superRefine((report, context) => {
    const ownedEvidenceIds = new Set(
      report.evidence.map((item) => item.evidenceId),
    );
    for (const [conflictIndex, conflict] of report.conflicts.entries()) {
      for (const evidenceId of conflict.evidenceIds) {
        if (!ownedEvidenceIds.has(evidenceId)) {
          context.addIssue({
            code: "custom",
            message: `Conflict references unknown evidence: ${evidenceId}.`,
            path: ["conflicts", conflictIndex, "evidenceIds"],
          });
        }
      }
    }

    if (report.status !== "complete") {
      return;
    }
    const claims = [
      ...report.conclusion.favorable,
      ...report.conclusion.cautions,
      report.conclusion.supportiveDirection,
      report.conclusion.avoidDirection,
      report.conclusion.action,
    ].filter((claim) => claim !== undefined);
    for (const [claimIndex, claim] of claims.entries()) {
      for (const evidenceId of claim.evidenceIds) {
        if (!ownedEvidenceIds.has(evidenceId)) {
          context.addIssue({
            code: "custom",
            message: `Conclusion references unknown evidence: ${evidenceId}.`,
            path: ["conclusion", "claims", claimIndex, "evidenceIds"],
          });
        }
      }
    }
    for (const evidenceId of report.conclusion.tendencyEvidenceIds) {
      if (!ownedEvidenceIds.has(evidenceId)) {
        context.addIssue({
          code: "custom",
          message: `Tendency references unknown evidence: ${evidenceId}.`,
          path: ["conclusion", "tendencyEvidenceIds"],
        });
      }
    }
  });

export type AgentId = z.infer<typeof AgentIdSchema>;
export type IntentCategory = z.infer<typeof IntentCategorySchema>;
export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type Tendency = z.infer<typeof TendencySchema>;
export type TraceableClaim = z.infer<typeof TraceableClaimSchema>;
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
