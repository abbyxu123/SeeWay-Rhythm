import { z } from "zod";
import { IanaTimeZoneSchema } from "./profile";

export const CONVERSATION_CONTEXT_VERSION = "conversation-context/v1" as const;

const IdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim(), {
    message: "Identifier must not contain surrounding whitespace.",
  });
const NonEmptyTextSchema = z.string().trim().min(1).max(240);
const OffsetDateTimeSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const ConversationMemoryRefSchema = z
  .object({
    memoryId: IdentifierSchema,
    purpose: z.enum(["conversation-style", "user-preference"]),
  })
  .strict()
  .readonly();

const ConversationProfileRefSchema = z
  .object({
    profileId: IdentifierSchema,
    profileVersion: z.number().int().positive(),
  })
  .strict()
  .readonly();

export const ConversationChartRefSchema = z
  .object({
    chartHash: Sha256Schema,
    verifierReportId: IdentifierSchema,
    verifierVersion: IdentifierSchema,
    verificationStatus: z.literal("verified"),
    validFrom: OffsetDateTimeSchema,
    validUntil: OffsetDateTimeSchema,
  })
  .strict()
  .superRefine((chart, context) => {
    if (Date.parse(chart.validUntil) <= Date.parse(chart.validFrom)) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Chart validity must end after it starts.",
      });
    }
  })
  .readonly();

function evidenceSchema<TDomain extends "personal-qimen" | "qimen-market">(
  domain: TDomain,
) {
  return z
    .object({
      evidenceId: IdentifierSchema,
      domain: z.literal(domain),
      sourceType: z.enum(["rule", "chart-fact"]),
      sourceId: IdentifierSchema,
    })
    .strict()
    .readonly();
}

export const PersonalConversationContextSchema = z
  .object({
    domain: z.literal("personal-qimen"),
    profileRef: ConversationProfileRefSchema,
    chartRef: ConversationChartRefSchema,
    evidence: z
      .array(evidenceSchema("personal-qimen"))
      .min(1)
      .max(64)
      .refine(
        (items) =>
          new Set(items.map((item) => item.evidenceId)).size === items.length,
        { message: "Personal evidence IDs must be distinct." },
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const MarketConversationContextSchema = z
  .object({
    domain: z.literal("qimen-market"),
    marketRef: z
      .object({
        market: NonEmptyTextSchema,
        instrument: IdentifierSchema,
        exchangeTimeZone: IanaTimeZoneSchema,
      })
      .strict()
      .readonly(),
    chartRef: ConversationChartRefSchema,
    evidence: z
      .array(evidenceSchema("qimen-market"))
      .min(1)
      .max(64)
      .refine(
        (items) =>
          new Set(items.map((item) => item.evidenceId)).size === items.length,
        { message: "Market evidence IDs must be distinct." },
      )
      .readonly(),
  })
  .strict()
  .readonly();

const EnvelopeCommonShape = {
  contractVersion: z.literal(CONVERSATION_CONTEXT_VERSION),
  conversationId: IdentifierSchema,
  requestId: IdentifierSchema,
  capturedAt: OffsetDateTimeSchema,
  memoryRefs: z
    .array(ConversationMemoryRefSchema)
    .max(32)
    .refine(
      (items) =>
        new Set(items.map((item) => item.memoryId)).size === items.length,
      { message: "Conversation memory references must be distinct." },
    )
    .readonly(),
} as const;

const GeneralConversationEnvelopeSchema = z
  .object({
    ...EnvelopeCommonShape,
    scope: z.literal("general-chat"),
  })
  .strict();

const PersonalConversationEnvelopeSchema = z
  .object({
    ...EnvelopeCommonShape,
    scope: z.literal("personal-only"),
    personalContext: PersonalConversationContextSchema,
  })
  .strict();

const MarketConversationEnvelopeSchema = z
  .object({
    ...EnvelopeCommonShape,
    scope: z.literal("market-only"),
    marketContext: MarketConversationContextSchema,
  })
  .strict();

const CombinedConversationEnvelopeSchema = z
  .object({
    ...EnvelopeCommonShape,
    scope: z.literal("personal-plus-market"),
    personalContext: PersonalConversationContextSchema,
    marketContext: MarketConversationContextSchema,
  })
  .strict();

export const ConversationContextEnvelopeSchema = z
  .discriminatedUnion("scope", [
    GeneralConversationEnvelopeSchema,
    PersonalConversationEnvelopeSchema,
    MarketConversationEnvelopeSchema,
    CombinedConversationEnvelopeSchema,
  ])
  .readonly();

const GeneralConversationClaimSchema = z
  .object({
    claimId: IdentifierSchema,
    domain: z.literal("general-chat"),
    text: NonEmptyTextSchema,
    evidenceIds: z.array(IdentifierSchema).max(0).readonly(),
  })
  .strict();

function groundedClaimSchema<TDomain extends "personal-qimen" | "qimen-market">(
  domain: TDomain,
) {
  return z
    .object({
      claimId: IdentifierSchema,
      domain: z.literal(domain),
      text: NonEmptyTextSchema,
      evidenceIds: z
        .array(IdentifierSchema)
        .min(1)
        .max(32)
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "Claim evidence IDs must be distinct.",
        })
        .readonly(),
    })
    .strict();
}

export const ConversationClaimSchema = z.discriminatedUnion("domain", [
  GeneralConversationClaimSchema,
  groundedClaimSchema("personal-qimen"),
  groundedClaimSchema("qimen-market"),
]);

export type ConversationChartRef = z.infer<
  typeof ConversationChartRefSchema
>;
export type PersonalConversationContext = z.infer<
  typeof PersonalConversationContextSchema
>;
export type MarketConversationContext = z.infer<
  typeof MarketConversationContextSchema
>;
export type ConversationContextEnvelope = z.infer<
  typeof ConversationContextEnvelopeSchema
>;
export type ConversationClaim = z.infer<typeof ConversationClaimSchema>;
