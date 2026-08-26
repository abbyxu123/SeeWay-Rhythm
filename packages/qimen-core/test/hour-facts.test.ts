import {
  QIMEN_ALGORITHM_VERSION,
  QIMEN_HOUR_FACTS_VERSION,
  QimenHourFactsSchema,
  calculateQimenHourFacts,
} from "@seeway/qimen-core";
import { sexagenaryName } from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const EXPECTED_XUN_FACTS = [
  { name: "甲子", instrument: "戊", voidPalaces: [6] },
  { name: "甲戌", instrument: "己", voidPalaces: [2, 7] },
  { name: "甲申", instrument: "庚", voidPalaces: [2, 9] },
  { name: "甲午", instrument: "辛", voidPalaces: [4] },
  { name: "甲辰", instrument: "壬", voidPalaces: [3, 8] },
  { name: "甲寅", instrument: "癸", voidPalaces: [1, 8] },
] as const;

describe("Qimen hour facts", () => {
  it("derives the preceding Xun head, instrument and void palaces for all sixty hours", () => {
    for (let cycleIndex = 0; cycleIndex < 60; cycleIndex += 1) {
      const hourPillar = sexagenaryName(cycleIndex);
      const expected = EXPECTED_XUN_FACTS[Math.floor(cycleIndex / 10)]!;
      const facts = calculateQimenHourFacts(hourPillar);

      expect(facts).toMatchObject({
        hourFactsVersion: QIMEN_HOUR_FACTS_VERSION,
        algorithmVersion: QIMEN_ALGORITHM_VERSION,
        hourPillar,
        xunHead: {
          name: expected.name,
          instrument: expected.instrument,
        },
        voidPalaces: expected.voidPalaces,
      });
    }
  });

  it.each([
    ["甲子", "甲子", "戊"],
    ["癸酉", "甲子", "戊"],
    ["甲戌", "甲戌", "己"],
    ["癸未", "甲戌", "己"],
    ["甲申", "甲申", "庚"],
    ["癸巳", "甲申", "庚"],
    ["甲午", "甲午", "辛"],
    ["癸卯", "甲午", "辛"],
    ["甲辰", "甲辰", "壬"],
    ["癸丑", "甲辰", "壬"],
    ["甲寅", "甲寅", "癸"],
    ["癸亥", "甲寅", "癸"],
  ] as const)(
    "locks literal Xun boundary %s to %s/%s",
    (pillar, xunHead, instrument) => {
      expect(calculateQimenHourFacts(pillar).xunHead).toEqual({
        name: xunHead,
        instrument,
      });
    },
  );

  it.each([
    ["甲申", 8],
    ["甲子", 8],
    ["甲辰", 8],
    ["甲寅", 2],
    ["甲午", 2],
    ["甲戌", 2],
    ["己巳", 6],
    ["癸酉", 6],
    ["乙丑", 6],
    ["癸亥", 4],
    ["丁卯", 4],
    ["辛未", 4],
  ] as const)("maps hour pillar %s to horse palace %i", (pillar, palace) => {
    expect(calculateQimenHourFacts(pillar).horsePalace).toBe(palace);
  });

  it("returns a deeply frozen fact", () => {
    const facts = calculateQimenHourFacts("丁亥");

    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.xunHead)).toBe(true);
    expect(Object.isFrozen(facts.voidPalaces)).toBe(true);
  });

  it("rejects facts that contradict their hour pillar", () => {
    const valid = calculateQimenHourFacts("丁亥");

    expect(
      QimenHourFactsSchema.safeParse({
        ...valid,
        xunHead: { name: "甲子", instrument: "戊" },
      }).success,
    ).toBe(false);
    expect(
      QimenHourFactsSchema.safeParse({
        ...valid,
        voidPalaces: [6],
      }).success,
    ).toBe(false);
    expect(
      QimenHourFactsSchema.safeParse({
        ...valid,
        horsePalace: 8,
      }).success,
    ).toBe(false);
    expect(
      QimenHourFactsSchema.safeParse({
        ...valid,
        hourPillar: "甲子",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields and values outside the sexagenary cycle", () => {
    const valid = calculateQimenHourFacts("丁亥");

    expect(
      QimenHourFactsSchema.safeParse({
        ...valid,
        interpretation: "大吉",
      }).success,
    ).toBe(false);
    expect(() => calculateQimenHourFacts("甲甲")).toThrow(/sexagenary/i);
    expect(() => calculateQimenHourFacts("甲子子")).toThrow(/sexagenary/i);
  });
});
