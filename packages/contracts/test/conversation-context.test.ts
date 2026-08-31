import { ConversationContextEnvelopeSchema } from "@seeway/contracts";
import { describe, expect, it } from "vitest";
import {
  commonConversationContext as common,
  marketContext,
  personalContext,
} from "./fixtures/conversation-context";

describe("conversation context envelope", () => {
  it.each([
    [{ ...common, scope: "general-chat" }],
    [{ ...common, scope: "personal-only", personalContext }],
    [{ ...common, scope: "market-only", marketContext }],
    [
      {
        ...common,
        scope: "personal-plus-market",
        personalContext,
        marketContext,
      },
    ],
  ])("accepts an isolated context shape", (value) => {
    expect(ConversationContextEnvelopeSchema.safeParse(value).success).toBe(
      true,
    );
  });

  it("requires both independent domains for a cross-domain request", () => {
    expect(
      ConversationContextEnvelopeSchema.safeParse({
        ...common,
        scope: "personal-plus-market",
        personalContext,
      }).success,
    ).toBe(false);
  });

  it("never accepts conversation memory as chart evidence", () => {
    expect(
      ConversationContextEnvelopeSchema.safeParse({
        ...common,
        scope: "personal-only",
        personalContext: {
          ...personalContext,
          evidence: [
            {
              evidenceId: "memory-tone-1",
              domain: "personal-qimen",
              sourceType: "conversation-memory",
              sourceId: "memory-tone-1",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects mixed domain labels and unverified chart references", () => {
    expect(
      ConversationContextEnvelopeSchema.safeParse({
        ...common,
        scope: "personal-only",
        personalContext: {
          ...personalContext,
          evidence: [
            { ...personalContext.evidence[0], domain: "qimen-market" },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      ConversationContextEnvelopeSchema.safeParse({
        ...common,
        scope: "market-only",
        marketContext: {
          ...marketContext,
          chartRef: {
            ...marketContext.chartRef,
            verificationStatus: "blocked",
          },
        },
      }).success,
    ).toBe(false);
  });
});
