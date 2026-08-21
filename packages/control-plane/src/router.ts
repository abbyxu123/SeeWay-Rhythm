import {
  AgentIdSchema,
  AgentRequestSchema,
  ProfileScopeSchema,
  type AgentId,
  type IntentCategory,
  type ProfileScope,
} from "@seeway/contracts";
import { z } from "zod";
import {
  getAgentDefinition,
  type AgentAvailability,
} from "./registry";

export type DomainAgentId = Exclude<AgentId, "orchestrator">;
export type RoutingStatus = "ready" | "needs_input" | "unavailable";

const DomainAgentIdSchema = AgentIdSchema.exclude(["orchestrator"]);
const NonEmptyStringSchema = z.string().trim().min(1);

export const RouteRequestInputSchema = AgentRequestSchema.extend({
  instrument: NonEmptyStringSchema.optional(),
  investmentHorizon: NonEmptyStringSchema.optional(),
  enabledSupportingAgentIds: z.array(DomainAgentIdSchema).optional(),
}).strict();

export type RouteRequestInput = z.infer<typeof RouteRequestInputSchema>;

export interface SupportingAgentState {
  readonly availability: AgentAvailability;
  readonly requiredProfileScopes: readonly ProfileScope[];
  readonly missingProfileScopes: readonly ProfileScope[];
  readonly executable: boolean;
}

export interface RoutingDecision {
  readonly primaryAgentId: DomainAgentId;
  readonly primaryReason: string;
  readonly selectedSupportingAgentIds: readonly DomainAgentId[];
  readonly supportingAgentIds: readonly DomainAgentId[];
  readonly supportingReasons: Readonly<Partial<Record<DomainAgentId, string>>>;
  readonly supportingAgentStates: Readonly<
    Partial<Record<DomainAgentId, SupportingAgentState>>
  >;
  readonly optionalAgentIds: readonly DomainAgentId[];
  readonly optionalReasons: Readonly<Partial<Record<DomainAgentId, string>>>;
  readonly optionalAgentStates: Readonly<
    Partial<Record<DomainAgentId, SupportingAgentState>>
  >;
  readonly requiredInputs: readonly string[];
  readonly availability: AgentAvailability;
  readonly status: RoutingStatus;
}

const AgentAvailabilitySchema = z.enum(["available", "unverified"]);
const RoutingStatusSchema = z.enum(["ready", "needs_input", "unavailable"]);
const SupportingAgentStateSchema = z
  .object({
    availability: AgentAvailabilitySchema,
    requiredProfileScopes: z.array(ProfileScopeSchema),
    missingProfileScopes: z.array(ProfileScopeSchema),
    executable: z.boolean(),
  })
  .strict();

export const RoutingDecisionSchema = z
  .object({
    primaryAgentId: DomainAgentIdSchema,
    primaryReason: NonEmptyStringSchema,
    selectedSupportingAgentIds: z.array(DomainAgentIdSchema),
    supportingAgentIds: z.array(DomainAgentIdSchema),
    supportingReasons: z.partialRecord(
      DomainAgentIdSchema,
      NonEmptyStringSchema,
    ),
    supportingAgentStates: z.partialRecord(
      DomainAgentIdSchema,
      SupportingAgentStateSchema,
    ),
    optionalAgentIds: z.array(DomainAgentIdSchema),
    optionalReasons: z.partialRecord(
      DomainAgentIdSchema,
      NonEmptyStringSchema,
    ),
    optionalAgentStates: z.partialRecord(
      DomainAgentIdSchema,
      SupportingAgentStateSchema,
    ),
    requiredInputs: z.array(NonEmptyStringSchema),
    availability: AgentAvailabilitySchema,
    status: RoutingStatusSchema,
  })
  .strict();

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

export function routeRequest(rawInput: unknown): RoutingDecision {
  const input = RouteRequestInputSchema.parse(rawInput);
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

  const selectedSupportingAgentIds = optionalCandidates.filter((agentId) =>
    enabledAgents.has(agentId),
  );
  const optionalAgentIds = optionalCandidates.filter(
    (agentId) => !enabledAgents.has(agentId),
  );
  const supportingAgentStates = createAgentStates(
    selectedSupportingAgentIds,
    input.profileScopes,
    true,
  );
  const optionalAgentStates = createAgentStates(
    optionalAgentIds,
    input.profileScopes,
    false,
  );
  const supportingAgentIds = selectedSupportingAgentIds.filter(
    (agentId) => supportingAgentStates[agentId]?.executable,
  );
  const supportingReasons = createReasonMap(
    selectedSupportingAgentIds,
    supportingAgentStates,
    true,
  );
  const optionalReasons = createReasonMap(
    optionalAgentIds,
    optionalAgentStates,
    false,
  );

  return Object.freeze({
    primaryAgentId,
    primaryReason: input.requestedAgent !== undefined
      ? `The user explicitly selected ${primaryAgentId}.`
      : `The ${input.category} category maps to ${primaryAgentId}.`,
    selectedSupportingAgentIds: Object.freeze(selectedSupportingAgentIds),
    supportingAgentIds: Object.freeze(supportingAgentIds),
    supportingReasons,
    supportingAgentStates,
    optionalAgentIds: Object.freeze(optionalAgentIds),
    optionalReasons,
    optionalAgentStates,
    requiredInputs: Object.freeze([...requiredInputs]),
    availability: primaryAgent.availability,
    status:
      requiredInputs.length > 0
        ? "needs_input"
        : primaryAgent.availability === "unverified"
          ? "unavailable"
          : "ready",
  });
}

function choosePrimary(input: RouteRequestInput): DomainAgentId {
  if (input.requestedAgent === undefined) {
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

function createAgentStates(
  agentIds: readonly DomainAgentId[],
  grantedProfileScopes: readonly ProfileScope[],
  selected: boolean,
): Readonly<Partial<Record<DomainAgentId, SupportingAgentState>>> {
  const granted = new Set(grantedProfileScopes);
  const entries = agentIds.map((agentId) => {
    const agent = requireDomainAgent(agentId);
    const requiredProfileScopes = [...agent.requiredProfileScopes];
    const missingProfileScopes = requiredProfileScopes.filter(
      (scope) => !granted.has(scope),
    );
    const state = Object.freeze({
      availability: agent.availability,
      requiredProfileScopes: Object.freeze(requiredProfileScopes),
      missingProfileScopes: Object.freeze(missingProfileScopes),
      executable:
        selected &&
        agent.availability === "available" &&
        missingProfileScopes.length === 0,
    });
    return [agentId, state] as const;
  });
  return Object.freeze(Object.fromEntries(entries));
}

function createReasonMap(
  agentIds: readonly DomainAgentId[],
  states: Readonly<Partial<Record<DomainAgentId, SupportingAgentState>>>,
  selected: boolean,
): Readonly<Partial<Record<DomainAgentId, string>>> {
  return Object.freeze(
    Object.fromEntries(
      agentIds.map((agentId) => [
        agentId,
        supportReason(agentId, states[agentId], selected),
      ]),
    ),
  );
}

function supportReason(
  agentId: DomainAgentId,
  state: SupportingAgentState | undefined,
  selected: boolean,
): string {
  if (state && state.missingProfileScopes.length > 0) {
    return `${agentId} requires explicit profile grants: ${state.missingProfileScopes.join(", ")}.`;
  }
  if (state?.availability === "unverified") {
    return selected
      ? `${agentId} is selected as context but its calculator is not verified yet.`
      : `${agentId} is an optional context Agent whose calculator is not verified yet.`;
  }
  if (agentId === "bazi-profile") {
    return "Adds an optional personal background layer from granted birth data.";
  }
  if (agentId === "ziwei-timeline") {
    return "Adds an optional long-term timeline background from granted birth data.";
  }
  return `Adds optional context from ${agentId}.`;
}
