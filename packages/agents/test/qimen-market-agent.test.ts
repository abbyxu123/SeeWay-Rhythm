import {
  AgentReportSchema,
  MARKET_METHOD_PENDING_VERSION,
  MarketSourceCandidateSchema,
  type AgentRequest,
} from "@seeway/contracts";
import { describe, expect, it } from "vitest";
import {
  QIMEN_MARKET_SOURCE_CANDIDATES,
  createQimenMarketAgent,
  type AuthorizedContext,
} from "@seeway/agents";

const fixedNow = new Date("2026-09-05T01:00:00.000Z");
const context: AuthorizedContext = {
  profileScopes: ["current-location"],
  memoryScopes: [],
};

function request(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: "market-agent-request-001",
    intent: "观察 AAPL 当前市场节奏",
    category: "finance",
    questionTime: "2026-09-05T09:00:00+08:00",
    targetTime: "2026-09-05T09:30:00+08:00",
    timezone: "America/New_York",
    location: "New York",
    instrument: "AAPL",
    investmentHorizon: "market-session",
    profileScopes: ["current-location"],
    memoryScopes: [],
    requestedAgent: "qimen-finance",
    ...overrides,
  };
}

describe("Qimen market Agent boundary", () => {
  it("registers stock and lottery books only as immutable candidate sources", () => {
    expect(QIMEN_MARKET_SOURCE_CANDIDATES).toHaveLength(4);
    expect(
      QIMEN_MARKET_SOURCE_CANDIDATES.every(
        (source) => MarketSourceCandidateSchema.safeParse(source).success,
      ),
    ).toBe(true);
    expect(
      QIMEN_MARKET_SOURCE_CANDIDATES.map((source) => ({
        sourceId: source.sourceId,
        domain: source.domain,
        reviewStatus: source.reviewStatus,
        ruleIds: source.ruleIds,
      })),
    ).toEqual([
      {
        sourceId: "market-source-yuejia-stock",
        domain: "stock",
        reviewStatus: "candidate",
        ruleIds: [],
      },
      {
        sourceId: "market-source-zhanghaibin-stock",
        domain: "stock",
        reviewStatus: "candidate",
        ruleIds: [],
      },
      {
        sourceId: "market-source-rijia-stock",
        domain: "stock",
        reviewStatus: "candidate",
        ruleIds: [],
      },
      {
        sourceId: "market-source-tianji-lottery",
        domain: "lottery",
        reviewStatus: "candidate",
        ruleIds: [],
      },
    ]);
    expect(Object.isFrozen(QIMEN_MARKET_SOURCE_CANDIDATES)).toBe(true);
    for (const source of QIMEN_MARKET_SOURCE_CANDIDATES) {
      expect(Object.isFrozen(source)).toBe(true);
      expect(Object.isFrozen(source.ruleIds)).toBe(true);
    }
  });

  it("keeps lottery sources out of the stock Agent candidate set", () => {
    const agent = createQimenMarketAgent({ clock: () => fixedNow });

    expect(agent.candidateSourceIds).toEqual([
      "market-source-yuejia-stock",
      "market-source-zhanghaibin-stock",
      "market-source-rijia-stock",
    ]);
    expect(agent.candidateSourceIds).not.toContain(
      "market-source-tianji-lottery",
    );
    expect(Object.isFrozen(agent.candidateSourceIds)).toBe(true);
  });

  it("asks for canonical finance inputs before evaluating availability", async () => {
    const agent = createQimenMarketAgent({ clock: () => fixedNow });

    const missingInstrument = await agent.execute(
      request({ instrument: undefined, investmentHorizon: undefined }),
      context,
    );
    expect(missingInstrument).toMatchObject({
      agentId: "qimen-finance",
      status: "needs_input",
      requiredInputs: ["instrument"],
      evidence: [],
    });

    const missingHorizon = await agent.execute(
      request({ investmentHorizon: undefined }),
      context,
    );
    expect(missingHorizon).toMatchObject({
      status: "needs_input",
      requiredInputs: ["investmentHorizon"],
    });
  });

  it("returns unavailable without conclusions or source-title evidence", async () => {
    const agent = createQimenMarketAgent({ clock: () => fixedNow });
    const report = await agent.execute(request(), context);

    expect(AgentReportSchema.safeParse(report).success).toBe(true);
    expect(report).toMatchObject({
      agentId: "qimen-finance",
      status: "unsupported",
      evidence: [],
      conflicts: [],
      requiredInputs: [],
      ruleVersion: MARKET_METHOD_PENDING_VERSION,
      generatedAt: "2026-09-05T01:00:00.000Z",
      reasonCode: "MARKET_RULESET_UNVERIFIED",
    });
    if (report.status !== "unsupported") {
      throw new Error("Expected an unavailable market report.");
    }
    expect("conclusion" in report).toBe(false);
    expect(JSON.stringify(report)).not.toContain("月家奇门股市用法经验");
    expect(report.prerequisites).toEqual([
      "stable stock-market rule IDs and source locators",
      "reviewed executable conditions",
      "backtest report and golden fixtures",
    ]);
  });

  it("does not let optional birth data change the unavailable market result", async () => {
    const agent = createQimenMarketAgent({ clock: () => fixedNow });
    const withoutBirth = await agent.execute(request(), context);
    const withBirth = await agent.execute(
      request({ profileScopes: ["current-location", "birth-data"] }),
      {
        profileScopes: ["current-location", "birth-data"],
        memoryScopes: [],
      },
    );

    expect(withBirth).toEqual(withoutBirth);
  });

  it("rejects malformed, non-finance and mismatched Agent requests", async () => {
    const agent = createQimenMarketAgent({ clock: () => fixedNow });

    await expect(agent.execute({ category: "finance" }, context)).rejects.toThrow();
    await expect(
      agent.execute(request({ category: "rhythm" }), context),
    ).rejects.toThrow(/does not support/i);
    await expect(
      agent.execute(request({ requestedAgent: "qimen-query" }), context),
    ).rejects.toThrow(/requested agent/i);
  });
});
