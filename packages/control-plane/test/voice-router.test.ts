import { describe, expect, it } from "vitest";
import { routeVoiceQuestion } from "@seeway/control-plane";

const verifiedContext = {
  verificationStatus: "verified",
  chartHash:
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  expectedChartHash:
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
} as const;

describe("deterministic voice routing", () => {
  it.each([
    ["今天工作适合推进合作吗？", "work"],
    ["这个时辰适合出门去机场吗？", "travel"],
    ["现在适合和对方沟通谈判吗？", "communication"],
    ["下午适合学习和准备考试吗？", "study"],
  ] as const)("routes %s to verified personal Qimen", (transcript, topic) => {
    expect(routeVoiceQuestion({ transcript, qimenContext: verifiedContext })).toEqual({
      status: "ready",
      route: "personal-qimen",
      topic,
      chartHash: verifiedContext.chartHash,
    });
  });

  it("routes explicit stock questions to the independent market route", () => {
    expect(
      routeVoiceQuestion({ transcript: "看看今天 A 股市场的交易节奏" }),
    ).toEqual({
      status: "ready",
      route: "qimen-market",
      topic: "market",
    });
  });

  it("keeps ordinary conversation out of all Qimen routes", () => {
    expect(routeVoiceQuestion({ transcript: "给我讲个笑话吧" })).toEqual({
      status: "ready",
      route: "general-chat",
      topic: "general",
    });
  });

  it.each([
    "我今天怎么样？",
    "帮我看看这个事情",
    "最近钱方面行不行？",
  ])("asks for clarification when the requested scope is ambiguous: %s", (transcript) => {
    const result = routeVoiceQuestion({ transcript });

    expect(result).toMatchObject({
      status: "needs_clarification",
      route: "clarify",
      topic: "general",
    });
    if (result.status !== "needs_clarification") {
      throw new Error("Expected a clarification route.");
    }
    expect(result.prompt.length).toBeGreaterThan(0);
  });

  it("blocks personal Qimen narration without verified context", () => {
    expect(
      routeVoiceQuestion({ transcript: "今天工作适合推进合作吗？" }),
    ).toEqual({
      status: "blocked",
      route: "personal-qimen",
      topic: "work",
      reasonCode: "missing_verified_context",
    });
    expect(
      routeVoiceQuestion({
        transcript: "今天工作适合推进合作吗？",
        qimenContext: {
          ...verifiedContext,
          verificationStatus: "blocked",
        },
      }),
    ).toEqual({
      status: "blocked",
      route: "personal-qimen",
      topic: "work",
      reasonCode: "unverified_context",
    });
  });

  it("blocks a chart hash mismatch before narration", () => {
    const result = routeVoiceQuestion({
      transcript: "下午适合学习和准备考试吗？",
      qimenContext: {
        ...verifiedContext,
        expectedChartHash:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
    });

    expect(result).toEqual({
      status: "blocked",
      route: "personal-qimen",
      topic: "study",
      reasonCode: "chart_hash_mismatch",
    });
  });

  it("rejects blank transcripts and malformed context", () => {
    expect(() => routeVoiceQuestion({ transcript: "   " })).toThrow();
    expect(() =>
      routeVoiceQuestion({
        transcript: "今天工作适合推进合作吗？",
        qimenContext: {
          ...verifiedContext,
          chartHash: "not-a-hash",
        },
      }),
    ).toThrow();
  });
});
