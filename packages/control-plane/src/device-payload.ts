import { createHash } from "node:crypto";
import {
  BIRTH_PROFILE_CONTRACT_VERSION,
  BirthProfileSchema,
  DEVICE_PAYLOAD_VERSION,
  DevicePayloadSchema,
  type BirthProfile,
  type DevicePayload,
} from "@seeway/contracts";
import {
  QIMEN_ALGORITHM_VERSION,
  QIMEN_CHART_VERSION,
  QIMEN_VERIFIER_VERSION,
  QimenChartSchema,
  verifyQimenChart,
} from "@seeway/qimen-core";
import {
  QIMEN_GUIDANCE_RULE_SET_VERSION,
  QIMEN_GUIDANCE_VERSION,
  evaluateQimenGuidance,
  type DirectionItem,
  type GuidanceSummaryItem,
} from "@seeway/qimen-guidance";
import {
  TimeContextSchema,
  type ShichenPeriod,
  type TimeContext,
} from "@seeway/time-core";

export interface BuildQimenDevicePayloadInput {
  readonly calculatedAt: string;
  readonly selection: "current" | "next";
  readonly profile: BirthProfile;
  readonly timeContext: TimeContext;
  readonly chart: unknown;
}

const VERSION_BLOCK = Object.freeze({
  profile: BIRTH_PROFILE_CONTRACT_VERSION,
  timeContext: "time-cn-zhang-v1",
  qimenChart: QIMEN_CHART_VERSION,
  qimenAlgorithm: QIMEN_ALGORITHM_VERSION,
  qimenVerifier: QIMEN_VERIFIER_VERSION,
  qimenGuidance: QIMEN_GUIDANCE_VERSION,
  qimenRuleSet: QIMEN_GUIDANCE_RULE_SET_VERSION,
} as const);

const EMPTY_ROWS = Object.freeze({
  favorable: Object.freeze({ text: null, evidenceIds: Object.freeze([]) }),
  caution: Object.freeze({ text: null, evidenceIds: Object.freeze([]) }),
  direction: Object.freeze({ text: null, evidenceIds: Object.freeze([]) }),
  advice: Object.freeze({ text: null, evidenceIds: Object.freeze([]) }),
} as const);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function chartHash(chart: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(chart)).digest("hex")}`;
}

function localParts(localDateTime: string): {
  readonly date: string;
  readonly hour: number;
  readonly minute: number;
} {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(localDateTime);
  if (!match) {
    throw new RangeError("Canonical local time could not be formatted.");
  }
  return {
    date: match[1]!,
    hour: Number(match[2]),
    minute: Number(match[3]),
  };
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function inclusiveRange(period: ShichenPeriod): string {
  const start = localParts(period.startLocal);
  const end = localParts(period.endLocal);
  const inclusiveMinute = (end.hour * 60 + end.minute + 1439) % 1440;
  return `${twoDigits(start.hour)}:${twoDigits(start.minute)}-${twoDigits(
    Math.floor(inclusiveMinute / 60),
  )}:${twoDigits(inclusiveMinute % 60)}`;
}

function weekdayText(localDate: string):
  | "星期一"
  | "星期二"
  | "星期三"
  | "星期四"
  | "星期五"
  | "星期六"
  | "星期日" {
  const [year, month, day] = localDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!, 12)).getUTCDay();
  return [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ][weekday]! as ReturnType<typeof weekdayText>;
}

function commonFields(
  input: BuildQimenDevicePayloadInput,
  profile: BirthProfile,
  context: TimeContext,
) {
  const local = localParts(context.civil.localDateTime);
  const lunar = context.lunar;
  return {
    payloadVersion: DEVICE_PAYLOAD_VERSION,
    calculatedAt: input.calculatedAt,
    profileRef: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
    },
    targetShichen: {
      selection: input.selection,
      index: context.shichen.index,
      branch: context.shichen.branch,
      label: `${context.shichen.branch}时`,
      startLocal: context.shichen.startLocal,
      endLocal: context.shichen.endLocal,
      rangeText: inclusiveRange(context.shichen),
    },
    calendarHeader: {
      clockText: `${twoDigits(local.hour)}:${twoDigits(local.minute)}`,
      weekdayText: weekdayText(local.date),
      solarDateText: `阳历 ${local.date.replaceAll("-", ".")}`,
      lunarDateText: `阴历 ${lunar.leap ? "闰" : ""}${lunar.monthName}${lunar.dayName}`,
      solarTermText: `节气 ${context.solarTerms.current.name}`,
      pillarsText: `${context.pillars.year}年 ${context.pillars.month}月 ${context.pillars.day}日 ${context.pillars.hour}时`,
    },
    versions: VERSION_BLOCK,
  } as const;
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function summaryRow(item: GuidanceSummaryItem | undefined) {
  return item
    ? { text: item.text, evidenceIds: [...item.evidenceIds] }
    : { text: null, evidenceIds: [] };
}

function directionRow(items: readonly DirectionItem[]) {
  const supportive = distinct(
    items
      .filter(({ polarity }) => polarity === "supportive")
      .map(({ direction }) => direction),
  );
  const avoid = distinct(
    items
      .filter(({ polarity }) => polarity === "avoid")
      .map(({ direction }) => direction),
  );
  const parts = [
    supportive.length > 0 ? `利${supportive.join("、")}` : null,
    avoid.length > 0 ? `慎${avoid.join("、")}` : null,
  ].filter((part): part is string => part !== null);
  return {
    text: parts.length > 0 ? parts.join("；") : null,
    evidenceIds: distinct(items.flatMap(({ evidenceIds }) => evidenceIds)),
  };
}

function blockedPayload(
  input: BuildQimenDevicePayloadInput,
  profile: BirthProfile,
  context: TimeContext,
  issueCodes: readonly string[],
): DevicePayload {
  return DevicePayloadSchema.parse({
    ...commonFields(input, profile, context),
    verification: {
      status: "blocked",
      issueCodes: distinct(issueCodes),
    },
    chartHash: null,
    guidanceStatus: "insufficient",
    rows: EMPTY_ROWS,
    directions: [],
    ruleIds: [],
    chart: null,
  });
}

export function buildQimenDevicePayload(
  input: BuildQimenDevicePayloadInput,
): DevicePayload {
  const profile = BirthProfileSchema.parse(input.profile);
  const context = TimeContextSchema.parse(input.timeContext) as TimeContext;
  const verification = verifyQimenChart(context, input.chart);
  const issueCodes: string[] = verification.issues.map(({ code }) => code);
  if (!verification.calculatorAuthenticated) {
    issueCodes.push("calculator_not_authenticated");
  }
  if (verification.status !== "verified" || !verification.calculatorAuthenticated) {
    return blockedPayload(input, profile, context, issueCodes);
  }

  const guidance = evaluateQimenGuidance(context, input.chart);
  if (guidance.status !== "derived" || guidance.verificationStatus !== "verified") {
    return blockedPayload(input, profile, context, ["guidance_insufficient"]);
  }

  const chart = QimenChartSchema.parse(input.chart);
  const rows = {
    favorable: summaryRow(guidance.categories.favorable[0]),
    caution: summaryRow(guidance.categories.caution[0]),
    direction: directionRow(guidance.categories.directions),
    advice: summaryRow(guidance.categories.actions[0]),
  };
  return DevicePayloadSchema.parse({
    ...commonFields(input, profile, context),
    verification: { status: "verified", issueCodes: [] },
    chartHash: chartHash(chart),
    guidanceStatus: "derived",
    rows,
    directions: guidance.categories.directions.map(
      ({ polarity, palaceNumber, direction, gate, purpose, strength, evidenceIds }) => ({
        polarity,
        palaceNumber,
        direction,
        gate,
        purpose,
        strength,
        evidenceIds: [...evidenceIds],
      }),
    ),
    ruleIds: distinct(guidance.evidence.map(({ ruleId }) => ruleId)),
    chart: {
      dunType: chart.dunType,
      juNumber: chart.juNumber,
      yuan: chart.yuan,
      xunHead: chart.xunHead.name,
      chiefStar: chart.chiefStar,
      chiefGate: chart.chiefGate,
      voidPalaces: [...chart.voidPalaces],
      horsePalace: chart.horsePalace,
      palaces: [...chart.palaces]
        .sort((left, right) => left.fixed.number - right.fixed.number)
        .map((palace) => ({
          palaceNumber: palace.fixed.number,
          direction: palace.fixed.direction,
          earthStem: palace.earthPlateStem,
          heavenStems: palace.heavenPlate.map(({ stem }) => stem),
          stars: palace.heavenPlate.map(({ star }) => star),
          gate: palace.gate,
          deity: palace.deity,
          isVoid: chart.voidPalaces.includes(palace.fixed.number),
          isHorse: chart.horsePalace === palace.fixed.number,
        })),
    },
  });
}
