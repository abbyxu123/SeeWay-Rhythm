import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type UpstreamLock = {
  schemaVersion: number;
  repository: string;
  release: string;
  commit: string;
  boardId: string;
  espIdfVersion: string;
  license: string;
  sourceArchive: {
    url: string;
    sha256: string;
  };
};

const lockPath = resolve(
  process.cwd(),
  "firmware/xiaozhi-seeway/upstream.lock.json",
);

async function readLock(): Promise<UpstreamLock> {
  return JSON.parse(await readFile(lockPath, "utf8")) as UpstreamLock;
}

describe("XiaoZhi upstream lock", () => {
  it("pins the reviewed official release and exact Waveshare board", async () => {
    const lock = await readLock();

    expect(lock).toMatchObject({
      schemaVersion: 1,
      repository: "https://github.com/78/xiaozhi-esp32.git",
      release: "v2.4.2",
      boardId: "waveshare-esp32-s3-rlcd-4.2",
      espIdfVersion: "6.0.2",
      license: "MIT",
    });
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.sourceArchive.url).toBe(
      `https://github.com/78/xiaozhi-esp32/archive/${lock.commit}.tar.gz`,
    );
    expect(lock.sourceArchive.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
