import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditQimenSourceFingerprints } from "../scripts/qimen-source-audit";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createSource(content: string) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "seeway-source-audit-"));
  temporaryDirectories.push(repositoryRoot);
  const relativePath = "reference materials/source.pdf";
  const sourcePath = join(repositoryRoot, relativePath);
  mkdirSync(join(repositoryRoot, "reference materials"));
  writeFileSync(sourcePath, content);

  return {
    repositoryRoot,
    relativePath,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

describe("Qimen source fingerprint audit", () => {
  it("recomputes the private source file hash", () => {
    const source = createSource("checked source bytes");

    expect(
      auditQimenSourceFingerprints(
        [
          {
            caseId: "case-1",
            sourcePath: source.relativePath,
            expectedSha256: source.sha256,
            chartFingerprints: [`sha256:${source.sha256}`],
          },
        ],
        source.repositoryRoot,
      ),
    ).toEqual([
      {
        caseId: "case-1",
        sourcePath: source.relativePath,
        sha256: source.sha256,
      },
    ]);
  });

  it("rejects changed source bytes or a conflicting chart fingerprint", () => {
    const source = createSource("actual source bytes");

    expect(() =>
      auditQimenSourceFingerprints(
        [
          {
            caseId: "case-1",
            sourcePath: source.relativePath,
            expectedSha256: "0".repeat(64),
            chartFingerprints: [`sha256:${source.sha256}`],
          },
        ],
        source.repositoryRoot,
      ),
    ).toThrow(/source hash mismatch/i);

    expect(() =>
      auditQimenSourceFingerprints(
        [
          {
            caseId: "case-1",
            sourcePath: source.relativePath,
            expectedSha256: source.sha256,
            chartFingerprints: [`sha256:${"f".repeat(64)}`],
          },
        ],
        source.repositoryRoot,
      ),
    ).toThrow(/chart fingerprint mismatch/i);
  });

  it("rejects a source symlink that escapes the materials directory", () => {
    const repositoryRoot = mkdtempSync(
      join(tmpdir(), "seeway-source-audit-"),
    );
    temporaryDirectories.push(repositoryRoot);
    const materialsRoot = join(repositoryRoot, "reference materials");
    const outsidePath = join(repositoryRoot, "outside.pdf");
    mkdirSync(materialsRoot);
    writeFileSync(outsidePath, "outside bytes");
    symlinkSync(outsidePath, join(materialsRoot, "source.pdf"));
    const sha256 = createHash("sha256")
      .update("outside bytes")
      .digest("hex");

    expect(() =>
      auditQimenSourceFingerprints(
        [
          {
            caseId: "case-1",
            sourcePath: "reference materials/source.pdf",
            expectedSha256: sha256,
            chartFingerprints: [`sha256:${sha256}`],
          },
        ],
        repositoryRoot,
      ),
    ).toThrow(/leaves reference materials/i);
  });
});
