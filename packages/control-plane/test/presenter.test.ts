import type {
  AgentId,
  CompleteAgentReport,
  Tendency,
  UnsupportedAgentReport,
} from "@seeway/contracts";
import { describe, expect, it } from "vitest";
import { presentAgentReports } from "@seeway/control-plane";

function completeReport(
  agentId: AgentId,
  tendency: Tendency,
  evidenceId: string,
): CompleteAgentReport {
  return {
    agentId,
    agentVersion: "0.1.0",
    status: "complete" as const,
    conclusion: {
      favorable:
        tendency === "favorable"
          ? [{ text: "focused work", evidenceIds: [evidenceId] }]
          : [],
      cautions:
        tendency === "caution"
          ? [{ text: "verbal commitments", evidenceIds: [evidenceId] }]
          : [],
      action: {
        text: "Keep the decision traceable.",
        evidenceIds: [evidenceId],
      },
      tendency,
    },
    evidence: [
      {
        evidenceId,
        ruleId: "TEST-RULE-001",
        ruleVersion: "test-0.1.0",
        sourceId: "test-source",
        factPath: "chart.test",
        explanation: "A verified test rule matched the chart fixture.",
      },
    ],
    conflicts: [],
    requiredInputs: [],
    ruleVersion: "test-0.1.0",
    generatedAt: "2026-08-21T12:00:00.000Z",
  };
}

function unsupportedReport(agentId: AgentId): UnsupportedAgentReport {
  return {
    agentId,
    agentVersion: "0.1.0",
    status: "unsupported" as const,
    evidence: [],
    conflicts: [],
    requiredInputs: [],
    ruleVersion: "unavailable-0.1.0",
    generatedAt: "2026-08-21T12:00:00.000Z",
    reasonCode: "CALCULATOR_NOT_VERIFIED",
    reason: "The calculator has not passed golden cases.",
    prerequisites: ["verified calculator", "golden cases"],
  };
}

describe("multi-Agent presentation", () => {
  it("keeps the primary conclusion primary and retains reports separately", () => {
    const primary = completeReport("qimen-finance", "favorable", "ev-primary");
    const supporting = completeReport("bazi-profile", "favorable", "ev-support");
    const result = presentAgentReports(primary, [supporting]);

    if (result.primary.status !== "complete") {
      throw new Error("Expected a complete primary report.");
    }
    expect(result.primary.conclusion).toEqual(primary.conclusion);
    expect(result.supporting).toHaveLength(1);
    expect(result.supporting[0]?.agentId).toBe("bazi-profile");
    expect(result.relationships).toEqual([
      {
        agentId: "bazi-profile",
        relationship: "supports",
        evidenceIds: ["ev-primary", "ev-support"],
      },
    ]);
    expect("conclusion" in result).toBe(false);
    expect("tendency" in result).toBe(false);
  });

  it("marks opposing tendencies as a conflict without averaging them", () => {
    const result = presentAgentReports(
      completeReport("qimen-finance", "favorable", "ev-primary"),
      [completeReport("bazi-profile", "caution", "ev-support")],
    );

    if (result.primary.status !== "complete") {
      throw new Error("Expected a complete primary report.");
    }
    const supportingReport = result.supporting[0];
    if (!supportingReport || supportingReport.status !== "complete") {
      throw new Error("Expected a complete supporting report.");
    }
    expect(result.primary.conclusion.tendency).toBe("favorable");
    expect(supportingReport.conclusion.tendency).toBe("caution");
    expect(result.relationships).toEqual([
      {
        agentId: "bazi-profile",
        relationship: "conflict",
        evidenceIds: ["ev-primary", "ev-support"],
      },
    ]);
  });

  it("marks mixed or insufficient supporting conclusions as modifiers", () => {
    const result = presentAgentReports(
      completeReport("qimen-finance", "favorable", "ev-primary"),
      [
        completeReport("bazi-profile", "mixed", "ev-mixed"),
        completeReport("ziwei-timeline", "insufficient", "ev-insufficient"),
      ],
    );

    expect(result.relationships.map((item) => item.relationship)).toEqual([
      "modifies",
      "modifies",
    ]);
    expect(result.relationships[0]?.evidenceIds).toEqual([
      "ev-primary",
      "ev-mixed",
    ]);
  });

  it("does not turn an internal unresolved conflict into a cross-Agent conflict", () => {
    const primary = completeReport(
      "qimen-finance",
      "favorable",
      "ev-primary",
    );
    primary.conflicts = [
      {
        conflictId: "internal-conflict",
        evidenceIds: ["ev-primary", "ev-internal"],
        explanation: "Two internal rules require later resolution.",
        resolution: "unresolved",
      },
    ];
    primary.evidence.push({
      ...primary.evidence[0]!,
      evidenceId: "ev-internal",
    });

    const result = presentAgentReports(primary, [
      completeReport("bazi-profile", "favorable", "ev-support"),
    ]);

    expect(result.relationships[0]?.relationship).toBe("supports");
    expect(result.primary.conflicts).toHaveLength(1);
  });

  it("does not let unsupported support invalidate a complete primary", () => {
    const result = presentAgentReports(
      completeReport("qimen-finance", "favorable", "ev-primary"),
      [unsupportedReport("bazi-profile")],
    );

    expect(result.overallStatus).toBe("complete");
    expect(result.relationships).toEqual([
      {
        agentId: "bazi-profile",
        relationship: "unavailable",
        evidenceIds: [],
      },
    ]);
  });

  it("returns no fabricated claims when the primary is unsupported", () => {
    const result = presentAgentReports(unsupportedReport("qimen-rhythm"), []);

    expect(result.overallStatus).toBe("unsupported");
    expect("conclusion" in result.primary).toBe(false);
    expect(result.relationships).toEqual([]);
  });

  it("rejects malformed reports at the presentation boundary", () => {
    expect(() =>
      presentAgentReports(
        {
          ...completeReport("qimen-rhythm", "favorable", "ev-primary"),
          evidence: [],
        },
        [],
      ),
    ).toThrow();
  });

  it("rejects duplicate and self-referencing supporting Agents", () => {
    const primary = completeReport(
      "qimen-finance",
      "favorable",
      "ev-primary",
    );
    const support = completeReport(
      "bazi-profile",
      "favorable",
      "ev-support",
    );

    expect(() => presentAgentReports(primary, [support, support])).toThrow(
      /duplicate supporting agent/i,
    );
    expect(() =>
      presentAgentReports(primary, [
        completeReport("qimen-finance", "favorable", "ev-self"),
      ]),
    ).toThrow(/primary agent/i);
  });

  it("rejects duplicate or colliding evidence IDs", () => {
    const duplicateWithinReport = completeReport(
      "qimen-finance",
      "favorable",
      "ev-duplicate",
    );
    duplicateWithinReport.evidence.push({
      ...duplicateWithinReport.evidence[0]!,
    });
    expect(() => presentAgentReports(duplicateWithinReport, [])).toThrow(
      /duplicate evidence id/i,
    );

    expect(() =>
      presentAgentReports(
        completeReport("qimen-finance", "favorable", "ev-collision"),
        [completeReport("bazi-profile", "caution", "ev-collision")],
      ),
    ).toThrow(/duplicate evidence id/i);
  });

  it("returns deeply immutable reports and relationships", () => {
    const result = presentAgentReports(
      completeReport("qimen-finance", "favorable", "ev-primary"),
      [unsupportedReport("bazi-profile")],
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.primary)).toBe(true);
    expect(Object.isFrozen(result.primary.evidence)).toBe(true);
    expect(Object.isFrozen(result.supporting)).toBe(true);
    expect(Object.isFrozen(result.relationships)).toBe(true);
    expect(Object.isFrozen(result.relationships[0])).toBe(true);
    expect(Object.isFrozen(result.relationships[0]?.evidenceIds)).toBe(true);
  });
});
