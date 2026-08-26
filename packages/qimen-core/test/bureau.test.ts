import { Temporal } from "@js-temporal/polyfill";
import {
  QIMEN_BUREAU_TABLE,
  QimenBureauFactSchema,
  QimenYuanFactSchema,
  determineQimenBureau,
  yuanForDayPillar,
} from "@seeway/qimen-core";
import {
  buildTimeContext,
  resolveCivilTime,
  sexagenaryName,
  type TimeContext,
} from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const EXPECTED_BUREAU_TABLE = {
  冬至: ["阳遁", 1, 7, 4],
  小寒: ["阳遁", 2, 8, 5],
  大寒: ["阳遁", 3, 9, 6],
  立春: ["阳遁", 8, 5, 2],
  雨水: ["阳遁", 9, 6, 3],
  惊蛰: ["阳遁", 1, 7, 4],
  春分: ["阳遁", 3, 9, 6],
  清明: ["阳遁", 4, 1, 7],
  谷雨: ["阳遁", 5, 2, 8],
  立夏: ["阳遁", 4, 1, 7],
  小满: ["阳遁", 5, 2, 8],
  芒种: ["阳遁", 6, 3, 9],
  夏至: ["阴遁", 9, 3, 6],
  小暑: ["阴遁", 8, 2, 5],
  大暑: ["阴遁", 7, 1, 4],
  立秋: ["阴遁", 2, 5, 8],
  处暑: ["阴遁", 1, 4, 7],
  白露: ["阴遁", 9, 3, 6],
  秋分: ["阴遁", 7, 1, 4],
  寒露: ["阴遁", 6, 9, 3],
  霜降: ["阴遁", 5, 8, 2],
  立冬: ["阴遁", 6, 9, 3],
  小雪: ["阴遁", 5, 8, 2],
  大雪: ["阴遁", 4, 7, 1],
} as const;

const SYMBOL_HEAD_GROUPS = [
  [0, "甲子", "上元"],
  [5, "己巳", "中元"],
  [10, "甲戌", "下元"],
  [15, "己卯", "上元"],
  [20, "甲申", "中元"],
  [25, "己丑", "下元"],
  [30, "甲午", "上元"],
  [35, "己亥", "中元"],
  [40, "甲辰", "下元"],
  [45, "己酉", "上元"],
  [50, "甲寅", "中元"],
  [55, "己未", "下元"],
] as const;

function contextAt(localDateTime: string): TimeContext {
  return buildTimeContext(
    resolveCivilTime({
      localDateTime,
      timeZone: "Asia/Shanghai",
      precision: "second",
    }),
  );
}

function localSecondAt(
  zonedDateTime: string,
  seconds: number,
): string {
  return Temporal.ZonedDateTime.from(zonedDateTime)
    .add({ seconds })
    .toPlainDateTime()
    .toString({ smallestUnit: "second" });
}

describe("Qimen bureau table", () => {
  it("locks all 24 solar-term upper, middle and lower Ju values", () => {
    expect(Object.isFrozen(QIMEN_BUREAU_TABLE)).toBe(true);
    expect(
      Object.values(QIMEN_BUREAU_TABLE).every(Object.isFrozen),
    ).toBe(true);
    expect(Object.keys(QIMEN_BUREAU_TABLE)).toEqual(
      Object.keys(EXPECTED_BUREAU_TABLE),
    );

    for (const [solarTerm, [dunType, upper, middle, lower]] of Object.entries(
      EXPECTED_BUREAU_TABLE,
    )) {
      const solarTermName = solarTerm as keyof typeof QIMEN_BUREAU_TABLE;
      expect(QIMEN_BUREAU_TABLE[solarTermName]).toEqual({
        dunType,
        上元: upper,
        中元: middle,
        下元: lower,
      });
    }
  });
});

describe("split-supplement Yuan", () => {
  it.each([
    ["甲子", "甲子", "上元"],
    ["庚申", "己未", "下元"],
    ["乙巳", "甲辰", "下元"],
    ["丙辰", "甲寅", "中元"],
  ] as const)("maps %s to symbol head %s and %s", (day, head, yuan) => {
    expect(yuanForDayPillar(day)).toEqual({
      dayPillar: day,
      symbolHead: head,
      yuan,
    });
  });

  it("maps every explicit five-day group to its source symbol head", () => {
    const counts = { 上元: 0, 中元: 0, 下元: 0 };

    for (const [startIndex, symbolHead, yuan] of SYMBOL_HEAD_GROUPS) {
      for (const dayIndex of [startIndex, startIndex + 4]) {
        expect(yuanForDayPillar(sexagenaryName(dayIndex))).toMatchObject({
          symbolHead,
          yuan,
        });
      }
      counts[yuan] += 5;
    }

    expect(counts).toEqual({ 上元: 20, 中元: 20, 下元: 20 });
  });

  it("rejects a structurally valid but contradictory Yuan fact", () => {
    expect(
      QimenYuanFactSchema.safeParse({
        dayPillar: "庚申",
        symbolHead: "甲子",
        yuan: "上元",
      }).success,
    ).toBe(false);
  });

  it("rejects a value outside the sexagenary cycle", () => {
    expect(() => yuanForDayPillar("甲甲")).toThrow(/sexagenary/i);
  });
});

describe("Qimen bureau calculation", () => {
  it("switches from Yang Dun to Yin Dun at the exact Summer Solstice", () => {
    const beforeSearch = contextAt("2026-06-20T12:00:00");
    expect(beforeSearch.solarTerms.next.name).toBe("夏至");

    const before = contextAt(
      localSecondAt(beforeSearch.solarTerms.next.localDateTime, -1),
    );
    const at = contextAt(
      localSecondAt(beforeSearch.solarTerms.next.localDateTime, 0),
    );

    expect(determineQimenBureau(before)).toMatchObject({
      solarTerm: "芒种",
      dayPillar: "丙寅",
      symbolHead: "甲子",
      dunType: "阳遁",
      yuan: "上元",
      juNumber: 6,
    });
    expect(determineQimenBureau(at)).toMatchObject({
      solarTerm: "夏至",
      dayPillar: "丙寅",
      symbolHead: "甲子",
      dunType: "阴遁",
      yuan: "上元",
      juNumber: 9,
    });
  });

  it("switches from Yin Dun to Yang Dun at the exact Winter Solstice", () => {
    const beforeSearch = contextAt("2026-12-20T12:00:00");
    expect(beforeSearch.solarTerms.next.name).toBe("冬至");

    const before = contextAt(
      localSecondAt(beforeSearch.solarTerms.next.localDateTime, -1),
    );
    const at = contextAt(
      localSecondAt(beforeSearch.solarTerms.next.localDateTime, 0),
    );

    expect(determineQimenBureau(before)).toMatchObject({
      solarTerm: "大雪",
      dayPillar: "庚午",
      symbolHead: "己巳",
      dunType: "阴遁",
      yuan: "中元",
      juNumber: 7,
    });
    expect(determineQimenBureau(at)).toMatchObject({
      solarTerm: "冬至",
      dayPillar: "庚午",
      symbolHead: "己巳",
      dunType: "阳遁",
      yuan: "中元",
      juNumber: 7,
    });
  });

  it("changes Yuan at the 23:00 day-pillar boundary", () => {
    expect(
      determineQimenBureau(contextAt("2026-08-22T22:59:59")),
    ).toMatchObject({
      solarTerm: "立秋",
      dayPillar: "戊辰",
      symbolHead: "甲子",
      yuan: "上元",
      dunType: "阴遁",
      juNumber: 2,
    });
    expect(
      determineQimenBureau(contextAt("2026-08-22T23:00:00")),
    ).toMatchObject({
      solarTerm: "立秋",
      dayPillar: "己巳",
      symbolHead: "己巳",
      yuan: "中元",
      dunType: "阴遁",
      juNumber: 5,
    });
  });

  it("rejects contradictory bureau facts and freezes valid output", () => {
    const fact = determineQimenBureau(contextAt("2026-08-25T10:27:00"));
    const wrongYuan = fact.yuan === "上元" ? "中元" : "上元";
    expect(Object.isFrozen(fact)).toBe(true);
    expect(
      QimenBureauFactSchema.safeParse({
        ...fact,
        symbolHead: fact.symbolHead === "甲子" ? "己未" : "甲子",
      }).success,
    ).toBe(false);
    expect(
      QimenBureauFactSchema.safeParse({
        ...fact,
        yuan: wrongYuan,
        juNumber: QIMEN_BUREAU_TABLE[fact.solarTerm][wrongYuan],
      }).success,
    ).toBe(false);
    expect(
      QimenBureauFactSchema.safeParse({
        ...fact,
        juNumber: fact.juNumber === 9 ? 8 : 9,
      }).success,
    ).toBe(false);
    expect(
      QimenBureauFactSchema.safeParse({
        ...fact,
        dunType: fact.dunType === "阳遁" ? "阴遁" : "阳遁",
      }).success,
    ).toBe(false);
  });

  it("rejects a forged time context", () => {
    const context = contextAt("2026-08-25T10:27:00");
    const forged = {
      ...context,
      pillars: { ...context.pillars, day: "甲子" },
    } as TimeContext;

    expect(() => determineQimenBureau(forged)).toThrow();
  });

  it("rejects a forged current solar term", () => {
    const context = contextAt("2026-08-25T10:27:00");
    const forged = {
      ...context,
      solarTerms: {
        ...context.solarTerms,
        current: { ...context.solarTerms.current, name: "冬至" },
      },
    } as TimeContext;

    expect(() => determineQimenBureau(forged)).toThrow();
  });
});
