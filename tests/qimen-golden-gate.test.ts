import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDefinition } from "@seeway/control-plane";
import {
  QIMEN_ALGORITHM_VERSION,
  QimenGoldenFixtureSchema,
  QimenRejectedFixtureSchema,
  evaluateQimenGoldenStructureReadiness,
} from "@seeway/qimen-core";
import {
  buildTimeContext,
  resolveCivilTime,
} from "@seeway/time-core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  TEST_DIRECTORY,
  "fixtures/qimen-golden/verified-cases.json",
);
const REJECTED_FIXTURE_PATH = resolve(
  TEST_DIRECTORY,
  "fixtures/qimen-golden/rejected-cases.json",
);
const PORTABLE_SCHEMA_PATH = resolve(
  TEST_DIRECTORY,
  "fixtures/qimen-golden/cases.schema.json",
);

const fixture = QimenGoldenFixtureSchema.parse(
  JSON.parse(readFileSync(FIXTURE_PATH, "utf8")),
);

describe("Qimen golden-case gate", () => {
  it("loads three palace-complete charts from the selected Zhang Zhichun method", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(
      fixture.minimumVerifiedCases,
    );
    expect(fixture.cases.map(({ caseId }) => caseId)).toEqual(
      expect.arrayContaining([
        "zhang-1997-03-19-yang-4",
        "zhang-2001-06-11-yang-9",
        "zhang-2002-08-16-yin-5",
      ]),
    );

    for (const goldenCase of fixture.cases) {
      expect(goldenCase.chart.palaces).toHaveLength(9);
      expect(goldenCase.chart.algorithmVersion).toBe(
        QIMEN_ALGORITHM_VERSION,
      );
      expect(goldenCase.chart.sourceReferences[0]?.fingerprint).toBe(
        `sha256:${goldenCase.provenance.sourceSha256}`,
      );
    }
  });

  it("generates the portable JSON Schema from the canonical Zod schema", () => {
    const portableSchema = JSON.parse(
      readFileSync(PORTABLE_SCHEMA_PATH, "utf8"),
    );
    expect(portableSchema).toEqual(
      z.toJSONSchema(QimenGoldenFixtureSchema),
    );
    expect(
      portableSchema.properties.cases.items.properties.provenance
        .properties.sourcePath.pattern,
    ).toBe(/^(?!.*\.\.)reference materials\/.+$/.source);
  });

  it("keeps unresolved source discrepancies outside the golden set", () => {
    const rejected = QimenRejectedFixtureSchema.parse(
      JSON.parse(readFileSync(REJECTED_FIXTURE_PATH, "utf8")),
    );

    expect(rejected.cases.length).toBeGreaterThanOrEqual(1);
    expect(rejected.cases.map(({ caseId }) => caseId)).toContain(
      "course-2001-09-01-yin-9-unresolved",
    );
  });

  it("requires the primary provenance to match a chart source reference", () => {
    const mismatched = {
      ...fixture.cases[0],
      provenance: {
        ...fixture.cases[0]!.provenance,
        sourceLocator: "不存在的案例定位",
      },
    };

    expect(QimenGoldenFixtureSchema.safeParse({
      ...fixture,
      cases: [mismatched, ...fixture.cases.slice(1)],
    }).success).toBe(false);
  });

  it("independently rebuilds each source time context before trusting its chart", () => {
    for (const goldenCase of fixture.cases) {
      const timeContext = buildTimeContext(
        resolveCivilTime(goldenCase.input),
      );

      expect(timeContext.pillars).toEqual(goldenCase.expectedTime.pillars);
      expect(timeContext.solarTerms.current.name).toBe(
        goldenCase.expectedTime.solarTerm,
      );
    }
  });

  it("refuses zero or fewer than three verified complete cases", () => {
    expect(evaluateQimenGoldenStructureReadiness([])).toMatchObject({
      ready: false,
      verifiedCaseCount: 0,
      minimumVerifiedCases: 3,
    });
    expect(
      evaluateQimenGoldenStructureReadiness(fixture.cases.slice(0, 2)),
    ).toMatchObject({
      ready: false,
      verifiedCaseCount: 2,
      minimumVerifiedCases: 3,
    });
  });

  it("refuses a nine-palace case that fails the strict chart invariants", () => {
    const malformedCases = fixture.cases.map((goldenCase, index) =>
      index === 0
        ? {
            ...goldenCase,
            chart: {
              ...goldenCase.chart,
              palaces: goldenCase.chart.palaces.map((palace) => ({
                ...palace,
                earthPlateStem: "戊" as const,
              })),
            },
          }
        : goldenCase,
    );

    expect(
      evaluateQimenGoldenStructureReadiness(malformedCases),
    ).toMatchObject({
      ready: false,
      verifiedCaseCount: 2,
    });
  });

  it("refuses duplicated source evidence or duplicated palace arrangements", () => {
    const duplicatedEvidence = fixture.cases.map((goldenCase, index) =>
      index === 2
        ? {
            ...goldenCase,
            provenance: fixture.cases[0]!.provenance,
            chart: {
              ...goldenCase.chart,
              sourceReferences: fixture.cases[0]!.chart.sourceReferences,
            },
          }
        : goldenCase,
    );
    const duplicatedArrangement = fixture.cases.map((goldenCase, index) =>
      index === 2
        ? {
            ...goldenCase,
            chart: {
              ...goldenCase.chart,
              palaces: fixture.cases[0]!.chart.palaces,
            },
          }
        : goldenCase,
    );

    expect(
      evaluateQimenGoldenStructureReadiness(duplicatedEvidence).ready,
    ).toBe(false);
    expect(
      evaluateQimenGoldenStructureReadiness(duplicatedArrangement).ready,
    ).toBe(false);
  });

  it("rejects blank case IDs before they can count as evidence", () => {
    const blankIdCases = fixture.cases.map((goldenCase, index) =>
      index === 0 ? { ...goldenCase, caseId: "   " } : goldenCase,
    );

    expect(
      evaluateQimenGoldenStructureReadiness(blankIdCases),
    ).toMatchObject({
      ready: false,
      verifiedCaseCount: 2,
    });
  });

  it("opens only the calculator-development gate after diverse goldens pass", () => {
    expect(evaluateQimenGoldenStructureReadiness(fixture.cases)).toMatchObject({
      ready: true,
      verifiedCaseCount: fixture.cases.length,
      minimumVerifiedCases: 3,
      issues: [],
    });
    expect(
      evaluateQimenGoldenStructureReadiness(fixture.cases).coveredDunTypes,
    ).toEqual(expect.arrayContaining(["阳遁", "阴遁"]));
    expect(
      evaluateQimenGoldenStructureReadiness(fixture.cases).coveredJu,
    ).toEqual(
      expect.arrayContaining(["阳遁四局", "阳遁九局", "阴遁五局"]),
    );
  });

  it("keeps every Qimen Agent unavailable until the calculator and verifier pass", () => {
    for (const agentId of [
      "qimen-rhythm",
      "qimen-query",
      "qimen-finance",
    ]) {
      expect(getAgentDefinition(agentId)?.availability).toBe("unverified");
    }
  });
});
