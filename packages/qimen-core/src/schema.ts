import { z } from "zod";
import {
  EIGHT_DEITIES,
  EIGHT_GATES,
  FIVE_ELEMENTS,
  LUO_SHU_PALACES,
  NINE_STARS,
  PALACE_DIRECTIONS,
  QIMEN_ALGORITHM_VERSION,
  QIMEN_CHART_VERSION,
  QIMEN_STEMS,
  SIX_INSTRUMENTS,
  TIME_CONTEXT_CONVENTION_VERSION,
  TRIGRAMS,
  XUN_HEAD_NAMES,
  XUN_HEADS,
} from "./constants";

const NonEmptyStringSchema = z.string().trim().min(1);
const PalaceNumberSchema = z.number().int().min(1).max(9);
const QimenStemSchema = z.enum(QIMEN_STEMS);
const NineStarSchema = z.enum(NINE_STARS);
const EightGateSchema = z.enum(EIGHT_GATES);
const EightDeitySchema = z.enum(EIGHT_DEITIES);
const CornerPalaceNumberSchema = z.union([
  z.literal(2),
  z.literal(4),
  z.literal(6),
  z.literal(8),
]);

export const QimenSourceReferenceSchema = z
  .object({
    sourceId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    locator: NonEmptyStringSchema,
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
  .readonly();

export const FixedPalaceFactsSchema = z
  .object({
    number: PalaceNumberSchema,
    trigram: z.enum(TRIGRAMS).nullable(),
    direction: z.enum(PALACE_DIRECTIONS),
    element: z.enum(FIVE_ELEMENTS),
    homeStar: NineStarSchema,
    homeGate: EightGateSchema.nullable(),
  })
  .strict()
  .superRefine((fixed, context) => {
    const canonical = LUO_SHU_PALACES.find(
      ({ number }) => number === fixed.number,
    );
    if (!canonical) {
      return;
    }

    for (const field of [
      "trigram",
      "direction",
      "element",
      "homeStar",
      "homeGate",
    ] as const) {
      if (fixed[field] !== canonical[field]) {
        context.addIssue({
          code: "custom",
          message: `Palace ${fixed.number} ${field} contradicts the canonical Luo Shu mapping.`,
          path: [field],
        });
      }
    }
  })
  .readonly();

export const QimenHeavenPlateEntrySchema = z
  .object({
    stem: QimenStemSchema,
    star: NineStarSchema,
  })
  .strict()
  .readonly();

export const XunHeadFactSchema = z
  .object({
    name: z.enum(XUN_HEAD_NAMES),
    instrument: z.enum(SIX_INSTRUMENTS),
  })
  .strict()
  .superRefine((xunHead, context) => {
    const canonical = XUN_HEADS.find(({ name }) => name === xunHead.name);
    if (canonical && canonical.instrument !== xunHead.instrument) {
      context.addIssue({
        code: "custom",
        message: `${xunHead.name} must hide under ${canonical.instrument}.`,
        path: ["instrument"],
      });
    }
  })
  .readonly();

export const QimenPalaceSchema = z
  .object({
    fixed: FixedPalaceFactsSchema,
    earthPlateStem: QimenStemSchema,
    heavenPlate: z.array(QimenHeavenPlateEntrySchema).max(2).readonly(),
    gate: EightGateSchema.nullable(),
    deity: EightDeitySchema.nullable(),
  })
  .strict()
  .readonly();

function isExactVocabulary(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every((item) => actual.includes(item))
  );
}

export const QimenChartSchema = z
  .object({
    chartVersion: z.literal(QIMEN_CHART_VERSION),
    algorithmVersion: z.literal(QIMEN_ALGORITHM_VERSION),
    timeContextVersion: z.literal(TIME_CONTEXT_CONVENTION_VERSION),
    sourceReferences: z
      .array(QimenSourceReferenceSchema)
      .min(1)
      .refine(
        (sources) =>
          new Set(
            sources.map(({ sourceId, locator }) => `${sourceId}:${locator}`),
          ).size === sources.length,
        { message: "Source references must be unique by source and locator." },
      )
      .readonly(),
    dunType: z.enum(["阳遁", "阴遁"]),
    juNumber: z.number().int().min(1).max(9),
    yuan: z.enum(["上元", "中元", "下元"]),
    xunHead: XunHeadFactSchema,
    chiefStar: NineStarSchema,
    chiefGate: EightGateSchema,
    voidPalaces: z
      .array(PalaceNumberSchema)
      .min(1)
      .max(2)
      .refine((palaces) => new Set(palaces).size === palaces.length, {
        message: "Void palaces must be distinct.",
      })
      .readonly(),
    horsePalace: CornerPalaceNumberSchema,
    palaces: z.array(QimenPalaceSchema).length(9).readonly(),
  })
  .strict()
  .superRefine((chart, context) => {
    const palaceNumbers = chart.palaces.map(({ fixed }) => fixed.number);
    if (
      !isExactVocabulary(palaceNumbers.map(String), [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
      ])
    ) {
      context.addIssue({
        code: "custom",
        message: "A chart must contain each Luo Shu palace exactly once.",
        path: ["palaces"],
      });
    }

    const centerPalace = chart.palaces.find(
      ({ fixed }) => fixed.number === 5,
    );
    if (
      centerPalace &&
      (centerPalace.heavenPlate.length !== 0 ||
        centerPalace.gate !== null ||
        centerPalace.deity !== null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The center palace cannot carry a heaven-plate star, gate, or deity in the selected rotating method.",
        path: ["palaces"],
      });
    }

    const outerPalaces = chart.palaces.filter(
      ({ fixed }) => fixed.number !== 5,
    );
    if (
      outerPalaces.some(
        ({ heavenPlate, gate, deity }) =>
          heavenPlate.length === 0 || gate === null || deity === null,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Every outer palace must carry at least one star, one gate, and one deity.",
        path: ["palaces"],
      });
    }

    const lodgingPalaces = outerPalaces.filter(
      ({ heavenPlate }) => heavenPlate.length === 2,
    );
    const lodgedStars = lodgingPalaces[0]?.heavenPlate.map(({ star }) => star);
    if (
      lodgingPalaces.length !== 1 ||
      !lodgedStars ||
      !isExactVocabulary(lodgedStars, ["天芮", "天禽"])
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Exactly one outer palace must lodge Tianqin together with Tianrui.",
        path: ["palaces"],
      });
    }

    const canonicalXunHead = XUN_HEADS.find(
      ({ name }) => name === chart.xunHead.name,
    );
    if (
      canonicalXunHead &&
      !isExactVocabulary(
        chart.voidPalaces.map(String),
        canonicalXunHead.voidPalaces.map(String),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: `Void palaces must match ${chart.xunHead.name}.`,
        path: ["voidPalaces"],
      });
    }

    const vocabularyChecks = [
      {
        actual: chart.palaces.flatMap(({ heavenPlate }) =>
          heavenPlate.map(({ star }) => star),
        ),
        expected: NINE_STARS,
        label: "nine stars",
      },
      {
        actual: chart.palaces.flatMap(({ gate }) =>
          gate === null ? [] : [gate],
        ),
        expected: EIGHT_GATES,
        label: "eight gates",
      },
      {
        actual: chart.palaces.flatMap(({ deity }) =>
          deity === null ? [] : [deity],
        ),
        expected: EIGHT_DEITIES,
        label: "eight deities",
      },
      {
        actual: chart.palaces.map(({ earthPlateStem }) => earthPlateStem),
        expected: QIMEN_STEMS,
        label: "earth-plate stems",
      },
      {
        actual: chart.palaces.flatMap(({ heavenPlate }) =>
          heavenPlate.map(({ stem }) => stem),
        ),
        expected: QIMEN_STEMS,
        label: "heaven-plate stems",
      },
    ];

    for (const { actual, expected, label } of vocabularyChecks) {
      if (!isExactVocabulary(actual, expected)) {
        context.addIssue({
          code: "custom",
          message: `A chart must contain each ${label} value exactly once.`,
          path: ["palaces"],
        });
      }
    }
  })
  .readonly();

export type QimenSourceReference = z.infer<
  typeof QimenSourceReferenceSchema
>;
export type FixedPalaceFacts = z.infer<typeof FixedPalaceFactsSchema>;
export type QimenHeavenPlateEntry = z.infer<
  typeof QimenHeavenPlateEntrySchema
>;
export type XunHeadFact = z.infer<typeof XunHeadFactSchema>;
export type QimenPalace = z.infer<typeof QimenPalaceSchema>;
export type QimenChart = z.infer<typeof QimenChartSchema>;
