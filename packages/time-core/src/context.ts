import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import {
  CalendarPillarsSchema,
  CalendarSolarTermsSchema,
  DateBoundarySchema,
  LunarDateFactSchema,
  calendarFactsFor,
  type CalendarFacts,
  type CalendarPillars,
  type DateBoundaryContract,
  type LunarDateFact,
} from "./calendar-provider";
import {
  resolveCivilTime,
  type CivilTimeInput,
  type ResolvedCivilTime,
} from "./civil-time";
import { EARTHLY_BRANCHES } from "./cycles";
import { shichenFor, type ShichenPeriod } from "./shichen";

export interface TimeContext {
  readonly civil: ResolvedCivilTime;
  readonly shichen: ShichenPeriod;
  readonly dateBoundary: Readonly<DateBoundaryContract>;
  readonly lunar: Readonly<LunarDateFact>;
  readonly pillars: Readonly<CalendarPillars>;
  readonly solarTerms: Readonly<CalendarFacts["solarTerms"]>;
  readonly providerVersion: "tyme4ts@1.5.2";
  readonly conventionVersion: "time-cn-zhang-v1";
  readonly verificationStatus: "unverified";
}

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

function plainDataEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => plainDataEqual(item, right[index]))
    );
  }

  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null ||
    Object.getPrototypeOf(left) !== Object.prototype ||
    Object.getPrototypeOf(right) !== Object.prototype
  ) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        plainDataEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

const PrecisionSchema = z.enum(["minute", "second"]);

const CivilInputSchema = z
  .object({
    localDateTime: z.string().min(1),
    timeZone: z.literal("Asia/Shanghai"),
    precision: PrecisionSchema,
  })
  .strict();

const ResolvedCivilTimeSchema = z
  .object({
    original: CivilInputSchema,
    localDateTime: z.string().min(1),
    timeZone: z.literal("Asia/Shanghai"),
    offset: z.string().min(1),
    instant: z.string().min(1),
    precision: PrecisionSchema,
    conventionVersion: z.literal("time-cn-zhang-v1"),
  })
  .strict();

const EarthlyBranchSchema = z.enum(EARTHLY_BRANCHES);
const ShichenSliceShape = {
  index: z.int().min(0).max(11),
  branch: EarthlyBranchSchema,
  startLocal: z.string().min(1),
  endLocal: z.string().min(1),
  startInstant: z.string().min(1),
  endInstant: z.string().min(1),
  endExclusive: z.literal(true),
} as const;

const ShichenNextSchema = z
  .object(ShichenSliceShape)
  .strict()
  .superRefine((period, context) => {
    if (EARTHLY_BRANCHES[period.index] !== period.branch) {
      context.addIssue({
        code: "custom",
        path: ["branch"],
        message: "Shichen branch must match its index.",
      });
    }
  });

const ShichenPeriodSchema = z
  .object({
    ...ShichenSliceShape,
    conventionVersion: z.literal("time-cn-zhang-v1"),
    next: ShichenNextSchema,
  })
  .strict()
  .superRefine((period, context) => {
    if (EARTHLY_BRANCHES[period.index] !== period.branch) {
      context.addIssue({
        code: "custom",
        path: ["branch"],
        message: "Shichen branch must match its index.",
      });
    }
    if ((period.index + 1) % EARTHLY_BRANCHES.length !== period.next.index) {
      context.addIssue({
        code: "custom",
        path: ["next", "index"],
        message: "Next shichen index must immediately follow the current index.",
      });
    }
  });

export const TimeContextSchema = z
  .object({
    civil: ResolvedCivilTimeSchema,
    shichen: ShichenPeriodSchema,
    dateBoundary: DateBoundarySchema,
    lunar: LunarDateFactSchema,
    pillars: CalendarPillarsSchema,
    solarTerms: CalendarSolarTermsSchema,
    providerVersion: z.literal("tyme4ts@1.5.2"),
    conventionVersion: z.literal("time-cn-zhang-v1"),
    verificationStatus: z.literal("unverified"),
  })
  .strict()
  .superRefine((value, context) => {
    let local: Temporal.PlainDateTime;
    try {
      local = Temporal.PlainDateTime.from(value.civil.localDateTime, {
        overflow: "reject",
      });
    } catch {
      context.addIssue({
        code: "custom",
        path: ["civil", "localDateTime"],
        message: "Civil localDateTime must be parseable.",
      });
      return;
    }

    if (value.dateBoundary.isSplitWindow !== (local.hour === 23)) {
      context.addIssue({
        code: "custom",
        path: ["dateBoundary", "isSplitWindow"],
        message: "Date-boundary split window must be true only during hour 23.",
      });
    }

    try {
      const previous = Temporal.Instant.from(value.solarTerms.previous.instant);
      const current = Temporal.Instant.from(value.solarTerms.current.instant);
      const civil = Temporal.Instant.from(value.civil.instant);
      const next = Temporal.Instant.from(value.solarTerms.next.instant);
      if (
        Temporal.Instant.compare(previous, current) >= 0 ||
        Temporal.Instant.compare(current, civil) > 0 ||
        Temporal.Instant.compare(civil, next) >= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["solarTerms"],
          message:
            "Context must satisfy previous < current <= civil instant < next.",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        path: ["civil", "instant"],
        message: "Context instants must be parseable.",
      });
    }

    let canonicalShichen: ShichenPeriod;
    let canonicalCalendar: CalendarFacts;
    try {
      canonicalShichen = shichenFor(value.civil);
      canonicalCalendar = calendarFactsFor(value.civil);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["civil"],
        message: "Civil time must support canonical fact derivation.",
      });
      return;
    }

    const canonicalComparisons: ReadonlyArray<
      readonly [string, unknown, unknown]
    > = [
      ["shichen", value.shichen, canonicalShichen],
      ["dateBoundary", value.dateBoundary, canonicalCalendar.dateBoundary],
      ["lunar", value.lunar, canonicalCalendar.lunar],
      ["pillars", value.pillars, canonicalCalendar.pillars],
      ["solarTerms", value.solarTerms, canonicalCalendar.solarTerms],
      ["providerVersion", value.providerVersion, canonicalCalendar.providerVersion],
      [
        "conventionVersion",
        value.conventionVersion,
        canonicalCalendar.conventionVersion,
      ],
      [
        "verificationStatus",
        value.verificationStatus,
        canonicalCalendar.verificationStatus,
      ],
    ];

    for (const [field, actual, expected] of canonicalComparisons) {
      if (!plainDataEqual(actual, expected)) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} must match facts canonically derived from civil time.`,
        });
      }
    }
  });

export function buildTimeContext(resolvedInput: ResolvedCivilTime): TimeContext {
  const civil = snapshotResolvedCivilTime(resolvedInput);
  const shichen = shichenFor(civil);
  const calendar = calendarFactsFor(civil);

  const parsed: TimeContext = TimeContextSchema.parse({
    civil,
    shichen,
    dateBoundary: calendar.dateBoundary,
    lunar: calendar.lunar,
    pillars: calendar.pillars,
    solarTerms: calendar.solarTerms,
    providerVersion: calendar.providerVersion,
    conventionVersion: calendar.conventionVersion,
    verificationStatus: calendar.verificationStatus,
  }) as TimeContext;

  return deepFreeze(parsed);
}
