import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
        "fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  ),
);

describe("complete Qimen chart golden cases", () => {
  it("recalculates every verified chart palace by palace", () => {
    for (const goldenCase of fixture.cases) {
      const timeContext = buildTimeContext(
        resolveCivilTime(goldenCase.input),
      );
      const sourceReference = goldenCase.chart.sourceReferences[0]!;

      expect(calculateQimenChart(timeContext, sourceReference)).toEqual(
        goldenCase.chart,
      );
    }
  });
});
