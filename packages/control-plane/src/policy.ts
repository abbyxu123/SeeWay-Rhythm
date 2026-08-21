import type {
  AgentId,
  MemoryScope,
  ProfileScope,
} from "@seeway/contracts";
import { getAgentDefinition } from "./registry";

export interface ScopeAuthorization<TScope extends string> {
  readonly allowed: readonly TScope[];
  readonly denied: readonly TScope[];
}

interface ContextAuthorizationInput {
  readonly agentId: AgentId;
  readonly requestedScopes: readonly MemoryScope[];
  readonly grantedScopes: readonly MemoryScope[];
}

interface ProfileContextAuthorizationInput {
  readonly agentId: AgentId;
  readonly requestedScopes: readonly ProfileScope[];
  readonly grantedScopes: readonly ProfileScope[];
}

function authorizeScopes<TScope extends string>(
  requestedScopes: readonly TScope[],
  grantedScopes: readonly TScope[],
  agentScopes: readonly TScope[],
): ScopeAuthorization<TScope> {
  const granted = new Set(grantedScopes);
  const declared = new Set(agentScopes);
  const allowed: TScope[] = [];
  const denied: TScope[] = [];

  for (const scope of requestedScopes) {
    if (granted.has(scope) && declared.has(scope)) {
      allowed.push(scope);
    } else {
      denied.push(scope);
    }
  }

  return { allowed, denied };
}

export function authorizeContext({
  agentId,
  requestedScopes,
  grantedScopes,
}: ContextAuthorizationInput): ScopeAuthorization<MemoryScope> {
  const agent = requireAgent(agentId);
  return authorizeScopes(
    requestedScopes,
    grantedScopes,
    agent.allowedMemoryScopes,
  );
}

export function authorizeProfileContext({
  agentId,
  requestedScopes,
  grantedScopes,
}: ProfileContextAuthorizationInput): ScopeAuthorization<ProfileScope> {
  const agent = requireAgent(agentId);
  const declaredScopes = [
    ...agent.requiredProfileScopes,
    ...agent.optionalProfileScopes,
  ];
  return authorizeScopes(requestedScopes, grantedScopes, declaredScopes);
}

export function assertAgentScope(
  agentId: AgentId,
  scope: MemoryScope,
): void {
  const agent = requireAgent(agentId);
  if (!agent.allowedMemoryScopes.includes(scope)) {
    throw new Error(`Agent ${agentId} is not allowed to access ${scope} memory.`);
  }
}

export type PersistenceDisposition =
  | "once"
  | "save_timeline"
  | "bookmark"
  | "add_note";

export interface PersistenceOperation {
  readonly type: Exclude<PersistenceDisposition, "once">;
  readonly scope: "timeline";
}

export interface PersistenceAuthorization {
  readonly allowed: boolean;
  readonly operations: readonly PersistenceOperation[];
  readonly deniedScopes: readonly MemoryScope[];
}

interface PersistenceAuthorizationInput {
  readonly disposition: PersistenceDisposition;
  readonly grantedScopes: readonly MemoryScope[];
}

export function authorizePersistence({
  disposition,
  grantedScopes,
}: PersistenceAuthorizationInput): PersistenceAuthorization {
  if (disposition === "once") {
    return { allowed: true, operations: [], deniedScopes: [] };
  }

  if (!grantedScopes.includes("timeline")) {
    return {
      allowed: false,
      operations: [],
      deniedScopes: ["timeline"],
    };
  }

  return {
    allowed: true,
    operations: [{ type: disposition, scope: "timeline" }],
    deniedScopes: [],
  };
}

function requireAgent(agentId: AgentId) {
  const agent = getAgentDefinition(agentId);
  if (!agent) {
    throw new Error(`Unknown Agent: ${agentId}`);
  }
  return agent;
}
