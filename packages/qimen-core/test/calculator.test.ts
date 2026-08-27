import {
  QimenChartSchema,
  calculateQimenChart,
} from "@seeway/qimen-core";
import {
  buildTimeContext,
  resolveCivilTime,
  type TimeContext,
} from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const SOURCE_REFERENCE = {
  sourceId: "zhang-advanced-course-notes",
  title: "河北周易研究会奇门遁甲高级班笔记",
  locator: "PDF第2页，例一",
  fingerprint:
    "sha256:4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47",
} as const;

function contextAt(localDateTime: string): TimeContext {
  return buildTimeContext(
    resolveCivilTime({
      localDateTime,
      timeZone: "Asia/Shanghai",
      precision: "second",
    }),
  );
}

describe("complete Qimen chart calculator", () => {
  it("assembles a strict and deeply frozen chart from verified facts", () => {
    const chart = calculateQimenChart(
      contextAt("1997-03-19T21:15:00"),
      SOURCE_REFERENCE,
    );

    expect(QimenChartSchema.parse(chart)).toEqual(chart);
    expect(chart.sourceReferences).toEqual([SOURCE_REFERENCE]);
    expect(Object.isFrozen(chart)).toBe(true);
    expect(Object.isFrozen(chart.sourceReferences)).toBe(true);
    expect(chart.sourceReferences.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(chart.palaces)).toBe(true);
    expect(chart.palaces.every(Object.isFrozen)).toBe(true);
    expect(
      chart.palaces.every(({ fixed, heavenPlate }) =>
        Object.isFrozen(fixed) && Object.isFrozen(heavenPlate),
      ),
    ).toBe(true);
  });

  it("rejects an invalid source reference", () => {
    expect(() =>
      calculateQimenChart(contextAt("1997-03-19T21:15:00"), {
        ...SOURCE_REFERENCE,
        fingerprint: "sha256:invalid",
      }),
    ).toThrow(/source/i);
  });

  it("rejects a forged time context", () => {
    const context = contextAt("1997-03-19T21:15:00");
    const forged = {
      ...context,
      pillars: { ...context.pillars, hour: "甲子" },
    } as TimeContext;

    expect(() => calculateQimenChart(forged, SOURCE_REFERENCE)).toThrow(
      /context/i,
    );
  });
});
