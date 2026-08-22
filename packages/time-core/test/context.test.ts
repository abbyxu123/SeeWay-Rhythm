import { describe, expect, it } from "vitest";
import {
  buildTimeContext,
  resolveCivilTime,
  shichenFor,
  type ResolvedCivilTime,
  type TimeContext,
} from "@seeway/time-core";
import * as contextModule from "../src/context";

interface RuntimeSchema {
  readonly safeParse: (value: unknown) => { readonly success: boolean };
}

function timeContextSchema(): RuntimeSchema {
  const schema = (
    contextModule as unknown as {
      readonly TimeContextSchema?: RuntimeSchema;
    }
  ).TimeContextSchema;

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

describe("buildTimeContext", () => {
  it("builds a strict time context with deterministic candidate calendar output", () => {
    const civil = resolved("2026-08-21T11:54:00");
    const result = buildTimeContext(civil);

    expect(result).toEqual({
      civil,
      shichen: shichenFor(civil),
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
      providerVersion: "tyme4ts@1.5.2",
      conventionVersion: "time-cn-zhang-v1",
      verificationStatus: "unverified",
    });
  });

  it("returns a deeply frozen plain-object context", () => {
    const result = buildTimeContext(resolved("2026-08-21T11:54:00"));

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.civil)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.shichen)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.dateBoundary)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.lunar)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.pillars)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.solarTerms)).toBe(Object.prototype);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.civil)).toBe(true);
    expect(Object.isFrozen(result.shichen)).toBe(true);
    expect(Object.isFrozen(result.dateBoundary)).toBe(true);
    expect(Object.isFrozen(result.lunar)).toBe(true);
    expect(Object.isFrozen(result.pillars)).toBe(true);
    expect(Object.isFrozen(result.solarTerms)).toBe(true);

    expect(() => {
      (result as { verificationStatus: string }).verificationStatus = "verified";
    }).toThrow(TypeError);
  });

  it("rejects malformed resolved input instead of normalizing it", () => {
    expect(() =>
      buildTimeContext({
        ...resolved("2026-08-21T11:54:00"),
        extra: true,
      } as never),
    ).toThrow(TypeError);
  });

  it("rejects an accessor-backed resolved field without invoking the getter", () => {
    const source = resolved("2026-08-21T11:54:00");
    const input = { ...source };
    let getterCalls = 0;
    Object.defineProperty(input, "timeZone", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return source.timeZone;
      },
    });

    expect(() => buildTimeContext(input as never)).toThrow(TypeError);
    expect(getterCalls).toBe(0);
  });

  it("rejects non-Shanghai calendar context construction in V1", () => {
    expect(() =>
      buildTimeContext(resolved("2026-08-21T11:54:00", "Asia/Tokyo")),
    ).toThrow(RangeError);
  });

  it("includes and validates the explicit day-boundary split contract", () => {
    const split = buildTimeContext(resolved("2026-08-21T23:00:00"));

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
    expect(
      buildTimeContext(resolved("2026-08-21T22:59:00")).dateBoundary
        .isSplitWindow,
    ).toBe(false);
    expect(
      buildTimeContext(resolved("2026-08-22T00:00:00")).dateBoundary
        .isSplitWindow,
    ).toBe(false);

    const invalid = {
      ...structuredClone(split),
      dateBoundary: {
        ...split.dateBoundary,
        isSplitWindow: false,
      },
    };
    expect(timeContextSchema().safeParse(invalid).success).toBe(false);
  });

  it("rejects invalid shichen mappings and strict context semantics", () => {
    const base = structuredClone(
      buildTimeContext(resolved("2026-08-21T11:54:00")),
    );
    const schema = timeContextSchema();
    const invalidCandidates: unknown[] = [
      { ...base, extra: true },
      { ...base, shichen: { ...base.shichen, branch: "甲" } },
      { ...base, shichen: { ...base.shichen, branch: "子" } },
      {
        ...base,
        shichen: {
          ...base.shichen,
          next: { ...base.shichen.next, branch: "申" },
        },
      },
      { ...base, pillars: { ...base.pillars, hour: "甲丑" } },
      { ...base, lunar: { ...base.lunar, month: 0 } },
      {
        ...base,
        civil: resolved("2026-08-24T11:54:00"),
      },
    ];

    expect(schema.safeParse(base).success).toBe(true);
    for (const candidate of invalidCandidates) {
      expect(schema.safeParse(candidate).success).toBe(false);
    }
  });

  it.each([
    [
      "day pillar",
      (base: TimeContext) => ({
        ...base,
        pillars: { ...base.pillars, day: "甲子" },
      }),
    ],
    [
      "lunar day name",
      (base: TimeContext) => ({
        ...base,
        lunar: { ...base.lunar, dayName: "错误" },
      }),
    ],
    [
      "shichen start instant",
      (base: TimeContext) => ({
        ...base,
        shichen: { ...base.shichen, startInstant: "not-an-instant" },
      }),
    ],
  ] as const)(
    "rejects a well-shaped %s that differs from the civil-time derivation",
    (_label, makeInvalid) => {
      const base = buildTimeContext(resolved("2026-08-21T11:54:00"));
      expect(timeContextSchema().safeParse(makeInvalid(base)).success).toBe(
        false,
      );
    },
  );
});
