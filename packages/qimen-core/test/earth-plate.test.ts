import {
  EARTH_PLATE_SEQUENCE,
  EarthPlateSchema,
  QIMEN_ALGORITHM_VERSION,
  QIMEN_BUREAU_TABLE,
  QIMEN_BUREAU_VERSION,
  QIMEN_YUANS,
  QimenBureauFactSchema,
  TIME_CONTEXT_CONVENTION_VERSION,
  buildEarthPlate,
  determineQimenBureau,
  type QimenBureauFact,
} from "@seeway/qimen-core";
import {
  buildTimeContext,
  resolveCivilTime,
} from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const YUAN_FACTS = {
  上元: { dayPillar: "甲子", symbolHead: "甲子" },
  中元: { dayPillar: "甲申", symbolHead: "甲申" },
  下元: { dayPillar: "甲戌", symbolHead: "甲戌" },
} as const;

function bureauAt(localDateTime: string) {
  return determineQimenBureau(
    buildTimeContext(
      resolveCivilTime({
        localDateTime,
        timeZone: "Asia/Shanghai",
        precision: "second",
      }),
    ),
  );
}

describe("Qimen earth plate", () => {
  it("locks the conventional earth-plate stem sequence", () => {
    expect(EARTH_PLATE_SEQUENCE).toEqual([
      "戊",
      "己",
      "庚",
      "辛",
      "壬",
      "癸",
      "丁",
      "丙",
      "乙",
    ]);
    expect(Object.isFrozen(EARTH_PLATE_SEQUENCE)).toBe(true);
  });

  it("places Yang Dun Ju 4 forward and wraps palace 9 to palace 1", () => {
    const plate = buildEarthPlate(bureauAt("1997-03-19T21:15:00"));

    expect(plate).toEqual([
      { palaceNumber: 1, stem: "丁" },
      { palaceNumber: 2, stem: "丙" },
      { palaceNumber: 3, stem: "乙" },
      { palaceNumber: 4, stem: "戊" },
      { palaceNumber: 5, stem: "己" },
      { palaceNumber: 6, stem: "庚" },
      { palaceNumber: 7, stem: "辛" },
      { palaceNumber: 8, stem: "壬" },
      { palaceNumber: 9, stem: "癸" },
    ]);
    expect(Object.isFrozen(plate)).toBe(true);
    expect(plate.every(Object.isFrozen)).toBe(true);
  });

  it("places Yang Dun Ju 9 forward and wraps palace 9 to palace 1", () => {
    expect(buildEarthPlate(bureauAt("2001-06-11T13:20:00"))).toEqual([
      { palaceNumber: 1, stem: "己" },
      { palaceNumber: 2, stem: "庚" },
      { palaceNumber: 3, stem: "辛" },
      { palaceNumber: 4, stem: "壬" },
      { palaceNumber: 5, stem: "癸" },
      { palaceNumber: 6, stem: "丁" },
      { palaceNumber: 7, stem: "丙" },
      { palaceNumber: 8, stem: "乙" },
      { palaceNumber: 9, stem: "戊" },
    ]);
  });

  it("places Yin Dun Ju 5 backward and wraps palace 1 to palace 9", () => {
    expect(buildEarthPlate(bureauAt("2002-08-16T12:00:00"))).toEqual([
      { palaceNumber: 1, stem: "壬" },
      { palaceNumber: 2, stem: "辛" },
      { palaceNumber: 3, stem: "庚" },
      { palaceNumber: 4, stem: "己" },
      { palaceNumber: 5, stem: "戊" },
      { palaceNumber: 6, stem: "乙" },
      { palaceNumber: 7, stem: "丙" },
      { palaceNumber: 8, stem: "丁" },
      { palaceNumber: 9, stem: "癸" },
    ]);
  });

  it("requires canonical palace order and nine unique stems", () => {
    const valid = buildEarthPlate(bureauAt("1997-03-19T21:15:00"));

    expect(
      EarthPlateSchema.safeParse([valid[1], valid[0], ...valid.slice(2)])
        .success,
    ).toBe(false);
    expect(
      EarthPlateSchema.safeParse([
        ...valid.slice(0, 8),
        { palaceNumber: 9, stem: valid[0]!.stem },
      ]).success,
    ).toBe(false);
    expect(new Set(valid.map(({ stem }) => stem)).size).toBe(9);
  });

  it("preserves the placement invariants for all 72 term-Yuan configurations", () => {
    for (const [solarTerm, tableEntry] of Object.entries(
      QIMEN_BUREAU_TABLE,
    )) {
      for (const yuan of QIMEN_YUANS) {
        const bureau = QimenBureauFactSchema.parse({
          bureauVersion: QIMEN_BUREAU_VERSION,
          algorithmVersion: QIMEN_ALGORITHM_VERSION,
          timeContextVersion: TIME_CONTEXT_CONVENTION_VERSION,
          solarTerm,
          ...YUAN_FACTS[yuan],
          dunType: tableEntry.dunType,
          yuan,
          juNumber: tableEntry[yuan],
        });
        const plate = buildEarthPlate(bureau);
        const palaceByStem = new Map(
          plate.map(({ palaceNumber, stem }) => [stem, palaceNumber]),
        );
        let expectedPalace = tableEntry[yuan];

        for (const stem of EARTH_PLATE_SEQUENCE) {
          expect(palaceByStem.get(stem)).toBe(expectedPalace);
          expectedPalace =
            tableEntry.dunType === "阳遁"
              ? expectedPalace === 9
                ? 1
                : expectedPalace + 1
              : expectedPalace === 1
                ? 9
                : expectedPalace - 1;
        }
      }
    }
  });

  it("rejects an unparsed or contradictory bureau fact", () => {
    const valid = bureauAt("1997-03-19T21:15:00");
    const forged = {
      ...valid,
      juNumber: 5,
    } as QimenBureauFact;

    expect(() => buildEarthPlate(forged)).toThrow(/bureau/i);
  });
});
