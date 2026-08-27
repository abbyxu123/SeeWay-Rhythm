import {
  TimeContextSchema,
  sexagenaryName,
  type TimeContext,
} from "@seeway/time-core";
import { z } from "zod";
import {
  EIGHT_DEITIES,
  LUO_SHU_PALACES,
  QIMEN_ALGORITHM_VERSION,
  QIMEN_CHART_VERSION,
  QIMEN_STEMS,
  TIME_CONTEXT_CONVENTION_VERSION,
  XUN_HEADS,
  type EightDeity,
  type EightGate,
  type NineStar,
  type QimenStem,
} from "./constants";
import {
  QIMEN_BUREAU_TABLE,
  type QimenDunType,
  type QimenYuan,
} from "./bureau";
import { EARTH_PLATE_SEQUENCE } from "./earth-plate";
import { QimenChartSchema, type QimenChart } from "./schema";
import { isAuthenticCalculatedQimenChart } from "./calculator";

export const QIMEN_VERIFIER_VERSION = "qimen-verifier/v1" as const;

const OUTER_PALACE_ORDER = Object.freeze([1, 8, 3, 4, 9, 2, 7, 6] as const);
const PALACE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9] as const);
const VERIFICATION_ISSUE_CODES = Object.freeze([
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
] as const);

const TRUSTED_SOURCE_REFERENCES = Object.freeze([
  Object.freeze({
    sourceId: "zhang-advanced-course-notes",
    title: "河北周易研究会奇门遁甲高级班笔记",
    locator: "PDF第2页，例一",
    fingerprint:
      "sha256:4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47",
  }),
  Object.freeze({
    sourceId: "zhang-advanced-course-notes",
    title: "河北周易研究会奇门遁甲高级班笔记",
    locator: "PDF第4至5页，例三",
    fingerprint:
      "sha256:4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47",
  }),
  Object.freeze({
    sourceId: "zhang-advanced-course-notes",
    title: "河北周易研究会奇门遁甲高级班笔记",
    locator: "PDF第5页，例四",
    fingerprint:
      "sha256:4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47",
  }),
] as const);

const GOLDEN_SOURCE_INDEX_BY_CONTEXT: Readonly<Record<string, number>> =
  Object.freeze({
    "Asia/Shanghai|1997-03-19T21:15:00": 0,
    "Asia/Shanghai|2001-06-11T13:20:00": 1,
    "Asia/Shanghai|2002-08-16T12:00:00": 2,
  });

type OuterPalaceNumber = (typeof OUTER_PALACE_ORDER)[number];
type PalaceNumber = (typeof PALACE_NUMBERS)[number];

export const QimenVerificationIssueSchema = z
  .object({
    code: z.enum(VERIFICATION_ISSUE_CODES),
    path: z.string().min(1),
    message: z.string().min(1),
  })
  .strict()
  .readonly();

export const QimenVerificationResultSchema = z
  .object({
    verifierVersion: z.literal(QIMEN_VERIFIER_VERSION),
    contextKey: z.string().min(1).nullable(),
    calculatorAuthenticated: z.boolean(),
    status: z.enum(["verified", "blocked"]),
    issues: z.array(QimenVerificationIssueSchema).readonly(),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      (result.status === "verified" && result.issues.length !== 0) ||
      (result.status === "blocked" && result.issues.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Verified results must be issue-free and blocked results need issues.",
      });
    }
  })
  .readonly();

export type QimenVerificationIssue = z.infer<
  typeof QimenVerificationIssueSchema
>;
export type QimenVerificationResult = z.infer<
  typeof QimenVerificationResultSchema
>;

interface ExpectedHeavenEntry {
  readonly stem: QimenStem;
  readonly star: NineStar;
}

interface ExpectedPalace {
  readonly earthPlateStem: QimenStem;
  readonly heavenPlate: readonly ExpectedHeavenEntry[];
  readonly gate: EightGate | null;
  readonly deity: EightDeity | null;
}

interface ExpectedChartFacts {
  readonly dunType: QimenDunType;
  readonly juNumber: number;
  readonly yuan: QimenChart["yuan"];
  readonly xunHead: QimenChart["xunHead"];
  readonly chiefStar: NineStar;
  readonly chiefGate: EightGate;
  readonly voidPalaces: readonly number[];
  readonly horsePalace: QimenChart["horsePalace"];
  readonly palaces: ReadonlyMap<PalaceNumber, ExpectedPalace>;
}

const SEXAGENARY_CYCLE = Object.freeze(
  Array.from({ length: 60 }, (_, index) => sexagenaryName(index)),
);

const SYMBOL_HEAD_YUAN: Readonly<Record<string, QimenYuan>> = Object.freeze({
  甲子: "上元",
  己卯: "上元",
  甲午: "上元",
  己酉: "上元",
  甲寅: "中元",
  己巳: "中元",
  甲申: "中元",
  己亥: "中元",
  甲辰: "下元",
  己未: "下元",
  甲戌: "下元",
  己丑: "下元",
});

const AUTHENTIC_RESULTS = new WeakSet<object>();

const HORSE_PALACE_BY_BRANCH = Object.freeze({
  申: 8,
  子: 8,
  辰: 8,
  寅: 2,
  午: 2,
  戌: 2,
  巳: 6,
  酉: 6,
  丑: 6,
  亥: 4,
  卯: 4,
  未: 4,
} as const);

function issue(
  code: QimenVerificationIssue["code"],
  path: string,
  message: string,
): QimenVerificationIssue {
  return QimenVerificationIssueSchema.parse({ code, path, message });
}

function result(
  issues: readonly QimenVerificationIssue[],
  contextKey: string | null,
  calculatorAuthenticated: boolean,
): QimenVerificationResult {
  const parsed = QimenVerificationResultSchema.parse({
    verifierVersion: QIMEN_VERIFIER_VERSION,
    contextKey,
    calculatorAuthenticated,
    status: issues.length === 0 ? "verified" : "blocked",
    issues,
  });
  AUTHENTIC_RESULTS.add(parsed);
  return parsed;
}

function independentYuanForDayPillar(dayPillar: string): QimenYuan {
  const cycleIndex = SEXAGENARY_CYCLE.indexOf(dayPillar);
  if (cycleIndex < 0) {
    throw new RangeError("Day pillar is outside the sexagenary cycle.");
  }
  const symbolHead = SEXAGENARY_CYCLE[Math.floor(cycleIndex / 5) * 5]!;
  const yuan = SYMBOL_HEAD_YUAN[symbolHead];
  if (!yuan) {
    throw new RangeError("Day pillar cannot produce a Qimen Yuan.");
  }
  return yuan;
}

function isTrustedSourceReference(
  candidate: QimenChart["sourceReferences"][number],
): boolean {
  return TRUSTED_SOURCE_REFERENCES.some(
    (trusted) =>
      candidate.sourceId === trusted.sourceId &&
      candidate.title === trusted.title &&
      candidate.locator === trusted.locator &&
      candidate.fingerprint === trusted.fingerprint,
  );
}

function sourceReferencesMatchContext(
  contextKey: string,
  candidates: QimenChart["sourceReferences"],
): boolean {
  const goldenSourceIndex = GOLDEN_SOURCE_INDEX_BY_CONTEXT[contextKey];
  if (goldenSourceIndex !== undefined) {
    const expected = TRUSTED_SOURCE_REFERENCES[goldenSourceIndex];
    return (
      candidates.length === 1 &&
      expected !== undefined &&
      candidates[0] !== undefined &&
      candidates[0].sourceId === expected.sourceId &&
      candidates[0].title === expected.title &&
      candidates[0].locator === expected.locator &&
      candidates[0].fingerprint === expected.fingerprint
    );
  }
  return candidates.every(isTrustedSourceReference);
}

function wrapPalace(value: number): PalaceNumber {
  return PALACE_NUMBERS[((value - 1) % 9 + 9) % 9]!;
}

function lodgeCenter(value: PalaceNumber): OuterPalaceNumber {
  return (value === 5 ? 2 : value) as OuterPalaceNumber;
}

function outerIndex(palace: OuterPalaceNumber): number {
  return OUTER_PALACE_ORDER.indexOf(palace);
}

function wrapOuterIndex(value: number): number {
  return ((value % OUTER_PALACE_ORDER.length) + OUTER_PALACE_ORDER.length) %
    OUTER_PALACE_ORDER.length;
}

function rotateOuter<T>(
  source: ReadonlyMap<OuterPalaceNumber, T>,
  sourceAnchor: OuterPalaceNumber,
  targetAnchor: OuterPalaceNumber,
): ReadonlyMap<OuterPalaceNumber, T> {
  const offset = outerIndex(targetAnchor) - outerIndex(sourceAnchor);
  const output = new Map<OuterPalaceNumber, T>();

  OUTER_PALACE_ORDER.forEach((sourcePalace, index) => {
    const targetPalace = OUTER_PALACE_ORDER[wrapOuterIndex(index + offset)]!;
    output.set(targetPalace, source.get(sourcePalace)!);
  });
  return output;
}

function deriveExpectedFacts(timeContext: TimeContext): ExpectedChartFacts {
  const solarTerm = timeContext.solarTerms.current.name;
  const tableEntry = QIMEN_BUREAU_TABLE[
    solarTerm as keyof typeof QIMEN_BUREAU_TABLE
  ];
  if (!tableEntry) {
    throw new RangeError(`Unsupported solar term: ${solarTerm}.`);
  }
  const yuan = independentYuanForDayPillar(timeContext.pillars.day);
  const dunType = tableEntry.dunType;
  const juNumber = tableEntry[yuan];
  const earthByPalace = new Map<PalaceNumber, QimenStem>();
  const earthDirection = dunType === "阳遁" ? 1 : -1;

  EARTH_PLATE_SEQUENCE.forEach((stem, index) => {
    earthByPalace.set(
      wrapPalace(juNumber + earthDirection * index),
      stem,
    );
  });

  const hourPillar = timeContext.pillars.hour;
  const hourIndex = SEXAGENARY_CYCLE.indexOf(hourPillar);
  if (hourIndex < 0) {
    throw new RangeError("Hour pillar is outside the sexagenary cycle.");
  }
  const xunIndex = Math.floor(hourIndex / 10) * 10;
  const xunHead = XUN_HEADS[Math.floor(hourIndex / 10)]!;
  const xunInstrumentPalace = PALACE_NUMBERS.find(
    (palace) => earthByPalace.get(palace) === xunHead.instrument,
  )!;
  const rotationSourcePalace = lodgeCenter(xunInstrumentPalace);
  const sourceFixed = LUO_SHU_PALACES[rotationSourcePalace - 1];
  if (!sourceFixed?.homeGate) {
    throw new RangeError("Rotation source has no home gate.");
  }

  const hourStem = Array.from(hourPillar)[0];
  const targetStem = (hourStem === "甲" ? xunHead.instrument : hourStem) as QimenStem;
  if (!(QIMEN_STEMS as readonly string[]).includes(targetStem)) {
    throw new RangeError("Hour stem cannot be placed on the Qimen earth plate.");
  }
  const rawStarTarget = PALACE_NUMBERS.find(
    (palace) => earthByPalace.get(palace) === targetStem,
  )!;
  const starTargetPalace = lodgeCenter(rawStarTarget);
  const gateDirection = dunType === "阳遁" ? 1 : -1;
  const gateTargetPalace = lodgeCenter(
    wrapPalace(
      xunInstrumentPalace + gateDirection * (hourIndex - xunIndex),
    ),
  );

  const heavenSource = new Map<OuterPalaceNumber, readonly ExpectedHeavenEntry[]>();
  const gateSource = new Map<OuterPalaceNumber, EightGate>();
  for (const palace of OUTER_PALACE_ORDER) {
    const fixed = LUO_SHU_PALACES[palace - 1]!;
    if (!fixed.homeGate) {
      throw new RangeError(`Outer palace ${palace} has no home gate.`);
    }
    gateSource.set(palace, fixed.homeGate);
    heavenSource.set(
      palace,
      palace === 2
        ? [
            { stem: earthByPalace.get(5)!, star: "天禽" },
            { stem: earthByPalace.get(2)!, star: "天芮" },
          ]
        : [{ stem: earthByPalace.get(palace)!, star: fixed.homeStar }],
    );
  }

  const heavenByPalace = rotateOuter(
    heavenSource,
    rotationSourcePalace,
    starTargetPalace,
  );
  const gateByPalace = rotateOuter(
    gateSource,
    rotationSourcePalace,
    gateTargetPalace,
  );
  const deityByPalace = new Map<OuterPalaceNumber, EightDeity>();
  const deityDirection = dunType === "阳遁" ? 1 : -1;
  const deityStart = outerIndex(starTargetPalace);
  EIGHT_DEITIES.forEach((deity, index) => {
    deityByPalace.set(
      OUTER_PALACE_ORDER[
        wrapOuterIndex(deityStart + deityDirection * index)
      ]!,
      deity,
    );
  });

  const palaces = new Map<PalaceNumber, ExpectedPalace>();
  for (const palace of PALACE_NUMBERS) {
    const outerPalace = palace === 5 ? null : lodgeCenter(palace);
    palaces.set(palace, {
      earthPlateStem: earthByPalace.get(palace)!,
      heavenPlate: outerPalace ? heavenByPalace.get(outerPalace)! : [],
      gate: outerPalace ? gateByPalace.get(outerPalace)! : null,
      deity: outerPalace ? deityByPalace.get(outerPalace)! : null,
    });
  }

  const hourBranch = Array.from(hourPillar)[1] as keyof typeof HORSE_PALACE_BY_BRANCH;
  return {
    dunType,
    juNumber,
    yuan,
    xunHead: { name: xunHead.name, instrument: xunHead.instrument },
    chiefStar: xunInstrumentPalace === 5 ? "天禽" : sourceFixed.homeStar,
    chiefGate: sourceFixed.homeGate,
    voidPalaces: xunHead.voidPalaces,
    horsePalace: HORSE_PALACE_BY_BRANCH[hourBranch],
    palaces,
  };
}

function sameValues(
  actual: readonly unknown[],
  expected: readonly unknown[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sameHeavenPlate(
  actual: QimenChart["palaces"][number]["heavenPlate"],
  expected: readonly ExpectedHeavenEntry[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (entry, index) =>
        entry.stem === expected[index]?.stem &&
        entry.star === expected[index]?.star,
    )
  );
}

export function verifyQimenChart(
  timeContext: TimeContext,
  candidate: unknown,
): QimenVerificationResult {
  const calculatorAuthenticated = isAuthenticCalculatedQimenChart(candidate);
  const parsedContext = TimeContextSchema.safeParse(timeContext);
  if (!parsedContext.success) {
    return result(
      [
        issue(
          "invalid_time_context",
          "timeContext",
          "Time context failed canonical validation.",
        ),
      ],
      null,
      calculatorAuthenticated,
    );
  }

  const contextKey = `${parsedContext.data.civil.timeZone}|${parsedContext.data.civil.localDateTime}`;

  const parsedChart = QimenChartSchema.safeParse(candidate);
  if (!parsedChart.success) {
    return result(
      [
        issue(
          "invalid_chart_structure",
          "chart",
          "Chart failed the strict structural contract.",
        ),
      ],
      contextKey,
      calculatorAuthenticated,
    );
  }

  const context = parsedContext.data as TimeContext;
  const chart = parsedChart.data;
  let expected: ExpectedChartFacts;
  try {
    expected = deriveExpectedFacts(context);
  } catch {
    return result(
      [
        issue(
          "invalid_time_context",
          "timeContext",
          "Time context could not produce independent Qimen facts.",
        ),
      ],
      contextKey,
      calculatorAuthenticated,
    );
  }

  const issues: QimenVerificationIssue[] = [];
  if (!sourceReferencesMatchContext(contextKey, chart.sourceReferences)) {
    issues.push(
      issue(
        "source_mismatch",
        "chart.sourceReferences",
        "Chart sources do not match the locked source registry.",
      ),
    );
  }
  if (
    chart.chartVersion !== QIMEN_CHART_VERSION ||
    chart.algorithmVersion !== QIMEN_ALGORITHM_VERSION ||
    chart.timeContextVersion !== TIME_CONTEXT_CONVENTION_VERSION
  ) {
    issues.push(
      issue("invalid_chart_structure", "chart.version", "Chart versions do not match."),
    );
  }
  if (
    chart.dunType !== expected.dunType ||
    chart.juNumber !== expected.juNumber ||
    chart.yuan !== expected.yuan
  ) {
    issues.push(
      issue(
        "bureau_mismatch",
        "chart.bureau",
        "Dun type, Ju number or Yuan differs from independent derivation.",
      ),
    );
  }
  if (
    chart.xunHead.name !== expected.xunHead.name ||
    chart.xunHead.instrument !== expected.xunHead.instrument ||
    !sameValues(chart.voidPalaces, expected.voidPalaces) ||
    chart.horsePalace !== expected.horsePalace
  ) {
    issues.push(
      issue(
        "hour_facts_mismatch",
        "chart.hourFacts",
        "Xun head, void palaces or horse palace differs from independent derivation.",
      ),
    );
  }
  if (
    chart.chiefStar !== expected.chiefStar ||
    chart.chiefGate !== expected.chiefGate
  ) {
    issues.push(
      issue(
        "chief_mismatch",
        "chart.chief",
        "Chief star or chief gate differs from independent derivation.",
      ),
    );
  }

  const actualByPalace = new Map(
    chart.palaces.map((palace) => [palace.fixed.number, palace]),
  );
  for (const palaceNumber of PALACE_NUMBERS) {
    const actual = actualByPalace.get(palaceNumber)!;
    const palaceExpected = expected.palaces.get(palaceNumber)!;
    if (actual.earthPlateStem !== palaceExpected.earthPlateStem) {
      issues.push(
        issue(
          "earth_plate_mismatch",
          `chart.palaces.${palaceNumber}.earthPlateStem`,
          `Earth-plate stem differs in palace ${palaceNumber}.`,
        ),
      );
    }
    if (!sameHeavenPlate(actual.heavenPlate, palaceExpected.heavenPlate)) {
      issues.push(
        issue(
          "heaven_plate_mismatch",
          `chart.palaces.${palaceNumber}.heavenPlate`,
          `Heaven plate differs in palace ${palaceNumber}.`,
        ),
      );
    }
    if (actual.gate !== palaceExpected.gate) {
      issues.push(
        issue(
          "gate_mismatch",
          `chart.palaces.${palaceNumber}.gate`,
          `Gate differs in palace ${palaceNumber}.`,
        ),
      );
    }
    if (actual.deity !== palaceExpected.deity) {
      issues.push(
        issue(
          "deity_mismatch",
          `chart.palaces.${palaceNumber}.deity`,
          `Deity differs in palace ${palaceNumber}.`,
        ),
      );
    }
  }

  return result(issues, contextKey, calculatorAuthenticated);
}

export function isAuthenticQimenVerificationResult(
  candidate: unknown,
): candidate is QimenVerificationResult {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    AUTHENTIC_RESULTS.has(candidate) &&
    QimenVerificationResultSchema.safeParse(candidate).success
  );
}
