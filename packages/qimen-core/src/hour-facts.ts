import { sexagenaryName } from "@seeway/time-core";
import { z } from "zod";
import {
  QIMEN_ALGORITHM_VERSION,
  XUN_HEADS,
} from "./constants";
import { XunHeadFactSchema } from "./schema";

export const QIMEN_HOUR_FACTS_VERSION = "qimen-hour-facts/v1" as const;

const SEXAGENARY_CYCLE = Object.freeze(
  Array.from({ length: 60 }, (_, index) => sexagenaryName(index)),
);

const SexagenaryNameSchema = z.string().refine(
  (value) => SEXAGENARY_CYCLE.includes(value),
  "Value must be a sexagenary cycle name.",
);

const HorsePalaceSchema = z.union([
  z.literal(2),
  z.literal(4),
  z.literal(6),
  z.literal(8),
]);

type HorsePalace = z.infer<typeof HorsePalaceSchema>;

const HORSE_PALACE_BY_BRANCH: Readonly<Record<string, HorsePalace>> =
  Object.freeze({
    申: 8,
    子: 8,
    辰: 8,
    寅: 2,
    午: 2,
    戌: 2,
    巳: 6,
    酉: 6,
    丑: 6,
    亥: 4,
    卯: 4,
    未: 4,
  });

interface DerivedHourFacts {
  readonly xunHead: {
    readonly name: (typeof XUN_HEADS)[number]["name"];
    readonly instrument: (typeof XUN_HEADS)[number]["instrument"];
  };
  readonly voidPalaces: readonly number[];
  readonly horsePalace: HorsePalace;
}

function deriveHourFacts(hourPillar: string): DerivedHourFacts | null {
  const cycleIndex = SEXAGENARY_CYCLE.indexOf(hourPillar);
  if (cycleIndex < 0) {
    return null;
  }

  const xunHead = XUN_HEADS[Math.floor(cycleIndex / 10)]!;
  const branch = Array.from(hourPillar)[1];
  const horsePalace = branch ? HORSE_PALACE_BY_BRANCH[branch] : undefined;
  if (!horsePalace) {
    return null;
  }

  return {
    xunHead: {
      name: xunHead.name,
      instrument: xunHead.instrument,
    },
    voidPalaces: xunHead.voidPalaces,
    horsePalace,
  };
}

export const QimenHourFactsSchema = z
  .object({
    hourFactsVersion: z.literal(QIMEN_HOUR_FACTS_VERSION),
    algorithmVersion: z.literal(QIMEN_ALGORITHM_VERSION),
    hourPillar: SexagenaryNameSchema,
    xunHead: XunHeadFactSchema,
    voidPalaces: z
      .array(z.number().int().min(1).max(9))
      .min(1)
      .max(2)
      .refine((palaces) => new Set(palaces).size === palaces.length, {
        message: "Void palaces must be distinct.",
      })
      .readonly(),
    horsePalace: HorsePalaceSchema,
  })
  .strict()
  .superRefine((facts, context) => {
    const expected = deriveHourFacts(facts.hourPillar);
    if (!expected) {
      return;
    }

    if (
      facts.xunHead.name !== expected.xunHead.name ||
      facts.xunHead.instrument !== expected.xunHead.instrument
    ) {
      context.addIssue({
        code: "custom",
        path: ["xunHead"],
        message: `${facts.hourPillar} must use Xun head ${expected.xunHead.name}/${expected.xunHead.instrument}.`,
      });
    }

    if (
      facts.voidPalaces.length !== expected.voidPalaces.length ||
      facts.voidPalaces.some(
        (palace, index) => palace !== expected.voidPalaces[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["voidPalaces"],
        message: `Void palaces must match ${expected.xunHead.name}.`,
      });
    }

    if (facts.horsePalace !== expected.horsePalace) {
      context.addIssue({
        code: "custom",
        path: ["horsePalace"],
        message: `${facts.hourPillar} must use horse palace ${expected.horsePalace}.`,
      });
    }
  })
  .readonly();

export type QimenHourFacts = z.infer<typeof QimenHourFactsSchema>;

export function calculateQimenHourFacts(
  hourPillar: string,
): QimenHourFacts {
  const derived = deriveHourFacts(hourPillar);
  if (!derived) {
    throw new RangeError("Hour pillar must be a sexagenary cycle name.");
  }

  return QimenHourFactsSchema.parse({
    hourFactsVersion: QIMEN_HOUR_FACTS_VERSION,
    algorithmVersion: QIMEN_ALGORITHM_VERSION,
    hourPillar,
    ...derived,
  });
}
