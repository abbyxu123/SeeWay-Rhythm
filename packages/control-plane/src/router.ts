import type {
  AgentId,
  AgentRequest,
  IntentCategory,
} from "@seeway/contracts";
import {
  getAgentDefinition,
  type AgentAvailability,
} from "./registry";

export type DomainAgentId = Exclude<AgentId, "orchestrator">;
export type RoutingStatus = "ready" | "needs_input" | "unavailable";

export type RouteRequestInput = AgentRequest & {
  readonly instrument?: string;
  readonly investmentHorizon?: string;
  readonly enabledSupportingAgentIds?: readonly DomainAgentId[];
};

export interface RoutingDecision {
  readonly primaryAgentId: DomainAgentId;
  readonly primaryReason: string;
  readonly supportingAgentIds: readonly DomainAgentId[];
  readonly supportingReasons: Readonly<Partial<Record<DomainAgentId, string>>>;
  readonly optionalAgentIds: readonly DomainAgentId[];
  readonly optionalReasons: Readonly<Partial<Record<DomainAgentId, string>>>;
  readonly requiredInputs: readonly string[];
  readonly availability: AgentAvailability;
  readonly status: RoutingStatus;
}

const DefaultPrimaryByCategory = {
  rhythm: "qimen-rhythm",
  query: "qimen-query",
  timeline: "ziwei-timeline",
  profile: "bazi-profile",
  finance: "qimen-finance",
  meihua: "meihua",
} as const satisfies Readonly<Record<IntentCategory, DomainAgentId>>;

const FinanceOptionalAgents = [
  "bazi-profile",
  "ziwei-timeline",
] as const satisfies readonly DomainAgentId[];

export function routeRequest(input: RouteRequestInput): RoutingDecision {
  const primaryAgentId = choosePrimary(input);
  const primaryAgent = requireDomainAgent(primaryAgentId);
  const requiredInputs = findNextRequiredInput(input);
  const optionalCandidates: readonly DomainAgentId[] =
    input.category === "finance" ? FinanceOptionalAgents : [];
  const enabledAgents = new Set(input.enabledSupportingAgentIds ?? []);

  for (const enabledAgent of enabledAgents) {
    if (!optionalCandidates.includes(enabledAgent)) {
      throw new Error(
        `Agent ${enabledAgent} is not an optional support for ${input.category}.`,
      );
    }
  }

  const supportingAgentIds = optionalCandidates.filter((agentId) =>
    enabledAgents.has(agentId),
  );
  const optionalAgentIds = optionalCandidates.filter(
    (agentId) => !enabledAgents.has(agentId),
  );
  const supportingReasons = Object.fromEntries(
    supportingAgentIds.map((agentId) => [agentId, supportReason(agentId)]),
  );
  const optionalReasons = Object.fromEntries(
    optionalAgentIds.map((agentId) => [agentId, supportReason(agentId)]),
  );

  return {
    primaryAgentId,
    primaryReason: input.requestedAgent
      ? `The user explicitly selected ${primaryAgentId}.`
      : `The ${input.category} category maps to ${primaryAgentId}.`,
    supportingAgentIds,
    supportingReasons,
    optionalAgentIds,
    optionalReasons,
    requiredInputs,
    availability: primaryAgent.availability,
    status:
      requiredInputs.length > 0
        ? "needs_input"
        : primaryAgent.availability === "unverified"
          ? "unavailable"
          : "ready",
  };
}

function choosePrimary(input: RouteRequestInput): DomainAgentId {
  if (!input.requestedAgent) {
    return DefaultPrimaryByCategory[input.category];
  }

  const requested = getAgentDefinition(input.requestedAgent);
  if (
    !requested ||
    requested.role !== "domain" ||
    !requested.capabilities.includes(input.category)
  ) {
    throw new Error(
      `Agent ${input.requestedAgent} does not support ${input.category}.`,
    );
  }

  return requested.id;
}

function findNextRequiredInput(input: RouteRequestInput): readonly string[] {
  if (input.category !== "finance") {
    return [];
  }
  if (!input.instrument?.trim()) {
    return ["instrument"];
  }
  if (!input.investmentHorizon?.trim()) {
    return ["investmentHorizon"];
  }
  return [];
}

function requireDomainAgent(agentId: DomainAgentId) {
  const agent = getAgentDefinition(agentId);
  if (!agent || agent.role !== "domain") {
    throw new Error(`Unknown domain Agent: ${agentId}`);
  }
  return agent;
}

function supportReason(agentId: DomainAgentId): string {
  if (agentId === "bazi-profile") {
    return "Adds an optional personal background layer when birth data is granted.";
  }
  if (agentId === "ziwei-timeline") {
    return "Adds an optional long-term timeline background when birth data is granted.";
  }
  return `Adds optional context from ${agentId}.`;
}
