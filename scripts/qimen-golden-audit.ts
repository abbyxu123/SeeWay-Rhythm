import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  QimenGoldenFixtureSchema,
  evaluateQimenGoldenStructureReadiness,
  type QimenGoldenStructureReadiness,
} from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { auditQimenSourceFingerprints } from "./qimen-source-audit";

export interface QimenGoldenAuditReport {
  readonly ready: true;
  readonly sourceAuditCount: number;
  readonly timeAuditCount: number;
  readonly structure: Readonly<QimenGoldenStructureReadiness>;
}

export function auditQimenGoldenFixture(
  fixtureInput: unknown,
  repositoryRoot: string,
): Readonly<QimenGoldenAuditReport> {
  const fixture = QimenGoldenFixtureSchema.parse(fixtureInput);
  const structure = evaluateQimenGoldenStructureReadiness(fixture.cases);
  if (!structure.ready) {
    throw new Error(
      `Qimen golden structure is not ready: ${structure.issues.join(" ")}`,
    );
  }

  for (const goldenCase of fixture.cases) {
    const actual = buildTimeContext(resolveCivilTime(goldenCase.input));
    if (
      actual.solarTerms.current.name !== goldenCase.expectedTime.solarTerm ||
      JSON.stringify(actual.pillars) !==
        JSON.stringify(goldenCase.expectedTime.pillars)
    ) {
      throw new Error(`Time context mismatch for ${goldenCase.caseId}.`);
    }
  }

  const sourceReports = auditQimenSourceFingerprints(
    fixture.cases.map(({ caseId, chart, provenance }) => ({
      caseId,
      sourcePath: provenance.sourcePath,
      expectedSha256: provenance.sourceSha256,
      chartFingerprints: chart.sourceReferences.map(
        ({ fingerprint }) => fingerprint,
      ),
    })),
    repositoryRoot,
  );

  return Object.freeze({
    ready: true,
    sourceAuditCount: sourceReports.length,
    timeAuditCount: fixture.cases.length,
    structure,
  });
}

function runCli(): void {
  const repositoryRoot = process.argv[2];
  if (!repositoryRoot) {
    throw new Error(
      "Usage: npm run audit:qimen-golden -- /absolute/path/to/SeeWay-Rhythm",
    );
  }

  const fixture = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "tests/fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  );
  const report = auditQimenGoldenFixture(fixture, repositoryRoot);
  console.log(
    `[ok] Qimen golden gate: ${report.timeAuditCount} time contexts, ` +
      `${report.sourceAuditCount} source fingerprints, structure ready`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli();
}
