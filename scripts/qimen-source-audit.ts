import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { QimenGoldenFixtureSchema } from "@seeway/qimen-core";

export interface QimenSourceAuditInput {
  readonly caseId: string;
  readonly sourcePath: string;
  readonly expectedSha256: string;
  readonly chartFingerprints: readonly string[];
}

export interface QimenSourceAuditReport {
  readonly caseId: string;
  readonly sourcePath: string;
  readonly sha256: string;
}

export function auditQimenSourceFingerprints(
  inputs: readonly QimenSourceAuditInput[],
  repositoryRoot: string,
): readonly Readonly<QimenSourceAuditReport>[] {
  const materialsRoot = realpathSync(
    resolve(repositoryRoot, "reference materials"),
  );

  return inputs.map((input) => {
    const sourcePath = realpathSync(
      resolve(repositoryRoot, input.sourcePath),
    );
    if (!sourcePath.startsWith(`${materialsRoot}${sep}`)) {
      throw new Error(
        `Source path leaves reference materials for ${input.caseId}.`,
      );
    }

    const sha256 = createHash("sha256")
      .update(readFileSync(sourcePath))
      .digest("hex");
    if (sha256 !== input.expectedSha256) {
      throw new Error(`Source hash mismatch for ${input.caseId}.`);
    }
    if (!input.chartFingerprints.includes(`sha256:${sha256}`)) {
      throw new Error(`Chart fingerprint mismatch for ${input.caseId}.`);
    }

    return Object.freeze({
      caseId: input.caseId,
      sourcePath: input.sourcePath,
      sha256,
    });
  });
}

function runCli(): void {
  const repositoryRoot = process.argv[2];
  if (!repositoryRoot) {
    throw new Error(
      "Usage: npm run audit:qimen-sources -- /absolute/path/to/SeeWay-Rhythm",
    );
  }

  const fixture = QimenGoldenFixtureSchema.parse(
    JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "tests/fixtures/qimen-golden/verified-cases.json",
        ),
        "utf8",
      ),
    ),
  );
  const reports = auditQimenSourceFingerprints(
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

  for (const report of reports) {
    console.log(`[ok] ${report.caseId} ${report.sha256}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli();
}
