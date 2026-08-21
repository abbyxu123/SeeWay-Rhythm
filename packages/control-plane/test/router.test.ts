import type { AgentRequest, IntentCategory } from "@seeway/contracts";
import { describe, expect, it } from "vitest";
import { routeRequest } from "@seeway/control-plane";

function request(
  category: IntentCategory,
  overrides: Partial<AgentRequest> = {},
): AgentRequest {
  return {
    requestId: `req-${category}`,
    intent: `Handle a ${category} request`,
    category,
    questionTime: "2026-08-21T12:00:00.000Z",
    timezone: "Asia/Shanghai",
    profileScopes: [],
    memoryScopes: [],
    ...overrides,
  };
}

describe("primary Agent routing", () => {
  it.each([
    ["rhythm", "qimen-rhythm"],
    ["query", "qimen-query"],
    ["timeline", "ziwei-timeline"],
    ["profile", "bazi-profile"],
    ["meihua", "meihua"],
  ] as const)("routes %s to %s", (category, primaryAgentId) => {
    const decision = routeRequest(request(category));

    expect(decision.primaryAgentId).toBe(primaryAgentId);
    expect(decision.primaryReason).toBeTruthy();
  });

  it("routes stock and market questions to Qimen Finance", () => {
    const decision = routeRequest({
      ...request("finance", { intent: "Review stock 600519" }),
      instrument: "600519",
      investmentHorizon: "swing",
    });

    expect(decision.primaryAgentId).toBe("qimen-finance");
  });

  it("honors an explicit compatible Agent selection", () => {
    const decision = routeRequest(
      request("query", { requestedAgent: "qimen-query" }),
    );

    expect(decision.primaryAgentId).toBe("qimen-query");
    expect(decision.primaryReason).toMatch(/explicit/i);
  });

  it("rejects an explicit Agent that cannot handle the category", () => {
    expect(() =>
      routeRequest(request("finance", { requestedAgent: "bazi-profile" })),
    ).toThrow(/does not support/i);
  });
});

describe("finance routing", () => {
  it("suggests Bazi and Ziwei without silently enabling them", () => {
    const decision = routeRequest({
      ...request("finance"),
      instrument: "AAPL",
      investmentHorizon: "short-term",
    });

    expect(decision.supportingAgentIds).toEqual([]);
    expect(decision.optionalAgentIds).toEqual([
      "bazi-profile",
      "ziwei-timeline",
    ]);
    expect(decision.optionalReasons).toEqual({
      "bazi-profile": expect.any(String),
      "ziwei-timeline": expect.any(String),
    });
  });

  it("enables only explicitly selected optional Agents", () => {
    const decision = routeRequest({
      ...request("finance"),
      instrument: "AAPL",
      investmentHorizon: "short-term",
      enabledSupportingAgentIds: ["bazi-profile"],
    });

    expect(decision.supportingAgentIds).toEqual(["bazi-profile"]);
    expect(decision.optionalAgentIds).toEqual(["ziwei-timeline"]);
    expect(decision.supportingReasons["bazi-profile"]).toBeTruthy();
  });

  it("asks for one missing finance input at a time in stable order", () => {
    expect(routeRequest(request("finance")).requiredInputs).toEqual([
      "instrument",
    ]);
    expect(
      routeRequest({ ...request("finance"), instrument: "AAPL" })
        .requiredInputs,
    ).toEqual(["investmentHorizon"]);
    expect(
      routeRequest({
        ...request("finance"),
        instrument: "AAPL",
        investmentHorizon: "long-term",
      }).requiredInputs,
    ).toEqual([]);
  });
});

describe("availability", () => {
  it("returns the selected unverified Agent as unavailable", () => {
    const decision = routeRequest(request("meihua"));

    expect(decision).toMatchObject({
      primaryAgentId: "meihua",
      status: "unavailable",
      availability: "unverified",
    });
  });

  it("prioritizes one required input before availability", () => {
    expect(routeRequest(request("finance"))).toMatchObject({
      primaryAgentId: "qimen-finance",
      status: "needs_input",
      requiredInputs: ["instrument"],
    });
  });
});
