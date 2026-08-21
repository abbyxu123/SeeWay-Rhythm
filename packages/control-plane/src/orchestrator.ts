import {
  AgentRequestSchema,
  type AgentRequest,
  type AgentReport,
  type MemoryScope,
  type ProfileScope,
} from "@seeway/contracts";
import { z } from "zod";
import { authorizeContext, authorizePersistence, authorizeProfileContext } from "./policy";
import { presentAgentReports, type PresentedResult } from "./presenter";
import type { DomainAgentDefinition } from "./registry";
import {
  routeRequest,
  RouteRequestInputSchema,
  type DomainAgentId,
  type RoutingDecision,
} from "./router";

const PersistenceDispositionSchema = z.enum([
  "once",
  "save_timeline",
  "bookmark",
  "add_note",
]);

export const OrchestrationRequestSchema = RouteRequestInputSchema.extend({
  disposition: PersistenceDispositionSchema.default("once"),
}).strict();

export type OrchestrationRequest = z.infer<typeof OrchestrationRequestSchema>;

export interface ExecutableDomainAgent {
  readonly definition: DomainAgentDefinition;
  execute(request: unknown, context: AuthorizedAgentContext): Promise<unknown>;
}

export interface AuthorizedAgentContext {
  readonly profileScopes: readonly ProfileScope[];
  readonly memoryScopes: readonly MemoryScope[];
}

export interface OrchestrationAudit {
  readonly requestId: string;
  readonly primaryAgentId: DomainAgentId;
  readonly executedAgentIds: readonly DomainAgentId[];
  readonly profileScopesByAgent: Readonly<
    Partial<Record<DomainAgentId, readonly ProfileScope[]>>
  >;
  readonly memoryScopesByAgent: Readonly<
    Partial<Record<DomainAgentId, readonly MemoryScope[]>>
  >;
  readonly generatedAt: string;
}

export interface ClarificationOutcome {
  readonly kind: "clarification";
  readonly status: "needs_input";
  readonly routing: RoutingDecision;
  readonly clarification: {
    readonly field: string;
    readonly prompt: string;
  };
  readonly audit: OrchestrationAudit;
}

export interface ResultOutcome {
  readonly kind: "result";
  readonly status: AgentReport["status"];
  readonly routing: RoutingDecision;
  readonly presentation: PresentedResult;
  readonly persistence: ReturnType<typeof authorizePersistence>;
  readonly audit: OrchestrationAudit;
}

export type OrchestrationOutcome = ClarificationOutcome | ResultOutcome;

export interface Orchestrator {
  execute(request: unknown): Promise<OrchestrationOutcome>;
}

interface OrchestratorOptions {
  readonly agents: readonly ExecutableDomainAgent[];
  readonly clock: () => Date;
  readonly router?: (request: unknown) => RoutingDecision;
}

export function createOrchestrator({
  agents,
  clock,
  router = routeRequest,
}: OrchestratorOptions): Orchestrator {
  const agentsById = createAgentMap(agents);

  return Object.freeze({
    async execute(rawRequest: unknown): Promise<OrchestrationOutcome> {
      const request = OrchestrationRequestSchema.parse(rawRequest);
      const { disposition, ...routeInput } = request;
      const routing = deepFreeze(router(routeInput));
      const emptyAudit = () =>
        createAudit(request.requestId, routing.primaryAgentId, [], {}, {}, clock);

      const routingInput = routing.requiredInputs[0];
      if (routingInput) {
        return deepFreeze({
          kind: "clarification" as const,
          status: "needs_input" as const,
          routing,
          clarification: {
            field: routingInput,
            prompt: clarificationPrompt(routingInput),
          },
          audit: emptyAudit(),
        });
      }

      const primaryAgent = requireAgent(agentsById, routing.primaryAgentId);
      const missingPrimaryProfile = firstMissingRequiredProfile(
        primaryAgent.definition,
        request.profileScopes,
      );
      if (missingPrimaryProfile) {
        const field = `profile:${missingPrimaryProfile}`;
        return deepFreeze({
          kind: "clarification" as const,
          status: "needs_input" as const,
          routing,
          clarification: {
            field,
            prompt: clarificationPrompt(field),
          },
          audit: emptyAudit(),
        });
      }

      const executedAgentIds: DomainAgentId[] = [];
      const profileScopesByAgent: Partial<
        Record<DomainAgentId, readonly ProfileScope[]>
      > = {};
      const memoryScopesByAgent: Partial<
        Record<DomainAgentId, readonly MemoryScope[]>
      > = {};

      const primaryContext = authorizeAgentContext(
        primaryAgent.definition,
        request.profileScopes,
        request.memoryScopes,
      );
      recordContext(
        routing.primaryAgentId,
        primaryContext,
        profileScopesByAgent,
        memoryScopesByAgent,
      );
      const primaryReport = await primaryAgent.execute(
        createPrimaryAgentRequest(request, routing.primaryAgentId),
        primaryContext,
      );
      executedAgentIds.push(routing.primaryAgentId);

      const supportingReports: unknown[] = [];
      for (const agentId of routing.supportingAgentIds) {
        const agent = requireAgent(agentsById, agentId);
        if (agent.definition.availability !== "available") {
          throw new Error(
            `Supporting Agent ${agentId} is not available for execution.`,
          );
        }
        const missingProfile = firstMissingRequiredProfile(
          agent.definition,
          request.profileScopes,
        );
        if (missingProfile) {
          throw new Error(
            `Supporting Agent ${agentId} is missing ${missingProfile}.`,
          );
        }
        const context = authorizeAgentContext(
          agent.definition,
          request.profileScopes,
          request.memoryScopes,
        );
        recordContext(
          agentId,
          context,
          profileScopesByAgent,
          memoryScopesByAgent,
        );
        supportingReports.push(
          await agent.execute(
            createSupportingAgentRequest(request, agent.definition),
            context,
          ),
        );
        executedAgentIds.push(agentId);
      }

      const presentation = presentAgentReports(
        primaryReport,
        supportingReports,
      );
      const persistence = authorizePersistence({
        agentId: routing.primaryAgentId,
        disposition,
        grantedScopes: request.memoryScopes,
      });
      const audit = createAudit(
        request.requestId,
        routing.primaryAgentId,
        executedAgentIds,
        profileScopesByAgent,
        memoryScopesByAgent,
        clock,
      );

      return deepFreeze({
        kind: "result" as const,
        status: presentation.overallStatus,
        routing,
        presentation,
        persistence,
        audit,
      });
    },
  });
}

function createAgentMap(
  agents: readonly ExecutableDomainAgent[],
): ReadonlyMap<DomainAgentId, ExecutableDomainAgent> {
  const map = new Map<DomainAgentId, ExecutableDomainAgent>();
  for (const agent of agents) {
    if (map.has(agent.definition.id)) {
      throw new Error(`Duplicate executable Agent: ${agent.definition.id}.`);
    }
    map.set(agent.definition.id, agent);
  }
  return map;
}

function requireAgent(
  agents: ReadonlyMap<DomainAgentId, ExecutableDomainAgent>,
  agentId: DomainAgentId,
): ExecutableDomainAgent {
  const agent = agents.get(agentId);
  if (!agent) {
    throw new Error(`No executable Agent registered for ${agentId}.`);
  }
  return agent;
}

function firstMissingRequiredProfile(
  definition: DomainAgentDefinition,
  grantedScopes: readonly ProfileScope[],
): ProfileScope | undefined {
  const granted = new Set(grantedScopes);
  return definition.requiredProfileScopes.find((scope) => !granted.has(scope));
}

function authorizeAgentContext(
  definition: DomainAgentDefinition,
  grantedProfileScopes: readonly ProfileScope[],
  grantedMemoryScopes: readonly MemoryScope[],
): AuthorizedAgentContext {
  const requestedProfiles = [
    ...definition.requiredProfileScopes,
    ...definition.optionalProfileScopes.filter((scope) =>
      grantedProfileScopes.includes(scope),
    ),
  ];
  const profiles = authorizeProfileContext({
    agentId: definition.id,
    requestedScopes: requestedProfiles,
    grantedScopes: grantedProfileScopes,
  });
  const memory = authorizeContext({
    agentId: definition.id,
    requestedScopes: grantedMemoryScopes,
    grantedScopes: grantedMemoryScopes,
  });
  return deepFreeze({
    profileScopes: profiles.allowed,
    memoryScopes: memory.allowed,
  });
}

function createPrimaryAgentRequest(
  request: OrchestrationRequest,
  primaryAgentId: DomainAgentId,
): AgentRequest {
  return baseAgentRequest(request, {
    requestId: request.requestId,
    category: request.category,
    intent: request.intent,
    requestedAgent: primaryAgentId,
  });
}

function createSupportingAgentRequest(
  request: OrchestrationRequest,
  definition: DomainAgentDefinition,
): AgentRequest {
  const category = definition.capabilities[0];
  if (!category) {
    throw new Error(`Supporting Agent ${definition.id} has no capability.`);
  }
  return baseAgentRequest(request, {
    requestId: `${request.requestId}:support:${definition.id}`,
    category,
    intent: `Provide ${definition.id} context for: ${request.intent}`,
    requestedAgent: definition.id,
  });
}

function baseAgentRequest(
  request: OrchestrationRequest,
  overrides: Pick<
    AgentRequest,
    "requestId" | "category" | "intent" | "requestedAgent"
  >,
): AgentRequest {
  return AgentRequestSchema.parse({
    requestId: overrides.requestId,
    intent: overrides.intent,
    category: overrides.category,
    questionTime: request.questionTime,
    targetTime: request.targetTime,
    timezone: request.timezone,
    location: request.location,
    actors: request.actors,
    profileScopes: request.profileScopes,
    memoryScopes: request.memoryScopes,
    requestedAgent: overrides.requestedAgent,
  });
}

function recordContext(
  agentId: DomainAgentId,
  context: AuthorizedAgentContext,
  profiles: Partial<Record<DomainAgentId, readonly ProfileScope[]>>,
  memory: Partial<Record<DomainAgentId, readonly MemoryScope[]>>,
): void {
  profiles[agentId] = context.profileScopes;
  memory[agentId] = context.memoryScopes;
}

function createAudit(
  requestId: string,
  primaryAgentId: DomainAgentId,
  executedAgentIds: readonly DomainAgentId[],
  profileScopesByAgent: Partial<
    Record<DomainAgentId, readonly ProfileScope[]>
  >,
  memoryScopesByAgent: Partial<
    Record<DomainAgentId, readonly MemoryScope[]>
  >,
  clock: () => Date,
): OrchestrationAudit {
  return deepFreeze({
    requestId,
    primaryAgentId,
    executedAgentIds: [...executedAgentIds],
    profileScopesByAgent: { ...profileScopesByAgent },
    memoryScopesByAgent: { ...memoryScopesByAgent },
    generatedAt: clock().toISOString(),
  });
}

function clarificationPrompt(field: string): string {
  const prompts: Record<string, string> = {
    instrument: "Which instrument or market should be analyzed?",
    investmentHorizon: "What investment horizon should be used?",
    "profile:current-location": "Allow the current location for this request?",
    "profile:birth-data": "Allow birth data for this request?",
    "profile:finance-profile": "Allow the finance profile for this request?",
  };
  return prompts[field] ?? `Provide ${field}.`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
