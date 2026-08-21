import { Temporal } from "@js-temporal/polyfill";
import { EARTHLY_BRANCHES } from "./cycles";
import {
  resolveCivilTime,
  type CivilTimeInput,
  type ResolvedCivilTime,
} from "./civil-time";

export type ShichenIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type EarthlyBranch = (typeof EARTHLY_BRANCHES)[number];

export interface ShichenNext {
  readonly index: ShichenIndex;
  readonly branch: EarthlyBranch;
  readonly startLocal: string;
  readonly endLocal: string;
  readonly startInstant: string;
  readonly endInstant: string;
  readonly endExclusive: true;
}

export interface ShichenPeriod extends ShichenNext {
  readonly conventionVersion: "time-cn-zhang-v1";
  readonly next: Readonly<ShichenNext>;
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

function asShichenIndex(index: number): ShichenIndex {
  if (!Number.isInteger(index) || index < 0 || index > 11) {
    throw new RangeError("Shichen index must be an integer from 0 to 11.");
  }
  return index as ShichenIndex;
}

function localString(zonedDateTime: Temporal.ZonedDateTime): string {
  return zonedDateTime.toString({ smallestUnit: "second" });
}

function instantString(zonedDateTime: Temporal.ZonedDateTime): string {
  return zonedDateTime.toInstant().toString({ fractionalSecondDigits: 0 });
}

function periodSlice(
  index: ShichenIndex,
  start: Temporal.PlainDateTime,
  end: Temporal.PlainDateTime,
  timeZone: string,
): Readonly<ShichenNext> {
  const branch = EARTHLY_BRANCHES[index];
  const startZoned = start.toZonedDateTime(timeZone, {
    disambiguation: "reject",
  });
  const endZoned = end.toZonedDateTime(timeZone, {
    disambiguation: "reject",
  });

  return Object.freeze({
    index,
    branch,
    startLocal: localString(startZoned),
    endLocal: localString(endZoned),
    startInstant: instantString(startZoned),
    endInstant: instantString(endZoned),
    endExclusive: true,
  });
}

export function shichenFor(resolvedInput: ResolvedCivilTime): ShichenPeriod {
  const resolved = snapshotResolvedCivilTime(resolvedInput);
  const local = Temporal.PlainDateTime.from(resolved.localDateTime, {
    overflow: "reject",
  });
  const index = asShichenIndex(Math.floor(((local.hour + 1) % 24) / 2));
  const startHour = index === 0 ? 23 : index * 2 - 1;
  let start = local.with({
    hour: startHour,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });
  if (index === 0 && local.hour === 0) {
    start = start.subtract({ days: 1 });
  }

  const end = start.add({ hours: 2 });
  const nextEnd = end.add({ hours: 2 });
  const current = periodSlice(index, start, end, resolved.timeZone);
  const nextIndex = asShichenIndex((index + 1) % 12);
  const next = periodSlice(nextIndex, end, nextEnd, resolved.timeZone);

  return Object.freeze({
    ...current,
    conventionVersion: "time-cn-zhang-v1",
    next,
  });
}
