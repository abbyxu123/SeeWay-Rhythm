import { describe, expect, it } from "vitest";
import {
  EARTHLY_BRANCHES,
  resolveCivilTime,
  shichenFor,
  type ResolvedCivilTime,
} from "@seeway/time-core";

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

describe("shichenFor", () => {
  it.each(
    EARTHLY_BRANCHES.map((branch, index) => [
      index,
      branch,
      String(index * 2).padStart(2, "0"),
    ] as const),
  )("maps representative midpoint %s to %s", (index, branch, hour) => {
    const result = shichenFor(resolved(`2026-08-21T${hour}:00:00`));

    expect(result.index).toBe(index);
    expect(result.branch).toBe(branch);
  });

  it.each([
    ["2026-08-21T22:59:59", 11, "亥", "2026-08-21T21:00:00+08:00[Asia/Shanghai]"],
    ["2026-08-21T23:00:00", 0, "子", "2026-08-21T23:00:00+08:00[Asia/Shanghai]"],
    ["2026-08-21T00:00:00", 0, "子", "2026-08-20T23:00:00+08:00[Asia/Shanghai]"],
    ["2026-08-21T00:59:59", 0, "子", "2026-08-20T23:00:00+08:00[Asia/Shanghai]"],
    ["2026-08-21T01:00:00", 1, "丑", "2026-08-21T01:00:00+08:00[Asia/Shanghai]"],
  ] as const)(
    "uses the canonical boundary for %s",
    (localDateTime, index, branch, startLocal) => {
      const result = shichenFor(resolved(localDateTime));

      expect(result).toMatchObject({ index, branch, startLocal });
    },
  );

  it("returns the current and next Shanghai periods with exclusive ends", () => {
    const result = shichenFor(resolved("2026-08-21T11:54:00"));

    expect(result).toEqual({
      index: 6,
      branch: "午",
      startLocal: "2026-08-21T11:00:00+08:00[Asia/Shanghai]",
      endLocal: "2026-08-21T13:00:00+08:00[Asia/Shanghai]",
      startInstant: "2026-08-21T03:00:00Z",
      endInstant: "2026-08-21T05:00:00Z",
      endExclusive: true,
      conventionVersion: "time-cn-zhang-v1",
      next: {
        index: 7,
        branch: "未",
        startLocal: "2026-08-21T13:00:00+08:00[Asia/Shanghai]",
        endLocal: "2026-08-21T15:00:00+08:00[Asia/Shanghai]",
        startInstant: "2026-08-21T05:00:00Z",
        endInstant: "2026-08-21T07:00:00Z",
        endExclusive: true,
      },
    });
    expect(result.next.startLocal).toBe(result.endLocal);
    expect(result.next.startInstant).toBe(result.endInstant);
  });

  it("preserves wall-clock boundaries in a valid non-China zone", () => {
    const result = shichenFor(
      resolved("2026-08-21T10:30:00", "Asia/Kathmandu"),
    );

    expect(result).toMatchObject({
      index: 5,
      branch: "巳",
      startLocal: "2026-08-21T09:00:00+05:45[Asia/Kathmandu]",
      endLocal: "2026-08-21T11:00:00+05:45[Asia/Kathmandu]",
      startInstant: "2026-08-21T03:15:00Z",
      endInstant: "2026-08-21T05:15:00Z",
    });
  });

  it("derives spring-DST boundaries in wall time rather than adding elapsed hours", () => {
    const result = shichenFor(
      resolved("2026-03-08T01:30:00", "America/New_York"),
    );

    expect(result).toMatchObject({
      index: 1,
      branch: "丑",
      startLocal: "2026-03-08T01:00:00-05:00[America/New_York]",
      endLocal: "2026-03-08T03:00:00-04:00[America/New_York]",
      startInstant: "2026-03-08T06:00:00Z",
      endInstant: "2026-03-08T07:00:00Z",
    });
    expect(result.next.startInstant).toBe("2026-03-08T07:00:00Z");
    expect(result.next.endInstant).toBe("2026-03-08T09:00:00Z");
  });

  it.each([
    ["ambiguous", "2026-04-05T04:00:00"],
    ["nonexistent", "2026-09-27T04:00:00"],
  ])("fails closed when a derived boundary is %s", (_, localDateTime) => {
    expect(() =>
      shichenFor(resolved(localDateTime, "Pacific/Chatham")),
    ).toThrow(RangeError);
  });

  it("accepts an exact resolved shape after a JSON round trip", () => {
    const input = JSON.parse(
      JSON.stringify(resolved("2026-08-21T11:54:00")),
    ) as ResolvedCivilTime;

    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.original)).toBe(false);
    expect(shichenFor(input)).toMatchObject({ index: 6, branch: "午" });
  });

  it.each([
    ["not an object", null],
    ["missing fields", {}],
    [
      "wrong convention",
      {
        ...resolved("2026-08-21T11:54:00"),
        conventionVersion: "time-cn-other-v1",
      },
    ],
    [
      "extra field",
      { ...resolved("2026-08-21T11:54:00"), calendar: "iso8601" },
    ],
    [
      "malformed original",
      {
        ...resolved("2026-08-21T11:54:00"),
        original: {
          ...resolved("2026-08-21T11:54:00").original,
          extra: true,
        },
      },
    ],
    [
      "inconsistent instant",
      {
        ...resolved("2026-08-21T11:54:00"),
        instant: "2026-08-21T03:55:00Z",
      },
    ],
  ])("rejects malformed resolved input: %s", (_, input) => {
    expect(() => shichenFor(input as never)).toThrow(TypeError);
  });

  it.each(["localDateTime", "timeZone", "offset", "instant"] as const)(
    "rejects an accessor-backed top-level %s without invoking it",
    (key) => {
      const source = resolved("2026-08-21T11:54:00");
      const input = { ...source };
      let getterCalls = 0;
      Object.defineProperty(input, key, {
        configurable: true,
        enumerable: true,
        get() {
          getterCalls += 1;
          return source[key];
        },
      });

      expect(() => shichenFor(input)).toThrow(TypeError);
      expect(getterCalls).toBe(0);
    },
  );

  it("rejects an accessor-backed original field without invoking it", () => {
    const source = resolved("2026-08-21T11:54:00");
    const original = { ...source.original };
    let getterCalls = 0;
    Object.defineProperty(original, "timeZone", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return source.original.timeZone;
      },
    });

    expect(() => shichenFor({ ...source, original })).toThrow(TypeError);
    expect(getterCalls).toBe(0);
  });

  it("returns recursively frozen plain objects", () => {
    const result = shichenFor(resolved("2026-08-21T11:54:00"));

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.next)).toBe(Object.prototype);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.next)).toBe(true);

    expect(() => {
      (result as { branch: string }).branch = "子";
    }).toThrow(TypeError);
    expect(() => {
      (result.next as { branch: string }).branch = "子";
    }).toThrow(TypeError);
  });
});
