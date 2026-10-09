import {
  MARKET_METHOD_PENDING_VERSION,
  MARKET_RESULT_VERSION,
  MarketRequestSchema,
  MarketResultSchema,
  MarketSourceCandidateSchema,
  type MarketResult,
  type MarketSourceCandidate,
} from "@seeway/contracts";
import {
  QIMEN_VERIFIER_VERSION,
  QimenSourceReferenceSchema,
  calculateQimenChart,
  verifyQimenChart,
  type QimenSourceReference,
} from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { hashQimenChart } from "./device-payload";

const CALCULATION_TIME_ZONE = "Asia/Shanghai" as const;

export interface QimenMarketServiceOptions {
  readonly sourceReference: QimenSourceReference;
  readonly sourceCandidates: readonly MarketSourceCandidate[];
  readonly clock: () => Date;
}

export interface QimenMarketService {
  readonly evaluate: (request: unknown) => MarketResult;
}

function localDateTimeAt(instant: string, timeZone: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Market target time is not a valid instant.");
  }
  const byType = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const fields = [
    byType.get("year"),
    byType.get("month"),
    byType.get("day"),
    byType.get("hour"),
    byType.get("minute"),
    byType.get("second"),
  ];
  if (fields.some((value) => value === undefined)) {
    throw new RangeError("Market target time could not be localized.");
  }
  const [year, month, day, hour, minute, second] = fields;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export function createQimenMarketService(
  options: QimenMarketServiceOptions,
): Readonly<QimenMarketService> {
  const sourceReference = QimenSourceReferenceSchema.parse(
    options.sourceReference,
  );
  const sourceCandidates = options.sourceCandidates.map((candidate) =>
    MarketSourceCandidateSchema.parse(candidate),
  );
  const stockCandidateSourceIds = Object.freeze(
    sourceCandidates
      .filter(
        (candidate) =>
          candidate.domain === "stock" &&
          candidate.reviewStatus === "candidate",
      )
      .map((candidate) => candidate.sourceId),
  );

  function evaluate(rawRequest: unknown): MarketResult {
    const request = MarketRequestSchema.parse(rawRequest);
    const timeContext = buildTimeContext(
      resolveCivilTime({
        localDateTime: localDateTimeAt(
          request.targetTime,
          CALCULATION_TIME_ZONE,
        ),
        timeZone: CALCULATION_TIME_ZONE,
        precision: "second",
      }),
    );
    const chart = calculateQimenChart(timeContext, sourceReference);
    const verification = verifyQimenChart(timeContext, chart);
    if (
      verification.status !== "verified" ||
      !verification.calculatorAuthenticated
    ) {
      throw new Error("Market chart failed independent verification.");
    }

    const generatedAt = options.clock().toISOString();
    return deepFreeze(
      MarketResultSchema.parse({
        contractVersion: MARKET_RESULT_VERSION,
        resultId: `market-result-${request.requestId}`.slice(0, 160),
        requestId: request.requestId,
        status: "unavailable",
        methodVersion: MARKET_METHOD_PENDING_VERSION,
        instrument: request.instrument,
        targetTime: request.targetTime,
        chartContext: {
          chartHash: hashQimenChart(chart),
          calculationTimeZone: CALCULATION_TIME_ZONE,
          verification: {
            status: "verified",
            verifierVersion: QIMEN_VERIFIER_VERSION,
            verifiedAt: generatedAt,
          },
          validFrom: timeContext.shichen.startInstant,
          validUntil: timeContext.shichen.endInstant,
        },
        generatedAt,
        reasonCode: request.personalOverlay
          ? "PERSONAL_OVERLAY_MISMATCH"
          : "MARKET_RULESET_UNVERIFIED",
        candidateSourceIds: stockCandidateSourceIds,
        prerequisites: request.personalOverlay
          ? [
              "verified personal overlay method",
              "separate personal chart and overlay hashes",
            ]
          : [
              "stable stock-market rule IDs and source locators",
              "reviewed executable conditions",
              "backtest report and golden fixtures",
            ],
      }),
    );
  }

  return Object.freeze({ evaluate });
}
