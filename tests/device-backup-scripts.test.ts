import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptsDirectory = resolve(process.cwd(), "scripts/device");
const recoveryGuide = resolve(
  process.cwd(),
  "firmware/esp32-s3-rlcd-4.2-smoke-test/RECOVERY.md",
);

async function readScript(name: string): Promise<string> {
  return readFile(resolve(scriptsDirectory, name), "utf8");
}

describe("ESP32-S3 RLCD backup scripts", () => {
  it("requires explicit identity and defaults to a read-only dry run", async () => {
    const source = await readScript("backup-esp32-s3-rlcd42.sh");

    expect(source).toContain("--port");
    expect(source).toContain("--expected-mac");
    expect(source).toContain("--execute");
    expect(source).toContain('EXECUTE="false"');
    expect(source).toContain("--chip esp32s3");
    expect(source).toContain("read-flash");
    expect(source).toContain("0x00000000 0x01000000");
    expect(source).toContain("--no-stub");
    expect(source).toContain("--no-progress");
    expect(source).not.toMatch(/erase[-_]flash/);
    expect(source).not.toMatch(/write[-_]flash/);
  });

  it("records identity, full-flash size, and SHA-256 evidence", async () => {
    const source = await readScript("backup-esp32-s3-rlcd42.sh");

    expect(source).toContain("chip-id.txt");
    expect(source).toContain("flash-id.txt");
    expect(source).toContain("flash-full-16mb.bin");
    expect(source).toContain("16777216");
    expect(source).toContain("manifest.sha256");
    expect(source).toContain("shasum -a 256");
  });

  it("verifies the exact backup size and stored digest", async () => {
    const source = await readScript("verify-esp32-backup.sh");

    expect(source).toContain("flash-full-16mb.bin");
    expect(source).toContain("16777216");
    expect(source).toContain("shasum -a 256 -c");
    expect(source).toContain("manifest.sha256");
  });

  it("documents the verified-backup gate and keeps restore manual", async () => {
    const source = await readFile(recoveryGuide, "utf8");

    expect(source).toContain("EXPECTED_MAC");
    expect(source).not.toMatch(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/i);
    expect(source).toContain("verify-esp32-backup.sh");
    expect(source).toContain("16777216");
    expect(source).toContain("manifest.sha256");
    expect(source).toContain("No restore command is automated");
  });
});
