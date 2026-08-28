import {
  ConflictRefSchema,
  EvidenceRefSchema,
  type EvidenceRef,
} from "@seeway/contracts";
import {
  EIGHT_GATES,
  PALACE_DIRECTIONS,
  QimenChartSchema,
  isAuthenticQimenVerificationResult,
  verifyQimenChart,
} from "@seeway/qimen-core";
import type { TimeContext } from "@seeway/time-core";
import { z } from "zod";
import {
  DirectionPolaritySchema,
  GATE_GUIDANCE_RULES,
  GuidanceStrengthSchema,
  QIMEN_GUIDANCE_RULE_SET_VERSION,
  matchGateGuidanceRule,
  resolveGuidanceCandidates,
  type GuidanceCandidate,
} from "./rules";

export const QIMEN_GUIDANCE_VERSION = "qimen-guidance/v1" as const;

const GuidanceSummaryItemSchema = z
  .object({
    itemId: z.string().min(1),
    text: z.string().min(1),
    strength: GuidanceStrengthSchema,
    evidenceIds: z.array(z.string().min(1)).min(1).readonly(),
  })
  .strict()
  .readonly();

const DirectionItemSchema = z
  .object({
    itemId: z.string().min(1),
    polarity: DirectionPolaritySchema,
    palaceNumber: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(6),
      z.literal(7),
      z.literal(8),
      z.literal(9),
    ]),
    direction: z.enum(PALACE_DIRECTIONS).refine((value) => value !== "中"),
    gate: z.enum(EIGHT_GATES),
    purpose: z.string().min(1),
    strength: GuidanceStrengthSchema,
    evidenceIds: z.array(z.string().min(1)).min(1).readonly(),
  })
  .strict()
  .readonly();

const GuidanceCategoriesSchema = z
  .object({
    favorable: z.array(GuidanceSummaryItemSchema).readonly(),
    caution: z.array(GuidanceSummaryItemSchema).readonly(),
    directions: z.array(DirectionItemSchema).readonly(),
    actions: z.array(GuidanceSummaryItemSchema).readonly(),
  })
  .strict()
  .readonly();

export const QimenGuidanceResultSchema = z
  .object({
    guidanceVersion: z.literal(QIMEN_GUIDANCE_VERSION),
    ruleSetVersion: z.literal(QIMEN_GUIDANCE_RULE_SET_VERSION),
    status: z.enum(["derived", "insufficient"]),
    uncertainty: z.enum(["partial", "insufficient"]),
    verificationStatus: z.enum(["verified", "blocked"]),
    categories: GuidanceCategoriesSchema,
    evidence: z.array(EvidenceRefSchema).readonly(),
    conflicts: z.array(ConflictRefSchema).readonly(),
    limitations: z.array(z.string().min(1)).readonly(),
  })
  .strict()
  .superRefine((result, context) => {
    const itemCount =
      result.categories.favorable.length +
      result.categories.caution.length +
      result.categories.directions.length +
      result.categories.actions.length;
    if (
      result.status === "insufficient"
        ? itemCount !== 0 || result.evidence.length !== 0
        : itemCount === 0 || result.evidence.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Derived guidance needs evidence; insufficient guidance must be empty.",
        path: ["status"],
      });
    }
  })
  .readonly();

export type GuidanceSummaryItem = z.infer<typeof GuidanceSummaryItemSchema>;
export type DirectionItem = z.infer<typeof DirectionItemSchema>;
export type QimenGuidanceResult = z.infer<typeof QimenGuidanceResultSchema>;

const LIMITATIONS = Object.freeze([
  "未纳入门宫生克、旺相休囚、格局克应与具体问事用神",
  "当前结论是八门日常通用层，不适用于金融、医疗或其他专题判断",
] as const);

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function insufficient(
  verificationStatus: "verified" | "blocked",
): QimenGuidanceResult {
  return deepFreeze(
    QimenGuidanceResultSchema.parse({
      guidanceVersion: QIMEN_GUIDANCE_VERSION,
      ruleSetVersion: QIMEN_GUIDANCE_RULE_SET_VERSION,
      status: "insufficient",
      uncertainty: "insufficient",
      verificationStatus,
      categories: {
        favorable: [],
        caution: [],
        directions: [],
        actions: [],
      },
      evidence: [],
      conflicts: [],
      limitations: LIMITATIONS,
    }),
  );
}

function summaryItem(candidate: GuidanceCandidate): GuidanceSummaryItem {
  return GuidanceSummaryItemSchema.parse({
    itemId: candidate.candidateId,
    text: candidate.text,
    strength: candidate.strength,
    evidenceIds: [candidate.evidence.evidenceId],
  });
}

function directionItem(candidate: GuidanceCandidate): DirectionItem {
  return DirectionItemSchema.parse({
    itemId: candidate.candidateId,
    polarity: candidate.polarity,
    palaceNumber: candidate.palaceNumber,
    direction: candidate.direction,
    gate: candidate.gate,
    purpose: candidate.text,
    strength: candidate.strength,
    evidenceIds: [candidate.evidence.evidenceId],
  });
}

function uniqueEvidence(candidates: readonly GuidanceCandidate[]): EvidenceRef[] {
  const byId = new Map<string, EvidenceRef>();
  for (const candidate of candidates) {
    byId.set(candidate.evidence.evidenceId, candidate.evidence);
  }
  return [...byId.values()];
}

export function evaluateQimenGuidance(
  timeContext: TimeContext,
  candidateChart: unknown,
): QimenGuidanceResult {
  const verification = verifyQimenChart(timeContext, candidateChart);
  if (
    !isAuthenticQimenVerificationResult(verification) ||
    verification.status !== "verified" ||
    !verification.calculatorAuthenticated
  ) {
    return insufficient("blocked");
  }

  const chart = QimenChartSchema.parse(candidateChart);
  const candidates: GuidanceCandidate[] = [];
  const chiefRule = GATE_GUIDANCE_RULES.find(
    ({ gate }) => gate === chart.chiefGate,
  );
  if (chiefRule) {
    candidates.push(
      ...matchGateGuidanceRule(chiefRule, {
        scope: "general_daily",
        role: "chief",
        gate: chart.chiefGate,
      }),
    );
  }

  for (const palace of chart.palaces) {
    if (palace.gate === null || palace.fixed.number === 5) {
      continue;
    }
    const palaceRule = GATE_GUIDANCE_RULES.find(
      ({ gate }) => gate === palace.gate,
    );
    if (!palaceRule) {
      continue;
    }
    candidates.push(
      ...matchGateGuidanceRule(palaceRule, {
        scope: "general_daily",
        role: "direction",
        gate: palace.gate,
        palaceNumber: palace.fixed.number,
        direction: palace.fixed.direction,
      }),
    );
  }

  if (candidates.length === 0) {
    return insufficient("verified");
  }

  const resolved = resolveGuidanceCandidates(candidates);
  const result = QimenGuidanceResultSchema.parse({
    guidanceVersion: QIMEN_GUIDANCE_VERSION,
    ruleSetVersion: QIMEN_GUIDANCE_RULE_SET_VERSION,
    status: "derived",
    uncertainty: "partial",
    verificationStatus: "verified",
    categories: {
      favorable: resolved.items
        .filter(({ category }) => category === "favorable")
        .map(summaryItem),
      caution: resolved.items
        .filter(({ category }) => category === "caution")
        .map(summaryItem),
      directions: resolved.items
        .filter(({ category }) => category === "direction")
        .map(directionItem),
      actions: resolved.items
        .filter(({ category }) => category === "action")
        .map(summaryItem),
    },
    evidence: uniqueEvidence(candidates),
    conflicts: resolved.conflicts,
    limitations: LIMITATIONS,
  });
  return deepFreeze(result);
}
