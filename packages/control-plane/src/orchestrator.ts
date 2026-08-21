import {
  AgentReportSchema,
  AgentRequestSchema,
  type AgentRequest,
  type AgentReport,
  type MemoryScope,
  type ProfileScope,
} from "@seeway/contracts";
import { z } from "zod";
import { authorizeContext, authorizePersistence, authorizeProfileContext } from "./policy";
import { presentAgentReports, type PresentedResult } from "./presenter";
import {
  agentRegistry,
  getAgentDefinition,
  type DomainAgentDefinition,
} from "./registry";
import {
  routeRequest,
  RoutingDecisionSchema,
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
  readonly trustedDefinitions?: readonly DomainAgentDefinition[];
  readonly clock: () => Date;
  readonly router?: (request: unknown) => RoutingDecision;
  readonly agentTimeoutMs?: number;
}

export function createOrchestrator({
  agents,
  trustedDefinitions = canonicalDomainDefinitions(),
  clock,
  router = routeRequest,
  agentTimeoutMs = 10_000,
}: OrchestratorOptions): Orchestrator {
  if (!Number.isFinite(agentTimeoutMs) || agentTimeoutMs <= 0) {
    throw new Error("Agent timeout must be a positive finite number.");
  }
  const trustedDefinitionsById = createTrustedDefinitionMap(trustedDefinitions);
  const agentsById = createAgentMap(agents, trustedDefinitionsById);

  return Object.freeze({
    async execute(rawRequest: unknown): Promise<OrchestrationOutcome> {
      const request = OrchestrationRequestSchema.parse(rawRequest);
      const { disposition, ...routeInput } = request;
      const routing = deepFreeze(
        RoutingDecisionSchema.parse(router(routeInput)),
      );
      assertTrustedRouting(request, routing, trustedDefinitionsById);
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
      const primaryReport = validateAgentReport(
        await executeAgentSafely(
          primaryAgent,
          createPrimaryAgentRequest(
            request,
            routing.primaryAgentId,
            primaryContext,
          ),
          primaryContext,
          clock,
          agentTimeoutMs,
        ),
        primaryAgent.definition,
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
          validateAgentReport(
            await executeAgentSafely(
              agent,
              createSupportingAgentRequest(request, agent.definition, context),
              context,
              clock,
              agentTimeoutMs,
            ),
            agent.definition,
          ),
        );
        executedAgentIds.push(agentId);
      }

      const presentation = presentAgentReports(
        primaryReport,
        supportingReports,
      );
      const persistence = authorizeCombinedPersistence({
        agentIds: executedAgentIds,
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

interface BoundExecutableAgent {
  readonly definition: DomainAgentDefinition;
  readonly executor: ExecutableDomainAgent;
}

function canonicalDomainDefinitions(): readonly DomainAgentDefinition[] {
  return agentRegistry.filter(
    (definition): definition is DomainAgentDefinition =>
      definition.role === "domain",
  );
}

function createTrustedDefinitionMap(
  definitions: readonly DomainAgentDefinition[],
): ReadonlyMap<DomainAgentId, DomainAgentDefinition> {
  const map = new Map<DomainAgentId, DomainAgentDefinition>();
  for (const definition of definitions) {
    const canonical = getAgentDefinition(definition.id);
    if (
      !canonical ||
      canonical.role !== "domain" ||
      !sameDefinition(canonical, definition, false)
    ) {
      throw new Error(
        `Trusted definition for ${definition.id} differs from the canonical registry.`,
      );
    }
    if (map.has(definition.id)) {
      throw new Error(`Duplicate trusted Agent definition: ${definition.id}.`);
    }
    map.set(definition.id, definition);
  }
  return map;
}

function createAgentMap(
  agents: readonly ExecutableDomainAgent[],
  trustedDefinitions: ReadonlyMap<DomainAgentId, DomainAgentDefinition>,
): ReadonlyMap<DomainAgentId, BoundExecutableAgent> {
  const map = new Map<DomainAgentId, BoundExecutableAgent>();
  for (const agent of agents) {
    if (map.has(agent.definition.id)) {
      throw new Error(`Duplicate executable Agent: ${agent.definition.id}.`);
    }
    const trusted = trustedDefinitions.get(agent.definition.id);
    if (!trusted || !sameDefinition(agent.definition, trusted, true)) {
      throw new Error(
        `Executable Agent ${agent.definition.id} does not match its trusted definition.`,
      );
    }
    map.set(
      agent.definition.id,
      Object.freeze({ definition: trusted, executor: agent }),
    );
  }
  return map;
}

function requireAgent(
  agents: ReadonlyMap<DomainAgentId, BoundExecutableAgent>,
  agentId: DomainAgentId,
): BoundExecutableAgent {
  const agent = agents.get(agentId);
  if (!agent) {
    throw new Error(`No executable Agent registered for ${agentId}.`);
  }
  return agent;
}

function assertTrustedRouting(
  request: OrchestrationRequest,
  routing: RoutingDecision,
  trustedDefinitions: ReadonlyMap<DomainAgentId, DomainAgentDefinition>,
): void {
  const primary = trustedDefinitions.get(routing.primaryAgentId);
  if (!primary) {
    throw new Error(
      `Routing selected untrusted primary Agent ${routing.primaryAgentId}.`,
    );
  }
  if (routing.availability !== primary.availability) {
    throw new Error(
      `Routing availability for ${primary.id} differs from its trusted definition.`,
    );
  }

  const enabled = new Set(request.enabledSupportingAgentIds ?? []);
  const selected = new Set(routing.selectedSupportingAgentIds);
  const seen = new Set<DomainAgentId>();
  for (const agentId of routing.supportingAgentIds) {
    if (seen.has(agentId)) {
      throw new Error(`Routing duplicated supporting Agent ${agentId}.`);
    }
    seen.add(agentId);
    if (!trustedDefinitions.has(agentId)) {
      throw new Error(`Routing selected untrusted supporting Agent ${agentId}.`);
    }
    if (!selected.has(agentId)) {
      throw new Error(
        `Supporting Agent ${agentId} was not selected by the routing decision.`,
      );
    }
    if (!enabled.has(agentId)) {
      throw new Error(
        `Supporting Agent ${agentId} was not explicitly enabled by the user.`,
      );
    }
  }
}

function sameDefinition(
  left: DomainAgentDefinition,
  right: DomainAgentDefinition,
  compareAvailability: boolean,
): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.calculationCore === right.calculationCore &&
    (!compareAvailability || left.availability === right.availability) &&
    sameValues(left.capabilities, right.capabilities) &&
    sameValues(left.timeGranularities, right.timeGranularities) &&
    sameValues(left.requiredProfileScopes, right.requiredProfileScopes) &&
    sameValues(left.optionalProfileScopes, right.optionalProfileScopes) &&
    sameValues(left.allowedMemoryScopes, right.allowedMemoryScopes)
  );
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function validateAgentReport(
  rawReport: unknown,
  definition: DomainAgentDefinition,
): AgentReport {
  const report = AgentReportSchema.parse(rawReport);
  if (report.agentId !== definition.id) {
    throw new Error(
      `Agent ${definition.id} returned ${report.agentId} instead of its own identity.`,
    );
  }
  if (
    definition.availability === "unverified" &&
    report.status !== "unsupported"
  ) {
    throw new Error(
      `Unverified Agent ${definition.id} must return unsupported.`,
    );
  }
  return report;
}

function authorizeCombinedPersistence({
  agentIds,
  disposition,
  grantedScopes,
}: {
  readonly agentIds: readonly DomainAgentId[];
  readonly disposition: z.infer<typeof PersistenceDispositionSchema>;
  readonly grantedScopes: readonly MemoryScope[];
}): ReturnType<typeof authorizePersistence> {
  const authorizations = agentIds.map((agentId) =>
    authorizePersistence({ agentId, disposition, grantedScopes }),
  );
  const deniedScopes = [
    ...new Set(authorizations.flatMap((item) => item.deniedScopes)),
  ];
  if (authorizations.some((item) => !item.allowed)) {
    return deepFreeze({
      allowed: false,
      operations: [],
      deniedScopes,
    });
  }
  return deepFreeze({
    allowed: true,
    operations: authorizations[0]?.operations ?? [],
    deniedScopes: [],
  });
}

async function executeAgentSafely(
  agent: BoundExecutableAgent,
  request: AgentRequest,
  context: AuthorizedAgentContext,
  clock: () => Date,
  timeoutMs: number,
): Promise<unknown> {
  try {
    return await withTimeout(
      agent.executor.execute(request, context),
      timeoutMs,
    );
  } catch {
    return AgentReportSchema.parse({
      agentId: agent.definition.id,
      agentVersion: "control-plane-1.0.0",
      status: "error",
      evidence: [],
      conflicts: [],
      requiredInputs: [],
      ruleVersion: `${agent.definition.calculationCore}-execution-boundary`,
      generatedAt: clock().toISOString(),
      errorCode: "AGENT_EXECUTION_FAILED",
      message: "Agent execution failed.",
    });
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error("Agent execution timed out.")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
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
  context: AuthorizedAgentContext,
): AgentRequest {
  return baseAgentRequest(request, {
    requestId: request.requestId,
    category: request.category,
    intent: request.intent,
    requestedAgent: primaryAgentId,
  }, context, true);
}

function createSupportingAgentRequest(
  request: OrchestrationRequest,
  definition: DomainAgentDefinition,
  context: AuthorizedAgentContext,
): AgentRequest {
  const category = definition.capabilities[0];
  if (!category) {
    throw new Error(`Supporting Agent ${definition.id} has no capability.`);
  }
  return baseAgentRequest(request, {
    requestId: `${request.requestId}:support:${definition.id}`,
    category,
    intent: `Provide ${definition.id} background for the primary Agent.`,
    requestedAgent: definition.id,
  }, context, false);
}

function baseAgentRequest(
  request: OrchestrationRequest,
  overrides: Pick<
    AgentRequest,
    "requestId" | "category" | "intent" | "requestedAgent"
  >,
  context: AuthorizedAgentContext,
  includePrimaryTaskData: boolean,
): AgentRequest {
  return AgentRequestSchema.parse({
    requestId: overrides.requestId,
    intent: overrides.intent,
    category: overrides.category,
    questionTime: request.questionTime,
    ...(request.targetTime !== undefined
      ? { targetTime: request.targetTime }
      : {}),
    timezone: request.timezone,
    ...(context.profileScopes.includes("current-location") &&
    request.location !== undefined
      ? { location: request.location }
      : {}),
    ...(includePrimaryTaskData && request.actors !== undefined
      ? { actors: request.actors }
      : {}),
    ...(includePrimaryTaskData && request.instrument !== undefined
      ? { instrument: request.instrument }
      : {}),
    ...(includePrimaryTaskData && request.investmentHorizon !== undefined
      ? { investmentHorizon: request.investmentHorizon }
      : {}),
    profileScopes: context.profileScopes,
    memoryScopes: context.memoryScopes,
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
