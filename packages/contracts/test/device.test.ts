import {
  BIRTH_PROFILE_CONTRACT_VERSION,
  DEVICE_PAYLOAD_VERSION,
  DEVICE_PROVISIONING_VERSION,
  DevicePayloadSchema,
  DeviceProvisioningSchema,
} from "@seeway/contracts";
import { describe, expect, it } from "vitest";

const directions = [
  "北",
  "西南",
  "东",
  "东南",
  "中",
  "西北",
  "西",
  "东北",
  "南",
] as const;

function compactPalaces() {
  return directions.map((direction, index) => {
    const palaceNumber = index + 1;
    const center = palaceNumber === 5;
    return {
      palaceNumber,
      direction,
      earthStem: ["丁", "丙", "乙", "戊", "己", "庚", "辛", "壬", "癸"][
        index
      ],
      heavenStems: center ? [] : ["庚"],
      stars: center ? [] : ["天心"],
      gate: center ? null : "开门",
      deity: center ? null : "值符",
      isVoid: palaceNumber === 2 || palaceNumber === 9,
      isHorse: palaceNumber === 4,
    };
  });
}

function verifiedPayload() {
  return {
    payloadVersion: DEVICE_PAYLOAD_VERSION,
    calculatedAt: "2026-08-28T11:45:00Z",
    profileRef: { profileId: "profile-self", profileVersion: 1 },
    targetShichen: {
      selection: "current",
      index: 5,
      branch: "巳",
      label: "巳时",
      startLocal: "2026-08-28T09:00:00+08:00[Asia/Shanghai]",
      endLocal: "2026-08-28T11:00:00+08:00[Asia/Shanghai]",
      rangeText: "09:00-10:59",
    },
    calendarHeader: {
      clockText: "19:45",
      weekdayText: "星期五",
      solarDateText: "阳历 2026.08.28",
      lunarDateText: "阴历 七月十六",
      solarTermText: "节气 处暑",
      pillarsText: "丙午年 丙申月 甲戌日 乙亥时",
    },
    versions: {
      profile: "birth-profile/v1",
      timeContext: "time-cn-zhang-v1",
      qimenChart: "qimen-chart/v1",
      qimenAlgorithm: "qimen-zhuanpan-chaibu-v1",
      qimenVerifier: "qimen-verifier/v1",
      qimenGuidance: "qimen-guidance/v1",
      qimenRuleSet: "qimen-gate-baseline/v1",
    },
    verification: { status: "verified", issueCodes: [] },
    chartHash:
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    guidanceStatus: "derived",
    rows: {
      favorable: {
        text: "适合启动、经营与公开推进",
        evidenceIds: ["QG-GATE-OPEN-001:chief"],
      },
      caution: {
        text: "留意争执、磕碰与仓促出行",
        evidenceIds: ["QG-GATE-INJURY-001:chief"],
      },
      direction: {
        text: "利西北；慎西南",
        evidenceIds: [
          "QG-GATE-OPEN-001:palace-6",
          "QG-GATE-INJURY-001:palace-2",
        ],
      },
      advice: {
        text: "重要事项留出复核时间",
        evidenceIds: ["QG-GATE-OPEN-001:chief"],
      },
    },
    directions: [
      {
        polarity: "supportive",
        palaceNumber: 6,
        direction: "西北",
        gate: "开门",
        purpose: "适合启动与公开推进",
        strength: "medium",
        evidenceIds: ["QG-GATE-OPEN-001:palace-6"],
      },
    ],
    ruleIds: ["QG-GATE-OPEN-001", "QG-GATE-INJURY-001"],
    chart: {
      dunType: "阴遁",
      juNumber: 1,
      yuan: "上元",
      xunHead: "甲子",
      chiefStar: "天心",
      chiefGate: "开门",
      voidPalaces: [2, 9],
      horsePalace: 4,
      palaces: compactPalaces(),
    },
  };
}

function blockedPayload() {
  const value = verifiedPayload();
  return {
    ...value,
    verification: {
      status: "blocked",
      issueCodes: ["invalid_chart_structure"],
    },
    chartHash: null,
    guidanceStatus: "insufficient",
    rows: {
      favorable: { text: null, evidenceIds: [] },
      caution: { text: null, evidenceIds: [] },
      direction: { text: null, evidenceIds: [] },
      advice: { text: null, evidenceIds: [] },
    },
    directions: [],
    ruleIds: [],
    chart: null,
  };
}

describe("device payload contract", () => {
  it("accepts a complete verified payload and freezes it", () => {
    const parsed = DevicePayloadSchema.parse(verifiedPayload());

    expect(parsed.verification.status).toBe("verified");
    expect(parsed.rows.advice.text).toBeTruthy();
    expect(parsed.chart?.palaces).toHaveLength(9);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("accepts an empty blocked payload", () => {
    const parsed = DevicePayloadSchema.parse(blockedPayload());

    expect(parsed.guidanceStatus).toBe("insufficient");
    expect(parsed.chart).toBeNull();
    expect(parsed.rows.favorable.text).toBeNull();
  });

  it("rejects guidance, evidence or chart data when verification is blocked", () => {
    for (const mutation of [
      { rows: verifiedPayload().rows },
      { chartHash: verifiedPayload().chartHash },
      { ruleIds: verifiedPayload().ruleIds },
      { directions: verifiedPayload().directions },
      { chart: verifiedPayload().chart },
    ]) {
      expect(
        DevicePayloadSchema.safeParse({ ...blockedPayload(), ...mutation })
          .success,
      ).toBe(false);
    }
  });

  it("rejects incomplete verified payloads and row text without evidence", () => {
    expect(
      DevicePayloadSchema.safeParse({
        ...verifiedPayload(),
        chartHash: null,
      }).success,
    ).toBe(false);
    expect(
      DevicePayloadSchema.safeParse({
        ...verifiedPayload(),
        rows: {
          ...verifiedPayload().rows,
          advice: { text: "没有出处的建议", evidenceIds: [] },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate palaces and unknown fields", () => {
    const value = verifiedPayload();
    const duplicate = compactPalaces();
    duplicate[8] = { ...duplicate[8]!, palaceNumber: 1 };

    expect(
      DevicePayloadSchema.safeParse({
        ...value,
        chart: { ...value.chart, palaces: duplicate },
      }).success,
    ).toBe(false);
    expect(
      DevicePayloadSchema.safeParse({ ...value, marketingLabel: "lucky" })
        .success,
    ).toBe(false);
  });
});

describe("device provisioning contract", () => {
  const provisioning = {
    provisioningVersion: DEVICE_PROVISIONING_VERSION,
    provisionedAt: "2026-08-28T11:45:00Z",
    profile: {
      contractVersion: BIRTH_PROFILE_CONTRACT_VERSION,
      profileId: "profile-self",
      profileVersion: 1,
      originalBirthInput: {
        calendar: "gregorian",
        precision: "minute",
        localDateTime: "1988-04-12T06:45",
        timeZone: "Asia/Shanghai",
        placeText: "浙江省杭州市",
      },
      displayName: "示例甲",
      sex: "female",
    },
  } as const;

  it("accepts only a complete canonical birth profile", () => {
    expect(DeviceProvisioningSchema.parse(provisioning)).toEqual(provisioning);
    expect(
      DeviceProvisioningSchema.safeParse({
        ...provisioning,
        profile: {
          ...provisioning.profile,
          originalBirthInput: {
            ...provisioning.profile.originalBirthInput,
            timeZone: "CST",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects defaults and unsupported provisioning fields", () => {
    const { provisionedAt: _provisionedAt, ...missing } = provisioning;
    expect(DeviceProvisioningSchema.safeParse(missing).success).toBe(false);
    expect(
      DeviceProvisioningSchema.safeParse({
        ...provisioning,
        wifiPassword: "must-not-live-here",
      }).success,
    ).toBe(false);
  });
});
