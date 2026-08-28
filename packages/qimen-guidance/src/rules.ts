import {
  ConflictRefSchema,
  EvidenceRefSchema,
  type ConflictRef,
  type EvidenceRef,
} from "@seeway/contracts";
import {
  EIGHT_GATES,
  PALACE_DIRECTIONS,
  type EightGate,
  type PalaceDirection,
} from "@seeway/qimen-core";
import { z } from "zod";

export const QIMEN_GUIDANCE_RULE_SET_VERSION =
  "qimen-gate-baseline/v1" as const;

const SOURCE = Object.freeze({
  sourceId: "zhang-shenqi-zhimen",
  title: "《奇门遁甲入门教程-神奇之门》张志春",
  fingerprint:
    "sha256:507852339d4205bee3ab7f9b009888e77c551bfb1ff0c627d0a07a7b01c4a96f",
});

export const GuidanceStrengthSchema = z.enum(["low", "medium", "high"]);
export const GuidanceCategorySchema = z.enum([
  "favorable",
  "caution",
  "direction",
  "action",
]);
export const DirectionPolaritySchema = z.enum(["supportive", "avoid"]);

const RuleSourceSchema = z
  .object({
    sourceId: z.string().min(1),
    title: z.string().min(1),
    locator: z.string().min(1),
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
  .readonly();

export const GateGuidanceRuleSchema = z
  .object({
    ruleId: z.string().regex(/^QG-GATE-[A-Z]+-001$/),
    ruleVersion: z.literal("qimen-guidance-rule/v1"),
    ruleSetVersion: z.literal(QIMEN_GUIDANCE_RULE_SET_VERSION),
    gate: z.enum(EIGHT_GATES),
    baseline: z.enum(["favorable", "caution", "context"]),
    strength: GuidanceStrengthSchema,
    preconditions: z
      .tuple([z.literal("verified_chart"), z.literal("general_daily_scope")])
      .readonly(),
    source: RuleSourceSchema,
    texts: z
      .object({
        tendency: z.string().min(1).nullable(),
        action: z.string().min(1),
        direction: z.string().min(1).nullable(),
      })
      .strict()
      .readonly(),
    directionPolarity: DirectionPolaritySchema.nullable(),
  })
  .strict()
  .superRefine((rule, context) => {
    if (
      (rule.baseline === "context") !== (rule.texts.tendency === null) ||
      (rule.directionPolarity === null) !== (rule.texts.direction === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Context and direction effects must match their declared text.",
        path: ["texts"],
      });
    }
  })
  .readonly();

export type GuidanceStrength = z.infer<typeof GuidanceStrengthSchema>;
export type GuidanceCategory = z.infer<typeof GuidanceCategorySchema>;
export type DirectionPolarity = z.infer<typeof DirectionPolaritySchema>;
export type GateGuidanceRule = z.infer<typeof GateGuidanceRuleSchema>;

function rule(
  input: Omit<
    GateGuidanceRule,
    "ruleVersion" | "ruleSetVersion" | "preconditions" | "source"
  > & { readonly locator: string },
): GateGuidanceRule {
  const { locator, ...body } = input;
  return GateGuidanceRuleSchema.parse({
    ...body,
    ruleVersion: "qimen-guidance-rule/v1",
    ruleSetVersion: QIMEN_GUIDANCE_RULE_SET_VERSION,
    preconditions: ["verified_chart", "general_daily_scope"],
    source: { ...SOURCE, locator },
  });
}

export const GATE_GUIDANCE_RULES: readonly GateGuidanceRule[] = Object.freeze([
  rule({
    ruleId: "QG-GATE-OPEN-001",
    gate: "开门",
    baseline: "favorable",
    strength: "medium",
    locator: "印刷页111-112；PDF第131-132页，八门总论与开门",
    directionPolarity: "supportive",
    texts: {
      tendency: "开门基础倾向偏有利，适合启动、经营与公开推进",
      action: "可优先安排启动、商务、远行或需要公开推进的事项",
      direction: "适合启动、经营或远行类事项",
    },
  }),
  rule({
    ruleId: "QG-GATE-REST-001",
    gate: "休门",
    baseline: "favorable",
    strength: "medium",
    locator: "印刷页111-113；PDF第131-133页，八门总论与休门",
    directionPolarity: "supportive",
    texts: {
      tendency: "休门基础倾向偏有利，适合休整、协调与从容处理",
      action: "宜放缓节奏，安排会见、沟通、休整或稳定推进",
      direction: "适合会见、协调、休整或稳妥推进",
    },
  }),
  rule({
    ruleId: "QG-GATE-LIFE-001",
    gate: "生门",
    baseline: "favorable",
    strength: "medium",
    locator: "印刷页111、113；PDF第131、133页，八门总论与生门",
    directionPolarity: "supportive",
    texts: {
      tendency: "生门基础倾向偏有利，适合经营、建设与生长类事务",
      action: "可优先处理求财、经营、建设或需要持续增长的事项",
      direction: "适合求财、经营、建设或生长类事项",
    },
  }),
  rule({
    ruleId: "QG-GATE-INJURY-001",
    gate: "伤门",
    baseline: "caution",
    strength: "medium",
    locator: "印刷页111、113；PDF第131、133页，八门总论与伤门",
    directionPolarity: "avoid",
    texts: {
      tendency: "伤门基础倾向需谨慎，留意争执、磕碰、破耗与仓促出行",
      action: "放慢行动并复核交通、沟通和成本，避免逞强或冲动推进",
      direction: "普通出行、合作或扩张事项宜谨慎",
    },
  }),
  rule({
    ruleId: "QG-GATE-OBSTRUCTION-001",
    gate: "杜门",
    baseline: "context",
    strength: "low",
    locator: "印刷页111、113-114；PDF第131、133-134页，八门总论与杜门",
    directionPolarity: null,
    texts: {
      tendency: null,
      action: "宜保密、收束、排查或暂缓公开，先处理阻塞点",
      direction: null,
    },
  }),
  rule({
    ruleId: "QG-GATE-SCENERY-001",
    gate: "景门",
    baseline: "context",
    strength: "low",
    locator: "印刷页111、114；PDF第131、134页，八门总论与景门",
    directionPolarity: null,
    texts: {
      tendency: null,
      action: "宜处理文书、方案、表达和信息核对，避免只重表面",
      direction: null,
    },
  }),
  rule({
    ruleId: "QG-GATE-DEATH-001",
    gate: "死门",
    baseline: "caution",
    strength: "medium",
    locator: "印刷页111、114；PDF第131、134页，八门总论与死门",
    directionPolarity: "avoid",
    texts: {
      tendency: "死门基础倾向偏收束，普通行动不宜强行扩张",
      action: "宜处理收尾、整理和低风险事务，避免仓促启动或强行推进",
      direction: "普通出行、启动或拓展事项宜谨慎",
    },
  }),
  rule({
    ruleId: "QG-GATE-ALARM-001",
    gate: "惊门",
    baseline: "caution",
    strength: "medium",
    locator: "印刷页111、114-115；PDF第131、134-135页，八门总论与惊门",
    directionPolarity: "avoid",
    texts: {
      tendency: "惊门基础倾向需谨慎，留意惊扰、争执、口舌与临时变化",
      action: "沟通先确认事实，给行程留余量，避免在情绪高点作决定",
      direction: "沟通、出行或临时决策宜谨慎",
    },
  }),
]);

export const GuidanceCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    slot: z.string().min(1),
    category: GuidanceCategorySchema,
    text: z.string().min(1),
    strength: GuidanceStrengthSchema,
    evidence: EvidenceRefSchema,
    polarity: DirectionPolaritySchema.optional(),
    palaceNumber: z.number().int().min(1).max(9).optional(),
    direction: z.enum(PALACE_DIRECTIONS).optional(),
    gate: z.enum(EIGHT_GATES).optional(),
  })
  .strict()
  .superRefine((candidate, context) => {
    const directionFields = [
      candidate.polarity,
      candidate.palaceNumber,
      candidate.direction,
      candidate.gate,
    ];
    if (
      candidate.category === "direction"
        ? directionFields.some((value) => value === undefined) ||
          candidate.palaceNumber === 5 ||
          candidate.direction === "中"
        : directionFields.some((value) => value !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only outer-palace direction candidates carry direction fields.",
        path: ["category"],
      });
    }
  })
  .readonly();

export type GuidanceCandidate = z.infer<typeof GuidanceCandidateSchema>;

export type GateGuidanceFacts =
  | {
      readonly scope: "general_daily";
      readonly role: "chief";
      readonly gate: EightGate;
    }
  | {
      readonly scope: "general_daily";
      readonly role: "direction";
      readonly gate: EightGate;
      readonly palaceNumber: number;
      readonly direction: PalaceDirection;
    };

function evidence(
  ruleDefinition: GateGuidanceRule,
  evidenceId: string,
  factPath: string,
  explanation: string,
  effect: "favorable" | "caution" | "context",
): EvidenceRef {
  return EvidenceRefSchema.parse({
    evidenceId,
    ruleId: ruleDefinition.ruleId,
    ruleVersion: ruleDefinition.ruleVersion,
    sourceId: ruleDefinition.source.sourceId,
    factPath,
    explanation,
    effect,
  });
}

export function matchGateGuidanceRule(
  ruleDefinition: GateGuidanceRule,
  facts: GateGuidanceFacts,
): readonly GuidanceCandidate[] {
  if (
    facts.scope !== "general_daily" ||
    facts.gate !== ruleDefinition.gate
  ) {
    return Object.freeze([]);
  }

  if (facts.role === "chief") {
    const candidates: GuidanceCandidate[] = [];
    if (ruleDefinition.texts.tendency !== null) {
      const category = ruleDefinition.baseline as "favorable" | "caution";
      const evidenceId = `${ruleDefinition.ruleId}:chief:tendency`;
      candidates.push(
        GuidanceCandidateSchema.parse({
          candidateId: evidenceId,
          slot: "chief:tendency",
          category,
          text: ruleDefinition.texts.tendency,
          strength: ruleDefinition.strength,
          evidence: evidence(
            ruleDefinition,
            evidenceId,
            "chart.chiefGate",
            `值使门为${ruleDefinition.gate}，命中八门基础性质规则。`,
            category,
          ),
        }),
      );
    }

    const actionEvidenceId = `${ruleDefinition.ruleId}:chief:action`;
    candidates.push(
      GuidanceCandidateSchema.parse({
        candidateId: actionEvidenceId,
        slot: "chief:action",
        category: "action",
        text: ruleDefinition.texts.action,
        strength: ruleDefinition.strength,
        evidence: evidence(
          ruleDefinition,
          actionEvidenceId,
          "chart.chiefGate",
          `值使门为${ruleDefinition.gate}，采用其日常通用行动提示。`,
          "context",
        ),
      }),
    );
    return Object.freeze(candidates);
  }

  if (
    facts.palaceNumber === 5 ||
    facts.direction === "中" ||
    ruleDefinition.directionPolarity === null ||
    ruleDefinition.texts.direction === null
  ) {
    return Object.freeze([]);
  }

  const effect =
    ruleDefinition.directionPolarity === "supportive"
      ? "favorable"
      : "caution";
  const evidenceId = `${ruleDefinition.ruleId}:palace:${facts.palaceNumber}:direction`;
  return Object.freeze([
    GuidanceCandidateSchema.parse({
      candidateId: evidenceId,
      slot: `direction:${facts.palaceNumber}`,
      category: "direction",
      text: ruleDefinition.texts.direction,
      strength: ruleDefinition.strength,
      polarity: ruleDefinition.directionPolarity,
      palaceNumber: facts.palaceNumber,
      direction: facts.direction,
      gate: facts.gate,
      evidence: evidence(
        ruleDefinition,
        evidenceId,
        `chart.palaces[palace=${facts.palaceNumber}].gate`,
        `${ruleDefinition.gate}落${facts.palaceNumber}宫（${facts.direction}），生成用途限定的方位提示。`,
        effect,
      ),
    }),
  ]);
}

const STRENGTH_RANK: Readonly<Record<GuidanceStrength, number>> = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
});

function materiallyDiffers(
  left: GuidanceCandidate,
  right: GuidanceCandidate,
): boolean {
  return (
    left.category !== right.category ||
    left.text !== right.text ||
    left.polarity !== right.polarity
  );
}

export interface GuidanceResolution {
  readonly items: readonly GuidanceCandidate[];
  readonly conflicts: readonly ConflictRef[];
}

export function resolveGuidanceCandidates(
  input: readonly GuidanceCandidate[],
): Readonly<GuidanceResolution> {
  const candidates = input.map((candidate) =>
    GuidanceCandidateSchema.parse(candidate),
  );
  const bySlot = new Map<string, GuidanceCandidate[]>();
  for (const candidate of candidates) {
    const group = bySlot.get(candidate.slot) ?? [];
    group.push(candidate);
    bySlot.set(candidate.slot, group);
  }

  const items: GuidanceCandidate[] = [];
  const conflicts: ConflictRef[] = [];
  for (const [slot, group] of bySlot) {
    const ordered = [...group].sort(
      (left, right) =>
        STRENGTH_RANK[right.strength] - STRENGTH_RANK[left.strength] ||
        left.candidateId.localeCompare(right.candidateId),
    );
    const winner = ordered[0]!;
    const strongest = ordered.filter(
      ({ strength }) => strength === winner.strength,
    );
    const unresolved = strongest.some((candidate) =>
      materiallyDiffers(winner, candidate),
    );

    if (!unresolved) {
      items.push(winner);
    }
    if (group.length > 1 && group.some((item) => materiallyDiffers(winner, item))) {
      conflicts.push(
        ConflictRefSchema.parse({
          conflictId: `guidance-conflict:${slot}`,
          evidenceIds: group.map(({ evidence: itemEvidence }) =>
            itemEvidence.evidenceId,
          ),
          explanation: unresolved
            ? `同一输出槽 ${slot} 出现同强度相反证据，暂不输出结论。`
            : `同一输出槽 ${slot} 出现不同强度相反证据，保留较强证据。`,
          resolution: unresolved ? "unresolved" : "primary",
        }),
      );
    }
  }

  return Object.freeze({
    items: Object.freeze(items),
    conflicts: Object.freeze(conflicts),
  });
}
