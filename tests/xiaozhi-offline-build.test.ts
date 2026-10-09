import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("firmware/xiaozhi-seeway");
const board = "CONFIG_BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2";
const cmakeAnchor = 'elseif(CONFIG_BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2)\n    set(BOARD_DIR "waveshare/esp32-s3-rlcd-4.2")\n    set(BUILTIN_TEXT_FONT font_noto_sans_basic_30_4)\n    set(BUILTIN_ICON_FONT font_material_symbols_30_4)\n';
const kconfig = '    config BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2\n        bool "Waveshare ESP32-S3-RLCD-4.2"\n        depends on IDF_TARGET_ESP32S3\n    depends on BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2 || BOARD_TYPE_WAVESHARE_ESP32_S3_TOUCH_LCD_1_85B\n';

describe("offline firmware build inputs", () => {
  it.each(["fresh", "previous-registration"])("updates %s source idempotently without a device", (state) => {
    const temporary = mkdtempSync(join(tmpdir(), "seeway-overlay-"));
    try {
      mkdirSync(join(temporary, "main/audio"), {recursive: true});
      writeFileSync(join(temporary, "main/audio/audio_service.cc"), '#include "audio_service.h"\nbool AudioService::ReadAudioData(std::vector<int16_t>& data, int sample_rate, int samples) {\n    return true;\n}\n');
      const cmake = join(temporary, "main/CMakeLists.txt");
      writeFileSync(cmake, (state === "fresh" ? "" : "elseif(" + board + ')\n    set(BOARD_DIR "seeway/seeway-rhythm-rlcd-4.2")\n') + cmakeAnchor);
      writeFileSync(join(temporary, "main/Kconfig.projbuild"), kconfig);
      const run = () => execFileSync("python3", [join(root, "scripts/apply-overlay.py"), temporary]);
      run();
      const once = readFileSync(cmake, "utf8");
      const onceAudio = readFileSync(join(temporary, "main/audio/audio_service.cc"), "utf8");
      const onceKconfig = readFileSync(join(temporary, "main/Kconfig.projbuild"), "utf8");
      run();
      expect(readFileSync(cmake, "utf8")).toBe(once);
      expect(readFileSync(join(temporary, "main/audio/audio_service.cc"), "utf8")).toBe(onceAudio);
      expect(readFileSync(join(temporary, "main/Kconfig.projbuild"), "utf8")).toBe(onceKconfig);
      expect(once.split(board)).toHaveLength(2);
      for (const source of ["seeway_buttons.cc", "seeway_mcp_tools.cc", "seeway_display.cc", "seeway_font_14.c"]) {
        expect(once).toContain(source);
      }
      expect(once).toContain('list(APPEND INCLUDE_DIRS');
    } finally {
      rmSync(temporary, {recursive: true, force: true});
    }
  });

  it("ships a reproducible licensed offline Chinese font", () => {
    const manifest = JSON.parse(readFileSync(join(root, "assets/fonts/manifest.json"), "utf8"));
    const generated = readFileSync(join(root, manifest.output), "utf8");
    expect(manifest.generator).toBe("lv_font_conv@1.5.3");
    expect(manifest.ranges).toBe("0x20-0x7e,0x4e00-0x9fff");
    expect(manifest.license).toBe("OFL-1.1");
    expect(createHash("sha256").update(generated).digest("hex")).toBe(manifest.generatedSha256);
    expect(generated).toContain(".line_height = 17");
    expect(generated).not.toContain("/Users/");
    expect(readFileSync(join(root, "assets/fonts/OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE");
  });
});
