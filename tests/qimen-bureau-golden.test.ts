import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QimenGoldenFixtureSchema,
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

describe("Qimen bureau golden cases", () => {
  it("derives every Dun, Yuan and Ju from the source civil time", () => {
    for (const goldenCase of fixture.cases) {
      const timeContext = buildTimeContext(
        resolveCivilTime(goldenCase.input),
      );

      expect(determineQimenBureau(timeContext)).toMatchObject({
        solarTerm: goldenCase.expectedTime.solarTerm,
        dayPillar: goldenCase.expectedTime.pillars.day,
        dunType: goldenCase.chart.dunType,
        yuan: goldenCase.chart.yuan,
        juNumber: goldenCase.chart.juNumber,
      });
    }
  });
});
