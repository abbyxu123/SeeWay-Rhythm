import { describe, expect, it } from "vitest";
import { assembleConversationResponse } from "@seeway/control-plane";
import {
  commonConversationContext as common,
  marketContext,
  personalContext,
} from "../../contracts/test/fixtures/conversation-context";

const combinedEnvelope = {
  ...common,
  scope: "personal-plus-market",
  personalContext,
  marketContext,
} as const;

describe("conversation context orchestration", () => {
  it("assembles separately attributed personal and market claims", () => {
    const result = assembleConversationResponse({
      envelope: combinedEnvelope,
      now: "2026-08-31T15:20:00+08:00",
      claims: [
        {
          claimId: "claim-personal-1",
          domain: "personal-qimen",
          text: "个人节奏宜先核对条件。",
          evidenceIds: ["personal-evidence-1"],
        },
        {
          claimId: "claim-market-1",
          domain: "qimen-market",
          text: "市场部分只观察，不追价。",
          evidenceIds: ["market-evidence-1"],
        },
      ],
    });

    expect(result.claims.map((claim) => claim.domain)).toEqual([
      "personal-qimen",
      "qimen-market",
    ]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects missing, foreign or stale domain results", () => {
    expect(() =>
      assembleConversationResponse({
        envelope: combinedEnvelope,
        now: "2026-08-31T15:20:00+08:00",
        claims: [
          {
            claimId: "claim-personal-only",
            domain: "personal-qimen",
            text: "只有个人结论。",
            evidenceIds: ["personal-evidence-1"],
          },
        ],
      }),
    ).toThrow(/market/i);
    expect(() =>
      assembleConversationResponse({
        envelope: combinedEnvelope,
        now: "2026-08-31T15:20:00+08:00",
        claims: [
          {
            claimId: "claim-personal-foreign",
            domain: "personal-qimen",
            text: "错误引用市场证据。",
            evidenceIds: ["market-evidence-1"],
          },
          {
            claimId: "claim-market-1",
            domain: "qimen-market",
            text: "市场结论。",
            evidenceIds: ["market-evidence-1"],
          },
        ],
      }),
    ).toThrow(/evidence/i);
    expect(() =>
      assembleConversationResponse({
        envelope: combinedEnvelope,
        now: "2026-08-31T17:00:00+08:00",
        claims: [
          {
            claimId: "claim-personal-stale",
            domain: "personal-qimen",
            text: "过期个人结论。",
            evidenceIds: ["personal-evidence-1"],
          },
          {
            claimId: "claim-market-stale",
            domain: "qimen-market",
            text: "过期市场结论。",
            evidenceIds: ["market-evidence-1"],
          },
        ],
      }),
    ).toThrow(/stale/i);
  });

  it("cannot accept a replacement chart from the conversation layer", () => {
    expect(() =>
      assembleConversationResponse({
        envelope: combinedEnvelope,
        now: "2026-08-31T15:20:00+08:00",
        claims: [],
        chart: { invented: true },
      }),
    ).toThrow();
  });

  it("allows general wellbeing language but blocks medical claims", () => {
    expect(
      assembleConversationResponse({
        envelope: { ...common, scope: "general-chat" },
        now: "2026-08-31T15:20:00+08:00",
        claims: [
          {
            claimId: "claim-general-1",
            domain: "general-chat",
            text: "今天可以早点休息，出行时保持注意。",
            evidenceIds: [],
          },
        ],
      }).claims[0]?.text,
    ).toMatch(/休息/);
    expect(() =>
      assembleConversationResponse({
        envelope: { ...common, scope: "general-chat" },
        now: "2026-08-31T15:20:00+08:00",
        claims: [
          {
            claimId: "claim-medical-1",
            domain: "general-chat",
            text: "这是疾病诊断，建议按此用药治疗。",
            evidenceIds: [],
          },
        ],
      }),
    ).toThrow(/medical/i);
  });
});
