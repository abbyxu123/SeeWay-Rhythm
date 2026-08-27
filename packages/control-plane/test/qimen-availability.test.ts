import {
  QIMEN_AVAILABILITY_MANIFEST_VERSION,
  QIMEN_GOLDEN_FIXTURE_DIGEST,
  QimenAvailabilityManifestSchema,
  createAgentRegistry,
  evaluateQimenAvailability,
} from "@seeway/control-plane";
import { QIMEN_VERIFIER_VERSION } from "@seeway/qimen-core";
import { describe, expect, it } from "vitest";

function enabledManifest() {
  return {
    manifestVersion: QIMEN_AVAILABILITY_MANIFEST_VERSION,
    goldenEvidence: {
      enabled: true,
      fixtureVersion: "qimen-golden/v1",
      fixtureDigest: QIMEN_GOLDEN_FIXTURE_DIGEST,
      verifiedCaseCount: 3,
    },
    calculatorSuite: {
      enabled: true,
      chartVersion: "qimen-chart/v1",
      algorithmVersion: "qimen-zhuanpan-chaibu-v1",
    },
    verifier: {
      enabled: true,
      verifierVersion: QIMEN_VERIFIER_VERSION,
    },
  } as const;
}

const disabledManifests = [
  {
    label: "golden evidence",
    manifest: {
      ...enabledManifest(),
      goldenEvidence: {
        ...enabledManifest().goldenEvidence,
        enabled: false,
      },
    },
  },
  {
    label: "calculator suite",
    manifest: {
      ...enabledManifest(),
      calculatorSuite: {
        ...enabledManifest().calculatorSuite,
        enabled: false,
      },
    },
  },
  {
    label: "verifier",
    manifest: {
      ...enabledManifest(),
      verifier: {
        ...enabledManifest().verifier,
        enabled: false,
      },
    },
  },
] as const;

describe("Qimen availability manifest", () => {
  it("parses the complete evidence declaration without treating it as a credential", () => {
    const manifest = enabledManifest();

    expect(QimenAvailabilityManifestSchema.parse(manifest)).toEqual(manifest);
    expect(evaluateQimenAvailability(manifest)).toEqual({
      availability: "unverified",
      issues: ["invalid_attestation"],
    });
  });

  it.each(disabledManifests)(
    "fails closed when $label is disabled",
    ({ manifest }) => {
      expect(evaluateQimenAvailability(manifest).availability).toBe(
        "unverified",
      );
    },
  );

  it("fails closed for missing, malformed or mismatched evidence", () => {
    const wrongVerifier = {
      ...enabledManifest(),
      verifier: {
        enabled: true,
        verifierVersion: "qimen-verifier/v0",
      },
    };

    expect(evaluateQimenAvailability(undefined).availability).toBe("unverified");
    expect(evaluateQimenAvailability({}).availability).toBe("unverified");
    expect(evaluateQimenAvailability(wrongVerifier).availability).toBe(
      "unverified",
    );
  });

  it("keeps the registry closed when a caller hand-writes a full manifest", () => {
    const defaultRegistry = createAgentRegistry();
    const forgedRegistry = createAgentRegistry(enabledManifest());
    const defaultQimen = defaultRegistry.filter(
      ({ calculationCore }) => calculationCore === "qimen-core",
    );
    const forgedQimen = forgedRegistry.filter(
      ({ calculationCore }) => calculationCore === "qimen-core",
    );

    expect(defaultQimen.every(({ availability }) => availability === "unverified"))
      .toBe(true);
    expect(forgedQimen.every(({ availability }) => availability === "unverified"))
      .toBe(true);
    expect(
      forgedRegistry
        .filter(({ calculationCore }) => calculationCore !== "qimen-core")
        .map(({ availability }) => availability),
    ).toEqual(["available", "unverified", "unverified", "unverified"]);
    expect(Object.isFrozen(forgedRegistry)).toBe(true);
    expect(forgedRegistry.every(Object.isFrozen)).toBe(true);
  });
});
