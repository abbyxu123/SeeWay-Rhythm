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

  for (const scope of new Set(requestedScopes)) {
    if (granted.has(scope) && declared.has(scope)) {
      allowed.push(scope);
    } else {
      denied.push(scope);
    }
  }

  return Object.freeze({
    allowed: Object.freeze(allowed),
    denied: Object.freeze(denied),
  });
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
  readonly reasonCode?: "UNKNOWN_DISPOSITION";
}

interface PersistenceAuthorizationInput {
  readonly agentId: AgentId;
  readonly disposition: PersistenceDisposition;
  readonly grantedScopes: readonly MemoryScope[];
}

const PersistenceDispositions = new Set<string>([
  "once",
  "save_timeline",
  "bookmark",
  "add_note",
]);

export function authorizePersistence({
  agentId,
  disposition,
  grantedScopes,
}: PersistenceAuthorizationInput): PersistenceAuthorization {
  const agent = requireAgent(agentId);

  if (!PersistenceDispositions.has(disposition)) {
    return freezePersistenceAuthorization({
      allowed: false,
      operations: [],
      deniedScopes: [],
      reasonCode: "UNKNOWN_DISPOSITION",
    });
  }

  if (disposition === "once") {
    return freezePersistenceAuthorization({
      allowed: true,
      operations: [],
      deniedScopes: [],
    });
  }

  if (
    !grantedScopes.includes("timeline") ||
    !agent.allowedMemoryScopes.includes("timeline")
  ) {
    return freezePersistenceAuthorization({
      allowed: false,
      operations: [],
      deniedScopes: ["timeline"],
    });
  }

  return freezePersistenceAuthorization({
    allowed: true,
    operations: [{ type: disposition, scope: "timeline" }],
    deniedScopes: [],
  });
}

function freezePersistenceAuthorization(
  authorization: PersistenceAuthorization,
): PersistenceAuthorization {
  const operations = authorization.operations.map((operation) =>
    Object.freeze({ ...operation }),
  );
  const frozen = {
    ...authorization,
    operations: Object.freeze(operations),
    deniedScopes: Object.freeze([...authorization.deniedScopes]),
  };
  return Object.freeze(frozen);
}

function requireAgent(agentId: AgentId) {
  const agent = getAgentDefinition(agentId);
  if (!agent) {
    throw new Error(`Unknown Agent: ${agentId}`);
  }
  return agent;
}
