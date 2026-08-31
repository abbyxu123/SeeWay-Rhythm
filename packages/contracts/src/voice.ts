import { z } from "zod";
import { IanaTimeZoneSchema } from "./profile";

export const VOICE_QUESTION_VERSION = "voice-question/v1" as const;
export const VOICE_RESPONSE_VERSION = "voice-response/v1" as const;

const IdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim(), {
    message: "Identifier must not contain surrounding whitespace.",
  });
const TranscriptSchema = z.string().trim().min(1).max(500);
const DisplayTextSchema = z.string().trim().min(1).max(80);
const SpokenAnswerSchema = z.string().trim().min(1).max(600);
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const OffsetDateTimeSchema = z.iso.datetime({ offset: true });

export const VoiceTopicSchema = z.enum([
  "general",
  "work",
  "travel",
  "communication",
  "study",
  "wellbeing",
  "market",
]);

export const VoiceProfileRefSchema = z
  .object({
    profileId: IdentifierSchema,
    profileVersion: z.number().int().positive(),
  })
  .strict()
  .readonly();

export const VoiceRuntimeLocationSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    timeZone: IanaTimeZoneSchema,
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
  })
  .strict()
  .readonly();

const GeneralVoiceQuestionSchema = z
  .object({
    contractVersion: z.literal(VOICE_QUESTION_VERSION),
    questionId: IdentifierSchema,
    basis: z.literal("general"),
    topic: VoiceTopicSchema,
    transcript: TranscriptSchema,
    capturedAt: OffsetDateTimeSchema,
  })
  .strict();

const QimenVoiceQuestionSchema = z
  .object({
    contractVersion: z.literal(VOICE_QUESTION_VERSION),
    questionId: IdentifierSchema,
    basis: z.literal("qimen"),
    topic: VoiceTopicSchema.exclude(["general"]),
    transcript: TranscriptSchema,
    capturedAt: OffsetDateTimeSchema,
    profileRef: VoiceProfileRefSchema,
    runtimeLocation: VoiceRuntimeLocationSchema,
    targetTime: OffsetDateTimeSchema,
  })
  .strict();

export const VoiceQuestionSchema = z
  .discriminatedUnion("basis", [
    GeneralVoiceQuestionSchema,
    QimenVoiceQuestionSchema,
  ])
  .readonly();

const VoiceResponseCommonShape = {
  contractVersion: z.literal(VOICE_RESPONSE_VERSION),
  responseId: IdentifierSchema,
  questionId: IdentifierSchema,
  topic: VoiceTopicSchema,
  displayText: DisplayTextSchema,
  spokenAnswer: SpokenAnswerSchema,
  generatedAt: OffsetDateTimeSchema,
} as const;

const GeneralVoiceResponseSchema = z
  .object({
    ...VoiceResponseCommonShape,
    basis: z.literal("general"),
    evidenceIds: z.array(IdentifierSchema).max(0).readonly(),
  })
  .strict();

const QimenVerificationSchema = z
  .object({
    status: z.literal("verified"),
    verifierVersion: IdentifierSchema,
    verifiedAt: OffsetDateTimeSchema,
  })
  .strict()
  .readonly();

const QimenVoiceResponseSchema = z
  .object({
    ...VoiceResponseCommonShape,
    basis: z.literal("qimen"),
    topic: VoiceTopicSchema.exclude(["general"]),
    profileRef: VoiceProfileRefSchema,
    runtimeLocation: VoiceRuntimeLocationSchema,
    targetTime: OffsetDateTimeSchema,
    chartHash: Sha256Schema,
    verification: QimenVerificationSchema,
    validFrom: OffsetDateTimeSchema,
    validUntil: OffsetDateTimeSchema,
    evidenceIds: z
      .array(IdentifierSchema)
      .min(1)
      .max(32)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Voice evidence IDs must be distinct.",
      })
      .readonly(),
  })
  .strict()
  .superRefine((response, context) => {
    const targetTime = Date.parse(response.targetTime);
    const validFrom = Date.parse(response.validFrom);
    const validUntil = Date.parse(response.validUntil);

    if (validUntil <= validFrom) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Voice response validity must end after it starts.",
      });
    }
    if (targetTime < validFrom || targetTime >= validUntil) {
      context.addIssue({
        code: "custom",
        path: ["targetTime"],
        message: "Target time must fall inside the verified validity window.",
      });
    }
  });

export const VoiceResponseSchema = z
  .discriminatedUnion("basis", [
    GeneralVoiceResponseSchema,
    QimenVoiceResponseSchema,
  ])
  .readonly();

export type VoiceTopic = z.infer<typeof VoiceTopicSchema>;
export type VoiceProfileRef = z.infer<typeof VoiceProfileRefSchema>;
export type VoiceRuntimeLocation = z.infer<typeof VoiceRuntimeLocationSchema>;
export type VoiceQuestion = z.infer<typeof VoiceQuestionSchema>;
export type VoiceResponse = z.infer<typeof VoiceResponseSchema>;
