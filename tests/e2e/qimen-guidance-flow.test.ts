import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateQimenGuidance } from "@seeway/qimen-guidance";
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
        "../fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  ),
);

describe("verified chart to four-category guidance", () => {
  it("calculates, verifies and derives cited guidance without language-model input", () => {
    for (const goldenCase of fixture.cases) {
      const context = buildTimeContext(resolveCivilTime(goldenCase.input));
      const chart = calculateQimenChart(
        context,
        goldenCase.chart.sourceReferences[0]!,
      );
      const result = evaluateQimenGuidance(context, chart);

      expect(result.status).toBe("derived");
      expect(result.verificationStatus).toBe("verified");
      expect(result.categories.actions).toHaveLength(1);
      expect(result.categories.directions).toHaveLength(6);
      expect(result.evidence.length).toBeGreaterThanOrEqual(8);
      expect(
        result.evidence.every(
          ({ sourceId, ruleId, factPath }) =>
            sourceId === "zhang-shenqi-zhimen" &&
            ruleId.startsWith("QG-GATE-") &&
            factPath.startsWith("chart."),
        ),
      ).toBe(true);
    }
  });

  it("keeps the same chart deterministic across repeated evaluations", () => {
    const goldenCase = fixture.cases[0]!;
    const context = buildTimeContext(resolveCivilTime(goldenCase.input));
    const chart = calculateQimenChart(
      context,
      goldenCase.chart.sourceReferences[0]!,
    );

    expect(evaluateQimenGuidance(context, chart)).toEqual(
      evaluateQimenGuidance(context, chart),
    );
  });
});
