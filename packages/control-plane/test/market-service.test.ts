import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKET_REQUEST_VERSION,
  MarketResultSchema,
} from "@seeway/contracts";
import {
  createQimenMarketService,
  hashQimenChart,
} from "@seeway/control-plane";
import {
  QimenGoldenFixtureSchema,
  calculateQimenChart,
} from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const fixture = QimenGoldenFixtureSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(
        TEST_DIRECTORY,
        "../../../tests/fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  ),
);
const sourceReference = fixture.cases[0]!.chart.sourceReferences[0]!;
const fixedNow = new Date("2026-09-05T13:31:00.000Z");

const sourceCandidates = [
  {
    sourceId: "market-source-yuejia-stock",
    title: "月家奇门股市用法经验",
    fingerprint:
      "sha256:fe4687bb550bf61ef828b2c3e3ce776fcbfc288906978713f1a2601a2ca18ab8",
    domain: "stock",
    reviewStatus: "candidate",
    ruleIds: [],
  },
  {
    sourceId: "market-source-tianji-lottery",
    title: "《天机推演图》奇门测彩票",
    fingerprint:
      "sha256:7f9fefb0f658a56e5761590f248db0a693b2b83b8654329f3e83b892cbf939a5",
    domain: "lottery",
    reviewStatus: "candidate",
    ruleIds: [],
  },
] as const;

function request(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: MARKET_REQUEST_VERSION,
    requestId: "market-service-request-001",
    intent: "session-rhythm",
    instrument: {
      instrumentId: "us-equity-aapl",
      symbol: "AAPL",
      displayName: "Apple",
      assetClass: "equity",
      exchange: "NASDAQ",
      exchangeTimeZone: "America/New_York",
    },
    observedAt: "2026-09-05T09:31:00-04:00",
    targetTime: "2026-09-05T09:30:00-04:00",
    ...overrides,
  };
}

function createSubject() {
  return createQimenMarketService({
    sourceReference,
    sourceCandidates,
    clock: () => fixedNow,
  });
}

describe("Qimen market service", () => {
  it("builds and verifies the market chart using the explicit China-time V1 convention", () => {
    const result = createSubject().evaluate(request());

    expect(MarketResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      requestId: "market-service-request-001",
      status: "unavailable",
      targetTime: "2026-09-05T09:30:00-04:00",
      chartContext: {
        calculationTimeZone: "Asia/Shanghai",
        verification: {
          status: "verified",
          verifierVersion: "qimen-verifier/v1",
          verifiedAt: "2026-09-05T13:31:00.000Z",
        },
        validFrom: "2026-09-05T13:00:00Z",
        validUntil: "2026-09-05T15:00:00Z",
      },
      generatedAt: "2026-09-05T13:31:00.000Z",
      reasonCode: "MARKET_RULESET_UNVERIFIED",
      candidateSourceIds: ["market-source-yuejia-stock"],
    });
    expect(result.chartContext.chartHash).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect("marketRhythm" in result).toBe(false);
    expect("riskSignal" in result).toBe(false);
  });

  it("produces the canonical hash of the independently reproducible chart", () => {
    const result = createSubject().evaluate(request());
    const context = buildTimeContext(
      resolveCivilTime({
        localDateTime: "2026-09-05T21:30:00",
        timeZone: "Asia/Shanghai",
        precision: "second",
      }),
    );
    const chart = calculateQimenChart(context, sourceReference);

    expect(result.chartContext.chartHash).toBe(hashQimenChart(chart));
  });

  it("keeps an explicit personal overlay from mutating the base market chart", () => {
    const service = createSubject();
    const base = service.evaluate(request());
    const withOverlay = service.evaluate(
      request({
        requestId: "market-service-request-overlay",
        personalOverlay: {
          profileRef: { profileId: "profile-1990-test", profileVersion: 1 },
          expectedPersonalChartHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      }),
    );

    expect(withOverlay.chartContext.chartHash).toBe(
      base.chartContext.chartHash,
    );
    expect(withOverlay).toMatchObject({
      status: "unavailable",
      reasonCode: "PERSONAL_OVERLAY_MISMATCH",
    });
    expect("personalOverlay" in withOverlay).toBe(false);
  });

  it("rejects malformed requests and returns deeply immutable results", () => {
    const service = createSubject();

    expect(() => service.evaluate({ targetTime: "not-a-time" })).toThrow();
    const result = service.evaluate(request());
    expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.chartContext)).toBe(true);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") throw new Error("Expected unavailable market rules");
    expect(Object.isFrozen(result.candidateSourceIds)).toBe(true);
  });
});
