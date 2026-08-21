import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AgentDefinition,
  CalculationCore,
} from "@seeway/control-plane";
import {
  agentRegistry,
  getAgentDefinition,
} from "@seeway/control-plane";

const expectedAgentIds = [
  "orchestrator",
  "qimen-rhythm",
  "qimen-query",
  "ziwei-timeline",
  "bazi-profile",
  "qimen-finance",
  "meihua",
];

const expectedDefinitions = [
  {
    id: "orchestrator",
    role: "orchestrator",
    capabilities: ["rhythm", "query", "timeline", "profile", "finance", "meihua"],
    timeGranularities: [
      "period",
      "question",
      "day",
      "month",
      "year",
      "lifetime",
      "market-session",
    ],
    calculationCore: null,
    requiredProfileScopes: [],
    optionalProfileScopes: [],
    allowedMemoryScopes: [],
    availability: "available",
  },
  {
    id: "qimen-rhythm",
    role: "domain",
    capabilities: ["rhythm"],
    timeGranularities: ["period"],
    calculationCore: "qimen-core",
    requiredProfileScopes: ["current-location"],
    optionalProfileScopes: ["birth-data"],
    allowedMemoryScopes: ["preferences", "timeline"],
    availability: "unverified",
  },
  {
    id: "qimen-query",
    role: "domain",
    capabilities: ["query"],
    timeGranularities: ["question", "period", "day"],
    calculationCore: "qimen-core",
    requiredProfileScopes: ["current-location"],
    optionalProfileScopes: ["birth-data"],
    allowedMemoryScopes: ["preferences", "timeline", "career", "relationship"],
    availability: "unverified",
  },
  {
    id: "ziwei-timeline",
    role: "domain",
    capabilities: ["timeline"],
    timeGranularities: ["day", "month", "year", "lifetime"],
    calculationCore: "ziwei-core",
    requiredProfileScopes: ["birth-data"],
    optionalProfileScopes: ["current-location"],
    allowedMemoryScopes: ["identity", "preferences", "timeline"],
    availability: "unverified",
  },
  {
    id: "bazi-profile",
    role: "domain",
    capabilities: ["profile"],
    timeGranularities: ["year", "lifetime"],
    calculationCore: "bazi-core",
    requiredProfileScopes: ["birth-data"],
    optionalProfileScopes: [],
    allowedMemoryScopes: ["identity", "preferences", "timeline"],
    availability: "unverified",
  },
  {
    id: "qimen-finance",
    role: "domain",
    capabilities: ["finance"],
    timeGranularities: ["market-session", "period", "day"],
    calculationCore: "qimen-core",
    requiredProfileScopes: ["current-location"],
    optionalProfileScopes: ["birth-data", "finance-profile"],
    allowedMemoryScopes: ["preferences", "timeline", "finance"],
    availability: "unverified",
  },
  {
    id: "meihua",
    role: "domain",
    capabilities: ["meihua"],
    timeGranularities: ["question"],
    calculationCore: "meihua-core",
    requiredProfileScopes: ["current-location"],
    optionalProfileScopes: [],
    allowedMemoryScopes: ["preferences", "timeline"],
    availability: "unverified",
  },
];

describe("Agent registry", () => {
  it("registers exactly the seven approved Agents in a stable order", () => {
    expect(agentRegistry.map((agent) => agent.id)).toEqual(expectedAgentIds);
    expect(new Set(agentRegistry.map((agent) => agent.id)).size).toBe(7);
  });

  it("locks every capability, core, profile grant, and memory scope", () => {
    expect(agentRegistry).toEqual(expectedDefinitions);
  });

  it("reserves the orchestrator role for the orchestrator", () => {
    expect(
      agentRegistry.filter((agent) => agent.role === "orchestrator"),
    ).toEqual([expect.objectContaining({ id: "orchestrator" })]);
    expect(getAgentDefinition("orchestrator")?.availability).toBe("available");
  });

  it("shares qimen-core without sharing domain capabilities", () => {
    const qimenAgents = agentRegistry.filter((agent) =>
      agent.id.startsWith("qimen-"),
    );

    expect(qimenAgents).toHaveLength(3);
    expect(qimenAgents.map((agent) => agent.calculationCore)).toEqual([
      "qimen-core",
      "qimen-core",
      "qimen-core",
    ]);
    expect(qimenAgents.map((agent) => agent.capabilities)).toEqual([
      ["rhythm"],
      ["query"],
      ["finance"],
    ]);
  });

  it("keeps every domain Agent unavailable until verified", () => {
    const domainAgents = agentRegistry.filter(
      (agent) => agent.role === "domain",
    );

    expect(domainAgents).toHaveLength(6);
    expect(domainAgents.every((agent) => agent.availability === "unverified")).toBe(
      true,
    );
    expect(getAgentDefinition("meihua")?.availability).toBe("unverified");
  });

  it("limits every Agent to a minimum memory surface", () => {
    const everyMemoryScopeCount = 6;

    expect(
      agentRegistry.every(
        (agent) => agent.allowedMemoryScopes.length < everyMemoryScopeCount,
      ),
    ).toBe(true);
  });

  it("keeps required and optional profile scopes disjoint", () => {
    for (const agent of agentRegistry) {
      const required = new Set(agent.requiredProfileScopes);
      expect(
        agent.optionalProfileScopes.every((scope) => !required.has(scope)),
      ).toBe(true);
    }
  });

  it("exposes immutable definitions and nested permission lists", () => {
    expect(Object.isFrozen(agentRegistry)).toBe(true);

    for (const agent of agentRegistry) {
      expect(Object.isFrozen(agent)).toBe(true);
      expect(Object.isFrozen(agent.capabilities)).toBe(true);
      expect(Object.isFrozen(agent.timeGranularities)).toBe(true);
      expect(Object.isFrozen(agent.requiredProfileScopes)).toBe(true);
      expect(Object.isFrozen(agent.optionalProfileScopes)).toBe(true);
      expect(Object.isFrozen(agent.allowedMemoryScopes)).toBe(true);
    }
  });

  it("returns undefined for an unknown Agent ID", () => {
    expect(getAgentDefinition("unknown-agent")).toBeUndefined();
  });

  it("uses role-specific types for calculation cores and availability", () => {
    type DomainDefinition = Extract<AgentDefinition, { role: "domain" }>;
    type OrchestratorDefinition = Extract<
      AgentDefinition,
      { role: "orchestrator" }
    >;

    expectTypeOf<DomainDefinition["calculationCore"]>().toEqualTypeOf<CalculationCore>();
    expectTypeOf<OrchestratorDefinition["calculationCore"]>().toEqualTypeOf<null>();
    expectTypeOf<OrchestratorDefinition["availability"]>().toEqualTypeOf<"available">();
  });
});
