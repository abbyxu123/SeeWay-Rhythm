import {
  AgentReportSchema,
  AgentRequestSchema,
  type AgentReport,
  type UnsupportedAgentReport,
} from "@seeway/contracts";
import {
  agentRegistry,
  type DeepReadonly,
  type DomainAgentId,
  type DomainAgentDefinition,
  getAgentDefinition,
} from "@seeway/control-plane";
import type {
  AgentClockOptions,
  AuthorizedContext,
  DomainAgent,
} from "./types";

const AgentVersion = "0.1.0";

export function createUnsupportedAgent(
  agentId: DomainAgentId,
  { clock }: AgentClockOptions,
): DomainAgent {
  const definition = getAgentDefinition(agentId);
  if (!definition || definition.role !== "domain") {
    throw new Error(`Unknown domain Agent: ${agentId}.`);
  }
  if (definition.availability !== "unverified") {
    throw new Error(
      `Agent ${definition.id} is available and cannot use an unsupported adapter.`,
    );
  }

  return Object.freeze({
    definition,
    async execute(
      rawRequest: unknown,
      _context: AuthorizedContext,
    ): Promise<DeepReadonly<AgentReport>> {
      const request = AgentRequestSchema.parse(rawRequest);
      if (!definition.capabilities.includes(request.category)) {
        throw new Error(
          `Agent ${definition.id} does not support ${request.category}.`,
        );
      }
      if (
        request.requestedAgent !== undefined &&
        request.requestedAgent !== definition.id
      ) {
        throw new Error(
          `Requested Agent ${request.requestedAgent} does not match ${definition.id}.`,
        );
      }

      const report: UnsupportedAgentReport = {
        agentId: definition.id,
        agentVersion: AgentVersion,
        status: "unsupported",
        evidence: [],
        conflicts: [],
        requiredInputs: [],
        ruleVersion: `${definition.calculationCore}-unverified`,
        generatedAt: clock().toISOString(),
        reasonCode: "CALCULATOR_NOT_VERIFIED",
        reason: `${definition.calculationCore} has not passed its verified golden cases.`,
        prerequisites: [
          `${definition.calculationCore} implementation`,
          `${definition.calculationCore} golden cases`,
        ],
      };
      return deepFreeze(AgentReportSchema.parse(report));
    },
  });
}

export function createUnsupportedAgentSet(
  options: AgentClockOptions,
): readonly DomainAgent[] {
  const agents = agentRegistry
    .filter(
      (definition): definition is DomainAgentDefinition =>
        definition.role === "domain" &&
        definition.availability === "unverified",
    )
    .map((definition) => createUnsupportedAgent(definition.id, options));
  return Object.freeze(agents);
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
