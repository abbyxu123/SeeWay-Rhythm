import {
  AgentReportSchema,
  type AgentId,
  type AgentReport,
  type CompleteAgentReport,
} from "@seeway/contracts";

export type AgentRelationship =
  | "supports"
  | "modifies"
  | "conflict"
  | "unavailable";

export interface RelationshipReport {
  readonly agentId: AgentId;
  readonly relationship: AgentRelationship;
  readonly evidenceIds: readonly string[];
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : T extends object
      ? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
      : T;

export interface PresentedResult {
  readonly primary: DeepReadonly<AgentReport>;
  readonly supporting: readonly DeepReadonly<AgentReport>[];
  readonly relationships: readonly RelationshipReport[];
  readonly overallStatus: AgentReport["status"];
}

export function presentAgentReports(
  rawPrimary: unknown,
  rawSupporting: readonly unknown[],
): PresentedResult {
  const parsedPrimary = AgentReportSchema.parse(rawPrimary);
  const parsedSupporting = rawSupporting.map((report) =>
    AgentReportSchema.parse(report),
  );
  assertDistinctAgents(parsedPrimary, parsedSupporting);
  assertUniqueEvidenceIds([parsedPrimary, ...parsedSupporting]);
  const relationships = Object.freeze(
    parsedSupporting.map((report) =>
      deepFreeze(relationshipFor(parsedPrimary, report)),
    ),
  );
  const primary = deepFreeze(parsedPrimary);
  const supporting = Object.freeze(parsedSupporting.map(deepFreeze));

  return Object.freeze({
    primary,
    supporting,
    relationships,
    overallStatus: primary.status,
  });
}

function relationshipFor(
  primary: AgentReport,
  supporting: AgentReport,
): RelationshipReport {
  if (primary.status !== "complete" || supporting.status !== "complete") {
    return {
      agentId: supporting.agentId,
      relationship: "unavailable",
      evidenceIds: [],
    };
  }

  const relationship = compareCompleteReports(primary, supporting);
  return {
    agentId: supporting.agentId,
    relationship,
    evidenceIds: comparisonEvidenceIds(primary, supporting),
  };
}

function compareCompleteReports(
  primary: CompleteAgentReport,
  supporting: CompleteAgentReport,
): Exclude<AgentRelationship, "unavailable"> {
  const primaryTendency = primary.conclusion.tendency;
  const supportingTendency = supporting.conclusion.tendency;
  if (
    (primaryTendency === "favorable" && supportingTendency === "caution") ||
    (primaryTendency === "caution" && supportingTendency === "favorable")
  ) {
    return "conflict";
  }

  if (
    primaryTendency === supportingTendency &&
    (primaryTendency === "favorable" || primaryTendency === "caution")
  ) {
    return "supports";
  }

  return "modifies";
}

function comparisonEvidenceIds(
  primary: CompleteAgentReport,
  supporting: CompleteAgentReport,
): string[] {
  return [
    ...primary.conclusion.tendencyEvidenceIds,
    ...supporting.conclusion.tendencyEvidenceIds,
  ];
}

function assertDistinctAgents(
  primary: AgentReport,
  supporting: readonly AgentReport[],
): void {
  const seen = new Set<AgentId>([primary.agentId]);
  for (const report of supporting) {
    if (report.agentId === primary.agentId) {
      throw new Error(
        `Supporting Agent ${report.agentId} cannot be the primary Agent.`,
      );
    }
    if (seen.has(report.agentId)) {
      throw new Error(`Duplicate supporting Agent: ${report.agentId}.`);
    }
    seen.add(report.agentId);
  }
}

function assertUniqueEvidenceIds(reports: readonly AgentReport[]): void {
  const seen = new Set<string>();
  for (const report of reports) {
    for (const evidence of report.evidence) {
      if (seen.has(evidence.evidenceId)) {
        throw new Error(`Duplicate evidence ID: ${evidence.evidenceId}.`);
      }
      seen.add(evidence.evidenceId);
    }
  }
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
