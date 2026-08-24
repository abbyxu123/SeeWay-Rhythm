import { describe, expect, it } from "vitest";
import {
  EIGHT_DEITIES,
  EIGHT_GATES,
  LUO_SHU_PALACES,
  NINE_STARS,
  QIMEN_ALGORITHM_VERSION,
  QIMEN_CHART_VERSION,
  QIMEN_CORE_STATUS,
  SIX_INSTRUMENTS,
  THREE_WONDERS,
  TIME_CONTEXT_CONVENTION_VERSION,
  XUN_HEADS,
} from "@seeway/qimen-core";

describe("canonical Qimen vocabulary", () => {
  it("locks the three wonders and six instruments without mixing their roles", () => {
    expect(THREE_WONDERS).toEqual(["乙", "丙", "丁"]);
    expect(SIX_INSTRUMENTS).toEqual(["戊", "己", "庚", "辛", "壬", "癸"]);
    expect(new Set([...THREE_WONDERS, ...SIX_INSTRUMENTS]).size).toBe(9);
  });

  it("locks the complete star, gate, and deity vocabularies", () => {
    expect(NINE_STARS).toEqual([
      "天蓬",
      "天芮",
      "天冲",
      "天辅",
      "天禽",
      "天心",
      "天柱",
      "天任",
      "天英",
    ]);
    expect(EIGHT_GATES).toEqual([
      "休门",
      "生门",
      "伤门",
      "杜门",
      "景门",
      "死门",
      "惊门",
      "开门",
    ]);
    expect(EIGHT_DEITIES).toEqual([
      "值符",
      "腾蛇",
      "太阴",
      "六合",
      "白虎",
      "玄武",
      "九地",
      "九天",
    ]);

    for (const vocabulary of [NINE_STARS, EIGHT_GATES, EIGHT_DEITIES]) {
      expect(new Set(vocabulary).size).toBe(vocabulary.length);
      expect(Object.isFrozen(vocabulary)).toBe(true);
    }
  });

  it("maps all nine Luo Shu palaces to fixed trigram, direction, element, star, and gate facts", () => {
    expect(LUO_SHU_PALACES).toEqual([
      {
        number: 1,
        trigram: "坎",
        direction: "北",
        element: "水",
        homeStar: "天蓬",
        homeGate: "休门",
      },
      {
        number: 2,
        trigram: "坤",
        direction: "西南",
        element: "土",
        homeStar: "天芮",
        homeGate: "死门",
      },
      {
        number: 3,
        trigram: "震",
        direction: "东",
        element: "木",
        homeStar: "天冲",
        homeGate: "伤门",
      },
      {
        number: 4,
        trigram: "巽",
        direction: "东南",
        element: "木",
        homeStar: "天辅",
        homeGate: "杜门",
      },
      {
        number: 5,
        trigram: null,
        direction: "中",
        element: "土",
        homeStar: "天禽",
        homeGate: null,
      },
      {
        number: 6,
        trigram: "乾",
        direction: "西北",
        element: "金",
        homeStar: "天心",
        homeGate: "开门",
      },
      {
        number: 7,
        trigram: "兑",
        direction: "西",
        element: "金",
        homeStar: "天柱",
        homeGate: "惊门",
      },
      {
        number: 8,
        trigram: "艮",
        direction: "东北",
        element: "土",
        homeStar: "天任",
        homeGate: "生门",
      },
      {
        number: 9,
        trigram: "离",
        direction: "南",
        element: "火",
        homeStar: "天英",
        homeGate: "景门",
      },
    ]);
    expect(LUO_SHU_PALACES.map(({ number }) => number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("deep-freezes fixed palace facts", () => {
    expect(Object.isFrozen(LUO_SHU_PALACES)).toBe(true);
    expect(LUO_SHU_PALACES.every(Object.isFrozen)).toBe(true);

    expect(() => {
      (LUO_SHU_PALACES[0] as { direction: string }).direction = "南";
    }).toThrow(TypeError);
  });

  it("locks each xun head to its hidden instrument and void palaces", () => {
    expect(XUN_HEADS).toEqual([
      { name: "甲子", instrument: "戊", voidPalaces: [6] },
      { name: "甲戌", instrument: "己", voidPalaces: [2, 7] },
      { name: "甲申", instrument: "庚", voidPalaces: [2, 9] },
      { name: "甲午", instrument: "辛", voidPalaces: [4] },
      { name: "甲辰", instrument: "壬", voidPalaces: [3, 8] },
      { name: "甲寅", instrument: "癸", voidPalaces: [1, 8] },
    ]);
    expect(XUN_HEADS.every(Object.isFrozen)).toBe(true);
    expect(XUN_HEADS.every(({ voidPalaces }) => Object.isFrozen(voidPalaces))).toBe(
      true,
    );
  });

  it("locks the first calculation and context versions", () => {
    expect(QIMEN_CHART_VERSION).toBe("qimen-chart/v1");
    expect(QIMEN_ALGORITHM_VERSION).toBe("qimen-zhuanpan-chaibu-v1");
    expect(TIME_CONTEXT_CONVENTION_VERSION).toBe("time-cn-zhang-v1");
  });

  it("keeps the calculation core unavailable until verified charts exist", () => {
    expect(QIMEN_CORE_STATUS).toBe("unverified");
  });
});
