import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { QimenGoldenFixtureSchema } from "@seeway/qimen-core";
import { afterEach, describe, expect, it } from "vitest";
import { auditQimenGoldenFixture } from "../scripts/qimen-golden-audit";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const fixture = QimenGoldenFixtureSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(
        TEST_DIRECTORY,
        "fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  ),
);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixtureWithLocalSource(content: string) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "seeway-golden-audit-"));
  temporaryDirectories.push(repositoryRoot);
  const relativePath = "reference materials/source.pdf";
  mkdirSync(join(repositoryRoot, "reference materials"));
  writeFileSync(join(repositoryRoot, relativePath), content);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const localFixture = QimenGoldenFixtureSchema.parse({
    ...fixture,
    cases: fixture.cases.map((goldenCase) => ({
      ...goldenCase,
      provenance: {
        ...goldenCase.provenance,
        sourcePath: relativePath,
        sourceSha256: sha256,
      },
      chart: {
        ...goldenCase.chart,
        sourceReferences: goldenCase.chart.sourceReferences.map(
          (reference) => ({
            ...reference,
            fingerprint: `sha256:${sha256}`,
          }),
        ),
      },
    })),
  });

  return { repositoryRoot, localFixture };
}

describe("complete Qimen golden fixture audit", () => {
  it("requires structure, rebuilt time facts and real source bytes", () => {
    const { repositoryRoot, localFixture } =
      fixtureWithLocalSource("verified source bytes");

    expect(
      auditQimenGoldenFixture(localFixture, repositoryRoot),
    ).toMatchObject({
      ready: true,
      sourceAuditCount: 3,
      timeAuditCount: 3,
      structure: { ready: true, verifiedCaseCount: 3 },
    });
  });

  it("rejects a fixture whose declared time facts were not rebuilt", () => {
    const { repositoryRoot, localFixture } =
      fixtureWithLocalSource("verified source bytes");
    const wrongTimeFixture = {
      ...localFixture,
      cases: localFixture.cases.map((goldenCase, index) =>
        index === 0
          ? {
              ...goldenCase,
              expectedTime: {
                ...goldenCase.expectedTime,
                pillars: {
                  ...goldenCase.expectedTime.pillars,
                  day: "甲子",
                },
              },
            }
          : goldenCase,
      ),
    };

    expect(() =>
      auditQimenGoldenFixture(wrongTimeFixture, repositoryRoot),
    ).toThrow(/time context mismatch/i);
  });

  it("rejects a fixture when the private source bytes change", () => {
    const { repositoryRoot, localFixture } =
      fixtureWithLocalSource("verified source bytes");
    writeFileSync(
      join(repositoryRoot, "reference materials/source.pdf"),
      "changed bytes",
    );

    expect(() =>
      auditQimenGoldenFixture(localFixture, repositoryRoot),
    ).toThrow(/source hash mismatch/i);
  });
});
