import { z } from "zod";
import { QIMEN_STEMS, type QimenStem } from "./constants";
import {
  QimenBureauFactSchema,
  type QimenBureauFact,
} from "./bureau";

export const EARTH_PLATE_SEQUENCE = Object.freeze([
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
  "丁",
  "丙",
  "乙",
] as const);

export const EarthPlateEntrySchema = z
  .object({
    palaceNumber: z.number().int().min(1).max(9),
    stem: z.enum(QIMEN_STEMS),
  })
  .strict()
  .readonly();

export const EarthPlateSchema = z
  .array(EarthPlateEntrySchema)
  .length(9)
  .superRefine((entries, context) => {
    const stems = new Set<QimenStem>();

    entries.forEach((entry, index) => {
      const expectedPalaceNumber = index + 1;
      if (entry.palaceNumber !== expectedPalaceNumber) {
        context.addIssue({
          code: "custom",
          path: [index, "palaceNumber"],
          message: `Earth plate must use canonical palace order; expected ${expectedPalaceNumber}.`,
        });
      }

      if (stems.has(entry.stem)) {
        context.addIssue({
          code: "custom",
          path: [index, "stem"],
          message: `Earth-plate stem ${entry.stem} must appear exactly once.`,
        });
      }
      stems.add(entry.stem);
    });
  })
  .readonly();

export type EarthPlateEntry = z.infer<typeof EarthPlateEntrySchema>;
export type EarthPlate = z.infer<typeof EarthPlateSchema>;

function wrapPalaceNumber(value: number): number {
  return ((value - 1) % 9 + 9) % 9 + 1;
}

export function buildEarthPlate(bureau: QimenBureauFact): EarthPlate {
  const parsedBureau = QimenBureauFactSchema.safeParse(bureau);
  if (!parsedBureau.success) {
    throw new TypeError(
      `Invalid Qimen bureau fact: ${parsedBureau.error.message}`,
    );
  }

  const direction = parsedBureau.data.dunType === "阳遁" ? 1 : -1;
  const stemByPalace = new Map<number, QimenStem>();

  EARTH_PLATE_SEQUENCE.forEach((stem, index) => {
    const palaceNumber = wrapPalaceNumber(
      parsedBureau.data.juNumber + direction * index,
    );
    stemByPalace.set(palaceNumber, stem);
  });

  return EarthPlateSchema.parse(
    Array.from({ length: 9 }, (_, index) => ({
      palaceNumber: index + 1,
      stem: stemByPalace.get(index + 1),
    })),
  );
}
