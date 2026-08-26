import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QimenGoldenFixtureSchema,
  calculateQimenHourFacts,
} from "@seeway/qimen-core";
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

describe("Qimen hour-fact golden cases", () => {
  it("matches every verified Xun head, void and horse fact", () => {
    for (const goldenCase of fixture.cases) {
      const facts = calculateQimenHourFacts(
        goldenCase.expectedTime.pillars.hour,
      );

      expect(facts).toMatchObject({
        hourPillar: goldenCase.expectedTime.pillars.hour,
        xunHead: goldenCase.chart.xunHead,
        voidPalaces: goldenCase.chart.voidPalaces,
        horsePalace: goldenCase.chart.horsePalace,
      });
    }
  });
});
