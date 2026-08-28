import { z } from "zod";
import { BirthProfileSchema } from "./profile";

export const DEVICE_PAYLOAD_VERSION = "seeway-device-payload/v1" as const;
export const DEVICE_PROVISIONING_VERSION = "device-provisioning/v1" as const;

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
const PALACE_DIRECTIONS = Object.freeze([
  "北",
  "西南",
  "东",
  "东南",
  "中",
  "西北",
  "西",
  "东北",
  "南",
] as const);
const QIMEN_STEMS = Object.freeze([
  "乙",
  "丙",
  "丁",
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
] as const);
const NINE_STARS = Object.freeze([
  "天蓬",
  "天芮",
  "天冲",
  "天辅",
  "天禽",
  "天心",
  "天柱",
  "天任",
  "天英",
] as const);
const EIGHT_GATES = Object.freeze([
  "休门",
  "生门",
  "伤门",
  "杜门",
  "景门",
  "死门",
  "惊门",
  "开门",
] as const);
const EIGHT_DEITIES = Object.freeze([
  "值符",
  "腾蛇",
  "太阴",
  "六合",
  "白虎",
  "玄武",
  "九地",
  "九天",
] as const);
const XUN_HEADS = Object.freeze([
  "甲子",
  "甲戌",
  "甲申",
  "甲午",
  "甲辰",
  "甲寅",
] as const);

const NonEmptyTextSchema = z.string().trim().min(1).max(200);
const IdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim(), {
    message: "Identifier must not contain surrounding whitespace.",
  });
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const ProfileRefSchema = z
  .object({
    profileId: IdentifierSchema,
    profileVersion: z.number().int().positive(),
  })
  .strict()
  .readonly();

const TargetShichenSchema = z
  .object({
    selection: z.enum(["current", "next"]),
    index: z.number().int().min(0).max(11),
    branch: z.enum(EARTHLY_BRANCHES),
    label: NonEmptyTextSchema,
    startLocal: NonEmptyTextSchema,
    endLocal: NonEmptyTextSchema,
    rangeText: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
  })
  .strict()
  .superRefine((value, context) => {
    if (EARTHLY_BRANCHES[value.index] !== value.branch) {
      context.addIssue({
        code: "custom",
        path: ["branch"],
        message: "Shichen branch must match its index.",
      });
    }
    if (value.label !== `${value.branch}时`) {
      context.addIssue({
        code: "custom",
        path: ["label"],
        message: "Shichen label must match its branch.",
      });
    }
  })
  .readonly();

const CalendarHeaderSchema = z
  .object({
    clockText: z.string().regex(/^\d{2}:\d{2}$/),
    weekdayText: z.enum([
      "星期一",
      "星期二",
      "星期三",
      "星期四",
      "星期五",
      "星期六",
      "星期日",
    ]),
    solarDateText: NonEmptyTextSchema,
    lunarDateText: NonEmptyTextSchema,
    solarTermText: NonEmptyTextSchema,
    pillarsText: NonEmptyTextSchema,
  })
  .strict()
  .readonly();

const DeviceVersionsSchema = z
  .object({
    profile: z.literal("birth-profile/v1"),
    timeContext: z.literal("time-cn-zhang-v1"),
    qimenChart: z.literal("qimen-chart/v1"),
    qimenAlgorithm: z.literal("qimen-zhuanpan-chaibu-v1"),
    qimenVerifier: z.literal("qimen-verifier/v1"),
    qimenGuidance: z.literal("qimen-guidance/v1"),
    qimenRuleSet: z.literal("qimen-gate-baseline/v1"),
  })
  .strict()
  .readonly();

const VerificationIssueCodeSchema = z.enum([
  "invalid_time_context",
  "invalid_chart_structure",
  "source_mismatch",
  "bureau_mismatch",
  "hour_facts_mismatch",
  "chief_mismatch",
  "earth_plate_mismatch",
  "heaven_plate_mismatch",
  "gate_mismatch",
  "deity_mismatch",
  "calculator_not_authenticated",
  "guidance_insufficient",
]);

const DeviceVerificationSchema = z
  .object({
    status: z.enum(["verified", "blocked"]),
    issueCodes: z
      .array(VerificationIssueCodeSchema)
      .max(16)
      .refine(distinct, "Verification issue codes must be distinct.")
      .readonly(),
  })
  .strict()
  .readonly();

const DeviceResultRowSchema = z
  .object({
    text: NonEmptyTextSchema.nullable(),
    evidenceIds: z
      .array(IdentifierSchema)
      .max(16)
      .refine(distinct, "Evidence IDs must be distinct.")
      .readonly(),
  })
  .strict()
  .superRefine((row, context) => {
    if ((row.text === null) !== (row.evidenceIds.length === 0)) {
      context.addIssue({
        code: "custom",
        path: ["evidenceIds"],
        message: "Display text and evidence IDs must be present together.",
      });
    }
  })
  .readonly();

const DeviceResultRowsSchema = z
  .object({
    favorable: DeviceResultRowSchema,
    caution: DeviceResultRowSchema,
    direction: DeviceResultRowSchema,
    advice: DeviceResultRowSchema,
  })
  .strict()
  .readonly();

const DeviceDirectionSchema = z
  .object({
    polarity: z.enum(["supportive", "avoid"]),
    palaceNumber: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(6),
      z.literal(7),
      z.literal(8),
      z.literal(9),
    ]),
    direction: z.enum(PALACE_DIRECTIONS).refine((value) => value !== "中"),
    gate: z.enum(EIGHT_GATES),
    purpose: NonEmptyTextSchema,
    strength: z.enum(["low", "medium", "high"]),
    evidenceIds: z
      .array(IdentifierSchema)
      .min(1)
      .max(8)
      .refine(distinct, "Evidence IDs must be distinct.")
      .readonly(),
  })
  .strict()
  .readonly();

const CompactPalaceSchema = z
  .object({
    palaceNumber: z.number().int().min(1).max(9),
    direction: z.enum(PALACE_DIRECTIONS),
    earthStem: z.enum(QIMEN_STEMS),
    heavenStems: z.array(z.enum(QIMEN_STEMS)).max(2).readonly(),
    stars: z.array(z.enum(NINE_STARS)).max(2).readonly(),
    gate: z.enum(EIGHT_GATES).nullable(),
    deity: z.enum(EIGHT_DEITIES).nullable(),
    isVoid: z.boolean(),
    isHorse: z.boolean(),
  })
  .strict()
  .superRefine((palace, context) => {
    const expectedDirection = PALACE_DIRECTIONS[palace.palaceNumber - 1];
    if (palace.direction !== expectedDirection) {
      context.addIssue({
        code: "custom",
        path: ["direction"],
        message: "Palace direction must match the canonical Luo Shu mapping.",
      });
    }
    const isCenter = palace.palaceNumber === 5;
    const empty =
      palace.heavenStems.length === 0 &&
      palace.stars.length === 0 &&
      palace.gate === null &&
      palace.deity === null;
    if (isCenter !== empty) {
      context.addIssue({
        code: "custom",
        path: ["palaceNumber"],
        message: "Only the center palace may omit rotating-plate values.",
      });
    }
    if (palace.heavenStems.length !== palace.stars.length) {
      context.addIssue({
        code: "custom",
        path: ["stars"],
        message: "Heaven stems and stars must remain paired.",
      });
    }
  })
  .readonly();

const CompactChartSchema = z
  .object({
    dunType: z.enum(["阳遁", "阴遁"]),
    juNumber: z.number().int().min(1).max(9),
    yuan: z.enum(["上元", "中元", "下元"]),
    xunHead: z.enum(XUN_HEADS),
    chiefStar: z.enum(NINE_STARS),
    chiefGate: z.enum(EIGHT_GATES),
    voidPalaces: z
      .array(z.number().int().min(1).max(9))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length)
      .readonly(),
    horsePalace: z.union([
      z.literal(2),
      z.literal(4),
      z.literal(6),
      z.literal(8),
    ]),
    palaces: z.array(CompactPalaceSchema).length(9).readonly(),
  })
  .strict()
  .superRefine((chart, context) => {
    const palaceNumbers = chart.palaces.map(({ palaceNumber }) => palaceNumber);
    if (
      new Set(palaceNumbers).size !== 9 ||
      !Array.from({ length: 9 }, (_, index) => index + 1).every((number) =>
        palaceNumbers.includes(number),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["palaces"],
        message: "Compact chart must contain Luo Shu palaces 1 through 9 once.",
      });
    }
    for (const palace of chart.palaces) {
      if (palace.isVoid !== chart.voidPalaces.includes(palace.palaceNumber)) {
        context.addIssue({
          code: "custom",
          path: ["palaces"],
          message: "Void flags must match voidPalaces.",
        });
        break;
      }
      if (palace.isHorse !== (palace.palaceNumber === chart.horsePalace)) {
        context.addIssue({
          code: "custom",
          path: ["palaces"],
          message: "Horse flag must match horsePalace.",
        });
        break;
      }
    }
  })
  .readonly();

export const DevicePayloadSchema = z
  .object({
    payloadVersion: z.literal(DEVICE_PAYLOAD_VERSION),
    calculatedAt: z.iso.datetime({ offset: true }),
    profileRef: ProfileRefSchema,
    targetShichen: TargetShichenSchema,
    calendarHeader: CalendarHeaderSchema,
    versions: DeviceVersionsSchema,
    verification: DeviceVerificationSchema,
    chartHash: Sha256Schema.nullable(),
    guidanceStatus: z.enum(["derived", "insufficient"]),
    rows: DeviceResultRowsSchema,
    directions: z.array(DeviceDirectionSchema).max(16).readonly(),
    ruleIds: z
      .array(IdentifierSchema)
      .max(16)
      .refine(distinct, "Rule IDs must be distinct.")
      .readonly(),
    chart: CompactChartSchema.nullable(),
  })
  .strict()
  .superRefine((payload, context) => {
    const rows = Object.values(payload.rows);
    if (payload.verification.status === "blocked") {
      if (
        payload.verification.issueCodes.length === 0 ||
        payload.chartHash !== null ||
        payload.guidanceStatus !== "insufficient" ||
        rows.some((row) => row.text !== null || row.evidenceIds.length !== 0) ||
        payload.directions.length !== 0 ||
        payload.ruleIds.length !== 0 ||
        payload.chart !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["verification"],
          message: "Blocked payloads must not carry conclusions or chart data.",
        });
      }
      return;
    }

    if (
      payload.verification.issueCodes.length !== 0 ||
      payload.chartHash === null ||
      payload.guidanceStatus !== "derived" ||
      payload.rows.direction.text === null ||
      payload.rows.advice.text === null ||
      (payload.rows.favorable.text === null && payload.rows.caution.text === null) ||
      payload.directions.length === 0 ||
      payload.ruleIds.length === 0 ||
      payload.chart === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["verification"],
        message: "Verified payloads require a complete cited chart and guidance.",
      });
    }
  })
  .readonly();

export const DeviceProvisioningSchema = z
  .object({
    provisioningVersion: z.literal(DEVICE_PROVISIONING_VERSION),
    provisionedAt: z.iso.datetime({ offset: true }),
    profile: BirthProfileSchema,
  })
  .strict()
  .readonly();

export type DevicePayload = z.infer<typeof DevicePayloadSchema>;
export type DeviceProvisioning = z.infer<typeof DeviceProvisioningSchema>;
