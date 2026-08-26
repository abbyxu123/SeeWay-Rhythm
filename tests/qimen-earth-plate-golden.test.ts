import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QimenGoldenFixtureSchema,
  buildEarthPlate,
  determineQimenBureau,
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

describe("Qimen earth-plate golden cases", () => {
  it("matches every verified chart palace by palace", () => {
    for (const goldenCase of fixture.cases) {
      const timeContext = buildTimeContext(
        resolveCivilTime(goldenCase.input),
      );
      const bureau = determineQimenBureau(timeContext);

      expect(buildEarthPlate(bureau)).toEqual(
        goldenCase.chart.palaces.map(({ fixed, earthPlateStem }) => ({
          palaceNumber: fixed.number,
          stem: earthPlateStem,
        })),
      );
    }
  });
});
