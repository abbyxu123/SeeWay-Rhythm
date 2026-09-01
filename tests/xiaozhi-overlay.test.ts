import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "firmware/xiaozhi-seeway");
const board = resolve(
  root,
  "overlay/main/boards/seeway/seeway-rhythm-rlcd-4.2",
);

async function read(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

describe("SeeWay XiaoZhi board overlay", () => {
  it("uses a unique board and OTA identity for the ESP32-S3 N16R8 target", async () => {
    const config = JSON.parse(
      await readFile(resolve(board, "config.json"), "utf8"),
    ) as {
      manufacturer: string;
      type: string;
      target: string;
      builds: Array<{ name: string; sdkconfig_append: string[] }>;
    };

    expect(config).toMatchObject({
      manufacturer: "seeway",
      type: "seeway-rhythm-rlcd-4.2",
      target: "esp32s3",
    });
    expect(config.builds).toHaveLength(1);
    const [build] = config.builds;
    expect(build).toBeDefined();
    if (!build) {
      throw new Error("SeeWay board build configuration is missing");
    }
    expect(build).toMatchObject({
      name: "seeway-rhythm-rlcd-4.2",
    });
    expect(build.sdkconfig_append).toEqual(
      expect.arrayContaining([
        "CONFIG_BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2=y",
        "CONFIG_ESPTOOLPY_FLASHSIZE_16MB=y",
        "CONFIG_SPIRAM=y",
        "CONFIG_SPIRAM_MODE_OCT=y",
        "CONFIG_SPIRAM_SPEED_80M=y",
        "CONFIG_USE_DEVICE_AEC=y",
      ]),
    );
  });

  it("pins the reviewed display, button, battery, and audio wiring", async () => {
    const config = await readFile(resolve(board, "config.h"), "utf8");

    expect(config).toContain("#define RLCD_WIDTH   400");
    expect(config).toContain("#define RLCD_HEIGHT  300");
    expect(config).toContain("#define BOOT_BUTTON_GPIO");
    expect(config).toContain("GPIO_NUM_0");
    expect(config).toContain("#define KEY_BUTTON_GPIO");
    expect(config).toContain("GPIO_NUM_18");
    expect(config).toContain("#define BATTERY_ADC_CHANNEL");
    expect(config).toContain("ADC_CHANNEL_3");
    expect(config).toContain("AUDIO_CODEC_ES7210_ADDR");
    expect(config).toContain("AUDIO_CODEC_ES8311_ADDR");
    expect(config).toContain("AUDIO_CODEC_PA_PIN");
    expect(config).toContain("GPIO_NUM_46");
  });

  it("keeps BOOT and KEY distinct and does not bind the hardware PWR button", async () => {
    const source = await readFile(
      resolve(board, "seeway-rhythm-rlcd-4.2.cc"),
      "utf8",
    );

    expect(source).toContain("Button boot_button_");
    expect(source).toContain("Button key_button_");
    expect(source).toContain("boot_button_(BOOT_BUTTON_GPIO)");
    expect(source).toContain("key_button_(KEY_BUTTON_GPIO)");
    expect(source).toContain("BoxAudioCodec");
    expect(source).toContain("AUDIO_CODEC_ES7210_ADDR");
    expect(source).toContain("AUDIO_CODEC_ES8311_ADDR");
    expect(source).not.toMatch(/PWR_BUTTON|POWER_BUTTON|GPIO_NUM_\d+.*PWR/i);
  });

  it("ships the reviewed RLCD driver inside the custom board overlay", async () => {
    await access(resolve(board, "custom_lcd_display.cc"));
    const header = await readFile(
      resolve(board, "custom_lcd_display.h"),
      "utf8",
    );

    expect(header).toContain("class CustomLcdDisplay");
    expect(header).toContain("RLCD_Display");
  });

  it("prepares only the locked archive and patches only a disposable source tree", async () => {
    const source = await read("scripts/prepare-upstream.sh");

    expect(source).toContain("upstream.lock.json");
    expect(source).toContain("shasum -a 256");
    expect(source).toContain("sourceArchive.sha256");
    expect(source).toContain("overlay/main");
    expect(source).toContain(
      "boards/seeway/seeway-rhythm-rlcd-4.2/config.json",
    );
    expect(source).toContain("BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2");
    expect(source).toContain("seeway-rhythm-rlcd-4.2");
    expect(source).toContain("Prepared source mismatch");
    expect(source).toContain(
      'rg -q "BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2"',
    );
    expect(source).not.toContain(
      'rg -q "CONFIG_BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2"',
    );
    expect(source).not.toMatch(/git\s+(?:checkout|reset|clean)/);
  });

  it("refuses the wrong ESP-IDF and records reviewable build evidence", async () => {
    const source = await read("scripts/build.sh");

    expect(source).toContain("6.0.2");
    expect(source).toContain("ESP-IDF");
    expect(source).toContain("seeway-rhythm-rlcd-4.2");
    expect(source).toContain(
      "scripts/build.py seeway/seeway-rhythm-rlcd-4.2",
    );
    expect(source).toContain("size");
    expect(source).toContain("partition-table");
    expect(source).toContain("build/xiaozhi.bin");
    expect(source).toContain("build/generated_assets.bin");
    expect(source).toContain("shasum -a 256");
    expect(source).not.toMatch(/write[-_]flash|erase[-_]flash|flash\b/);
  });

  it("records a verified non-flashed build within the reviewed partitions", async () => {
    const evidence = JSON.parse(await read("build-evidence.json")) as {
      board: string;
      target: string;
      upstreamCommit: string;
      espIdfVersion: string;
      flashed: boolean;
      binaries: {
        application: { bytes: number; partitionBytes: number; sha256: string };
        assets: { bytes: number; partitionBytes: number; sha256: string };
        merged: { bytes: number; flashBytes: number; sha256: string };
      };
    };

    expect(evidence).toMatchObject({
      board: "seeway-rhythm-rlcd-4.2",
      target: "esp32s3-n16r8",
      upstreamCommit: "e8d8a4010788afd60f0c8aa3b2e3d0a7bb8f02e5",
      espIdfVersion: "v6.0.2",
      flashed: false,
    });
    expect(evidence.binaries.application.bytes).toBeLessThanOrEqual(
      evidence.binaries.application.partitionBytes,
    );
    expect(evidence.binaries.assets.bytes).toBeLessThanOrEqual(
      evidence.binaries.assets.partitionBytes,
    );
    expect(evidence.binaries.merged.bytes).toBeLessThanOrEqual(
      evidence.binaries.merged.flashBytes,
    );
    expect(evidence.binaries.application.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.binaries.assets.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.binaries.merged.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
