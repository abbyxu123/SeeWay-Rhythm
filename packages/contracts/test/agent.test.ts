import { describe, expect, it } from "vitest";
import {
  AgentIdSchema,
  AgentReportSchema,
  AgentRequestSchema,
  ConclusionSchema,
  ConflictRefSchema,
  EvidenceRefSchema,
  MemoryScopeSchema,
  ProfileScopeSchema,
} from "../src/index";

const evidence = {
  evidenceId: "ev-001",
  ruleId: "QM-DOOR-001",
  ruleVersion: "qimen-0.1.0",
  sourceId: "source-qimen-001",
  factPath: "palaces.4.door",
  explanation: "The verified rule matched the calculated chart fact.",
  effect: "favorable" as const,
};

const conclusion = {
  favorable: ["focused work"],
  cautions: ["verbal commitments"],
  supportiveDirection: "southeast",
  avoidDirection: "northwest",
  action: "Confirm important details in writing.",
  tendency: "mixed" as const,
};

const reportBase = {
  agentId: "qimen-rhythm" as const,
  agentVersion: "0.1.0",
  conflicts: [],
  requiredInputs: [],
  ruleVersion: "qimen-0.1.0",
  generatedAt: "2026-08-21T12:00:00.000Z",
};

describe("Agent identifiers and memory grants", () => {
  it("accepts only the seven approved Agent IDs", () => {
    const approvedIds = [
      "orchestrator",
      "qimen-rhythm",
      "qimen-query",
      "ziwei-timeline",
      "bazi-profile",
      "qimen-finance",
      "meihua",
    ];

    for (const id of approvedIds) {
      expect(AgentIdSchema.safeParse(id).success).toBe(true);
    }
    expect(AgentIdSchema.safeParse("generic-fortune-agent").success).toBe(false);
  });

  it("rejects unknown profile and memory scopes", () => {
    expect(MemoryScopeSchema.safeParse("finance").success).toBe(true);
    expect(MemoryScopeSchema.safeParse("all-user-data").success).toBe(false);
    expect(ProfileScopeSchema.safeParse("birth-data").success).toBe(true);
    expect(ProfileScopeSchema.safeParse("everything").success).toBe(false);
  });
});

describe("Agent requests", () => {
  const request = {
    requestId: "req-001",
    intent: "Review the current two-hour period",
    category: "rhythm" as const,
    questionTime: "2026-08-21T12:00:00.000Z",
    timezone: "Asia/Shanghai",
    profileScopes: ["birth-data", "current-location"],
    memoryScopes: ["identity", "preferences"],
    actors: [{ role: "self" }],
    requestedAgent: "qimen-rhythm" as const,
  };

  it("parses explicit profile and memory grants", () => {
    expect(AgentRequestSchema.parse(request)).toEqual(request);
  });

  it("rejects unknown grants and unknown requested Agents", () => {
    expect(
      AgentRequestSchema.safeParse({
        ...request,
        profileScopes: ["all-profile-data"],
      }).success,
    ).toBe(false);
    expect(
      AgentRequestSchema.safeParse({
        ...request,
        memoryScopes: ["all-memories"],
      }).success,
    ).toBe(false);
    expect(
      AgentRequestSchema.safeParse({
        ...request,
        requestedAgent: "unknown-agent",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed timestamps, blank fields, and unknown keys", () => {
    expect(
      AgentRequestSchema.safeParse({ ...request, questionTime: "not-a-date" })
        .success,
    ).toBe(false);
    expect(
      AgentRequestSchema.safeParse({ ...request, requestId: "   " }).success,
    ).toBe(false);
    expect(
      AgentRequestSchema.safeParse({ ...request, unrestricted: true }).success,
    ).toBe(false);
  });
});

describe("Evidence references", () => {
  it("requires every provenance field", () => {
    expect(EvidenceRefSchema.safeParse(evidence).success).toBe(true);

    for (const field of [
      "evidenceId",
      "ruleId",
      "ruleVersion",
      "sourceId",
      "factPath",
      "explanation",
    ] as const) {
      const invalidEvidence = { ...evidence };
      delete invalidEvidence[field];
      expect(EvidenceRefSchema.safeParse(invalidEvidence).success, field).toBe(false);
    }
  });

  it("requires two distinct evidence IDs for a conflict", () => {
    const conflict = {
      conflictId: "conflict-001",
      evidenceIds: ["ev-001", "ev-002"],
      explanation: "The verified rules point in opposite directions.",
      resolution: "unresolved" as const,
    };

    expect(ConflictRefSchema.safeParse(conflict).success).toBe(true);
    expect(
      ConflictRefSchema.safeParse({
        ...conflict,
        evidenceIds: ["ev-001", "ev-001"],
      }).success,
    ).toBe(false);
  });
});

describe("Agent reports", () => {
  it("accepts a complete report with a conclusion and evidence", () => {
    expect(
      AgentReportSchema.safeParse({
        ...reportBase,
        status: "complete",
        conclusion,
        evidence: [evidence],
      }).success,
    ).toBe(true);
  });

  it("accepts a traceable chart snapshot reference", () => {
    expect(
      AgentReportSchema.safeParse({
        ...reportBase,
        status: "complete",
        conclusion,
        evidence: [evidence],
        chartSnapshotId: "chart-001",
      }).success,
    ).toBe(true);
  });

  it("rejects incomplete complete reports", () => {
    expect(
      AgentReportSchema.safeParse({
        ...reportBase,
        status: "complete",
        evidence: [evidence],
      }).success,
    ).toBe(false);
    expect(
      AgentReportSchema.safeParse({
        ...reportBase,
        status: "complete",
        conclusion,
        evidence: [],
      }).success,
    ).toBe(false);
    expect(
      AgentReportSchema.safeParse({
        ...reportBase,
        status: "complete",
        conclusion,
        evidence: [evidence],
        requiredInputs: ["birth-time"],
      }).success,
    ).toBe(false);
  });

  it("keeps unsupported reports free of conclusions and evidence", () => {
    const unsupported = {
      ...reportBase,
      status: "unsupported" as const,
      evidence: [],
      reasonCode: "CALCULATOR_NOT_VERIFIED",
      reason: "The calculator has not passed its golden cases.",
      prerequisites: ["verified calculator", "golden cases"],
    };

    expect(AgentReportSchema.safeParse(unsupported).success).toBe(true);
    expect(
      AgentReportSchema.safeParse({ ...unsupported, conclusion }).success,
    ).toBe(false);
    expect(
      AgentReportSchema.safeParse({ ...unsupported, evidence: [evidence] }).success,
    ).toBe(false);
  });

  it("requires missing inputs for needs_input reports", () => {
    const needsInput = {
      ...reportBase,
      status: "needs_input" as const,
      evidence: [],
      requiredInputs: ["instrument"],
    };

    expect(AgentReportSchema.safeParse(needsInput).success).toBe(true);
    expect(
      AgentReportSchema.safeParse({ ...needsInput, requiredInputs: [] }).success,
    ).toBe(false);
    expect(
      AgentReportSchema.safeParse({ ...needsInput, conclusion }).success,
    ).toBe(false);
  });

  it("keeps error reports free of conclusions and evidence", () => {
    const errorReport = {
      ...reportBase,
      status: "error" as const,
      evidence: [],
      errorCode: "INVALID_CHART",
      message: "The chart input could not be validated.",
    };

    expect(AgentReportSchema.safeParse(errorReport).success).toBe(true);
    expect(
      AgentReportSchema.safeParse({ ...errorReport, conclusion }).success,
    ).toBe(false);
    expect(
      AgentReportSchema.safeParse({ ...errorReport, evidence: [evidence] }).success,
    ).toBe(false);
  });

  it("rejects unknown statuses and tendencies", () => {
    expect(
      AgentReportSchema.safeParse({
        ...reportBase,
        status: "maybe",
        evidence: [],
      }).success,
    ).toBe(false);
    expect(
      ConclusionSchema.safeParse({ ...conclusion, tendency: "lucky" }).success,
    ).toBe(false);
  });
});
