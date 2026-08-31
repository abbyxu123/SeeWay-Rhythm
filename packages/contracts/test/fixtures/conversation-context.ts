import { CONVERSATION_CONTEXT_VERSION } from "@seeway/contracts";

export const personalContext = {
  domain: "personal-qimen",
  profileRef: { profileId: "profile-self", profileVersion: 2 },
  chartRef: {
    chartHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    verifierReportId: "verify-personal-1",
    verifierVersion: "qimen-verifier/v1",
    verificationStatus: "verified",
    validFrom: "2026-08-31T15:00:00+08:00",
    validUntil: "2026-08-31T17:00:00+08:00",
  },
  evidence: [
    {
      evidenceId: "personal-evidence-1",
      domain: "personal-qimen",
      sourceType: "rule",
      sourceId: "QG-GATE-OPEN-001",
    },
  ],
} as const;

export const marketContext = {
  domain: "qimen-market",
  marketRef: {
    market: "A股",
    instrument: "000001.SH",
    exchangeTimeZone: "Asia/Shanghai",
  },
  chartRef: {
    chartHash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    verifierReportId: "verify-market-1",
    verifierVersion: "qimen-market-verifier/v1",
    verificationStatus: "verified",
    validFrom: "2026-08-31T15:00:00+08:00",
    validUntil: "2026-08-31T17:00:00+08:00",
  },
  evidence: [
    {
      evidenceId: "market-evidence-1",
      domain: "qimen-market",
      sourceType: "chart-fact",
      sourceId: "market-palace-6",
    },
  ],
} as const;

export const commonConversationContext = {
  contractVersion: CONVERSATION_CONTEXT_VERSION,
  conversationId: "conversation-1",
  requestId: "request-1",
  capturedAt: "2026-08-31T15:10:00+08:00",
  memoryRefs: [
    { memoryId: "memory-tone-1", purpose: "conversation-style" },
  ],
} as const;
