import { z } from "zod";

export const BIRTH_PROFILE_CONTRACT_VERSION = "birth-profile/v1" as const;

const EARTHLY_BRANCHES = Object.freeze([
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

const UnpaddedNonEmptyStringSchema = z
  .string()
  .min(1)
  .refine((value) => value === value.trim(), {
    message: "Value must not contain leading or trailing whitespace.",
  });

const ProfileIdSchema = UnpaddedNonEmptyStringSchema.max(128).regex(
  /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
  "Profile ID must use letters, digits, underscores or hyphens.",
);

const PlaceTextSchema = UnpaddedNonEmptyStringSchema.max(200);
const DisplayNameSchema = UnpaddedNonEmptyStringSchema.max(80);

function isValidIanaTimeZone(value: string): boolean {
  if (
    value !== value.trim() ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9._+-]+)+$/.test(value)
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidGregorianDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isValidMinuteDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !isValidGregorianDate(match[1]!)) {
    return false;
  }
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export const IanaTimeZoneSchema = z
  .string()
  .refine(isValidIanaTimeZone, "Value must be an unambiguous IANA timezone.");

const SharedBirthInputShape = {
  calendar: z.literal("gregorian"),
  timeZone: IanaTimeZoneSchema,
  placeText: PlaceTextSchema,
} as const;

export const MinuteBirthInputSchema = z
  .object({
    ...SharedBirthInputShape,
    precision: z.literal("minute"),
    localDateTime: z
      .string()
      .refine(
        isValidMinuteDateTime,
        "Minute precision requires YYYY-MM-DDTHH:mm without an offset.",
      ),
  })
  .strict()
  .readonly();

export const ShichenBirthInputSchema = z
  .object({
    ...SharedBirthInputShape,
    precision: z.literal("shichen"),
    localDate: z
      .string()
      .refine(isValidGregorianDate, "Local date must be a valid Gregorian date."),
    shichenBranch: z.enum(EARTHLY_BRANCHES),
  })
  .strict()
  .readonly();

export const OriginalBirthInputSchema = z.discriminatedUnion("precision", [
  MinuteBirthInputSchema,
  ShichenBirthInputSchema,
]);

const BirthProfileDraftShape = {
  profileId: ProfileIdSchema,
  originalBirthInput: OriginalBirthInputSchema,
  displayName: DisplayNameSchema.optional(),
  sex: z.enum(["male", "female"]).optional(),
} as const;

export const BirthProfileDraftSchema = z
  .object(BirthProfileDraftShape)
  .strict()
  .readonly();

export const BirthProfileSchema = z
  .object({
    contractVersion: z.literal(BIRTH_PROFILE_CONTRACT_VERSION),
    profileId: ProfileIdSchema,
    profileVersion: z.number().int().positive(),
    originalBirthInput: OriginalBirthInputSchema,
    displayName: DisplayNameSchema.optional(),
    sex: z.enum(["male", "female"]).optional(),
  })
  .strict()
  .readonly();

export type MinuteBirthInput = z.infer<typeof MinuteBirthInputSchema>;
export type ShichenBirthInput = z.infer<typeof ShichenBirthInputSchema>;
export type OriginalBirthInput = z.infer<typeof OriginalBirthInputSchema>;
export type BirthProfileDraft = z.infer<typeof BirthProfileDraftSchema>;
export type BirthProfile = z.infer<typeof BirthProfileSchema>;
