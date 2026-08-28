import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QIMEN_GUIDANCE_VERSION,
  evaluateQimenGuidance,
} from "@seeway/qimen-guidance";
import {
  QimenGoldenFixtureSchema,
  calculateQimenChart,
} from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const fixture = QimenGoldenFixtureSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(
        TEST_DIRECTORY,
        "../../../tests/fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  ),
);

function evaluateCase(caseIndex: number) {
  const goldenCase = fixture.cases[caseIndex]!;
  const timeContext = buildTimeContext(resolveCivilTime(goldenCase.input));
  const chart = calculateQimenChart(
    timeContext,
    goldenCase.chart.sourceReferences[0]!,
  );
  return {
    chart,
    timeContext,
    result: evaluateQimenGuidance(timeContext, chart),
  };
}

describe("Qimen guidance evaluation", () => {
  it("derives all four result buckets from a verified opening-door chart", () => {
    const { chart, result } = evaluateCase(0);

    expect(chart.chiefGate).toBe("开门");
    expect(result).toMatchObject({
      guidanceVersion: QIMEN_GUIDANCE_VERSION,
      ruleSetVersion: "qimen-gate-baseline/v1",
      status: "derived",
      uncertainty: "partial",
      verificationStatus: "verified",
    });
    expect(result.categories.favorable).toHaveLength(1);
    expect(result.categories.caution).toEqual([]);
    expect(result.categories.actions).toHaveLength(1);
    expect(result.categories.directions.some(({ polarity }) => polarity === "supportive")).toBe(true);
    expect(result.categories.directions.some(({ polarity }) => polarity === "avoid")).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.limitations).toContain(
      "未纳入门宫生克、旺相休囚、格局克应与具体问事用神",
    );
  });

  it("puts a death chief gate in caution without turning it into a health claim", () => {
    const { chart, result } = evaluateCase(2);

    expect(chart.chiefGate).toBe("死门");
    expect(result.categories.favorable).toEqual([]);
    expect(result.categories.caution).toHaveLength(1);
    expect(result.categories.actions).toHaveLength(1);
    expect(result.categories.caution[0]!.text).not.toMatch(/疾病|死亡|医院/);
  });

  it("ties every direction to the actual palace and gate in the chart", () => {
    const { chart, result } = evaluateCase(1);

    for (const direction of result.categories.directions) {
      const palace = chart.palaces.find(
        ({ fixed }) => fixed.number === direction.palaceNumber,
      );
      expect(palace).toBeDefined();
      expect(direction.direction).toBe(palace!.fixed.direction);
      expect(direction.gate).toBe(palace!.gate);
      expect(direction.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it("returns insufficient with empty buckets for a copied unauthenticated chart", () => {
    const { chart, timeContext } = evaluateCase(0);
    const result = evaluateQimenGuidance(timeContext, structuredClone(chart));

    expect(result).toMatchObject({
      status: "insufficient",
      uncertainty: "insufficient",
      verificationStatus: "blocked",
      evidence: [],
    });
    expect(result.categories).toEqual({
      favorable: [],
      caution: [],
      directions: [],
      actions: [],
    });
  });

  it("returns a deeply frozen result", () => {
    const { result } = evaluateCase(0);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.categories)).toBe(true);
    expect(Object.values(result.categories).every(Object.isFrozen)).toBe(true);
    expect(result.evidence.every(Object.isFrozen)).toBe(true);
  });
});
