import { Temporal } from "@js-temporal/polyfill";

export type CivilTimePrecision = "minute" | "second";

export interface CivilTimeInput {
  readonly localDateTime: string;
  readonly timeZone: string;
  readonly precision: CivilTimePrecision;
}

export interface ResolvedCivilTime {
  readonly original: Readonly<CivilTimeInput>;
  readonly localDateTime: string;
  readonly timeZone: string;
  readonly offset: string;
  readonly instant: string;
  readonly precision: CivilTimePrecision;
  readonly conventionVersion: "time-cn-zhang-v1";
}

const MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const IANA_ZONE_PATTERN = /^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/;
const INPUT_KEYS = Object.freeze([
  "localDateTime",
  "precision",
  "timeZone",
] as const);

function parseCivilTimeInput(input: unknown): Readonly<CivilTimeInput> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new TypeError("Civil time input must be a plain object.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== INPUT_KEYS.length ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !INPUT_KEYS.includes(key as (typeof INPUT_KEYS)[number]),
    )
  ) {
    throw new TypeError("Civil time input has missing or unsupported fields.");
  }

  const localDateTime = descriptors.localDateTime;
  const timeZone = descriptors.timeZone;
  const precision = descriptors.precision;
  if (
    !localDateTime ||
    !timeZone ||
    !precision ||
    !Object.hasOwn(localDateTime, "value") ||
    !Object.hasOwn(timeZone, "value") ||
    !Object.hasOwn(precision, "value")
  ) {
    throw new TypeError("Civil time fields must be own data properties.");
  }

  if (
    typeof localDateTime.value !== "string" ||
    typeof timeZone.value !== "string" ||
    (precision.value !== "minute" && precision.value !== "second")
  ) {
    throw new TypeError("Civil time fields have invalid types or values.");
  }

  return Object.freeze({
    localDateTime: localDateTime.value,
    timeZone: timeZone.value,
    precision: precision.value,
  });
}

function assertTimeZone(timeZone: string): void {
  if (
    timeZone.length === 0 ||
    timeZone.trim() !== timeZone ||
    !IANA_ZONE_PATTERN.test(timeZone) ||
    /^[+-]/.test(timeZone)
  ) {
    throw new RangeError("Time zone must be an unmodified IANA identifier.");
  }
}

export function resolveCivilTime(input: CivilTimeInput): ResolvedCivilTime {
  const original = parseCivilTimeInput(input);

  const pattern =
    original.precision === "minute" ? MINUTE_PATTERN : SECOND_PATTERN;
  if (!pattern.test(original.localDateTime)) {
    throw new RangeError("Local date-time does not match its declared precision.");
  }
  assertTimeZone(original.timeZone);

  const localDateTime =
    original.precision === "minute"
      ? `${original.localDateTime}:00`
      : original.localDateTime;
  const plainDateTime = Temporal.PlainDateTime.from(localDateTime, {
    overflow: "reject",
  });
  if (plainDateTime.toString({ smallestUnit: "second" }) !== localDateTime) {
    throw new RangeError("Local date-time must not require normalization.");
  }
  const zonedDateTime = plainDateTime.toZonedDateTime(original.timeZone, {
    disambiguation: "reject",
  });

  return Object.freeze({
    original,
    localDateTime,
    timeZone: original.timeZone,
    offset: zonedDateTime.offset,
    instant: zonedDateTime.toInstant().toString({ fractionalSecondDigits: 0 }),
    precision: original.precision,
    conventionVersion: "time-cn-zhang-v1",
  });
}
