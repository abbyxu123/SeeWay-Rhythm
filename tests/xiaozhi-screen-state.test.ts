import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const firmwareRoot = resolve("firmware/xiaozhi-seeway");
const seewayRoot = resolve(firmwareRoot, "overlay/main/seeway");
const boardRoot = resolve(
  firmwareRoot,
  "overlay/main/boards/seeway/seeway-rhythm-rlcd-4.2",
);

describe("SeeWay XiaoZhi screen state", () => {
  it("keeps every user-visible state on the current shichen", () => {
    const buildDirectory = mkdtempSync(join(tmpdir(), "seeway-screen-state-"));
    const stateSource = resolve(seewayRoot, "seeway_screen_state.cc");
    const testSource = resolve(
      firmwareRoot,
      "host-tests/screen_state_test.cpp",
    );

    try {
      for (const standard of ["c++17", "c++20"] as const) {
        const executable = join(buildDirectory, `screen-state-${standard}`);
        execFileSync(
          "c++",
          [
            `-std=${standard}`,
            "-Wall",
            "-Wextra",
            "-Werror",
            "-I",
            seewayRoot,
            stateSource,
            testSource,
            "-o",
            executable,
          ],
          { stdio: "pipe" },
        );
        expect(execFileSync(executable, { encoding: "utf8" })).toBe("");
      }
    } finally {
      rmSync(buildDirectory, { recursive: true, force: true });
    }
  }, 15_000);

  it("draws the reviewed information hierarchy without developer diagnostics", () => {
    const display = readFileSync(
      resolve(seewayRoot, "seeway_display.cc"),
      "utf8",
    );

    for (const label of [
      "本时主势",
      "宜做",
      "慎防",
      "吉方",
      "行动",
      "盘面",
      "盘眼",
      "解读",
      "依据",
    ]) {
      expect(display).toContain(label);
    }
    for (const branch of [
      "子",
      "丑",
      "寅",
      "卯",
      "辰",
      "巳",
      "午",
      "未",
      "申",
      "酉",
      "戌",
      "亥",
    ]) {
      expect(display).toContain(`"${branch}"`);
    }

    expect(display).toContain("RenderAnalogClock");
    expect(display).toContain("LV_OBJ_FLAG_HIDDEN");
    expect(display).not.toContain("下一时辰");
    expect(display).not.toMatch(/RTC OK|UNSYNCED|KEY \d|BOOT \d|v0\.\d/);
  });

  it("registers the SeeWay display sources and constructs the custom display", () => {
    const patcher = readFileSync(
      resolve(firmwareRoot, "scripts/apply-overlay.py"),
      "utf8",
    );
    const board = readFileSync(
      resolve(boardRoot, "seeway-rhythm-rlcd-4.2.cc"),
      "utf8",
    );

    expect(patcher).toContain("seeway/seeway_screen_state.cc");
    expect(patcher).toContain("seeway/seeway_display.cc");
    expect(patcher).toContain("font_noto_sans_basic_14_1");
    expect(board).toContain('#include "seeway_display.h"');
    expect(board).toContain("SeeWayDisplay *display_");
    expect(board).toContain("new SeeWayDisplay");
  });
});
