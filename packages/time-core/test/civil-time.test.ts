import { describe, expect, expectTypeOf, it } from "vitest";
import { resolveCivilTime } from "@seeway/time-core";

const shanghaiSecondInput = {
  localDateTime: "2026-08-21T11:54:00",
  timeZone: "Asia/Shanghai",
  precision: "second",
} as const;

describe("resolveCivilTime", () => {
  it("resolves a Shanghai civil time without replacing its original input", () => {
    const result = resolveCivilTime(shanghaiSecondInput);

    expect(result).toEqual({
      original: shanghaiSecondInput,
      localDateTime: "2026-08-21T11:54:00",
      timeZone: "Asia/Shanghai",
      offset: "+08:00",
      instant: "2026-08-21T03:54:00Z",
      precision: "second",
      conventionVersion: "time-cn-zhang-v1",
    });
    expectTypeOf(result.precision).toEqualTypeOf<"minute" | "second">();
  });

  it("canonicalizes a declared minute input with zero seconds", () => {
    const result = resolveCivilTime({
      localDateTime: "2026-08-21T11:54",
      timeZone: "Asia/Shanghai",
      precision: "minute",
    });

    expect(result.localDateTime).toBe("2026-08-21T11:54:00");
    expect(result.instant).toBe("2026-08-21T03:54:00Z");
    expect(result.original.localDateTime).toBe("2026-08-21T11:54");
    expect(result.precision).toBe("minute");
  });

  it("resolves a valid non-China IANA time zone", () => {
    const result = resolveCivilTime({
      localDateTime: "2026-01-15T10:15:30",
      timeZone: "America/New_York",
      precision: "second",
    });

    expect(result).toMatchObject({
      localDateTime: "2026-01-15T10:15:30",
      timeZone: "America/New_York",
      offset: "-05:00",
      instant: "2026-01-15T15:15:30Z",
    });
  });

  it("accepts a valid leap day", () => {
    expect(
      resolveCivilTime({
        localDateTime: "2024-02-29T12:00:00",
        timeZone: "Asia/Shanghai",
        precision: "second",
      }).localDateTime,
    ).toBe("2024-02-29T12:00:00");
  });

  it("returns a recursively frozen plain object", () => {
    const result = resolveCivilTime(shanghaiSecondInput);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.original)).toBe(Object.prototype);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.original)).toBe(true);

    expect(() => {
      (result.original as { localDateTime: string }).localDateTime =
        "2026-08-21T12:00:00";
    }).toThrow(TypeError);
    expect(result.original.localDateTime).toBe(
      shanghaiSecondInput.localDateTime,
    );
  });

  it.each([
    ["minute text declared as seconds", "2026-08-21T11:54", "second"],
    ["second text declared as minutes", "2026-08-21T11:54:00", "minute"],
  ] as const)("rejects mismatched precision: %s", (_, localDateTime, precision) => {
    expect(() =>
      resolveCivilTime({
        localDateTime,
        timeZone: "Asia/Shanghai",
        precision,
      }),
    ).toThrow(RangeError);
  });

  it.each([
    ["invalid zone", "2026-08-21T11:54:00", "Mars/Olympus"],
    ["impossible date", "2026-02-29T11:54:00", "Asia/Shanghai"],
    ["UTC designator", "2026-08-21T11:54:00Z", "Asia/Shanghai"],
    ["numeric offset", "2026-08-21T11:54:00+08:00", "Asia/Shanghai"],
    ["fractional seconds", "2026-08-21T11:54:00.000", "Asia/Shanghai"],
    ["silently constrained leap second", "2026-08-21T11:54:60", "Asia/Shanghai"],
    ["space separator", "2026-08-21 11:54:00", "Asia/Shanghai"],
    ["trimmed local time", " 2026-08-21T11:54:00", "Asia/Shanghai"],
    ["trimmed zone", "2026-08-21T11:54:00", "Asia/Shanghai "],
  ])("rejects malformed input: %s", (_, localDateTime, timeZone) => {
    expect(() =>
      resolveCivilTime({
        localDateTime,
        timeZone,
        precision: "second",
      }),
    ).toThrow(RangeError);
  });

  it.each([
    ["ambiguous fold", "2026-11-01T01:30:00"],
    ["nonexistent gap", "2026-03-08T02:30:00"],
  ])("rejects a DST %s", (_, localDateTime) => {
    expect(() =>
      resolveCivilTime({
        localDateTime,
        timeZone: "America/New_York",
        precision: "second",
      }),
    ).toThrow(RangeError);
  });

  it.each([
    ["non-string local time", { ...shanghaiSecondInput, localDateTime: 123 }],
    ["non-string zone", { ...shanghaiSecondInput, timeZone: null }],
    ["unsupported precision", { ...shanghaiSecondInput, precision: "millisecond" }],
    ["missing value", { localDateTime: shanghaiSecondInput.localDateTime }],
    ["extra value", { ...shanghaiSecondInput, calendar: "iso8601" }],
    ["array input", []],
    ["null input", null],
  ])("rejects malformed object input: %s", (_, input) => {
    expect(() => resolveCivilTime(input as never)).toThrow(TypeError);
  });

  it.each(["localDateTime", "timeZone", "precision"] as const)(
    "rejects an accessor-backed %s without invoking its getter",
    (accessorKey) => {
      let getterCalls = 0;
      const input: Record<string, unknown> = { ...shanghaiSecondInput };
      Object.defineProperty(input, accessorKey, {
        configurable: true,
        enumerable: true,
        get() {
          getterCalls += 1;
          return shanghaiSecondInput[accessorKey];
        },
      });

      expect(() => resolveCivilTime(input as never)).toThrow(TypeError);
      expect(getterCalls).toBe(0);
    },
  );

  it("fails closed when a proxy descriptor trap throws", () => {
    const trapError = new Error("descriptor trap failed");
    const input = new Proxy({ ...shanghaiSecondInput }, {
      ownKeys() {
        throw trapError;
      },
    });

    expect(() => resolveCivilTime(input)).toThrow(trapError);
  });
});
