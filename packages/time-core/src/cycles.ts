export const HEAVENLY_STEMS = Object.freeze([
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
] as const);

export const EARTHLY_BRANCHES = Object.freeze([
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
] as const);

export function sexagenaryName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 59) {
    throw new RangeError("Sexagenary cycle index must be an integer from 0 to 59.");
  }

  const stem = HEAVENLY_STEMS[index % HEAVENLY_STEMS.length];
  const branch = EARTHLY_BRANCHES[index % EARTHLY_BRANCHES.length];

  return `${stem}${branch}`;
}
