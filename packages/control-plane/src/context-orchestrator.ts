import {
  ConversationClaimSchema,
  ConversationContextEnvelopeSchema,
  type ConversationClaim,
  type ConversationContextEnvelope,
  type MarketConversationContext,
  type PersonalConversationContext,
} from "@seeway/contracts";
import { z } from "zod";

const ConversationResponseInputSchema = z
  .object({
    envelope: ConversationContextEnvelopeSchema,
    now: z.iso.datetime({ offset: true }),
    claims: z.array(ConversationClaimSchema).min(1).max(24),
  })
  .strict();

export interface ConversationResponse {
  readonly conversationId: string;
  readonly requestId: string;
  readonly claims: readonly ConversationClaim[];
}

const MedicalClaimPattern =
  /诊断|疾病|病症|治疗|用药|药物|处方|治愈|癌症|糖尿病|高血压|住院|手术/;

export function assembleConversationResponse(rawInput: unknown): ConversationResponse {
  const input = ConversationResponseInputSchema.parse(rawInput);
  rejectMedicalClaims(input.claims);
  requireScopeClaims(input.envelope, input.claims);

  for (const claim of input.claims) {
    if (claim.domain === "general-chat") {
      continue;
    }
    const context = contextForDomain(input.envelope, claim.domain);
    if (context === undefined) {
      throw new Error(`Missing ${claim.domain} context for grounded claim.`);
    }
    assertContextCurrent(context, input.now);
    assertEvidenceOwned(context, claim.evidenceIds);
  }

  const claims = Object.freeze(
    input.claims.map((claim) =>
      Object.freeze({
        ...claim,
        evidenceIds: Object.freeze([...claim.evidenceIds]),
      }),
    ),
  );
  return Object.freeze({
    conversationId: input.envelope.conversationId,
    requestId: input.envelope.requestId,
    claims,
  });
}

function rejectMedicalClaims(claims: readonly ConversationClaim[]): void {
  if (claims.some((claim) => MedicalClaimPattern.test(claim.text))) {
    throw new Error("Medical diagnosis or treatment claims are not allowed.");
  }
}

function requireScopeClaims(
  envelope: ConversationContextEnvelope,
  claims: readonly ConversationClaim[],
): void {
  const domains = new Set(claims.map((claim) => claim.domain));
  if (
    (envelope.scope === "personal-only" ||
      envelope.scope === "personal-plus-market") &&
    !domains.has("personal-qimen")
  ) {
    throw new Error("A personal Qimen result is required for this scope.");
  }
  if (
    (envelope.scope === "market-only" ||
      envelope.scope === "personal-plus-market") &&
    !domains.has("qimen-market")
  ) {
    throw new Error("A market result is required for this scope.");
  }
}

function contextForDomain(
  envelope: ConversationContextEnvelope,
  domain: "personal-qimen" | "qimen-market",
): PersonalConversationContext | MarketConversationContext | undefined {
  if (domain === "personal-qimen" && "personalContext" in envelope) {
    return envelope.personalContext;
  }
  if (domain === "qimen-market" && "marketContext" in envelope) {
    return envelope.marketContext;
  }
  return undefined;
}

function assertContextCurrent(
  context: PersonalConversationContext | MarketConversationContext,
  now: string,
): void {
  const current = Date.parse(now);
  const validFrom = Date.parse(context.chartRef.validFrom);
  const validUntil = Date.parse(context.chartRef.validUntil);
  if (current < validFrom || current >= validUntil) {
    throw new Error(`The ${context.domain} context is stale.`);
  }
}

function assertEvidenceOwned(
  context: PersonalConversationContext | MarketConversationContext,
  evidenceIds: readonly string[],
): void {
  const owned = new Set(context.evidence.map((item) => item.evidenceId));
  for (const evidenceId of evidenceIds) {
    if (!owned.has(evidenceId)) {
      throw new Error(
        `Claim evidence ${evidenceId} is not owned by ${context.domain}.`,
      );
    }
  }
}
