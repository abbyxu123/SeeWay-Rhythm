import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QIMEN_AVAILABILITY_MANIFEST_VERSION,
  QIMEN_GOLDEN_FIXTURE_DIGEST,
  attestQimenAvailability,
  createAgentRegistry,
  evaluateQimenAvailability,
} from "@seeway/control-plane";
import {
  QIMEN_VERIFIER_VERSION,
  QimenGoldenFixtureSchema,
  calculateQimenChart,
  verifyQimenChart,
} from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const fixture = QimenGoldenFixtureSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(
        TEST_DIRECTORY,
        "../fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  ),
);

const manifest = {
  manifestVersion: QIMEN_AVAILABILITY_MANIFEST_VERSION,
  goldenEvidence: {
    enabled: true,
    fixtureVersion: fixture.fixtureVersion,
    fixtureDigest: QIMEN_GOLDEN_FIXTURE_DIGEST,
    verifiedCaseCount: fixture.cases.length,
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

describe("verified Qimen chart flow", () => {
  it("calculates and independently verifies every golden chart before opening the Qimen registry", () => {
    const verifications = fixture.cases.map((goldenCase) => {
      const timeContext = buildTimeContext(
        resolveCivilTime(goldenCase.input),
      );
      const chart = calculateQimenChart(
        timeContext,
        goldenCase.chart.sourceReferences[0]!,
      );

      expect(chart).toEqual(goldenCase.chart);
      return verifyQimenChart(timeContext, chart);
    });
    const attestation = attestQimenAvailability(manifest, verifications);
    const availability = evaluateQimenAvailability(attestation);
    const registry = createAgentRegistry(attestation);

    expect(attestation).not.toBeNull();
    expect(availability.availability).toBe("available");
    expect(
      registry
        .filter(({ calculationCore }) => calculationCore === "qimen-core")
        .every(({ availability: state }) => state === "available"),
    ).toBe(true);

    for (const verification of verifications) {
      expect(verification).toMatchObject({
        verifierVersion: QIMEN_VERIFIER_VERSION,
        status: "verified",
        issues: [],
      });
    }
  });

  it("rejects forged, incomplete or duplicate verification evidence", () => {
    const genuine = fixture.cases.map((goldenCase) => {
      const timeContext = buildTimeContext(resolveCivilTime(goldenCase.input));
      return verifyQimenChart(
        timeContext,
        calculateQimenChart(
          timeContext,
          goldenCase.chart.sourceReferences[0]!,
        ),
      );
    });

    expect(attestQimenAvailability(manifest, genuine.slice(0, 2))).toBeNull();
    expect(
      attestQimenAvailability(manifest, [genuine[0]!, genuine[0]!, genuine[0]!]),
    ).toBeNull();
    expect(
      attestQimenAvailability(manifest, genuine.map((item) => ({ ...item }))),
    ).toBeNull();

    const staticGoldenVerifications = fixture.cases.map((goldenCase) => {
      const timeContext = buildTimeContext(resolveCivilTime(goldenCase.input));
      return verifyQimenChart(timeContext, goldenCase.chart);
    });
    expect(
      staticGoldenVerifications.every(
        ({ status, calculatorAuthenticated }) =>
          status === "verified" && !calculatorAuthenticated,
      ),
    ).toBe(true);
    expect(
      attestQimenAvailability(manifest, staticGoldenVerifications),
    ).toBeNull();
  });

  it("keeps the default runtime registry unverified without an explicit manifest", () => {
    expect(evaluateQimenAvailability(undefined).availability).toBe(
      "unverified",
    );
    expect(evaluateQimenAvailability(manifest).availability).toBe("unverified");
    expect(
      createAgentRegistry()
        .filter(({ calculationCore }) => calculationCore === "qimen-core")
        .every(({ availability }) => availability === "unverified"),
    ).toBe(true);
  });
});
