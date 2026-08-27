import {
  isAuthenticQimenVerificationResult,
  type QimenVerificationResult,
} from "@seeway/qimen-core";
import { z } from "zod";

export const QIMEN_AVAILABILITY_MANIFEST_VERSION =
  "qimen-availability/v1" as const;
export const QIMEN_GOLDEN_FIXTURE_DIGEST =
  "sha256:cfa905b290bf97d5651b88c9e83dd0fe1aeb3052aaa350e0e50a319fe4bdb4b5" as const;

const QIMEN_GOLDEN_CONTEXT_KEYS = Object.freeze([
  "Asia/Shanghai|1997-03-19T21:15:00",
  "Asia/Shanghai|2001-06-11T13:20:00",
  "Asia/Shanghai|2002-08-16T12:00:00",
] as const);

const GoldenEvidenceSchema = z
  .object({
    enabled: z.boolean(),
    fixtureVersion: z.literal("qimen-golden/v1"),
    fixtureDigest: z.literal(QIMEN_GOLDEN_FIXTURE_DIGEST),
    verifiedCaseCount: z.literal(3),
  })
  .strict()
  .readonly();

const CalculatorSuiteSchema = z
  .object({
    enabled: z.boolean(),
    chartVersion: z.literal("qimen-chart/v1"),
    algorithmVersion: z.literal("qimen-zhuanpan-chaibu-v1"),
  })
  .strict()
  .readonly();

const VerifierEvidenceSchema = z
  .object({
    enabled: z.boolean(),
    verifierVersion: z.literal("qimen-verifier/v1"),
  })
  .strict()
  .readonly();

export const QimenAvailabilityManifestSchema = z
  .object({
    manifestVersion: z.literal(QIMEN_AVAILABILITY_MANIFEST_VERSION),
    goldenEvidence: GoldenEvidenceSchema,
    calculatorSuite: CalculatorSuiteSchema,
    verifier: VerifierEvidenceSchema,
  })
  .strict()
  .readonly();

export type QimenAvailabilityManifest = z.infer<
  typeof QimenAvailabilityManifestSchema
>;

export interface QimenAvailabilityEvaluation {
  readonly availability: "available" | "unverified";
  readonly issues: readonly string[];
}

export interface QimenAvailabilityAttestation {
  readonly manifestVersion: typeof QIMEN_AVAILABILITY_MANIFEST_VERSION;
  readonly fixtureDigest: typeof QIMEN_GOLDEN_FIXTURE_DIGEST;
  readonly verifiedContextKeys: readonly string[];
}

const AUTHENTIC_ATTESTATIONS = new WeakSet<object>();

function enabledManifestIssues(
  manifest: QimenAvailabilityManifest,
): readonly string[] {
  const issues: string[] = [];
  if (!manifest.goldenEvidence.enabled) {
    issues.push("golden_evidence_disabled");
  }
  if (!manifest.calculatorSuite.enabled) {
    issues.push("calculator_suite_disabled");
  }
  if (!manifest.verifier.enabled) {
    issues.push("verifier_disabled");
  }
  return issues;
}

export function attestQimenAvailability(
  manifestInput: unknown,
  verifications: readonly QimenVerificationResult[],
): Readonly<QimenAvailabilityAttestation> | null {
  const manifest = QimenAvailabilityManifestSchema.safeParse(manifestInput);
  if (!manifest.success || enabledManifestIssues(manifest.data).length > 0) {
    return null;
  }
  if (
    verifications.length !== manifest.data.goldenEvidence.verifiedCaseCount ||
    verifications.some(
      (verification) =>
        !isAuthenticQimenVerificationResult(verification) ||
        verification.status !== "verified" ||
        !verification.calculatorAuthenticated ||
        verification.contextKey === null,
    )
  ) {
    return null;
  }

  const verifiedContextKeys = verifications.map(
    ({ contextKey }) => contextKey as string,
  );
  if (
    new Set(verifiedContextKeys).size !== QIMEN_GOLDEN_CONTEXT_KEYS.length ||
    !QIMEN_GOLDEN_CONTEXT_KEYS.every((key) => verifiedContextKeys.includes(key))
  ) {
    return null;
  }

  const attestation = Object.freeze({
    manifestVersion: QIMEN_AVAILABILITY_MANIFEST_VERSION,
    fixtureDigest: QIMEN_GOLDEN_FIXTURE_DIGEST,
    verifiedContextKeys: Object.freeze([...verifiedContextKeys].sort()),
  });
  AUTHENTIC_ATTESTATIONS.add(attestation);
  return attestation;
}

export function evaluateQimenAvailability(
  candidate: unknown,
): Readonly<QimenAvailabilityEvaluation> {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !AUTHENTIC_ATTESTATIONS.has(candidate)
  ) {
    return Object.freeze({
      availability: "unverified",
      issues: Object.freeze(["invalid_attestation"]),
    });
  }

  return Object.freeze({
    availability: "available",
    issues: Object.freeze([]),
  });
}
