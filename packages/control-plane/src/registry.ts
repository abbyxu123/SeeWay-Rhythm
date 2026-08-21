import type {
  AgentId,
  IntentCategory,
  MemoryScope,
  ProfileScope,
} from "@seeway/contracts";

export type AgentRole = "orchestrator" | "domain";
export type AgentAvailability = "available" | "unverified";
export type TimeGranularity =
  | "period"
  | "question"
  | "day"
  | "month"
  | "year"
  | "lifetime"
  | "market-session";

export interface AgentDefinition {
  readonly id: AgentId;
  readonly role: AgentRole;
  readonly capabilities: readonly IntentCategory[];
  readonly timeGranularities: readonly TimeGranularity[];
  readonly calculationCore: string | null;
  readonly requiredProfileScopes: readonly ProfileScope[];
  readonly optionalProfileScopes: readonly ProfileScope[];
  readonly allowedMemoryScopes: readonly MemoryScope[];
  readonly availability: AgentAvailability;
}

const definitions = [
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
    allowedMemoryScopes: [
      "preferences",
      "timeline",
      "career",
      "relationship",
    ],
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
] as const satisfies readonly AgentDefinition[];

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

export const agentRegistry: readonly AgentDefinition[] = Object.freeze(
  definitions.map(freezeDefinition),
);

export function getAgentDefinition(
  agentId: string,
): AgentDefinition | undefined {
  return agentRegistry.find((agent) => agent.id === agentId);
}
