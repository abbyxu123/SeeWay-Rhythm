import type {
  AgentId,
  IntentCategory,
  MemoryScope,
  ProfileScope,
} from "@seeway/contracts";
import { evaluateQimenAvailability } from "./qimen-availability";

export type AgentRole = "orchestrator" | "domain";
export type AgentAvailability = "available" | "unverified";
export type CalculationCore =
  | "qimen-core"
  | "ziwei-core"
  | "bazi-core"
  | "meihua-core";
export type TimeGranularity =
  | "period"
  | "question"
  | "day"
  | "month"
  | "year"
  | "lifetime"
  | "market-session";

interface AgentDefinitionBase {
  readonly capabilities: readonly IntentCategory[];
  readonly timeGranularities: readonly TimeGranularity[];
  readonly requiredProfileScopes: readonly ProfileScope[];
  readonly optionalProfileScopes: readonly ProfileScope[];
  readonly allowedMemoryScopes: readonly MemoryScope[];
}

export interface OrchestratorAgentDefinition extends AgentDefinitionBase {
  readonly id: "orchestrator";
  readonly role: "orchestrator";
  readonly calculationCore: null;
  readonly availability: "available";
}

export interface DomainAgentDefinition extends AgentDefinitionBase {
  readonly id: Exclude<AgentId, "orchestrator">;
  readonly role: "domain";
  readonly calculationCore: CalculationCore;
  readonly availability: AgentAvailability;
}

export type AgentDefinition =
  | OrchestratorAgentDefinition
  | DomainAgentDefinition;

const definitionsById = {
  orchestrator: {
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
  "qimen-rhythm": {
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
  "qimen-query": {
    id: "qimen-query",
    role: "domain",
    capabilities: ["query"],
    timeGranularities: ["question", "period", "day"],
    calculationCore: "qimen-core",
    requiredProfileScopes: ["current-location"],
    optionalProfileScopes: ["birth-data"],
    allowedMemoryScopes: [
      "preferences",
      "timeline",
      "career",
      "relationship",
    ],
    availability: "unverified",
  },
  "ziwei-timeline": {
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
  "bazi-profile": {
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
  "qimen-finance": {
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
  meihua: {
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
} as const satisfies Readonly<Record<AgentId, AgentDefinition>>;

const agentOrder = [
  "orchestrator",
  "qimen-rhythm",
  "qimen-query",
  "ziwei-timeline",
  "bazi-profile",
  "qimen-finance",
  "meihua",
] as const satisfies readonly AgentId[];

function freezeDefinition(definition: AgentDefinition): AgentDefinition {
  return Object.freeze({
    ...definition,
    capabilities: Object.freeze([...definition.capabilities]),
    timeGranularities: Object.freeze([...definition.timeGranularities]),
    requiredProfileScopes: Object.freeze([...definition.requiredProfileScopes]),
    optionalProfileScopes: Object.freeze([...definition.optionalProfileScopes]),
    allowedMemoryScopes: Object.freeze([...definition.allowedMemoryScopes]),
  });
}

export function createAgentRegistry(
  qimenAttestation?: unknown,
): readonly AgentDefinition[] {
  const qimenAvailability =
    evaluateQimenAvailability(qimenAttestation).availability;

  return Object.freeze(
    agentOrder.map((agentId) => {
      const definition = definitionsById[agentId];
      if (
        definition.role === "domain" &&
        definition.calculationCore === "qimen-core"
      ) {
        return freezeDefinition({
          ...definition,
          availability: qimenAvailability,
        });
      }
      return freezeDefinition(definition);
    }),
  );
}

export const agentRegistry: readonly AgentDefinition[] = createAgentRegistry();

export function getAgentDefinition(
  agentId: string,
): AgentDefinition | undefined {
  return agentRegistry.find((agent) => agent.id === agentId);
}
