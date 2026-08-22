import { Temporal } from "@js-temporal/polyfill";
import { SolarTime } from "tyme4ts";
import { z } from "zod";
import {
  resolveCivilTime,
  type CivilTimeInput,
  type ResolvedCivilTime,
} from "./civil-time";
import { sexagenaryName } from "./cycles";

export type CalendarVerificationStatus = "unverified";
export type CalendarTimeZone = "Asia/Shanghai";
export type SolarTermKind = "jie" | "qi";

export interface DateBoundaryContract {
  readonly lunarDatePolicy: "civil-midnight";
  readonly sexagenaryDayPillarPolicy: "zi-start-23:00";
  readonly isSplitWindow: boolean;
}

export interface LunarDateFact {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly leap: boolean;
  readonly yearName: string;
  readonly monthName: string;
  readonly dayName: string;
}

export interface CalendarPillars {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
}

export interface SolarTermFact {
  readonly name: string;
  readonly kind: SolarTermKind;
  readonly localDateTime: string;
  readonly instant: string;
}

export interface CalendarSolarTerms {
  readonly previous: Readonly<SolarTermFact>;
  readonly current: Readonly<SolarTermFact>;
  readonly next: Readonly<SolarTermFact>;
}

export interface CalendarFacts {
  readonly timeZone: CalendarTimeZone;
  readonly providerVersion: "tyme4ts@1.5.2";
  readonly conventionVersion: "time-cn-zhang-v1";
  readonly verificationStatus: CalendarVerificationStatus;
  readonly dateBoundary: Readonly<DateBoundaryContract>;
  readonly lunar: Readonly<LunarDateFact>;
  readonly pillars: Readonly<CalendarPillars>;
  readonly solarTerms: Readonly<CalendarSolarTerms>;
}

const SOLAR_TERM_NAMES = Object.freeze([
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
  "冬至",
] as const);

const SOLAR_TERM_INDEX = new Map(
  SOLAR_TERM_NAMES.map((name, index) => [name, index] as const),
);
const SEXAGENARY_NAMES = new Set(
  Array.from({ length: 60 }, (_, index) => sexagenaryName(index)),
);

export const DateBoundarySchema = z
  .object({
    lunarDatePolicy: z.literal("civil-midnight"),
    sexagenaryDayPillarPolicy: z.literal("zi-start-23:00"),
    isSplitWindow: z.boolean(),
  })
  .strict();

export const LunarDateFactSchema = z
  .object({
    year: z.int(),
    month: z.int().min(1).max(12),
    day: z.int().min(1).max(30),
    leap: z.boolean(),
    yearName: z.string().min(1),
    monthName: z.string().min(1),
    dayName: z.string().min(1),
  })
  .strict();

const SexagenaryNameSchema = z.string().refine(
  (value) => SEXAGENARY_NAMES.has(value),
  "Pillar must be one of the sixty sexagenary cycle names.",
);

export const CalendarPillarsSchema = z
  .object({
    year: SexagenaryNameSchema,
    month: SexagenaryNameSchema,
    day: SexagenaryNameSchema,
    hour: SexagenaryNameSchema,
  })
  .strict();

function solarTermKindFor(name: (typeof SOLAR_TERM_NAMES)[number]): SolarTermKind {
  const index = SOLAR_TERM_INDEX.get(name);
  if (index === undefined) {
    throw new RangeError(`Unknown solar term: ${name}`);
  }
  return index % 2 === 0 ? "jie" : "qi";
}

export const SolarTermFactSchema = z
  .object({
    name: z.enum(SOLAR_TERM_NAMES),
    kind: z.enum(["jie", "qi"] satisfies readonly SolarTermKind[]),
    localDateTime: z.string().min(1),
    instant: z.string().min(1),
  })
  .strict()
  .superRefine((fact, context) => {
    if (fact.kind !== solarTermKindFor(fact.name)) {
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message: `${fact.name} has the wrong jie/qi kind.`,
      });
    }

    let zoned: Temporal.ZonedDateTime;
    try {
      zoned = Temporal.ZonedDateTime.from(fact.localDateTime, {
        disambiguation: "reject",
        offset: "reject",
        overflow: "reject",
      });
    } catch {
      context.addIssue({
        code: "custom",
        path: ["localDateTime"],
        message: "Solar-term localDateTime must be a valid zoned date-time.",
      });
      return;
    }

    if (zoned.timeZoneId !== "Asia/Shanghai") {
      context.addIssue({
        code: "custom",
        path: ["localDateTime"],
        message: "Solar-term localDateTime must use Asia/Shanghai.",
      });
    }

    let instant: Temporal.Instant;
    try {
      instant = Temporal.Instant.from(fact.instant);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["instant"],
        message: "Solar-term instant must be a valid Temporal instant.",
      });
      return;
    }

    if (Temporal.Instant.compare(zoned.toInstant(), instant) !== 0) {
      context.addIssue({
        code: "custom",
        path: ["instant"],
        message: "Solar-term localDateTime and instant must identify the same time.",
      });
    }
  });

export const CalendarSolarTermsSchema = z
  .object({
    previous: SolarTermFactSchema,
    current: SolarTermFactSchema,
    next: SolarTermFactSchema,
  })
  .strict()
  .superRefine((terms, context) => {
    const previousIndex = SOLAR_TERM_INDEX.get(terms.previous.name);
    const currentIndex = SOLAR_TERM_INDEX.get(terms.current.name);
    const nextIndex = SOLAR_TERM_INDEX.get(terms.next.name);
    if (
      previousIndex === undefined ||
      currentIndex === undefined ||
      nextIndex === undefined
    ) {
      return;
    }

    if ((previousIndex + 1) % SOLAR_TERM_NAMES.length !== currentIndex) {
      context.addIssue({
        code: "custom",
        path: ["current", "name"],
        message: "Previous and current solar terms must be adjacent.",
      });
    }
    if ((currentIndex + 1) % SOLAR_TERM_NAMES.length !== nextIndex) {
      context.addIssue({
        code: "custom",
        path: ["next", "name"],
        message: "Current and next solar terms must be adjacent.",
      });
    }

    try {
      const previous = Temporal.Instant.from(terms.previous.instant);
      const current = Temporal.Instant.from(terms.current.instant);
      const next = Temporal.Instant.from(terms.next.instant);
      if (
        Temporal.Instant.compare(previous, current) >= 0 ||
        Temporal.Instant.compare(current, next) >= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["current", "instant"],
          message: "Solar-term instants must be strictly increasing.",
        });
      }
    } catch {
      // Individual solar-term schemas report parsing errors at their own fields.
    }
  });

export const CalendarFactsSchema = z
  .object({
    timeZone: z.literal("Asia/Shanghai"),
    providerVersion: z.literal("tyme4ts@1.5.2"),
    conventionVersion: z.literal("time-cn-zhang-v1"),
    verificationStatus: z.literal("unverified"),
    dateBoundary: DateBoundarySchema,
    lunar: LunarDateFactSchema,
    pillars: CalendarPillarsSchema,
    solarTerms: CalendarSolarTermsSchema,
  })
  .strict();

const RESOLVED_KEYS = Object.freeze([
  "original",
  "localDateTime",
  "timeZone",
  "offset",
  "instant",
  "precision",
  "conventionVersion",
] as const);

const ORIGINAL_KEYS = Object.freeze([
  "localDateTime",
  "timeZone",
  "precision",
] as const);

function snapshotOwnDataProperties(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object.`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new TypeError(`${label} has missing or unsupported fields.`);
  }

  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} fields must be own data properties.`);
    }
    snapshot[key] = descriptor.value;
  }

  return Object.freeze(snapshot);
}

function snapshotResolvedCivilTime(input: unknown): ResolvedCivilTime {
  const resolved = snapshotOwnDataProperties(
    input,
    RESOLVED_KEYS,
    "Resolved civil time",
  );
  const originalRecord = snapshotOwnDataProperties(
    resolved.original,
    ORIGINAL_KEYS,
    "Resolved civil time original",
  );

  const originalLocalDateTime = originalRecord.localDateTime;
  const originalTimeZone = originalRecord.timeZone;
  const originalPrecision = originalRecord.precision;
  if (
    typeof originalLocalDateTime !== "string" ||
    typeof originalTimeZone !== "string" ||
    (originalPrecision !== "minute" && originalPrecision !== "second") ||
    typeof resolved.localDateTime !== "string" ||
    typeof resolved.timeZone !== "string" ||
    typeof resolved.offset !== "string" ||
    typeof resolved.instant !== "string" ||
    (resolved.precision !== "minute" && resolved.precision !== "second") ||
    resolved.conventionVersion !== "time-cn-zhang-v1"
  ) {
    throw new TypeError("Input must match the ResolvedCivilTime contract.");
  }

  const original: Readonly<CivilTimeInput> = Object.freeze({
    localDateTime: originalLocalDateTime,
    timeZone: originalTimeZone,
    precision: originalPrecision,
  });

  let canonical: ResolvedCivilTime;
  try {
    canonical = resolveCivilTime(original);
  } catch {
    throw new TypeError("Input must contain a valid resolved civil time.");
  }

  if (
    resolved.localDateTime !== canonical.localDateTime ||
    resolved.timeZone !== canonical.timeZone ||
    resolved.offset !== canonical.offset ||
    resolved.instant !== canonical.instant ||
    resolved.precision !== canonical.precision
  ) {
    throw new TypeError("Resolved civil time fields are inconsistent.");
  }

  return Object.freeze({
    original,
    localDateTime: resolved.localDateTime,
    timeZone: resolved.timeZone,
    offset: resolved.offset,
    instant: resolved.instant,
    precision: resolved.precision,
    conventionVersion: "time-cn-zhang-v1",
  });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(record)) {
      deepFreeze(record[key]);
    }
    return Object.freeze(value);
  }

  return value;
}

function toShanghaiInstant(
  solarTime: Pick<
    SolarTime,
    "getYear" | "getMonth" | "getDay" | "getHour" | "getMinute" | "getSecond"
  >,
): { readonly localDateTime: string; readonly instant: string } {
  const plain = Temporal.PlainDateTime.from({
    year: solarTime.getYear(),
    month: solarTime.getMonth(),
    day: solarTime.getDay(),
    hour: solarTime.getHour(),
    minute: solarTime.getMinute(),
    second: solarTime.getSecond(),
  });
  const zoned = plain.toZonedDateTime("Asia/Shanghai", {
    disambiguation: "reject",
  });

  return Object.freeze({
    localDateTime: zoned.toString({ smallestUnit: "second" }),
    instant: zoned.toInstant().toString({ fractionalSecondDigits: 0 }),
  });
}

function toSolarTermKind(term: {
  readonly isJie: () => boolean;
  readonly isQi: () => boolean;
}): SolarTermKind {
  if (term.isJie()) {
    return "jie";
  }
  if (term.isQi()) {
    return "qi";
  }
  throw new RangeError("Solar term kind must be jie or qi.");
}

function toSolarTermFact(term: {
  readonly getName: () => string;
  readonly isJie: () => boolean;
  readonly isQi: () => boolean;
  readonly getJulianDay: () => { readonly getSolarTime: () => SolarTime };
}) {
  const solarTime = term.getJulianDay().getSolarTime();
  const timestamp = toShanghaiInstant(solarTime);

  return Object.freeze({
    name: term.getName(),
    kind: toSolarTermKind(term),
    localDateTime: timestamp.localDateTime,
    instant: timestamp.instant,
  });
}

function assertCalendarWindow(
  facts: CalendarFacts,
  resolved: ResolvedCivilTime,
): void {
  const current = Temporal.Instant.from(facts.solarTerms.current.instant);
  const civil = Temporal.Instant.from(resolved.instant);
  const next = Temporal.Instant.from(facts.solarTerms.next.instant);
  if (
    Temporal.Instant.compare(current, civil) > 0 ||
    Temporal.Instant.compare(civil, next) >= 0
  ) {
    throw new RangeError(
      "Calendar facts must satisfy current solar term <= civil instant < next solar term.",
    );
  }
}

export function calendarFactsFor(
  resolvedInput: ResolvedCivilTime,
): CalendarFacts {
  const resolved = snapshotResolvedCivilTime(resolvedInput);
  if (resolved.timeZone !== "Asia/Shanghai") {
    throw new RangeError(
      "Calendar facts V1 only support Asia/Shanghai because tyme4ts solar-term civil times do not carry timezone metadata.",
    );
  }

  const local = Temporal.PlainDateTime.from(resolved.localDateTime, {
    overflow: "reject",
  });
  const solarTime = SolarTime.fromYmdHms(
    local.year,
    local.month,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  const sixtyCycleHour = solarTime.getSixtyCycleHour();
  const lunarHour = solarTime.getLunarHour();
  const lunarDay = lunarHour.getLunarDay();
  const lunarMonth = lunarDay.getLunarMonth();
  const lunarYear = lunarMonth.getLunarYear();
  const currentTerm = solarTime.getTerm();
  const previousTerm = currentTerm.next(-1);
  const nextTerm = currentTerm.next(1);

  const parsed: CalendarFacts = CalendarFactsSchema.parse({
    timeZone: "Asia/Shanghai",
    providerVersion: "tyme4ts@1.5.2",
    conventionVersion: "time-cn-zhang-v1",
    verificationStatus: "unverified",
    dateBoundary: {
      lunarDatePolicy: "civil-midnight",
      sexagenaryDayPillarPolicy: "zi-start-23:00",
      isSplitWindow: local.hour === 23,
    },
    lunar: {
      year: lunarYear.getYear(),
      month: lunarMonth.getMonth(),
      day: lunarDay.getDay(),
      leap: lunarMonth.isLeap(),
      yearName: lunarYear.getName(),
      monthName: lunarMonth.getName(),
      dayName: lunarDay.getName(),
    },
    pillars: {
      year: sixtyCycleHour.getYear().getName(),
      month: sixtyCycleHour.getMonth().getName(),
      day: sixtyCycleHour.getDay().getName(),
      hour: sixtyCycleHour.getSixtyCycle().getName(),
    },
    solarTerms: {
      previous: toSolarTermFact(previousTerm),
      current: toSolarTermFact(currentTerm),
      next: toSolarTermFact(nextTerm),
    },
  });

  assertCalendarWindow(parsed, resolved);
  return deepFreeze(parsed);
}
