import { describe, expect, it } from "vitest";
import { LUO_SHU_PALACES, QimenChartSchema } from "@seeway/qimen-core";

const SOURCE_FINGERPRINT = `sha256:${"a".repeat(64)}`;

function validChart() {
  const earthStems = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"];
  const heavenPlate = [
    [{ stem: "戊", star: "天蓬" }],
    [
      { stem: "己", star: "天芮" },
      { stem: "丁", star: "天禽" },
    ],
    [{ stem: "庚", star: "天冲" }],
    [{ stem: "辛", star: "天辅" }],
    [],
    [{ stem: "壬", star: "天心" }],
    [{ stem: "癸", star: "天柱" }],
    [{ stem: "丙", star: "天任" }],
    [{ stem: "乙", star: "天英" }],
  ];
  const gates = [
    "休门",
    "死门",
    "伤门",
    "杜门",
    null,
    "开门",
    "惊门",
    "生门",
    "景门",
  ];
  const deities = [
    "值符",
    "腾蛇",
    "太阴",
    "六合",
    null,
    "白虎",
    "玄武",
    "九地",
    "九天",
  ];

  return {
    chartVersion: "qimen-chart/v1",
    algorithmVersion: "qimen-zhuanpan-chaibu-v1",
    timeContextVersion: "time-cn-zhang-v1",
    sourceReferences: [
      {
        sourceId: "zhang-course-notes",
        title: "河北周易研究会奇门遁甲高级班笔记",
        locator: "example-1",
        fingerprint: SOURCE_FINGERPRINT,
      },
    ],
    dunType: "阳遁",
    juNumber: 4,
    yuan: "上元",
    xunHead: {
      name: "甲申",
      instrument: "庚",
    },
    chiefStar: "天心",
    chiefGate: "开门",
    voidPalaces: [2, 9],
    horsePalace: 8,
    palaces: LUO_SHU_PALACES.map((fixed, index) => ({
      fixed: { ...fixed } as {
        number: number;
        trigram: string | null;
        direction: string;
        element: string;
        homeStar: string;
        homeGate: string | null;
      },
      earthPlateStem: earthStems[index],
      heavenPlate: heavenPlate[index]!,
      gate: gates[index],
      deity: deities[index],
    })),
  };
}

describe("QimenChartSchema", () => {
  it("accepts a palace-complete structural chart including Tianqin lodging", () => {
    const result = QimenChartSchema.safeParse(validChart());
    expect(result.success).toBe(true);
  });

  it("returns a deeply immutable chart snapshot", () => {
    const chart = QimenChartSchema.parse(validChart());

    expect(Object.isFrozen(chart)).toBe(true);
    expect(Object.isFrozen(chart.sourceReferences)).toBe(true);
    expect(Object.isFrozen(chart.sourceReferences[0])).toBe(true);
    expect(Object.isFrozen(chart.palaces)).toBe(true);
    expect(Object.isFrozen(chart.palaces[0])).toBe(true);
    expect(Object.isFrozen(chart.palaces[0]!.fixed)).toBe(true);
    expect(Object.isFrozen(chart.palaces[0]!.heavenPlate)).toBe(true);
    expect(Object.isFrozen(chart.palaces[0]!.heavenPlate[0])).toBe(true);
  });

  it("rejects missing and duplicate palaces", () => {
    const missing = validChart();
    missing.palaces.pop();
    expect(QimenChartSchema.safeParse(missing).success).toBe(false);

    const duplicate = validChart();
    duplicate.palaces[8]!.fixed = LUO_SHU_PALACES[0];
    expect(QimenChartSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects fixed palace metadata that contradicts the canonical mapping", () => {
    const chart = validChart();
    chart.palaces[0]!.fixed = {
      ...chart.palaces[0]!.fixed,
      direction: "南",
    };

    expect(QimenChartSchema.safeParse(chart).success).toBe(false);
  });

  it("rejects movable facts in the center palace even when global counts remain complete", () => {
    const chart = validChart();
    chart.palaces[4]!.heavenPlate = chart.palaces[0]!.heavenPlate;
    chart.palaces[4]!.gate = chart.palaces[0]!.gate;
    chart.palaces[4]!.deity = chart.palaces[0]!.deity;
    chart.palaces[0]!.heavenPlate = [];
    chart.palaces[0]!.gate = null;
    chart.palaces[0]!.deity = null;

    expect(QimenChartSchema.safeParse(chart).success).toBe(false);
  });

  it("rejects Tianqin when it is not lodged with Tianrui", () => {
    const chart = validChart();
    chart.palaces[1]!.heavenPlate[1]!.star = "天冲";
    chart.palaces[2]!.heavenPlate[0]!.star = "天禽";

    expect(QimenChartSchema.safeParse(chart).success).toBe(false);
  });

  it("requires each movable star, gate, deity, and plate stem exactly once", () => {
    const duplicateStar = validChart();
    duplicateStar.palaces[8]!.heavenPlate = [
      { stem: "乙", star: "天蓬" },
    ];
    expect(QimenChartSchema.safeParse(duplicateStar).success).toBe(false);

    const missingGate = validChart();
    missingGate.palaces[0]!.gate = null;
    expect(QimenChartSchema.safeParse(missingGate).success).toBe(false);

    const duplicateDeity = validChart();
    duplicateDeity.palaces[8]!.deity = "值符";
    expect(QimenChartSchema.safeParse(duplicateDeity).success).toBe(false);

    const duplicateEarthStem = validChart();
    duplicateEarthStem.palaces[8]!.earthPlateStem = "戊";
    expect(QimenChartSchema.safeParse(duplicateEarthStem).success).toBe(false);

    const duplicateHeavenStem = validChart();
    duplicateHeavenStem.palaces[8]!.heavenPlate = [
      { stem: "戊", star: "天英" },
    ];
    expect(QimenChartSchema.safeParse(duplicateHeavenStem).success).toBe(false);
  });

  it("requires version, source, dun, ju, yuan, chief, void, and horse metadata", () => {
    for (const field of [
      "chartVersion",
      "algorithmVersion",
      "timeContextVersion",
      "sourceReferences",
      "dunType",
      "juNumber",
      "yuan",
      "xunHead",
      "chiefStar",
      "chiefGate",
      "voidPalaces",
      "horsePalace",
    ] as const) {
      const chart = validChart() as Record<string, unknown>;
      delete chart[field];
      expect(QimenChartSchema.safeParse(chart).success, field).toBe(false);
    }
  });

  it("rejects unknown method versions", () => {
    const wrongAlgorithm = validChart();
    wrongAlgorithm.algorithmVersion = "qimen-feipan-v1";
    expect(QimenChartSchema.safeParse(wrongAlgorithm).success).toBe(false);

    const wrongTimeContext = validChart();
    wrongTimeContext.timeContextVersion = "time-context/v0";
    expect(QimenChartSchema.safeParse(wrongTimeContext).success).toBe(false);
  });

  it("rejects a mismatched xun head, instrument, or void-palace set", () => {
    const wrongInstrument = validChart();
    wrongInstrument.xunHead.instrument = "戊";
    expect(QimenChartSchema.safeParse(wrongInstrument).success).toBe(false);

    const wrongVoid = validChart();
    wrongVoid.voidPalaces = [6];
    expect(QimenChartSchema.safeParse(wrongVoid).success).toBe(false);
  });

  it("restricts the horse star to the four corner palaces", () => {
    const chart = validChart();
    chart.horsePalace = 5;
    expect(QimenChartSchema.safeParse(chart).success).toBe(false);
  });

  it("rejects unknown fields instead of silently accepting analysis text", () => {
    const chart = {
      ...validChart(),
      favorable: ["开门大吉"],
    };
    expect(QimenChartSchema.safeParse(chart).success).toBe(false);

    const nested = validChart();
    const palaceWithUnknown = {
      ...nested.palaces[0]!,
      advice: "宜出行",
    };
    nested.palaces[0] = palaceWithUnknown;
    expect(QimenChartSchema.safeParse(nested).success).toBe(false);
  });
});
