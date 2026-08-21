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
  createTestOrchestrator,
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

function availableDefinition(
  agentId: "qimen-finance" | "bazi-profile" | "qimen-rhythm",
) {
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
  observe?: (request: AgentRequest, context: AuthorizedContext) => void,
): DomainAgent {
  return {
    definition,
    async execute(
      request: unknown,
      _context: AuthorizedContext,
    ): Promise<AgentReport> {
      const typedRequest = request as AgentRequest;
      seenCategories.push(typedRequest.category);
      observe?.(typedRequest, _context);
      return {
        agentId: definition.id,
        agentVersion: "test-0.1.0",
        status: "complete",
        conclusion: {
          favorable:
            tendency === "favorable"
              ? [
                  {
                    text: "test favorable",
                    evidenceIds: [`evidence-${definition.id}`],
                  },
                ]
              : [],
          cautions:
            tendency === "caution"
              ? [
                  {
                    text: "test caution",
                    evidenceIds: [`evidence-${definition.id}`],
                  },
                ]
              : [],
          action: {
            text: "Keep both reports separate.",
            evidenceIds: [`evidence-${definition.id}`],
          },
          tendency,
          tendencyEvidenceIds: [`evidence-${definition.id}`],
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

function readyFinanceRouter(
  supportingAgentIds: readonly ("bazi-profile" | "ziwei-timeline")[] = [],
) {
  return (rawInput: unknown): RoutingDecision => {
    const routed = routeRequest(rawInput);
    return {
      ...routed,
      availability: "available",
      status: "ready",
      selectedSupportingAgentIds: supportingAgentIds,
      supportingAgentIds,
      supportingReasons: Object.fromEntries(
        supportingAgentIds.map((agentId) => [agentId, "Enabled in this test."]),
      ),
      supportingAgentStates: Object.fromEntries(
        supportingAgentIds.map((agentId) => [
          agentId,
          {
            availability: "available",
            requiredProfileScopes: ["birth-data"],
            missingProfileScopes: [],
            executable: true,
          },
        ]),
      ),
      optionalAgentIds: [],
      optionalReasons: {},
      optionalAgentStates: {},
    };
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
    const orchestrator = createTestOrchestrator({
      agents: [primary, supporting],
      trustedDefinitions: [primary.definition, supporting.definition],
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

  it("rejects an executor whose self-declared definition differs from the trusted registry", () => {
    const trusted = availableDefinition("qimen-finance");
    const selfDeclared = {
      ...trusted,
      requiredProfileScopes: [],
    } satisfies DomainAgentDefinition;
    const agent = completeFakeAgent(selfDeclared, "favorable", []);

    expect(() =>
      createTestOrchestrator({
        agents: [agent],
        trustedDefinitions: [trusted],
        clock: () => now,
      }),
    ).toThrow(/trusted definition/i);
  });

  it("rejects a report that spoofs a different Agent identity", async () => {
    const definition = availableDefinition("qimen-finance");
    const agent: DomainAgent = {
      definition,
      async execute() {
        return {
          agentId: "bazi-profile",
          agentVersion: "test-0.1.0",
          status: "complete",
          conclusion: {
            favorable: [
              { text: "test favorable", evidenceIds: ["spoofed-evidence"] },
            ],
            cautions: [],
            action: {
              text: "Test action.",
              evidenceIds: ["spoofed-evidence"],
            },
            tendency: "favorable",
            tendencyEvidenceIds: ["spoofed-evidence"],
          },
          evidence: [
            {
              evidenceId: "spoofed-evidence",
              ruleId: "TEST-SPOOF",
              ruleVersion: "test-0.1.0",
              sourceId: "test-source",
              factPath: "test.spoof",
              explanation: "Test-only spoofed report.",
            },
          ],
          conflicts: [],
          requiredInputs: [],
          ruleVersion: "test-0.1.0",
          generatedAt: now.toISOString(),
        };
      },
    };
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router: readyFinanceRouter(),
    });

    await expect(
      orchestrator.execute({
        ...baseRequest("finance"),
        instrument: "AAPL",
        investmentHorizon: "short-term",
      }),
    ).rejects.toThrow(/returned bazi-profile/i);
  });

  it("rejects a complete report from a canonically unverified Agent", async () => {
    const definition = getAgentDefinition("qimen-finance");
    if (!definition || definition.role !== "domain") {
      throw new Error("Missing qimen-finance definition.");
    }
    const agent = completeFakeAgent(definition, "favorable", []);
    const orchestrator = createOrchestrator({
      agents: [agent],
      clock: () => now,
    });

    await expect(
      orchestrator.execute({
        ...baseRequest("finance"),
        instrument: "AAPL",
        investmentHorizon: "short-term",
      }),
    ).rejects.toThrow(/unverified.*unsupported/i);
  });

  it.each(["throws", "malformed", "timeout"] as const)(
    "returns a sanitized error when an unverified Agent %s",
    async (failureMode) => {
      const definition = getAgentDefinition("qimen-finance");
      if (!definition || definition.role !== "domain") {
        throw new Error("Missing qimen-finance definition.");
      }
      const agent: DomainAgent = {
        definition,
        async execute(_request, _context, signal) {
          if (failureMode === "throws") {
            throw new Error("private unverified failure");
          }
          if (failureMode === "malformed") {
            return {} as AgentReport;
          }
          return await new Promise<never>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(new Error("private cancelled work")),
              { once: true },
            );
          });
        },
      };
      const orchestrator = createOrchestrator({
        agents: [agent],
        clock: () => now,
        agentTimeoutMs: 5,
      });

      const result = await orchestrator.execute({
        ...baseRequest("finance"),
        instrument: "AAPL",
        investmentHorizon: "short-term",
      });

      expect(result.kind).toBe("result");
      if (result.kind !== "result") {
        throw new Error("Expected a sanitized error result.");
      }
      expect(result.presentation.primary).toMatchObject({
        agentId: "qimen-finance",
        status: "error",
        errorCode: "AGENT_EXECUTION_FAILED",
        message: "Agent execution failed.",
      });
      expect(JSON.stringify(result)).not.toContain("private");
    },
  );

  it("rejects a router that enables support without explicit user consent", async () => {
    const primaryRuns: string[] = [];
    const supportRuns: string[] = [];
    const primary = completeFakeAgent(
      availableDefinition("qimen-finance"),
      "favorable",
      primaryRuns,
    );
    const supporting = completeFakeAgent(
      availableDefinition("bazi-profile"),
      "caution",
      supportRuns,
    );
    const orchestrator = createTestOrchestrator({
      agents: [primary, supporting],
      trustedDefinitions: [primary.definition, supporting.definition],
      clock: () => now,
      router: readyFinanceRouter(["bazi-profile"]),
    });

    await expect(
      orchestrator.execute({
        ...baseRequest("finance"),
        profileScopes: ["current-location", "birth-data"],
        instrument: "AAPL",
        investmentHorizon: "short-term",
      }),
    ).rejects.toThrow(/explicitly enabled/i);
    expect(primaryRuns).toEqual([]);
    expect(supportRuns).toEqual([]);
  });

  it("rejects replacement routing that changes canonical primary semantics", async () => {
    const definition = availableDefinition("qimen-rhythm");
    const agent = completeFakeAgent(definition, "favorable", []);
    const router = (rawInput: unknown): RoutingDecision => ({
      ...readyFinanceRouter()(rawInput),
      primaryAgentId: "qimen-rhythm",
    });
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router,
    });

    await expect(
      orchestrator.execute({
        ...baseRequest("finance"),
        instrument: "AAPL",
        investmentHorizon: "short-term",
      }),
    ).rejects.toThrow(/canonical primary|does not support finance/i);
  });

  it("rejects replacement routing that omits canonical required inputs", async () => {
    const definition = availableDefinition("qimen-finance");
    const agent = completeFakeAgent(definition, "favorable", []);
    const router = (rawInput: unknown): RoutingDecision => ({
      ...routeRequest(rawInput),
      availability: "available",
      status: "ready",
      requiredInputs: [],
    });
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router,
    });

    await expect(
      orchestrator.execute(baseRequest("finance")),
    ).rejects.toThrow(/required inputs/i);
  });

  it("copies trusted test definitions before use", async () => {
    const definition = availableDefinition("qimen-finance");
    const agent = completeFakeAgent(definition, "favorable", []);
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router: readyFinanceRouter(),
    });
    (definition as { availability: "available" | "unverified" }).availability =
      "unverified";

    const result = await orchestrator.execute({
      ...baseRequest("finance"),
      instrument: "AAPL",
      investmentHorizon: "short-term",
    });

    expect(result.kind).toBe("result");
    expect(result.status).toBe("complete");
  });

  it("projects minimum payloads and delivers finance inputs to the primary", async () => {
    let primaryRequest: AgentRequest | undefined;
    let primaryContext: AuthorizedContext | undefined;
    let supportingRequest: AgentRequest | undefined;
    let supportingContext: AuthorizedContext | undefined;
    const primary = completeFakeAgent(
      availableDefinition("qimen-finance"),
      "favorable",
      [],
      (request, context) => {
        primaryRequest = request;
        primaryContext = context;
      },
    );
    const supporting = completeFakeAgent(
      availableDefinition("bazi-profile"),
      "caution",
      [],
      (request, context) => {
        supportingRequest = request;
        supportingContext = context;
      },
    );
    const orchestrator = createTestOrchestrator({
      agents: [primary, supporting],
      trustedDefinitions: [primary.definition, supporting.definition],
      clock: () => now,
      router: readyFinanceRouter(["bazi-profile"]),
    });

    await orchestrator.execute({
      ...baseRequest("finance"),
      location: "Shanghai",
      actors: [{ role: "self" }],
      profileScopes: ["current-location", "birth-data", "finance-profile"],
      memoryScopes: ["finance", "timeline", "identity"],
      instrument: "AAPL",
      investmentHorizon: "short-term",
      enabledSupportingAgentIds: ["bazi-profile"],
    });

    expect(primaryRequest).toMatchObject({
      location: "Shanghai",
      actors: [{ role: "self" }],
      profileScopes: ["current-location", "birth-data", "finance-profile"],
      memoryScopes: ["finance", "timeline"],
      instrument: "AAPL",
      investmentHorizon: "short-term",
    });
    expect(primaryContext).toEqual({
      profileScopes: ["current-location", "birth-data", "finance-profile"],
      memoryScopes: ["finance", "timeline"],
    });
    expect(supportingRequest).toMatchObject({
      profileScopes: ["birth-data"],
      memoryScopes: ["timeline", "identity"],
    });
    expect(supportingRequest).not.toHaveProperty("location");
    expect(supportingRequest).not.toHaveProperty("actors");
    expect(supportingRequest).not.toHaveProperty("instrument");
    expect(supportingRequest).not.toHaveProperty("investmentHorizon");
    expect(supportingContext).toEqual({
      profileScopes: ["birth-data"],
      memoryScopes: ["timeline", "identity"],
    });
  });

  it("removes surplus finance fields from a non-finance primary request", async () => {
    let seenRequest: AgentRequest | undefined;
    const definition = availableDefinition("qimen-rhythm");
    const agent = completeFakeAgent(
      definition,
      "favorable",
      [],
      (request) => {
        seenRequest = request;
      },
    );
    const router = (rawInput: unknown): RoutingDecision => ({
      ...routeRequest(rawInput),
      availability: "available",
      status: "ready",
    });
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router,
    });

    await orchestrator.execute({
      ...baseRequest("rhythm"),
      instrument: "surplus-secret-symbol",
      investmentHorizon: "surplus-horizon",
    });

    expect(seenRequest).toBeDefined();
    expect(seenRequest).not.toHaveProperty("instrument");
    expect(seenRequest).not.toHaveProperty("investmentHorizon");
  });

  it("turns a primary execution failure into a sanitized audited error report", async () => {
    const definition = availableDefinition("qimen-finance");
    const agent: DomainAgent = {
      definition,
      async execute() {
        throw new Error("private broker token should never escape");
      },
    };
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router: readyFinanceRouter(),
    });

    const result = await orchestrator.execute({
      ...baseRequest("finance"),
      instrument: "AAPL",
      investmentHorizon: "short-term",
    });

    expect(result.kind).toBe("result");
    if (result.kind !== "result") {
      throw new Error("Expected an error result.");
    }
    expect(result.status).toBe("error");
    expect(result.presentation.primary).toMatchObject({
      agentId: "qimen-finance",
      status: "error",
      errorCode: "AGENT_EXECUTION_FAILED",
      message: "Agent execution failed.",
    });
    expect(JSON.stringify(result)).not.toContain("private broker token");
    expect(result.audit.executedAgentIds).toEqual(["qimen-finance"]);
  });

  it("turns an Agent timeout into the same sanitized error boundary", async () => {
    const definition = availableDefinition("qimen-finance");
    let aborted = false;
    const agent: DomainAgent = {
      definition,
      async execute(_request, _context, signal) {
        return await new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("cancelled private work"));
            },
            { once: true },
          );
        });
      },
    };
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router: readyFinanceRouter(),
      agentTimeoutMs: 5,
    });

    const result = await orchestrator.execute({
      ...baseRequest("finance"),
      instrument: "AAPL",
      investmentHorizon: "short-term",
    });

    expect(result.kind).toBe("result");
    if (result.kind !== "result") {
      throw new Error("Expected a timeout result.");
    }
    expect(result.presentation.primary).toMatchObject({
      status: "error",
      errorCode: "AGENT_EXECUTION_FAILED",
      message: "Agent execution failed.",
    });
    expect(aborted).toBe(true);
  });

  it("keeps a valid primary report when supporting execution fails", async () => {
    const primary = completeFakeAgent(
      availableDefinition("qimen-finance"),
      "favorable",
      [],
    );
    const supportingDefinition = availableDefinition("bazi-profile");
    const supporting: DomainAgent = {
      definition: supportingDefinition,
      async execute() {
        throw new Error("sensitive supporting failure");
      },
    };
    const orchestrator = createTestOrchestrator({
      agents: [primary, supporting],
      trustedDefinitions: [primary.definition, supportingDefinition],
      clock: () => now,
      router: readyFinanceRouter(["bazi-profile"]),
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
      throw new Error("Expected a primary result.");
    }
    expect(result.status).toBe("complete");
    expect(result.presentation.supporting[0]).toMatchObject({
      agentId: "bazi-profile",
      status: "error",
      errorCode: "AGENT_EXECUTION_FAILED",
    });
    expect(result.presentation.relationships).toEqual([
      {
        agentId: "bazi-profile",
        relationship: "unavailable",
        evidenceIds: [],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("sensitive supporting failure");
    expect(result.audit.executedAgentIds).toEqual([
      "qimen-finance",
      "bazi-profile",
    ]);
  });

  it("sanitizes a malformed supporting report without discarding the primary", async () => {
    const primary = completeFakeAgent(
      availableDefinition("qimen-finance"),
      "favorable",
      [],
    );
    const supportingDefinition = availableDefinition("bazi-profile");
    const supporting: DomainAgent = {
      definition: supportingDefinition,
      async execute(): Promise<AgentReport> {
        return {} as AgentReport;
      },
    };
    const orchestrator = createTestOrchestrator({
      agents: [primary, supporting],
      trustedDefinitions: [primary.definition, supportingDefinition],
      clock: () => now,
      router: readyFinanceRouter(["bazi-profile"]),
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
      throw new Error("Expected a primary result.");
    }
    expect(result.status).toBe("complete");
    expect(result.presentation.supporting[0]).toMatchObject({
      agentId: "bazi-profile",
      status: "error",
      errorCode: "AGENT_EXECUTION_FAILED",
    });
  });

  it("does not freeze an injected router's caller-owned decision", async () => {
    const definition = availableDefinition("qimen-finance");
    const agent = completeFakeAgent(definition, "favorable", []);
    let callerOwnedDecision: RoutingDecision | undefined;
    const router = (rawInput: unknown): RoutingDecision => {
      callerOwnedDecision = readyFinanceRouter()(rawInput);
      return callerOwnedDecision;
    };
    const orchestrator = createTestOrchestrator({
      agents: [agent],
      trustedDefinitions: [definition],
      clock: () => now,
      router,
    });

    await orchestrator.execute({
      ...baseRequest("finance"),
      instrument: "AAPL",
      investmentHorizon: "short-term",
    });

    expect(callerOwnedDecision).toBeDefined();
    expect(Object.isFrozen(callerOwnedDecision)).toBe(false);
  });
});
