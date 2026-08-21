import { describe, expect, expectTypeOf, it } from "vitest";
import {
  EARTHLY_BRANCHES,
  HEAVENLY_STEMS,
  sexagenaryName,
} from "@seeway/time-core";

describe("canonical cycle vocabulary", () => {
  it("exposes the ten heavenly stems as a readonly tuple", () => {
    expect(HEAVENLY_STEMS).toEqual([
      "甲",
      "乙",
      "丙",
      "丁",
      "戊",
      "己",
      "庚",
      "辛",
      "壬",
      "癸",
    ]);
    expectTypeOf(HEAVENLY_STEMS).toEqualTypeOf<
      readonly ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]
    >();
  });

  it("exposes the twelve earthly branches as a readonly tuple", () => {
    expect(EARTHLY_BRANCHES).toEqual([
      "子",
      "丑",
      "寅",
      "卯",
      "辰",
      "巳",
      "午",
      "未",
      "申",
      "酉",
      "戌",
      "亥",
    ]);
    expectTypeOf(EARTHLY_BRANCHES).toEqualTypeOf<
      readonly [
        "子",
        "丑",
        "寅",
        "卯",
        "辰",
        "巳",
        "午",
        "未",
        "申",
        "酉",
        "戌",
        "亥",
      ]
    >();
  });

  it("freezes both canonical tuples at runtime", () => {
    expect([
      Object.isFrozen(HEAVENLY_STEMS),
      Object.isFrozen(EARTHLY_BRANCHES),
    ]).toEqual([true, true]);
  });

  it.each([
    ["heavenly stems", HEAVENLY_STEMS, "破"],
    ["earthly branches", EARTHLY_BRANCHES, "坏"],
  ] as const)(
    "rejects runtime mutation of %s without changing it",
    (_, tuple, replacement) => {
      const original = [...tuple];
      const mutableTuple = tuple as unknown as string[];
      let mutationError: unknown;

      try {
        mutableTuple[0] = replacement;
      } catch (error) {
        mutationError = error;
      }

      const afterMutation = [...tuple];
      if (!mutationError) {
        mutableTuple[0] = original[0]!;
      }

      expect(mutationError).toBeInstanceOf(TypeError);
      expect(afterMutation).toEqual(original);
    },
  );
});

describe("sexagenaryName", () => {
  it("maps the first and last cycle indexes", () => {
    expect(sexagenaryName(0)).toBe("甲子");
    expect(sexagenaryName(59)).toBe("癸亥");
  });

  it("produces all sixty unique names with canonical progression", () => {
    const names = Array.from({ length: 60 }, (_, index) =>
      sexagenaryName(index),
    );

    expect(new Set(names).size).toBe(60);
    for (const [index, name] of names.entries()) {
      expect(name).toBe(
        `${HEAVENLY_STEMS[index % HEAVENLY_STEMS.length]}${
          EARTHLY_BRANCHES[index % EARTHLY_BRANCHES.length]
        }`,
      );
    }
  });

  it.each([-1, 60, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid index: %s",
    (index) => {
      expect(() => sexagenaryName(index)).toThrow(RangeError);
    },
  );
});
