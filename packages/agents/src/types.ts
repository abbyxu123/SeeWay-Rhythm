import type {
  AgentReport,
  MemoryScope,
  ProfileScope,
} from "@seeway/contracts";
import type {
  DeepReadonly,
  DomainAgentDefinition,
} from "@seeway/control-plane";

export interface AuthorizedContext {
  readonly profileScopes: readonly ProfileScope[];
  readonly memoryScopes: readonly MemoryScope[];
}

export interface DomainAgent {
  readonly definition: DomainAgentDefinition;
  execute(
    request: unknown,
    context: AuthorizedContext,
  ): Promise<DeepReadonly<AgentReport>>;
}

export interface AgentClockOptions {
  readonly clock: () => Date;
}
