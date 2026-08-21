import { describe, expect, it } from "vitest";
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

describe("Agent registry", () => {
  it("registers exactly the seven approved Agents in a stable order", () => {
    expect(agentRegistry.map((agent) => agent.id)).toEqual(expectedAgentIds);
    expect(new Set(agentRegistry.map((agent) => agent.id)).size).toBe(7);
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
});
