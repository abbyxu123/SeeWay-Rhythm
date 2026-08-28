import {
  GATE_GUIDANCE_RULES,
  GateGuidanceRuleSchema,
  matchGateGuidanceRule,
  resolveGuidanceCandidates,
  type GuidanceCandidate,
} from "@seeway/qimen-guidance";
import { EIGHT_GATES } from "@seeway/qimen-core";
import { describe, expect, it } from "vitest";

const SOURCE_FINGERPRINT =
  "sha256:507852339d4205bee3ab7f9b009888e77c551bfb1ff0c627d0a07a7b01c4a96f";

describe("gate guidance rule registry", () => {
  it("contains one strict, cited rule for each gate", () => {
    expect(GATE_GUIDANCE_RULES).toHaveLength(8);
    expect(new Set(GATE_GUIDANCE_RULES.map(({ ruleId }) => ruleId)).size).toBe(8);
    expect(new Set(GATE_GUIDANCE_RULES.map(({ gate }) => gate))).toEqual(
      new Set(EIGHT_GATES),
    );

    for (const rule of GATE_GUIDANCE_RULES) {
      expect(GateGuidanceRuleSchema.parse(rule)).toEqual(rule);
      expect(rule.source).toMatchObject({
        sourceId: "zhang-shenqi-zhimen",
        fingerprint: SOURCE_FINGERPRINT,
      });
      expect(rule.source.locator).toMatch(/印刷页.*PDF第/);
      expect(rule.preconditions).toEqual([
        "verified_chart",
        "general_daily_scope",
      ]);
    }
  });

  it.each(GATE_GUIDANCE_RULES)(
    "$ruleId hits only its exact chief gate and always gives an action",
    (rule) => {
      const hit = matchGateGuidanceRule(rule, {
        scope: "general_daily",
        role: "chief",
        gate: rule.gate,
      });
      const differentGate = EIGHT_GATES.find((gate) => gate !== rule.gate)!;
      const miss = matchGateGuidanceRule(rule, {
        scope: "general_daily",
        role: "chief",
        gate: differentGate,
      });

      expect(hit.some(({ category }) => category === "action")).toBe(true);
      expect(hit.every(({ evidence }) => evidence.ruleId === rule.ruleId)).toBe(
        true,
      );
      expect(miss).toEqual([]);
    },
  );

  it.each(GATE_GUIDANCE_RULES)(
    "$ruleId rejects unsupported scope and impossible center-palace directions",
    (rule) => {
      expect(
        matchGateGuidanceRule(rule, {
          scope: "financial" as "general_daily",
          role: "chief",
          gate: rule.gate,
        }),
      ).toEqual([]);
      expect(
        matchGateGuidanceRule(rule, {
          scope: "general_daily",
          role: "direction",
          gate: rule.gate,
          palaceNumber: 5,
          direction: "中",
        }),
      ).toEqual([]);
    },
  );

  it("distinguishes supportive, avoid and context-only directions", () => {
    const directionMatch = (gate: (typeof EIGHT_GATES)[number]) =>
      matchGateGuidanceRule(
        GATE_GUIDANCE_RULES.find((rule) => rule.gate === gate)!,
        {
          scope: "general_daily",
          role: "direction",
          gate,
          palaceNumber: 1,
          direction: "北",
        },
      );

    expect(directionMatch("开门")[0]).toMatchObject({
      category: "direction",
      polarity: "supportive",
      palaceNumber: 1,
      direction: "北",
    });
    expect(directionMatch("伤门")[0]).toMatchObject({
      category: "direction",
      polarity: "avoid",
    });
    expect(directionMatch("杜门")).toEqual([]);
    expect(directionMatch("景门")).toEqual([]);
  });

  it.each(GATE_GUIDANCE_RULES)(
    "$ruleId does not fabricate a winner for an equal-strength opposite conflict",
    (rule) => {
      const [candidate] = matchGateGuidanceRule(rule, {
        scope: "general_daily",
        role: "chief",
        gate: rule.gate,
      });
      expect(candidate).toBeDefined();
      const opposite: GuidanceCandidate = {
        ...candidate!,
        candidateId: `${candidate!.candidateId}:opposite`,
        category:
          candidate!.category === "favorable" ? "caution" : "favorable",
        text: "相反测试结论",
        evidence: {
          ...candidate!.evidence,
          evidenceId: `${candidate!.evidence.evidenceId}:opposite`,
          effect:
            candidate!.category === "favorable" ? "caution" : "favorable",
        },
      };

      const resolved = resolveGuidanceCandidates([candidate!, opposite]);

      expect(resolved.items).toEqual([]);
      expect(resolved.conflicts).toHaveLength(1);
      expect(resolved.conflicts[0]).toMatchObject({ resolution: "unresolved" });
    },
  );

  it("selects stronger evidence but records the displaced conflict", () => {
    const openRule = GATE_GUIDANCE_RULES.find(({ gate }) => gate === "开门")!;
    const [candidate] = matchGateGuidanceRule(openRule, {
      scope: "general_daily",
      role: "chief",
      gate: "开门",
    });
    const weaker: GuidanceCandidate = {
      ...candidate!,
      candidateId: "weaker-opposite",
      category: "caution",
      text: "较弱相反结论",
      strength: "low",
      evidence: {
        ...candidate!.evidence,
        evidenceId: "weaker-opposite:evidence",
        effect: "caution",
      },
    };

    const resolved = resolveGuidanceCandidates([candidate!, weaker]);

    expect(resolved.items).toEqual([candidate]);
    expect(resolved.conflicts).toHaveLength(1);
    expect(resolved.conflicts[0]).toMatchObject({ resolution: "primary" });
  });
});
