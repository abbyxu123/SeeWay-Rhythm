import { sexagenaryName } from "@seeway/time-core";
import { z } from "zod";
import {
  EIGHT_DEITIES,
  EIGHT_GATES,
  LUO_SHU_PALACES,
  NINE_STARS,
  QIMEN_STEMS,
  type QimenStem,
} from "./constants";
import {
  EarthPlateSchema,
  type EarthPlate,
} from "./earth-plate";
import {
  QimenHourFactsSchema,
  type QimenHourFacts,
} from "./hour-facts";
import { QimenHeavenPlateEntrySchema } from "./schema";

export const OUTER_PALACE_ORDER = Object.freeze([
  1,
  8,
  3,
  4,
  9,
  2,
  7,
  6,
] as const);

const DUN_TYPES = Object.freeze(["阳遁", "阴遁"] as const);
const PalaceNumberSchema = z.number().int().min(1).max(9);
const OuterPalaceNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
]);

type OuterPalaceNumber = z.infer<typeof OuterPalaceNumberSchema>;
type DunType = (typeof DUN_TYPES)[number];

const SEXAGENARY_CYCLE = Object.freeze(
  Array.from({ length: 60 }, (_, index) => sexagenaryName(index)),
);

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

function validateCanonicalPalaceOrder(
  entries: readonly { readonly palaceNumber: number }[],
  context: z.RefinementCtx,
): void {
  entries.forEach(({ palaceNumber }, index) => {
    if (palaceNumber !== index + 1) {
      context.addIssue({
        code: "custom",
        path: [index, "palaceNumber"],
        message: `Expected canonical palace ${index + 1}.`,
      });
    }
  });
}

export const QimenRotationAnchorsSchema = z
  .object({
    xunInstrumentPalace: PalaceNumberSchema,
    rotationSourcePalace: OuterPalaceNumberSchema,
    starTargetPalace: OuterPalaceNumberSchema,
    gateTargetPalace: OuterPalaceNumberSchema,
    chiefStar: z.enum(NINE_STARS),
    chiefGate: z.enum(EIGHT_GATES),
  })
  .strict()
  .readonly();

const HeavenPlatePlacementEntrySchema = z
  .object({
    palaceNumber: PalaceNumberSchema,
    heavenPlate: z
      .array(QimenHeavenPlateEntrySchema)
      .max(2)
      .readonly(),
  })
  .strict()
  .readonly();

export const QimenHeavenPlatePlacementSchema = z
  .array(HeavenPlatePlacementEntrySchema)
  .length(9)
  .superRefine((entries, context) => {
    validateCanonicalPalaceOrder(entries, context);
    if (entries[4]?.heavenPlate.length !== 0) {
      context.addIssue({
        code: "custom",
        path: [4, "heavenPlate"],
        message: "The center palace must be empty on the rotating heaven plate.",
      });
    }
    if (
      entries.some(
        ({ palaceNumber, heavenPlate }) =>
          palaceNumber !== 5 && heavenPlate.length === 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Every outer palace must contain a heaven-plate star.",
      });
    }

    const heavenEntries = entries.flatMap(({ heavenPlate }) => heavenPlate);
    if (
      !isExactVocabulary(
        heavenEntries.map(({ star }) => star),
        NINE_STARS,
      ) ||
      !isExactVocabulary(
        heavenEntries.map(({ stem }) => stem),
        QIMEN_STEMS,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "The heaven plate must contain every star and stem exactly once.",
      });
    }

    const lodgingGroups = entries.filter(
      ({ heavenPlate }) => heavenPlate.length === 2,
    );
    if (
      lodgingGroups.length !== 1 ||
      !isExactVocabulary(
        lodgingGroups[0]?.heavenPlate.map(({ star }) => star) ?? [],
        ["天禽", "天芮"],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Tianqin must lodge with Tianrui in exactly one outer palace.",
      });
    }
  })
  .readonly();

const GatePlacementEntrySchema = z
  .object({
    palaceNumber: PalaceNumberSchema,
    gate: z.enum(EIGHT_GATES).nullable(),
  })
  .strict()
  .readonly();

export const QimenGatePlacementSchema = z
  .array(GatePlacementEntrySchema)
  .length(9)
  .superRefine((entries, context) => {
    validateCanonicalPalaceOrder(entries, context);
    const gates = entries.flatMap(({ gate }) => (gate ? [gate] : []));
    if (entries[4]?.gate !== null || !isExactVocabulary(gates, EIGHT_GATES)) {
      context.addIssue({
        code: "custom",
        message: "The gates must occupy the eight outer palaces exactly once.",
      });
    }
  })
  .readonly();

const DeityPlacementEntrySchema = z
  .object({
    palaceNumber: PalaceNumberSchema,
    deity: z.enum(EIGHT_DEITIES).nullable(),
  })
  .strict()
  .readonly();

export const QimenDeityPlacementSchema = z
  .array(DeityPlacementEntrySchema)
  .length(9)
  .superRefine((entries, context) => {
    validateCanonicalPalaceOrder(entries, context);
    const deities = entries.flatMap(({ deity }) =>
      deity ? [deity] : [],
    );
    if (
      entries[4]?.deity !== null ||
      !isExactVocabulary(deities, EIGHT_DEITIES)
    ) {
      context.addIssue({
        code: "custom",
        message: "The deities must occupy the eight outer palaces exactly once.",
      });
    }
  })
  .readonly();

export type QimenRotationAnchors = z.infer<
  typeof QimenRotationAnchorsSchema
>;
export type QimenHeavenPlatePlacement = z.infer<
  typeof QimenHeavenPlatePlacementSchema
>;
export type QimenGatePlacement = z.infer<
  typeof QimenGatePlacementSchema
>;
export type QimenDeityPlacement = z.infer<
  typeof QimenDeityPlacementSchema
>;

function lodgeCenter(palaceNumber: number): OuterPalaceNumber {
  return OuterPalaceNumberSchema.parse(
    palaceNumber === 5 ? 2 : palaceNumber,
  );
}

function wrapPalaceNumber(value: number): number {
  return ((value - 1) % 9 + 9) % 9 + 1;
}

function wrapOuterIndex(value: number): number {
  return ((value % OUTER_PALACE_ORDER.length) +
    OUTER_PALACE_ORDER.length) % OUTER_PALACE_ORDER.length;
}

function outerIndex(palaceNumber: OuterPalaceNumber): number {
  const index = OUTER_PALACE_ORDER.indexOf(
    palaceNumber as (typeof OUTER_PALACE_ORDER)[number],
  );
  if (index < 0) {
    throw new RangeError(`Palace ${palaceNumber} is not an outer palace.`);
  }
  return index;
}

function rotateOuterMap<T>(
  sourceByPalace: ReadonlyMap<OuterPalaceNumber, T>,
  sourceAnchor: OuterPalaceNumber,
  targetAnchor: OuterPalaceNumber,
): Map<OuterPalaceNumber, T> {
  const offset = outerIndex(targetAnchor) - outerIndex(sourceAnchor);
  const rotated = new Map<OuterPalaceNumber, T>();

  OUTER_PALACE_ORDER.forEach((sourcePalace, index) => {
    const value = sourceByPalace.get(sourcePalace);
    if (value === undefined) {
      throw new RangeError(`Missing source value for palace ${sourcePalace}.`);
    }
    const targetPalace = OUTER_PALACE_ORDER[wrapOuterIndex(index + offset)]!;
    rotated.set(targetPalace, value);
  });

  return rotated;
}

export function calculateQimenRotationAnchors(
  earthPlate: EarthPlate,
  hourFacts: QimenHourFacts,
  dunType: DunType,
): QimenRotationAnchors {
  const parsedEarthPlate = EarthPlateSchema.parse(earthPlate);
  const parsedHourFacts = QimenHourFactsSchema.parse(hourFacts);
  const parsedDunType = z.enum(DUN_TYPES).parse(dunType);

  const xunInstrumentPalace = parsedEarthPlate.find(
    ({ stem }) => stem === parsedHourFacts.xunHead.instrument,
  )?.palaceNumber;
  if (!xunInstrumentPalace) {
    throw new RangeError("The Xun-head instrument is missing from the earth plate.");
  }

  const rotationSourcePalace = lodgeCenter(xunInstrumentPalace);
  const sourceFixedPalace = LUO_SHU_PALACES.find(
    ({ number }) => number === rotationSourcePalace,
  );
  if (!sourceFixedPalace?.homeGate) {
    throw new RangeError("The rotation source must have a home gate.");
  }

  const hourStem = Array.from(parsedHourFacts.hourPillar)[0];
  const targetStem: QimenStem =
    hourStem === "甲"
      ? parsedHourFacts.xunHead.instrument
      : z.enum(QIMEN_STEMS).parse(hourStem);
  const rawStarTargetPalace = parsedEarthPlate.find(
    ({ stem }) => stem === targetStem,
  )?.palaceNumber;
  if (!rawStarTargetPalace) {
    throw new RangeError("The hour stem is missing from the earth plate.");
  }

  const hourIndex = SEXAGENARY_CYCLE.indexOf(parsedHourFacts.hourPillar);
  const xunIndex = SEXAGENARY_CYCLE.indexOf(parsedHourFacts.xunHead.name);
  const elapsedHours = hourIndex - xunIndex;
  if (elapsedHours < 0 || elapsedHours > 9) {
    throw new RangeError("The hour pillar does not belong to its Xun head.");
  }
  const gateDirection = parsedDunType === "阳遁" ? 1 : -1;
  const rawGateTargetPalace = wrapPalaceNumber(
    xunInstrumentPalace + gateDirection * elapsedHours,
  );

  return QimenRotationAnchorsSchema.parse({
    xunInstrumentPalace,
    rotationSourcePalace,
    starTargetPalace: lodgeCenter(rawStarTargetPalace),
    gateTargetPalace: lodgeCenter(rawGateTargetPalace),
    chiefStar:
      xunInstrumentPalace === 5
        ? "天禽"
        : sourceFixedPalace.homeStar,
    chiefGate: sourceFixedPalace.homeGate,
  });
}

export function rotateHeavenPlate(
  earthPlate: EarthPlate,
  anchors: QimenRotationAnchors,
): QimenHeavenPlatePlacement {
  const parsedEarthPlate = EarthPlateSchema.parse(earthPlate);
  const parsedAnchors = QimenRotationAnchorsSchema.parse(anchors);
  const stemByPalace = new Map(
    parsedEarthPlate.map(({ palaceNumber, stem }) => [palaceNumber, stem]),
  );
  const sourceByPalace = new Map<
    OuterPalaceNumber,
    readonly z.infer<typeof QimenHeavenPlateEntrySchema>[]
  >();

  for (const palaceNumber of OUTER_PALACE_ORDER) {
    const fixed = LUO_SHU_PALACES.find(
      ({ number }) => number === palaceNumber,
    )!;
    if (palaceNumber === 2) {
      sourceByPalace.set(
        palaceNumber,
        Object.freeze([
          QimenHeavenPlateEntrySchema.parse({
            stem: stemByPalace.get(5),
            star: "天禽",
          }),
          QimenHeavenPlateEntrySchema.parse({
            stem: stemByPalace.get(2),
            star: "天芮",
          }),
        ]),
      );
    } else {
      sourceByPalace.set(
        palaceNumber,
        Object.freeze([
          QimenHeavenPlateEntrySchema.parse({
            stem: stemByPalace.get(palaceNumber),
            star: fixed.homeStar,
          }),
        ]),
      );
    }
  }

  const rotated = rotateOuterMap(
    sourceByPalace,
    parsedAnchors.rotationSourcePalace,
    parsedAnchors.starTargetPalace,
  );

  return QimenHeavenPlatePlacementSchema.parse(
    Array.from({ length: 9 }, (_, index) => {
      const palaceNumber = index + 1;
      return {
        palaceNumber,
        heavenPlate:
          palaceNumber === 5
            ? []
            : rotated.get(lodgeCenter(palaceNumber)),
      };
    }),
  );
}

export function rotateGates(
  anchors: QimenRotationAnchors,
): QimenGatePlacement {
  const parsedAnchors = QimenRotationAnchorsSchema.parse(anchors);
  const sourceByPalace = new Map<OuterPalaceNumber, (typeof EIGHT_GATES)[number]>();

  for (const palaceNumber of OUTER_PALACE_ORDER) {
    const homeGate = LUO_SHU_PALACES.find(
      ({ number }) => number === palaceNumber,
    )?.homeGate;
    if (!homeGate) {
      throw new RangeError(`Palace ${palaceNumber} has no home gate.`);
    }
    sourceByPalace.set(palaceNumber, homeGate);
  }

  const rotated = rotateOuterMap(
    sourceByPalace,
    parsedAnchors.rotationSourcePalace,
    parsedAnchors.gateTargetPalace,
  );

  return QimenGatePlacementSchema.parse(
    Array.from({ length: 9 }, (_, index) => {
      const palaceNumber = index + 1;
      return {
        palaceNumber,
        gate:
          palaceNumber === 5
            ? null
            : rotated.get(lodgeCenter(palaceNumber)),
      };
    }),
  );
}

export function rotateDeities(
  anchors: QimenRotationAnchors,
  dunType: DunType,
): QimenDeityPlacement {
  const parsedAnchors = QimenRotationAnchorsSchema.parse(anchors);
  const parsedDunType = z.enum(DUN_TYPES).parse(dunType);
  const direction = parsedDunType === "阳遁" ? 1 : -1;
  const startIndex = outerIndex(parsedAnchors.starTargetPalace);
  const deityByPalace = new Map<
    OuterPalaceNumber,
    (typeof EIGHT_DEITIES)[number]
  >();

  EIGHT_DEITIES.forEach((deity, index) => {
    const palaceNumber =
      OUTER_PALACE_ORDER[
        wrapOuterIndex(startIndex + direction * index)
      ]!;
    deityByPalace.set(palaceNumber, deity);
  });

  return QimenDeityPlacementSchema.parse(
    Array.from({ length: 9 }, (_, index) => {
      const palaceNumber = index + 1;
      return {
        palaceNumber,
        deity:
          palaceNumber === 5
            ? null
            : deityByPalace.get(lodgeCenter(palaceNumber)),
      };
    }),
  );
}
