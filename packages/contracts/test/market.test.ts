import {
  MARKET_METHOD_PENDING_VERSION,
  MARKET_REQUEST_VERSION,
  MARKET_RESULT_VERSION,
  MarketRequestSchema,
  MarketResultSchema,
  MarketSourceCandidateSchema,
} from "@seeway/contracts";
import { describe, expect, it } from "vitest";

const hash = (character: string) => `sha256:${character.repeat(64)}`;

function instrument() {
  return {
    instrumentId: "cn-equity-600519",
    symbol: "600519",
    displayName: "测试标的",
    assetClass: "equity",
    exchange: "SSE",
    exchangeTimeZone: "Asia/Shanghai",
  } as const;
}

function chartContext() {
  return {
    chartHash: hash("a"),
    verification: {
      status: "verified",
      verifierVersion: "qimen-verifier/v1",
      verifiedAt: "2026-09-04T01:01:00+08:00",
    },
    validFrom: "2026-09-04T01:00:00+08:00",
    validUntil: "2026-09-04T03:00:00+08:00",
  } as const;
}

function request() {
  return {
    contractVersion: MARKET_REQUEST_VERSION,
    requestId: "market-request-1",
    intent: "session-rhythm",
    instrument: instrument(),
    observedAt: "2026-09-04T01:01:00+08:00",
    targetTime: "2026-09-04T01:30:00+08:00",
  } as const;
}

describe("Qimen market contracts", () => {
  it("requires an instrument, exchange timezone and explicit observation time", () => {
    expect(MarketRequestSchema.parse(request())).toEqual(request());

    const { instrument: _instrument, ...missingInstrument } = request();
    expect(MarketRequestSchema.safeParse(missingInstrument).success).toBe(false);
    expect(
      MarketRequestSchema.safeParse({
        ...request(),
        instrument: { ...instrument(), exchangeTimeZone: "Shanghai" },
      }).success,
    ).toBe(false);
  });

  it("allows birth data only through an explicit separately hashed overlay", () => {
    expect(
      MarketRequestSchema.safeParse({
        ...request(),
        profileRef: { profileId: "person-1", profileVersion: 1 },
      }).success,
    ).toBe(false);

    const parsed = MarketRequestSchema.parse({
      ...request(),
      personalOverlay: {
        profileRef: { profileId: "person-1", profileVersion: 1 },
        expectedPersonalChartHash: hash("b"),
      },
    });
    expect(parsed.personalOverlay?.expectedPersonalChartHash).toBe(hash("b"));
  });

  it("represents the current honest state without inventing market signals", () => {
    const unavailable = {
      contractVersion: MARKET_RESULT_VERSION,
      resultId: "market-result-1",
      requestId: "market-request-1",
      status: "unavailable",
      methodVersion: MARKET_METHOD_PENDING_VERSION,
      instrument: instrument(),
      targetTime: "2026-09-04T01:30:00+08:00",
      chartContext: chartContext(),
      generatedAt: "2026-09-04T01:02:00+08:00",
      reasonCode: "MARKET_RULESET_UNVERIFIED",
      candidateSourceIds: ["market-source-monthly-stock-experience"],
      prerequisites: ["executable_rules", "historical_backtest", "golden_cases"],
    } as const;

    expect(MarketResultSchema.parse(unavailable)).toEqual(unavailable);
    expect(
      MarketResultSchema.safeParse({
        ...unavailable,
        marketRhythm: "supportive",
      }).success,
    ).toBe(false);
  });

  it("accepts a verified result only with qualified method evidence", () => {
    const verified = {
      contractVersion: MARKET_RESULT_VERSION,
      resultId: "market-result-2",
      requestId: "market-request-2",
      status: "verified",
      methodVersion: "qimen-market-method/v1",
      instrument: instrument(),
      targetTime: "2026-09-04T01:30:00+08:00",
      chartContext: chartContext(),
      generatedAt: "2026-09-04T01:02:00+08:00",
      marketRhythm: "mixed",
      observationWindow: {
        start: "2026-09-04T01:00:00+08:00",
        end: "2026-09-04T03:00:00+08:00",
      },
      riskSignal: {
        level: "high",
        text: "仅观察，不追价",
        evidenceIds: ["market-rule-1"],
      },
      discipline: {
        text: "设置退出条件并控制仓位",
        evidenceIds: ["market-rule-2"],
      },
      evidenceIds: ["market-rule-1", "market-rule-2"],
      methodEvidence: {
        attestationHash: hash("c"),
        backtestReportHash: hash("d"),
        goldenFixtureHash: hash("e"),
      },
    } as const;

    expect(MarketResultSchema.parse(verified)).toEqual(verified);
    expect(
      MarketResultSchema.safeParse({
        ...verified,
        methodVersion: MARKET_METHOD_PENDING_VERSION,
      }).success,
    ).toBe(false);
    expect(
      MarketResultSchema.safeParse({
        ...verified,
        riskSignal: {
          ...verified.riskSignal,
          evidenceIds: ["unknown-rule"],
        },
      }).success,
    ).toBe(false);
  });

  it("keeps a personal overlay separate from market chart facts", () => {
    const base = MarketResultSchema.parse({
      contractVersion: MARKET_RESULT_VERSION,
      resultId: "market-result-3",
      requestId: "market-request-3",
      status: "unavailable",
      methodVersion: MARKET_METHOD_PENDING_VERSION,
      instrument: instrument(),
      targetTime: "2026-09-04T01:30:00+08:00",
      chartContext: chartContext(),
      generatedAt: "2026-09-04T01:02:00+08:00",
      reasonCode: "MARKET_RULESET_UNVERIFIED",
      candidateSourceIds: [],
      prerequisites: ["historical_backtest"],
      personalOverlay: {
        profileRef: { profileId: "person-1", profileVersion: 1 },
        personalChartHash: hash("b"),
        overlayHash: hash("f"),
        verification: {
          status: "verified",
          verifierVersion: "qimen-verifier/v1",
          verifiedAt: "2026-09-04T01:01:00+08:00",
        },
      },
    });

    expect(base.chartContext.chartHash).toBe(hash("a"));
    expect(base.personalOverlay?.personalChartHash).toBe(hash("b"));
    expect(
      MarketResultSchema.safeParse({
        ...base,
        personalOverlay: {
          ...base.personalOverlay!,
          overlayHash: base.chartContext.chartHash,
        },
      }).success,
    ).toBe(false);
  });

  it("does not qualify a source by title or fingerprint alone", () => {
    const candidate = {
      sourceId: "market-source-monthly-stock-experience",
      title: "月家奇门股市用法经验",
      fingerprint: hash("f"),
      domain: "stock",
      reviewStatus: "candidate",
      ruleIds: [],
    } as const;
    expect(MarketSourceCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      MarketSourceCandidateSchema.safeParse({
        ...candidate,
        reviewStatus: "qualified",
      }).success,
    ).toBe(false);
    expect(
      MarketSourceCandidateSchema.parse({
        ...candidate,
        sourceId: "lottery-source-tianji",
        domain: "lottery",
      }).domain,
    ).toBe("lottery");
  });
});
