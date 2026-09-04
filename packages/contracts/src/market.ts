import { z } from "zod";
import { IanaTimeZoneSchema } from "./profile";
import { VoiceProfileRefSchema } from "./voice";

export const MARKET_REQUEST_VERSION = "qimen-market-request/v1" as const;
export const MARKET_RESULT_VERSION = "qimen-market-result/v1" as const;
export const MARKET_METHOD_PENDING_VERSION =
  "qimen-market-method/pending-review-v1" as const;

const IdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim(), {
    message: "Identifier must not contain surrounding whitespace.",
  });
const ShortTextSchema = z.string().trim().min(1).max(200);
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const OffsetDateTimeSchema = z.iso.datetime({ offset: true });
const DistinctEvidenceIdsSchema = z
  .array(IdentifierSchema)
  .min(1)
  .max(64)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Market evidence IDs must be distinct.",
  })
  .readonly();

export const MarketAssetClassSchema = z.enum([
  "equity",
  "etf",
  "index",
  "fund",
  "futures",
  "forex",
  "crypto",
  "other",
]);

export const MarketInstrumentSchema = z
  .object({
    instrumentId: IdentifierSchema,
    symbol: z.string().trim().min(1).max(40),
    displayName: ShortTextSchema.optional(),
    assetClass: MarketAssetClassSchema,
    exchange: z.string().trim().min(1).max(80),
    exchangeTimeZone: IanaTimeZoneSchema,
  })
  .strict()
  .readonly();

const PersonalOverlayRequestSchema = z
  .object({
    profileRef: VoiceProfileRefSchema,
    expectedPersonalChartHash: Sha256Schema,
  })
  .strict()
  .readonly();

export const MarketRequestSchema = z
  .object({
    contractVersion: z.literal(MARKET_REQUEST_VERSION),
    requestId: IdentifierSchema,
    intent: z.enum(["session-rhythm", "timing", "risk-watch"]),
    instrument: MarketInstrumentSchema,
    observedAt: OffsetDateTimeSchema,
    targetTime: OffsetDateTimeSchema,
    personalOverlay: PersonalOverlayRequestSchema.optional(),
  })
  .strict()
  .readonly();

const VerifiedMarkerSchema = z
  .object({
    status: z.literal("verified"),
    verifierVersion: z.literal("qimen-verifier/v1"),
    verifiedAt: OffsetDateTimeSchema,
  })
  .strict()
  .readonly();

export const MarketChartContextSchema = z
  .object({
    chartHash: Sha256Schema,
    verification: VerifiedMarkerSchema,
    validFrom: OffsetDateTimeSchema,
    validUntil: OffsetDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Market chart validity must end after it starts.",
      });
    }
  })
  .readonly();

const PersonalOverlayResultSchema = z
  .object({
    profileRef: VoiceProfileRefSchema,
    personalChartHash: Sha256Schema,
    overlayHash: Sha256Schema,
    verification: VerifiedMarkerSchema,
  })
  .strict()
  .readonly();

const MarketResultCommonShape = {
  contractVersion: z.literal(MARKET_RESULT_VERSION),
  resultId: IdentifierSchema,
  requestId: IdentifierSchema,
  instrument: MarketInstrumentSchema,
  targetTime: OffsetDateTimeSchema,
  chartContext: MarketChartContextSchema,
  generatedAt: OffsetDateTimeSchema,
  personalOverlay: PersonalOverlayResultSchema.optional(),
} as const;

const MarketUnavailableResultSchema = z
  .object({
    ...MarketResultCommonShape,
    status: z.literal("unavailable"),
    methodVersion: z.literal(MARKET_METHOD_PENDING_VERSION),
    reasonCode: z.enum([
      "MARKET_RULESET_UNVERIFIED",
      "MARKET_CHART_BLOCKED",
      "PERSONAL_OVERLAY_MISMATCH",
    ]),
    candidateSourceIds: z
      .array(IdentifierSchema)
      .max(32)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Candidate source IDs must be distinct.",
      })
      .readonly(),
    prerequisites: z.array(IdentifierSchema).min(1).max(16).readonly(),
  })
  .strict();

const ObservationWindowSchema = z
  .object({
    start: OffsetDateTimeSchema,
    end: OffsetDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.end) <= Date.parse(value.start)) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "Observation window must end after it starts.",
      });
    }
  })
  .readonly();

const TraceableMarketTextSchema = z
  .object({
    text: z.string().trim().min(1).max(240),
    evidenceIds: DistinctEvidenceIdsSchema,
  })
  .strict()
  .readonly();

const MarketMethodEvidenceSchema = z
  .object({
    attestationHash: Sha256Schema,
    backtestReportHash: Sha256Schema,
    goldenFixtureHash: Sha256Schema,
  })
  .strict()
  .readonly();

const MarketVerifiedResultSchema = z
  .object({
    ...MarketResultCommonShape,
    status: z.literal("verified"),
    methodVersion: IdentifierSchema.refine(
      (value) => value !== MARKET_METHOD_PENDING_VERSION,
      "A verified market result cannot use the pending method version.",
    ),
    marketRhythm: z.enum(["supportive", "cautious", "mixed"]),
    observationWindow: ObservationWindowSchema,
    riskSignal: z
      .object({
        level: z.enum(["low", "medium", "high"]),
        text: z.string().trim().min(1).max(240),
        evidenceIds: DistinctEvidenceIdsSchema,
      })
      .strict()
      .readonly(),
    discipline: TraceableMarketTextSchema,
    evidenceIds: DistinctEvidenceIdsSchema,
    methodEvidence: MarketMethodEvidenceSchema,
  })
  .strict();

export const MarketResultSchema = z
  .discriminatedUnion("status", [
    MarketUnavailableResultSchema,
    MarketVerifiedResultSchema,
  ])
  .superRefine((result, context) => {
    const target = Date.parse(result.targetTime);
    const validFrom = Date.parse(result.chartContext.validFrom);
    const validUntil = Date.parse(result.chartContext.validUntil);
    if (target < validFrom || target >= validUntil) {
      context.addIssue({
        code: "custom",
        path: ["targetTime"],
        message: "Market target time must be inside the chart validity window.",
      });
    }

    if (result.personalOverlay) {
      const hashes = [
        result.chartContext.chartHash,
        result.personalOverlay.personalChartHash,
        result.personalOverlay.overlayHash,
      ];
      if (new Set(hashes).size !== hashes.length) {
        context.addIssue({
          code: "custom",
          path: ["personalOverlay", "overlayHash"],
          message: "Market, personal and overlay hashes must remain separate.",
        });
      }
    }

    if (result.status === "verified") {
      const ownedEvidence = new Set(result.evidenceIds);
      for (const [path, ids] of [
        ["riskSignal", result.riskSignal.evidenceIds],
        ["discipline", result.discipline.evidenceIds],
      ] as const) {
        if (ids.some((id) => !ownedEvidence.has(id))) {
          context.addIssue({
            code: "custom",
            path: [path, "evidenceIds"],
            message: "Market claim references unknown evidence.",
          });
        }
      }
    }
  })
  .readonly();

const MarketSourceBaseShape = {
  sourceId: IdentifierSchema,
  title: ShortTextSchema,
  fingerprint: Sha256Schema,
  domain: z.enum(["stock", "lottery"]),
} as const;

const CandidateSourceSchema = z
  .object({
    ...MarketSourceBaseShape,
    reviewStatus: z.literal("candidate"),
    ruleIds: z.array(IdentifierSchema).max(0).readonly(),
  })
  .strict();

const QualifiedSourceSchema = z
  .object({
    ...MarketSourceBaseShape,
    reviewStatus: z.literal("qualified"),
    ruleIds: z.array(IdentifierSchema).min(1).readonly(),
    methodVersion: IdentifierSchema,
    backtestReportHash: Sha256Schema,
    goldenFixtureHash: Sha256Schema,
    reviewedAt: OffsetDateTimeSchema,
  })
  .strict();

export const MarketSourceCandidateSchema = z
  .discriminatedUnion("reviewStatus", [
    CandidateSourceSchema,
    QualifiedSourceSchema,
  ])
  .readonly();

export type MarketAssetClass = z.infer<typeof MarketAssetClassSchema>;
export type MarketInstrument = z.infer<typeof MarketInstrumentSchema>;
export type MarketRequest = z.infer<typeof MarketRequestSchema>;
export type MarketChartContext = z.infer<typeof MarketChartContextSchema>;
export type MarketResult = z.infer<typeof MarketResultSchema>;
export type MarketSourceCandidate = z.infer<
  typeof MarketSourceCandidateSchema
>;
