export const THREE_WONDERS = Object.freeze(["乙", "丙", "丁"] as const);

export const SIX_INSTRUMENTS = Object.freeze([
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
] as const);

export const QIMEN_STEMS = Object.freeze([
  ...THREE_WONDERS,
  ...SIX_INSTRUMENTS,
] as const);

export const NINE_STARS = Object.freeze([
  "天蓬",
  "天芮",
  "天冲",
  "天辅",
  "天禽",
  "天心",
  "天柱",
  "天任",
  "天英",
] as const);

// This tuple records the conventional gate cycle, not a placement algorithm.
export const EIGHT_GATES = Object.freeze([
  "休门",
  "生门",
  "伤门",
  "杜门",
  "景门",
  "死门",
  "惊门",
  "开门",
] as const);

// This tuple is vocabulary only. Yin/Yang placement order belongs to the calculator.
export const EIGHT_DEITIES = Object.freeze([
  "值符",
  "腾蛇",
  "太阴",
  "六合",
  "白虎",
  "玄武",
  "九地",
  "九天",
] as const);

export const TRIGRAMS = Object.freeze([
  "坎",
  "坤",
  "震",
  "巽",
  "乾",
  "兑",
  "艮",
  "离",
] as const);

export const PALACE_DIRECTIONS = Object.freeze([
  "北",
  "西南",
  "东",
  "东南",
  "中",
  "西北",
  "西",
  "东北",
  "南",
] as const);

export const FIVE_ELEMENTS = Object.freeze([
  "木",
  "火",
  "土",
  "金",
  "水",
] as const);

export const LUO_SHU_PALACES = Object.freeze([
  Object.freeze({
    number: 1,
    trigram: "坎",
    direction: "北",
    element: "水",
    homeStar: "天蓬",
    homeGate: "休门",
  }),
  Object.freeze({
    number: 2,
    trigram: "坤",
    direction: "西南",
    element: "土",
    homeStar: "天芮",
    homeGate: "死门",
  }),
  Object.freeze({
    number: 3,
    trigram: "震",
    direction: "东",
    element: "木",
    homeStar: "天冲",
    homeGate: "伤门",
  }),
  Object.freeze({
    number: 4,
    trigram: "巽",
    direction: "东南",
    element: "木",
    homeStar: "天辅",
    homeGate: "杜门",
  }),
  Object.freeze({
    number: 5,
    trigram: null,
    direction: "中",
    element: "土",
    homeStar: "天禽",
    homeGate: null,
  }),
  Object.freeze({
    number: 6,
    trigram: "乾",
    direction: "西北",
    element: "金",
    homeStar: "天心",
    homeGate: "开门",
  }),
  Object.freeze({
    number: 7,
    trigram: "兑",
    direction: "西",
    element: "金",
    homeStar: "天柱",
    homeGate: "惊门",
  }),
  Object.freeze({
    number: 8,
    trigram: "艮",
    direction: "东北",
    element: "土",
    homeStar: "天任",
    homeGate: "生门",
  }),
  Object.freeze({
    number: 9,
    trigram: "离",
    direction: "南",
    element: "火",
    homeStar: "天英",
    homeGate: "景门",
  }),
] as const);

export const XUN_HEAD_NAMES = Object.freeze([
  "甲子",
  "甲戌",
  "甲申",
  "甲午",
  "甲辰",
  "甲寅",
] as const);

export const XUN_HEADS = Object.freeze([
  Object.freeze({
    name: "甲子",
    instrument: "戊",
    voidPalaces: Object.freeze([6] as const),
  }),
  Object.freeze({
    name: "甲戌",
    instrument: "己",
    voidPalaces: Object.freeze([2, 7] as const),
  }),
  Object.freeze({
    name: "甲申",
    instrument: "庚",
    voidPalaces: Object.freeze([2, 9] as const),
  }),
  Object.freeze({
    name: "甲午",
    instrument: "辛",
    voidPalaces: Object.freeze([4] as const),
  }),
  Object.freeze({
    name: "甲辰",
    instrument: "壬",
    voidPalaces: Object.freeze([3, 8] as const),
  }),
  Object.freeze({
    name: "甲寅",
    instrument: "癸",
    voidPalaces: Object.freeze([1, 8] as const),
  }),
] as const);

export const QIMEN_CHART_VERSION = "qimen-chart/v1" as const;
export const QIMEN_ALGORITHM_VERSION =
  "qimen-zhuanpan-chaibu-v1" as const;
export const TIME_CONTEXT_CONVENTION_VERSION = "time-cn-zhang-v1" as const;
export const QIMEN_CORE_STATUS = "unverified" as const;

export type ThreeWonder = (typeof THREE_WONDERS)[number];
export type SixInstrument = (typeof SIX_INSTRUMENTS)[number];
export type QimenStem = (typeof QIMEN_STEMS)[number];
export type NineStar = (typeof NINE_STARS)[number];
export type EightGate = (typeof EIGHT_GATES)[number];
export type EightDeity = (typeof EIGHT_DEITIES)[number];
export type Trigram = (typeof TRIGRAMS)[number];
export type PalaceDirection = (typeof PALACE_DIRECTIONS)[number];
export type FiveElement = (typeof FIVE_ELEMENTS)[number];
export type LuoShuPalace = (typeof LUO_SHU_PALACES)[number];
export type XunHeadName = (typeof XUN_HEAD_NAMES)[number];
export type XunHead = (typeof XUN_HEADS)[number];
