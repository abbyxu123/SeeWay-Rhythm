import {
  TimeContextSchema,
  sexagenaryName,
  type TimeContext,
} from "@seeway/time-core";
import { z } from "zod";
import {
  QIMEN_ALGORITHM_VERSION,
  TIME_CONTEXT_CONVENTION_VERSION,
} from "./constants";

export const QIMEN_YUANS = Object.freeze([
  "上元",
  "中元",
  "下元",
] as const);
export const QIMEN_DUN_TYPES = Object.freeze(["阳遁", "阴遁"] as const);
export const QIMEN_BUREAU_VERSION = "qimen-bureau/v1" as const;

const SOLAR_TERMS = Object.freeze([
  "冬至",
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
] as const);

export type QimenYuan = (typeof QIMEN_YUANS)[number];
export type QimenDunType = (typeof QIMEN_DUN_TYPES)[number];
export type QimenSolarTerm = (typeof SOLAR_TERMS)[number];

export interface QimenBureauTableEntry {
  readonly dunType: QimenDunType;
  readonly 上元: number;
  readonly 中元: number;
  readonly 下元: number;
}

function bureauEntry(
  dunType: QimenDunType,
  upper: number,
  middle: number,
  lower: number,
): Readonly<QimenBureauTableEntry> {
  return Object.freeze({
    dunType,
    上元: upper,
    中元: middle,
    下元: lower,
  });
}

export const QIMEN_BUREAU_TABLE: Readonly<
  Record<QimenSolarTerm, Readonly<QimenBureauTableEntry>>
> = Object.freeze({
  冬至: bureauEntry("阳遁", 1, 7, 4),
  小寒: bureauEntry("阳遁", 2, 8, 5),
  大寒: bureauEntry("阳遁", 3, 9, 6),
  立春: bureauEntry("阳遁", 8, 5, 2),
  雨水: bureauEntry("阳遁", 9, 6, 3),
  惊蛰: bureauEntry("阳遁", 1, 7, 4),
  春分: bureauEntry("阳遁", 3, 9, 6),
  清明: bureauEntry("阳遁", 4, 1, 7),
  谷雨: bureauEntry("阳遁", 5, 2, 8),
  立夏: bureauEntry("阳遁", 4, 1, 7),
  小满: bureauEntry("阳遁", 5, 2, 8),
  芒种: bureauEntry("阳遁", 6, 3, 9),
  夏至: bureauEntry("阴遁", 9, 3, 6),
  小暑: bureauEntry("阴遁", 8, 2, 5),
  大暑: bureauEntry("阴遁", 7, 1, 4),
  立秋: bureauEntry("阴遁", 2, 5, 8),
  处暑: bureauEntry("阴遁", 1, 4, 7),
  白露: bureauEntry("阴遁", 9, 3, 6),
  秋分: bureauEntry("阴遁", 7, 1, 4),
  寒露: bureauEntry("阴遁", 6, 9, 3),
  霜降: bureauEntry("阴遁", 5, 8, 2),
  立冬: bureauEntry("阴遁", 6, 9, 3),
  小雪: bureauEntry("阴遁", 5, 8, 2),
  大雪: bureauEntry("阴遁", 4, 7, 1),
});

const SEXAGENARY_CYCLE = Object.freeze(
  Array.from({ length: 60 }, (_, index) => sexagenaryName(index)),
);
const SYMBOL_HEAD_YUAN: Readonly<Record<string, QimenYuan>> = Object.freeze({
  甲子: "上元",
  己卯: "上元",
  甲午: "上元",
  己酉: "上元",
  甲寅: "中元",
  己巳: "中元",
  甲申: "中元",
  己亥: "中元",
  甲辰: "下元",
  己未: "下元",
  甲戌: "下元",
  己丑: "下元",
});

const SexagenaryNameSchema = z.string().refine(
  (value) => SEXAGENARY_CYCLE.includes(value),
  "Value must be a sexagenary cycle name.",
);

function deriveYuanFact(dayPillar: string): {
  readonly symbolHead: string;
  readonly yuan: QimenYuan;
} | null {
  const cycleIndex = SEXAGENARY_CYCLE.indexOf(dayPillar);
  if (cycleIndex < 0) {
    return null;
  }

  const symbolHead = sexagenaryName(Math.floor(cycleIndex / 5) * 5);
  const yuan = SYMBOL_HEAD_YUAN[symbolHead];
  return yuan ? { symbolHead, yuan } : null;
}

export const QimenYuanFactSchema = z
  .object({
    dayPillar: SexagenaryNameSchema,
    symbolHead: SexagenaryNameSchema,
    yuan: z.enum(QIMEN_YUANS),
  })
  .strict()
  .superRefine((fact, context) => {
    const expected = deriveYuanFact(fact.dayPillar);
    if (!expected) {
      return;
    }
    if (fact.symbolHead !== expected.symbolHead) {
      context.addIssue({
        code: "custom",
        path: ["symbolHead"],
        message: `${fact.dayPillar} must use symbol head ${expected.symbolHead}.`,
      });
    }
    if (fact.yuan !== expected.yuan) {
      context.addIssue({
        code: "custom",
        path: ["yuan"],
        message: `${fact.dayPillar} must belong to ${expected.yuan}.`,
      });
    }
  })
  .readonly();

export const QimenBureauFactSchema = z
  .object({
    bureauVersion: z.literal(QIMEN_BUREAU_VERSION),
    algorithmVersion: z.literal(QIMEN_ALGORITHM_VERSION),
    timeContextVersion: z.literal(TIME_CONTEXT_CONVENTION_VERSION),
    solarTerm: z.enum(SOLAR_TERMS),
    dayPillar: SexagenaryNameSchema,
    symbolHead: SexagenaryNameSchema,
    dunType: z.enum(QIMEN_DUN_TYPES),
    yuan: z.enum(QIMEN_YUANS),
    juNumber: z.number().int().min(1).max(9),
  })
  .strict()
  .superRefine((fact, context) => {
    const expectedYuan = deriveYuanFact(fact.dayPillar);
    if (expectedYuan) {
      if (fact.symbolHead !== expectedYuan.symbolHead) {
        context.addIssue({
          code: "custom",
          path: ["symbolHead"],
          message: `${fact.dayPillar} must use symbol head ${expectedYuan.symbolHead}.`,
        });
      }
      if (fact.yuan !== expectedYuan.yuan) {
        context.addIssue({
          code: "custom",
          path: ["yuan"],
          message: `${fact.dayPillar} must belong to ${expectedYuan.yuan}.`,
        });
      }
    }

    const tableEntry = QIMEN_BUREAU_TABLE[fact.solarTerm];
    if (fact.dunType !== tableEntry.dunType) {
      context.addIssue({
        code: "custom",
        path: ["dunType"],
        message: `${fact.solarTerm} must use ${tableEntry.dunType}.`,
      });
    }
    if (fact.juNumber !== tableEntry[fact.yuan]) {
      context.addIssue({
        code: "custom",
        path: ["juNumber"],
        message: `${fact.solarTerm} ${fact.yuan} must use Ju ${tableEntry[fact.yuan]}.`,
      });
    }
  })
  .readonly();

export type QimenYuanFact = z.infer<typeof QimenYuanFactSchema>;
export type QimenBureauFact = z.infer<typeof QimenBureauFactSchema>;

export function yuanForDayPillar(dayPillar: string): QimenYuanFact {
  const derived = deriveYuanFact(dayPillar);
  if (!derived) {
    throw new RangeError("Day pillar must be a sexagenary cycle name.");
  }

  return QimenYuanFactSchema.parse({ dayPillar, ...derived });
}

function isQimenSolarTerm(value: string): value is QimenSolarTerm {
  return (SOLAR_TERMS as readonly string[]).includes(value);
}

export function determineQimenBureau(
  timeContext: TimeContext,
): QimenBureauFact {
  const context = TimeContextSchema.parse(timeContext);
  const solarTerm = context.solarTerms.current.name;
  if (!isQimenSolarTerm(solarTerm)) {
    throw new RangeError(`Unsupported solar term: ${solarTerm}`);
  }

  const yuanFact = yuanForDayPillar(context.pillars.day);
  const tableEntry = QIMEN_BUREAU_TABLE[solarTerm];

  return QimenBureauFactSchema.parse({
    bureauVersion: QIMEN_BUREAU_VERSION,
    algorithmVersion: QIMEN_ALGORITHM_VERSION,
    timeContextVersion: TIME_CONTEXT_CONVENTION_VERSION,
    solarTerm,
    dayPillar: yuanFact.dayPillar,
    symbolHead: yuanFact.symbolHead,
    dunType: tableEntry.dunType,
    yuan: yuanFact.yuan,
    juNumber: tableEntry[yuanFact.yuan],
  });
}
