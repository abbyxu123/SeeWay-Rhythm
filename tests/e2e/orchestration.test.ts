import {
  createUnsupportedAgentSet,
  type AuthorizedContext,
  type DomainAgent,
} from "@seeway/agents";
import type {
  AgentReport,
  AgentRequest,
  Tendency,
} from "@seeway/contracts";
import {
  createOrchestrator,
  getAgentDefinition,
  routeRequest,
  type DomainAgentDefinition,
  type RoutingDecision,
} from "@seeway/control-plane";
import { describe, expect, it } from "vitest";

const now = new Date("2026-08-21T12:00:00.000Z");

function baseRequest(category: AgentRequest["category"]) {
  return {
    requestId: `req-${category}`,
    intent: `Handle a ${category} request`,
    category,
    questionTime: "2026-08-21T12:00:00.000Z",
    timezone: "Asia/Shanghai",
    profileScopes: ["current-location"] as const,
    memoryScopes: [] as const,
    disposition: "once" as const,
  };
}

function availableDefinition(agentId: "qimen-finance" | "bazi-profile") {
  const definition = getAgentDefinition(agentId);
  if (!definition || definition.role !== "domain") {
    throw new Error(`Missing ${agentId} definition.`);
  }
  return {
    ...definition,
    availability: "available" as const,
  } satisfies DomainAgentDefinition;
}

function completeFakeAgent(
  definition: DomainAgentDefinition,
  tendency: Tendency,
  seenCategories: string[],
): DomainAgent {
  return {
    definition,
    async execute(
      request: unknown,
      _context: AuthorizedContext,
    ): Promise<AgentReport> {
      const typedRequest = request as AgentRequest;
      seenCategories.push(typedRequest.category);
      return {
        agentId: definition.id,
        agentVersion: "test-0.1.0",
        status: "complete",
        conclusion: {
          favorable: tendency === "favorable" ? ["test favorable"] : [],
          cautions: tendency === "caution" ? ["test caution"] : [],
          action: "Keep both reports separate.",
          tendency,
        },
        evidence: [
          {
            evidenceId: `evidence-${definition.id}`,
            ruleId: `TEST-${definition.id}`,
            ruleVersion: "test-0.1.0",
            sourceId: "test-source",
            factPath: `test.${definition.id}`,
            explanation: "Test-only evidence for orchestration behavior.",
          },
        ],
        conflicts: [],
        requiredInputs: [],
        ruleVersion: "test-0.1.0",
        generatedAt: now.toISOString(),
      };
    },
  };
}

describe("orchestration vertical slice", () => {
  it("routes a current-period request and honestly returns unsupported", async () => {
    const orchestrator = createOrchestrator({
      agents: createUnsupportedAgentSet({ clock: () => now }),
      clock: () => now,
    });
    const result = await orchestrator.execute(baseRequest("rhythm"));

    expect(result.kind).toBe("result");
    if (result.kind !== "result") {
      throw new Error("Expected a presented result.");
    }
    expect(result.status).toBe("unsupported");
    expect(result.presentation.primary).toMatchObject({
      agentId: "qimen-rhythm",
      status: "unsupported",
      reasonCode: "CALCULATOR_NOT_VERIFIED",
    });
    expect("conclusion" in result.presentation.primary).toBe(false);
  });

  it("asks only for the first missing finance input", async () => {
    const orchestrator = createOrchestrator({
      agents: createUnsupportedAgentSet({ clock: () => now }),
      clock: () => now,
    });
    const result = await orchestrator.execute(baseRequest("finance"));

    expect(result).toMatchObject({
      kind: "clarification",
      status: "needs_input",
      clarification: { field: "instrument" },
    });
    expect(result.audit.executedAgentIds).toEqual([]);
  });

  it("suggests optional personal Agents without reading ungranted birth data", async () => {
    const orchestrator = createOrchestrator({
      agents: createUnsupportedAgentSet({ clock: () => now }),
      clock: () => now,
    });
    const result = await orchestrator.execute({
      ...baseRequest("finance"),
      instrument: "AAPL",
      investmentHorizon: "short-term",
    });

    expect(result.kind).toBe("result");
    if (result.kind !== "result") {
      throw new Error("Expected a presented result.");
    }
    expect(result.routing.optionalAgentIds).toEqual([
      "bazi-profile",
      "ziwei-timeline",
    ]);
    expect(result.audit.executedAgentIds).toEqual(["qimen-finance"]);
    expect(result.audit.profileScopesByAgent["qimen-finance"]).toEqual([
      "current-location",
    ]);
    expect(result.audit.profileScopesByAgent["bazi-profile"]).toBeUndefined();
  });

  it("preserves contradictory fake reports through the full pipeline", async () => {
    const seenPrimaryCategories: string[] = [];
    const seenSupportingCategories: string[] = [];
    const primary = completeFakeAgent(
      availableDefinition("qimen-finance"),
      "favorable",
      seenPrimaryCategories,
    );
    const supporting = completeFakeAgent(
      availableDefinition("bazi-profile"),
      "caution",
      seenSupportingCategories,
    );
    const testRouter = (rawInput: unknown): RoutingDecision => {
      const routed = routeRequest(rawInput);
      return {
        ...routed,
        availability: "available",
        status: "ready",
        selectedSupportingAgentIds: ["bazi-profile"],
        supportingAgentIds: ["bazi-profile"],
        supportingReasons: { "bazi-profile": "Enabled in this test." },
        supportingAgentStates: {
          "bazi-profile": {
            availability: "available",
            requiredProfileScopes: ["birth-data"],
            missingProfileScopes: [],
            executable: true,
          },
        },
        optionalAgentIds: [],
        optionalReasons: {},
        optionalAgentStates: {},
      };
    };
    const orchestrator = createOrchestrator({
      agents: [primary, supporting],
      clock: () => now,
      router: testRouter,
    });
    const result = await orchestrator.execute({
      ...baseRequest("finance"),
      profileScopes: ["current-location", "birth-data"],
      instrument: "AAPL",
      investmentHorizon: "short-term",
      enabledSupportingAgentIds: ["bazi-profile"],
    });

    expect(result.kind).toBe("result");
    if (result.kind !== "result") {
      throw new Error("Expected a presented result.");
    }
    expect(result.status).toBe("complete");
    expect(result.presentation.relationships).toEqual([
      {
        agentId: "bazi-profile",
        relationship: "conflict",
        evidenceIds: [
          "evidence-qimen-finance",
          "evidence-bazi-profile",
        ],
      },
    ]);
    expect(seenPrimaryCategories).toEqual(["finance"]);
    expect(seenSupportingCategories).toEqual(["profile"]);
    expect(result.persistence).toEqual({
      allowed: true,
      operations: [],
      deniedScopes: [],
    });
  });
});
