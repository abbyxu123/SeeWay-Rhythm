import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QIMEN_VERIFIER_VERSION,
  QimenGoldenFixtureSchema,
  calculateQimenChart,
  isAuthenticQimenVerificationResult,
  verifyQimenChart,
  type QimenChart,
} from "@seeway/qimen-core";
import {
  buildTimeContext,
  resolveCivilTime,
  type TimeContext,
} from "@seeway/time-core";
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

interface CalculatedGolden {
  readonly caseId: string;
  readonly timeContext: TimeContext;
  readonly chart: QimenChart;
}

function calculatedGoldens(): readonly CalculatedGolden[] {
  return fixture.cases.map((goldenCase) => {
    const timeContext = buildTimeContext(
      resolveCivilTime(goldenCase.input),
    );
    return {
      caseId: goldenCase.caseId,
      timeContext,
      chart: calculateQimenChart(
        timeContext,
        goldenCase.chart.sourceReferences[0]!,
      ),
    };
  });
}

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

type MutableChart = DeepMutable<QimenChart>;

function swap<T>(values: T[], left: number, right: number): void {
  [values[left], values[right]] = [values[right]!, values[left]!];
}

const mutations = [
  {
    label: "Ju number",
    expectedCode: "bureau_mismatch",
    mutate(chart: MutableChart) {
      chart.juNumber = chart.juNumber === 9 ? 1 : chart.juNumber + 1;
    },
  },
  {
    label: "earth-plate stem",
    expectedCode: "earth_plate_mismatch",
    mutate(chart: MutableChart) {
      const stems = chart.palaces.map(({ earthPlateStem }) => earthPlateStem);
      swap(stems, 0, 1);
      chart.palaces[0]!.earthPlateStem = stems[0]!;
      chart.palaces[1]!.earthPlateStem = stems[1]!;
    },
  },
  {
    label: "heaven-plate stem",
    expectedCode: "heaven_plate_mismatch",
    mutate(chart: MutableChart) {
      const movable = chart.palaces.filter(
        ({ heavenPlate }) => heavenPlate.length > 0,
      );
      const left = movable[0]!.heavenPlate[0]!;
      const right = movable[1]!.heavenPlate[0]!;
      [left.stem, right.stem] = [right.stem, left.stem];
    },
  },
  {
    label: "nine star",
    expectedCode: "heaven_plate_mismatch",
    mutate(chart: MutableChart) {
      const movable = chart.palaces.filter(
        ({ heavenPlate }) => heavenPlate.length === 1,
      );
      const left = movable[0]!.heavenPlate[0]!;
      const right = movable[1]!.heavenPlate[0]!;
      [left.star, right.star] = [right.star, left.star];
    },
  },
  {
    label: "gate",
    expectedCode: "gate_mismatch",
    mutate(chart: MutableChart) {
      const movable = chart.palaces.filter(({ gate }) => gate !== null);
      [movable[0]!.gate, movable[1]!.gate] = [
        movable[1]!.gate,
        movable[0]!.gate,
      ];
    },
  },
  {
    label: "deity",
    expectedCode: "deity_mismatch",
    mutate(chart: MutableChart) {
      const movable = chart.palaces.filter(({ deity }) => deity !== null);
      [movable[0]!.deity, movable[1]!.deity] = [
        movable[1]!.deity,
        movable[0]!.deity,
      ];
    },
  },
  {
    label: "schema-valid Xun head and void-palace pair",
    expectedCode: "hour_facts_mismatch",
    mutate(chart: MutableChart) {
      chart.xunHead = { name: "甲子", instrument: "戊" };
      chart.voidPalaces = [6];
    },
  },
  {
    label: "horse palace",
    expectedCode: "hour_facts_mismatch",
    mutate(chart: MutableChart) {
      chart.horsePalace = chart.horsePalace === 2 ? 4 : 2;
    },
  },
] as const;

describe("independent Qimen chart verifier", () => {
  it.each(calculatedGoldens())(
    "verifies a freshly calculated golden chart: $caseId",
    ({ timeContext, chart }) => {
      const result = verifyQimenChart(timeContext, chart);

      expect(result).toEqual({
        verifierVersion: QIMEN_VERIFIER_VERSION,
        contextKey: `${timeContext.civil.timeZone}|${timeContext.civil.localDateTime}`,
        calculatorAuthenticated: true,
        status: "verified",
        issues: [],
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.issues)).toBe(true);
    },
  );

  for (const golden of calculatedGoldens()) {
    for (const mutation of mutations) {
      it(`blocks ${golden.caseId} after a ${mutation.label} mutation`, () => {
        const changed = structuredClone(golden.chart) as MutableChart;
        mutation.mutate(changed);

        const result = verifyQimenChart(golden.timeContext, changed);

        expect(result.status).toBe("blocked");
        expect(result.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: mutation.expectedCode }),
          ]),
        );
      });
    }
  }

  it.each(calculatedGoldens())(
    "blocks a forged but well-formed source reference: $caseId",
    ({ timeContext, chart }) => {
      const changed = structuredClone(chart) as MutableChart;
      changed.sourceReferences[0]!.fingerprint = `sha256:${"f".repeat(64)}`;

      expect(verifyQimenChart(timeContext, changed)).toMatchObject({
        status: "blocked",
        issues: [expect.objectContaining({ code: "source_mismatch" })],
      });
    },
  );

  it.each(calculatedGoldens().map((golden, index, all) => ({
    ...golden,
    replacement: all[(index + 1) % all.length]!.chart.sourceReferences[0]!,
  })))(
    "blocks a source locator borrowed from another golden case: $caseId",
    ({ timeContext, chart, replacement }) => {
      const changed = structuredClone(chart) as MutableChart;
      changed.sourceReferences = [structuredClone(replacement)];

      expect(verifyQimenChart(timeContext, changed)).toMatchObject({
        status: "blocked",
        issues: [expect.objectContaining({ code: "source_mismatch" })],
      });
    },
  );

  it.each([
    {
      label: "a moving Yin chart",
      localDateTime: "2002-08-16T14:00:00",
      expected: {
        hour: "乙未",
        juNumber: 5,
        chiefStar: "天芮",
        gateByPalace: { 1: "死门", 3: "开门", 8: "惊门" },
        lodgingPalace: 6,
      },
    },
    {
      label: "a moving chart whose chief star starts from the center",
      localDateTime: "2002-08-21T14:00:00",
      expected: {
        hour: "乙未",
        juNumber: 8,
        chiefStar: "天禽",
        gateByPalace: { 1: "伤门", 3: "景门", 8: "杜门" },
        lodgingPalace: 9,
      },
    },
  ])("verifies $label against pinned placements", ({ localDateTime, expected }) => {
    const timeContext = buildTimeContext(
      resolveCivilTime({
        localDateTime,
        timeZone: "Asia/Shanghai",
        precision: "second",
      }),
    );
    const source = fixture.cases[2]!.chart.sourceReferences[0]!;
    const chart = calculateQimenChart(timeContext, source);
    const byPalace = new Map(
      chart.palaces.map((palace) => [palace.fixed.number, palace]),
    );

    expect(timeContext.pillars.hour).toBe(expected.hour);
    expect(chart.dunType).toBe("阴遁");
    expect(chart.juNumber).toBe(expected.juNumber);
    expect(chart.chiefStar).toBe(expected.chiefStar);
    for (const [palace, gate] of Object.entries(expected.gateByPalace)) {
      expect(byPalace.get(Number(palace))?.gate).toBe(gate);
    }
    expect(
      chart.palaces.find(({ heavenPlate }) => heavenPlate.length === 2)?.fixed
        .number,
    ).toBe(expected.lodgingPalace);

    const verification = verifyQimenChart(timeContext, chart);
    expect(verification.status).toBe("verified");
    expect(isAuthenticQimenVerificationResult(verification)).toBe(true);
  });

  it("blocks a forged time context instead of verifying against it", () => {
    const [golden] = calculatedGoldens();
    const forged = {
      ...golden!.timeContext,
      pillars: { ...golden!.timeContext.pillars, hour: "甲子" },
    } as TimeContext;

    expect(verifyQimenChart(forged, golden!.chart)).toMatchObject({
      status: "blocked",
      issues: [expect.objectContaining({ code: "invalid_time_context" })],
    });
  });
});
