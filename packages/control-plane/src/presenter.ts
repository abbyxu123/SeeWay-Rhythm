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

export interface PresentedResult {
  readonly primary: AgentReport;
  readonly supporting: readonly AgentReport[];
  readonly relationships: readonly RelationshipReport[];
  readonly overallStatus: AgentReport["status"];
}

export function presentAgentReports(
  rawPrimary: unknown,
  rawSupporting: readonly unknown[],
): PresentedResult {
  const primary = deepFreeze(AgentReportSchema.parse(rawPrimary));
  const supporting = Object.freeze(
    rawSupporting.map((report) =>
      deepFreeze(AgentReportSchema.parse(report)),
    ),
  );
  const relationships = Object.freeze(
    supporting.map((report) => deepFreeze(relationshipFor(primary, report))),
  );

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
    evidenceIds:
      relationship === "conflict"
        ? uniqueEvidenceIds(primary, supporting)
        : supporting.evidence.map((item) => item.evidenceId),
  };
}

function compareCompleteReports(
  primary: CompleteAgentReport,
  supporting: CompleteAgentReport,
): Exclude<AgentRelationship, "unavailable"> {
  if (hasUnresolvedConflict(primary) || hasUnresolvedConflict(supporting)) {
    return "conflict";
  }

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

function hasUnresolvedConflict(report: CompleteAgentReport): boolean {
  return report.conflicts.some(
    (conflict) => conflict.resolution === "unresolved",
  );
}

function uniqueEvidenceIds(
  primary: CompleteAgentReport,
  supporting: CompleteAgentReport,
): string[] {
  return [
    ...new Set([
      ...primary.evidence.map((item) => item.evidenceId),
      ...supporting.evidence.map((item) => item.evidenceId),
    ]),
  ];
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
