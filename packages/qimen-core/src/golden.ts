import { z } from "zod";
import { QimenChartSchema } from "./schema";

const NonEmptyStringSchema = z.string().trim().min(1);
const SafeSourcePathSchema = z
  .string()
  .regex(/^(?!.*\.\.)reference materials\/.+$/, {
    message:
      "Source paths must stay inside reference materials without traversal.",
  });
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const PillarSchema = z.string().length(2);

export const QimenGoldenProvenanceSchema = z
  .object({
    sourcePath: SafeSourcePathSchema,
    sourceLocator: NonEmptyStringSchema,
    sourceSha256: Sha256Schema,
    verificationMethod: z.literal(
      "two-pass visual transcription plus structural invariant check",
    ),
    transcriptionPasses: z.literal(2),
    verifiedBy: z.literal("codex-source-review"),
    verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: NonEmptyStringSchema,
  })
  .strict()
  .readonly();

export const QimenGoldenCaseSchema = z
  .object({
    caseId: NonEmptyStringSchema,
    status: z.literal("verified"),
    input: z
      .object({
        localDateTime: NonEmptyStringSchema,
        timeZone: z.literal("Asia/Shanghai"),
        precision: z.enum(["minute", "second"]),
      })
      .strict()
      .readonly(),
    expectedTime: z
      .object({
        solarTerm: NonEmptyStringSchema,
        pillars: z
          .object({
            year: PillarSchema,
            month: PillarSchema,
            day: PillarSchema,
            hour: PillarSchema,
          })
          .strict()
          .readonly(),
      })
      .strict()
      .readonly(),
    chart: QimenChartSchema,
    provenance: QimenGoldenProvenanceSchema,
  })
  .strict()
  .superRefine((goldenCase, context) => {
    const primaryFingerprint = `sha256:${goldenCase.provenance.sourceSha256}`;
    const hasPrimaryReference = goldenCase.chart.sourceReferences.some(
      ({ locator, fingerprint }) =>
        locator === goldenCase.provenance.sourceLocator &&
        fingerprint === primaryFingerprint,
    );

    if (!hasPrimaryReference) {
      context.addIssue({
        code: "custom",
        message:
          "Primary provenance must match a chart source locator and fingerprint.",
        path: ["provenance"],
      });
    }
  })
  .readonly();

export const QimenGoldenFixtureSchema = z
  .object({
    fixtureVersion: z.literal("qimen-golden/v1"),
    minimumVerifiedCases: z.literal(3),
    cases: z.array(QimenGoldenCaseSchema).min(3).readonly(),
  })
  .strict()
  .readonly();

export const QimenRejectedCaseSchema = z
  .object({
    caseId: NonEmptyStringSchema,
    status: z.literal("rejected_pending_review"),
    input: z
      .object({
        localDateTime: NonEmptyStringSchema,
        timeZone: z.literal("Asia/Shanghai"),
        precision: z.enum(["minute", "second"]),
      })
      .strict()
      .readonly(),
    sourceClaim: z
      .object({
        solarTerm: NonEmptyStringSchema,
        dunType: z.enum(["阳遁", "阴遁"]),
        juNumber: z.number().int().min(1).max(9),
      })
      .strict()
      .readonly(),
    provenance: z
      .object({
        sourcePath: SafeSourcePathSchema,
        sourceLocator: NonEmptyStringSchema,
        sourceSha256: Sha256Schema,
      })
      .strict()
      .readonly(),
    reason: NonEmptyStringSchema,
  })
  .strict()
  .readonly();

export const QimenRejectedFixtureSchema = z
  .object({
    fixtureVersion: z.literal("qimen-golden-rejected/v1"),
    cases: z.array(QimenRejectedCaseSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

export type QimenGoldenCase = z.infer<typeof QimenGoldenCaseSchema>;
export type QimenGoldenFixture = z.infer<
  typeof QimenGoldenFixtureSchema
>;
export type QimenRejectedCase = z.infer<typeof QimenRejectedCaseSchema>;
export type QimenRejectedFixture = z.infer<
  typeof QimenRejectedFixtureSchema
>;
