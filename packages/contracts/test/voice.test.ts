import {
  VOICE_QUESTION_VERSION,
  VOICE_RESPONSE_VERSION,
  VoiceQuestionSchema,
  VoiceResponseSchema,
} from "@seeway/contracts";
import { describe, expect, it } from "vitest";

const profileRef = {
  profileId: "profile-self",
  profileVersion: 2,
} as const;

const runtimeLocation = {
  label: "上海市",
  timeZone: "Asia/Shanghai",
  longitude: 121.4737,
  latitude: 31.2304,
} as const;

const chartHash =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function qimenQuestion() {
  return {
    contractVersion: VOICE_QUESTION_VERSION,
    questionId: "voice-question-1",
    basis: "qimen",
    topic: "work",
    transcript: "今天下午适合推进合作吗？",
    capturedAt: "2026-08-31T04:00:00+08:00",
    profileRef,
    runtimeLocation,
    targetTime: "2026-08-31T15:00:00+08:00",
  } as const;
}

function verifiedQimenResponse() {
  return {
    contractVersion: VOICE_RESPONSE_VERSION,
    responseId: "voice-response-1",
    questionId: "voice-question-1",
    basis: "qimen",
    topic: "work",
    displayText: "宜先核对，再推进合作",
    spokenAnswer: "当前时辰更适合先核对条件，再推进合作，不要仓促承诺。",
    generatedAt: "2026-08-31T04:00:02+08:00",
    profileRef,
    runtimeLocation,
    targetTime: "2026-08-31T15:00:00+08:00",
    chartHash,
    verification: {
      status: "verified",
      verifierVersion: "qimen-verifier/v1",
      verifiedAt: "2026-08-31T04:00:01+08:00",
    },
    validFrom: "2026-08-31T15:00:00+08:00",
    validUntil: "2026-08-31T17:00:00+08:00",
    evidenceIds: ["QG-GATE-OPEN-001:palace-6"],
  } as const;
}

describe("voice question contract", () => {
  it("accepts a Qimen question only with explicit profile, location and target time", () => {
    const parsed = VoiceQuestionSchema.parse(qimenQuestion());

    expect(parsed.basis).toBe("qimen");
    if (parsed.basis !== "qimen") {
      throw new Error("Expected a Qimen voice question.");
    }
    expect(parsed.profileRef).toEqual(profileRef);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("keeps ordinary chat independent from birth and chart context", () => {
    const parsed = VoiceQuestionSchema.parse({
      contractVersion: VOICE_QUESTION_VERSION,
      questionId: "voice-general-1",
      basis: "general",
      topic: "general",
      transcript: "陪我聊两句吧",
      capturedAt: "2026-08-31T04:00:00+08:00",
    });

    expect(parsed.basis).toBe("general");
    expect("profileRef" in parsed).toBe(false);
  });

  it("rejects missing Qimen inputs and bounded-text overflow", () => {
    const { profileRef: _profileRef, ...missingProfile } = qimenQuestion();
    expect(VoiceQuestionSchema.safeParse(missingProfile).success).toBe(false);
    expect(
      VoiceQuestionSchema.safeParse({
        ...qimenQuestion(),
        transcript: "问".repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe("voice response contract", () => {
  it("accepts a concise general-chat response without chart claims", () => {
    const parsed = VoiceResponseSchema.parse({
      contractVersion: VOICE_RESPONSE_VERSION,
      responseId: "voice-general-response-1",
      questionId: "voice-general-1",
      basis: "general",
      topic: "general",
      displayText: "我在，慢慢说",
      spokenAnswer: "我在，你慢慢说。",
      generatedAt: "2026-08-31T04:00:02+08:00",
      evidenceIds: [],
    });

    expect(parsed.basis).toBe("general");
    expect(parsed.evidenceIds).toEqual([]);
  });

  it("accepts Qimen narration only with verified chart evidence", () => {
    const parsed = VoiceResponseSchema.parse(verifiedQimenResponse());

    expect(parsed.basis).toBe("qimen");
    if (parsed.basis !== "qimen") {
      throw new Error("Expected a Qimen voice response.");
    }
    expect(parsed.verification.status).toBe("verified");
    expect(parsed.chartHash).toBe(chartHash);
    expect(parsed.runtimeLocation).toEqual(runtimeLocation);
  });

  it("rejects blocked, unverified, hashless or unsupported Qimen narration", () => {
    for (const mutation of [
      { verification: { status: "blocked" } },
      { verification: { status: "unverified" } },
      { chartHash: null },
      { evidenceIds: [] },
    ]) {
      expect(
        VoiceResponseSchema.safeParse({
          ...verifiedQimenResponse(),
          ...mutation,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects Qimen fields smuggled into general chat", () => {
    expect(
      VoiceResponseSchema.safeParse({
        contractVersion: VOICE_RESPONSE_VERSION,
        responseId: "voice-general-response-2",
        questionId: "voice-general-1",
        basis: "general",
        topic: "general",
        displayText: "普通聊天",
        spokenAnswer: "这只是普通聊天。",
        generatedAt: "2026-08-31T04:00:02+08:00",
        evidenceIds: [],
        chartHash,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid validity windows, duplicate evidence and long display copy", () => {
    expect(
      VoiceResponseSchema.safeParse({
        ...verifiedQimenResponse(),
        validUntil: "2026-08-31T14:59:59+08:00",
      }).success,
    ).toBe(false);
    expect(
      VoiceResponseSchema.safeParse({
        ...verifiedQimenResponse(),
        evidenceIds: ["evidence-a", "evidence-a"],
      }).success,
    ).toBe(false);
    expect(
      VoiceResponseSchema.safeParse({
        ...verifiedQimenResponse(),
        displayText: "长".repeat(81),
      }).success,
    ).toBe(false);
  });
});
