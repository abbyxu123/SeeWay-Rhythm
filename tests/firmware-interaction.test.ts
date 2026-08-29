import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("RLCD interaction policy", () => {
  it("keeps verified content visible when a preview is unavailable", () => {
    const buildDirectory = mkdtempSync(join(tmpdir(), "seeway-interaction-"));
    const source = resolve(
      "firmware/esp32-s3-rlcd-4.2-smoke-test/test/interaction_policy_test.cpp",
    );

    try {
      for (const standard of ["c++17", "c++20"] as const) {
        const executable = join(buildDirectory, `interaction-policy-${standard}`);
        execFileSync(
          "c++",
          ["-std=" + standard, "-Wall", "-Wextra", "-Werror", source, "-o", executable],
          { stdio: "pipe" },
        );
        const result = execFileSync(executable, { encoding: "utf8" });
        expect(result).toBe("");
      }
    } finally {
      rmSync(buildDirectory, { recursive: true, force: true });
    }
  }, 15_000);
});
