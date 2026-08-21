import {
  AgentReportSchema,
  type AgentRequest,
  type IntentCategory,
} from "@seeway/contracts";
import { agentRegistry } from "@seeway/control-plane";
import { describe, expect, it } from "vitest";
import {
  createUnsupportedAgent,
  createUnsupportedAgentSet,
  type AuthorizedContext,
} from "@seeway/agents";

const fixedNow = new Date("2026-08-21T12:00:00.000Z");
const context: AuthorizedContext = {
  profileScopes: [],
  memoryScopes: [],
};

function request(category: IntentCategory): AgentRequest {
  return {
    requestId: `req-${category}`,
    intent: `Handle a ${category} request`,
    category,
    questionTime: "2026-08-21T12:00:00.000Z",
    timezone: "Asia/Shanghai",
    profileScopes: [],
    memoryScopes: [],
  };
}

describe("unsupported domain Agent adapters", () => {
  it("creates one honest adapter for every unverified domain Agent", () => {
    const agents = createUnsupportedAgentSet({ clock: () => fixedNow });

    expect(agents.map((agent) => agent.definition.id)).toEqual([
      "qimen-rhythm",
      "qimen-query",
      "ziwei-timeline",
      "bazi-profile",
      "qimen-finance",
      "meihua",
    ]);
  });

  it("returns unsupported without conclusions or invented evidence", async () => {
    const agents = createUnsupportedAgentSet({ clock: () => fixedNow });

    for (const agent of agents) {
      const category = agent.definition.capabilities[0];
      if (!category) {
        throw new Error(`Agent ${agent.definition.id} has no capability.`);
      }
      const report = await agent.execute(request(category), context);

      expect(AgentReportSchema.safeParse(report).success).toBe(true);
      expect(report).toMatchObject({
        agentId: agent.definition.id,
        agentVersion: "0.1.0",
        status: "unsupported",
        evidence: [],
        conflicts: [],
        requiredInputs: [],
        reasonCode: "CALCULATOR_NOT_VERIFIED",
        generatedAt: "2026-08-21T12:00:00.000Z",
      });
      if (report.status !== "unsupported") {
        throw new Error(`Expected ${agent.definition.id} to be unsupported.`);
      }
      expect("conclusion" in report).toBe(false);
      expect(report.prerequisites).toEqual([
        `${agent.definition.calculationCore} implementation`,
        `${agent.definition.calculationCore} golden cases`,
      ]);
    }
  });

  it("rejects malformed and incompatible requests", async () => {
    const definition = agentRegistry.find(
      (agent) => agent.id === "qimen-rhythm",
    );
    if (!definition || definition.role !== "domain") {
      throw new Error("Missing qimen-rhythm definition.");
    }
    const agent = createUnsupportedAgent(definition, {
      clock: () => fixedNow,
    });

    await expect(agent.execute({ category: "rhythm" }, context)).rejects.toThrow();
    await expect(agent.execute(request("finance"), context)).rejects.toThrow(
      /does not support/i,
    );
  });

  it("returns deeply immutable unsupported reports", async () => {
    const agent = createUnsupportedAgentSet({ clock: () => fixedNow })[0];
    if (!agent) {
      throw new Error("Missing domain Agent.");
    }
    const report = await agent.execute(request("rhythm"), context);

    if (report.status !== "unsupported") {
      throw new Error("Expected an unsupported report.");
    }
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.evidence)).toBe(true);
    expect(Object.isFrozen(report.prerequisites)).toBe(true);
  });
});
