import {
  TimeContextSchema,
  type TimeContext,
} from "@seeway/time-core";
import {
  LUO_SHU_PALACES,
  QIMEN_ALGORITHM_VERSION,
  QIMEN_CHART_VERSION,
  TIME_CONTEXT_CONVENTION_VERSION,
} from "./constants";
import { determineQimenBureau } from "./bureau";
import { buildEarthPlate } from "./earth-plate";
import { calculateQimenHourFacts } from "./hour-facts";
import {
  QimenChartSchema,
  QimenSourceReferenceSchema,
  type QimenChart,
  type QimenSourceReference,
} from "./schema";
import {
  calculateQimenRotationAnchors,
  rotateDeities,
  rotateGates,
  rotateHeavenPlate,
} from "./rotation";

const AUTHENTIC_CALCULATED_CHARTS = new WeakSet<object>();

export function calculateQimenChart(
  timeContext: TimeContext,
  sourceReference: QimenSourceReference,
): QimenChart {
  const parsedContext = TimeContextSchema.safeParse(timeContext);
  if (!parsedContext.success) {
    throw new TypeError(
      `Invalid time context: ${parsedContext.error.message}`,
    );
  }
  const context = parsedContext.data as TimeContext;

  const parsedSource = QimenSourceReferenceSchema.safeParse(sourceReference);
  if (!parsedSource.success) {
    throw new TypeError(
      `Invalid Qimen source reference: ${parsedSource.error.message}`,
    );
  }

  const bureau = determineQimenBureau(context);
  const earthPlate = buildEarthPlate(bureau);
  const hourFacts = calculateQimenHourFacts(
    context.pillars.hour,
  );
  const anchors = calculateQimenRotationAnchors(
    earthPlate,
    hourFacts,
    bureau.dunType,
  );
  const heavenPlate = rotateHeavenPlate(earthPlate, anchors);
  const gates = rotateGates(anchors);
  const deities = rotateDeities(anchors, bureau.dunType);

  const earthByPalace = new Map(
    earthPlate.map(({ palaceNumber, stem }) => [palaceNumber, stem]),
  );
  const heavenByPalace = new Map(
    heavenPlate.map(({ palaceNumber, heavenPlate: entries }) => [
      palaceNumber,
      entries,
    ]),
  );
  const gateByPalace = new Map(
    gates.map(({ palaceNumber, gate }) => [palaceNumber, gate]),
  );
  const deityByPalace = new Map(
    deities.map(({ palaceNumber, deity }) => [palaceNumber, deity]),
  );

  const chart = QimenChartSchema.parse({
    chartVersion: QIMEN_CHART_VERSION,
    algorithmVersion: QIMEN_ALGORITHM_VERSION,
    timeContextVersion: TIME_CONTEXT_CONVENTION_VERSION,
    sourceReferences: [parsedSource.data],
    dunType: bureau.dunType,
    juNumber: bureau.juNumber,
    yuan: bureau.yuan,
    xunHead: hourFacts.xunHead,
    chiefStar: anchors.chiefStar,
    chiefGate: anchors.chiefGate,
    voidPalaces: hourFacts.voidPalaces,
    horsePalace: hourFacts.horsePalace,
    palaces: LUO_SHU_PALACES.map((fixed) => ({
      fixed,
      earthPlateStem: earthByPalace.get(fixed.number),
      heavenPlate: heavenByPalace.get(fixed.number),
      gate: gateByPalace.get(fixed.number),
      deity: deityByPalace.get(fixed.number),
    })),
  });
  AUTHENTIC_CALCULATED_CHARTS.add(chart);
  return chart;
}

export function isAuthenticCalculatedQimenChart(
  candidate: unknown,
): candidate is QimenChart {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    AUTHENTIC_CALCULATED_CHARTS.has(candidate) &&
    QimenChartSchema.safeParse(candidate).success
  );
}
