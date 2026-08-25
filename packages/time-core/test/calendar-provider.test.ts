import { describe, expect, it } from "vitest";
import {
  calendarFactsFor,
  resolveCivilTime,
  type ResolvedCivilTime,
} from "@seeway/time-core";
import * as calendarProviderModule from "../src/calendar-provider";

interface RuntimeSchema {
  readonly safeParse: (value: unknown) => { readonly success: boolean };
}

function calendarFactsSchema(): RuntimeSchema {
  const schema = (
    calendarProviderModule as unknown as {
      readonly CalendarFactsSchema?: RuntimeSchema;
    }
  ).CalendarFactsSchema;

  expect(schema).toBeDefined();
  return schema as RuntimeSchema;
}

function resolved(
  localDateTime: string,
  timeZone = "Asia/Shanghai",
): ResolvedCivilTime {
  return resolveCivilTime({
    localDateTime,
    timeZone,
    precision: "second",
  });
}

describe("calendarFactsFor", () => {
  it("returns candidate Shanghai calendar facts from the pinned provider output", () => {
    const result = calendarFactsFor(resolved("2026-08-21T11:54:00"));

    expect(result).toEqual({
      timeZone: "Asia/Shanghai",
      providerVersion: "tyme4ts@1.5.2",
      conventionVersion: "time-cn-zhang-v1",
      verificationStatus: "unverified",
      dateBoundary: {
        lunarDatePolicy: "civil-midnight",
        sexagenaryDayPillarPolicy: "zi-start-23:00",
        isSplitWindow: false,
      },
      lunar: {
        year: 2026,
        month: 7,
        day: 9,
        leap: false,
        yearName: "农历丙午年",
        monthName: "七月",
        dayName: "初九",
      },
      pillars: {
        year: "丙午",
        month: "丙申",
        day: "丁卯",
        hour: "丙午",
      },
      solarTerms: {
        previous: {
          name: "大暑",
          kind: "qi",
          localDateTime: "2026-07-23T03:13:05+08:00[Asia/Shanghai]",
          instant: "2026-07-22T19:13:05Z",
        },
        current: {
          name: "立秋",
          kind: "jie",
          localDateTime: "2026-08-07T19:42:43+08:00[Asia/Shanghai]",
          instant: "2026-08-07T11:42:43Z",
        },
        next: {
          name: "处暑",
          kind: "qi",
          localDateTime: "2026-08-23T10:18:49+08:00[Asia/Shanghai]",
          instant: "2026-08-23T02:18:49Z",
        },
      },
    });
  });

  it("pins the reviewed 2026-08-25 hardware display case", () => {
    const result = calendarFactsFor(resolved("2026-08-25T01:35:40"));

    expect(result.lunar).toMatchObject({
      year: 2026,
      month: 7,
      day: 13,
      yearName: "农历丙午年",
      monthName: "七月",
      dayName: "十三",
    });
    expect(result.pillars).toEqual({
      year: "丙午",
      month: "丙申",
      day: "辛未",
      hour: "己丑",
    });
    expect(result.solarTerms.current).toMatchObject({
      name: "处暑",
      kind: "qi",
      localDateTime: "2026-08-23T10:18:49+08:00[Asia/Shanghai]",
    });
  });

  it("returns only plain deeply frozen project objects", () => {
    const result = calendarFactsFor(resolved("2026-08-21T11:54:00"));

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.lunar)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.pillars)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.dateBoundary)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.solarTerms)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.solarTerms.previous)).toBe(
      Object.prototype,
    );
    expect(Object.getPrototypeOf(result.solarTerms.current)).toBe(
      Object.prototype,
    );
    expect(Object.getPrototypeOf(result.solarTerms.next)).toBe(Object.prototype);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.lunar)).toBe(true);
    expect(Object.isFrozen(result.pillars)).toBe(true);
    expect(Object.isFrozen(result.dateBoundary)).toBe(true);
    expect(Object.isFrozen(result.solarTerms)).toBe(true);
    expect(Object.isFrozen(result.solarTerms.previous)).toBe(true);
    expect(Object.isFrozen(result.solarTerms.current)).toBe(true);
    expect(Object.isFrozen(result.solarTerms.next)).toBe(true);

    expect(() => {
      (result.pillars as { hour: string }).hour = "丁未";
    }).toThrow(TypeError);
  });

  it("rejects non-Shanghai resolved times because V1 calendar facts are China-time only", () => {
    expect(() =>
      calendarFactsFor(resolved("2026-08-21T11:54:00", "America/New_York")),
    ).toThrow(RangeError);
  });

  it("makes the civil-midnight and zi-start day-boundary split explicit", () => {
    const beforeSplit = calendarFactsFor(resolved("2026-08-21T22:59:00"));
    const split = calendarFactsFor(resolved("2026-08-21T23:00:00"));
    const afterMidnight = calendarFactsFor(resolved("2026-08-22T00:00:00"));

    expect(beforeSplit.dateBoundary).toEqual({
      lunarDatePolicy: "civil-midnight",
      sexagenaryDayPillarPolicy: "zi-start-23:00",
      isSplitWindow: false,
    });
    expect(split.dateBoundary).toEqual({
      lunarDatePolicy: "civil-midnight",
      sexagenaryDayPillarPolicy: "zi-start-23:00",
      isSplitWindow: true,
    });
    expect(split.lunar).toMatchObject({
      month: 7,
      day: 9,
      monthName: "七月",
      dayName: "初九",
    });
    expect(split.pillars.day).toBe("戊辰");
    expect(afterMidnight.dateBoundary.isSplitWindow).toBe(false);
  });

  it("rejects an accessor-backed provider input without invoking the getter", () => {
    const source = resolved("2026-08-21T11:54:00");
    const input = { ...source };
    let getterCalls = 0;
    Object.defineProperty(input, "instant", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return source.instant;
      },
    });

    expect(() => calendarFactsFor(input as never)).toThrow(TypeError);
    expect(getterCalls).toBe(0);
  });

  it("rejects invalid lunar, pillar, and solar-term fact semantics", () => {
    const base = structuredClone(
      calendarFactsFor(resolved("2026-08-21T11:54:00")),
    );
    const schema = calendarFactsSchema();
    const invalidCandidates: unknown[] = [
      { ...base, lunar: { ...base.lunar, month: 13 } },
      { ...base, lunar: { ...base.lunar, day: 31 } },
      { ...base, lunar: { ...base.lunar, yearName: "" } },
      { ...base, lunar: { ...base.lunar, monthName: "" } },
      { ...base, lunar: { ...base.lunar, dayName: "" } },
      { ...base, pillars: { ...base.pillars, day: "甲丑" } },
      {
        ...base,
        solarTerms: {
          ...base.solarTerms,
          current: { ...base.solarTerms.current, name: "不存在" },
        },
      },
      {
        ...base,
        solarTerms: {
          ...base.solarTerms,
          current: { ...base.solarTerms.current, kind: "qi" },
        },
      },
      {
        ...base,
        solarTerms: {
          ...base.solarTerms,
          current: {
            ...base.solarTerms.current,
            localDateTime: "2026-08-07T19:42:43+09:00[Asia/Tokyo]",
          },
        },
      },
      {
        ...base,
        solarTerms: {
          ...base.solarTerms,
          current: {
            ...base.solarTerms.current,
            instant: "2026-08-07T11:42:44Z",
          },
        },
      },
      {
        ...base,
        solarTerms: {
          ...base.solarTerms,
          previous: {
            ...base.solarTerms.previous,
            name: "小暑",
            kind: "jie",
          },
        },
      },
      {
        ...base,
        solarTerms: {
          previous: {
            ...base.solarTerms.previous,
            localDateTime: base.solarTerms.current.localDateTime,
            instant: base.solarTerms.current.instant,
          },
          current: {
            ...base.solarTerms.current,
            localDateTime: base.solarTerms.previous.localDateTime,
            instant: base.solarTerms.previous.instant,
          },
          next: base.solarTerms.next,
        },
      },
    ];

    expect(schema.safeParse(base).success).toBe(true);
    for (const candidate of invalidCandidates) {
      expect(schema.safeParse(candidate).success).toBe(false);
    }
  });
});
