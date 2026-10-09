#!/usr/bin/env python3
"""Register the SeeWay board in a disposable, locked XiaoZhi source tree."""

from __future__ import annotations

import re
import sys
from pathlib import Path


BOARD_SYMBOL = "CONFIG_BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2"
BOARD_DIR = "seeway/seeway-rhythm-rlcd-4.2"


def replace_once(path: Path, needle: str, replacement: str) -> None:
    source = path.read_text(encoding="utf-8")
    if replacement in source:
        return
    count = source.count(needle)
    if count != 1:
        raise RuntimeError(
            f"Prepared source mismatch: expected one anchor in {path}, found {count}",
        )
    path.write_text(source.replace(needle, replacement, 1), encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: apply-overlay.py PREPARED_SOURCE")

    root = Path(sys.argv[1]).resolve()
    cmake = root / "main/CMakeLists.txt"
    kconfig = root / "main/Kconfig.projbuild"

    replace_once(
        kconfig,
        """    config BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2
        bool \"Waveshare ESP32-S3-RLCD-4.2\"
        depends on IDF_TARGET_ESP32S3
""",
        """    config BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2
        bool \"Waveshare ESP32-S3-RLCD-4.2\"
        depends on IDF_TARGET_ESP32S3
    config BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2
        bool \"SeeWay Rhythm RLCD 4.2\"
        depends on IDF_TARGET_ESP32S3
""",
    )

    # Replace an earlier SeeWay registration when reusing a prepared tree.
    source = cmake.read_text(encoding="utf-8")
    branch = f"elseif({BOARD_SYMBOL})"
    if source.count(branch) > 1:
        raise RuntimeError("Prepared source mismatch: duplicate SeeWay registration")
    if branch in source:
        pattern = rf"{re.escape(branch)}.*?(?=elseif\(CONFIG_BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2\))"
        source, count = re.subn(pattern, "", source, flags=re.DOTALL)
        if count != 1:
            raise RuntimeError("Prepared source mismatch: missing registration boundary")
        cmake.write_text(source, encoding="utf-8")

    replace_once(
        cmake,
        """elseif(CONFIG_BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2)
    set(BOARD_DIR \"waveshare/esp32-s3-rlcd-4.2\")
    set(BUILTIN_TEXT_FONT font_noto_sans_basic_30_4)
    set(BUILTIN_ICON_FONT font_material_symbols_30_4)
""",
        f"""elseif({BOARD_SYMBOL})
    set(BOARD_DIR \"{BOARD_DIR}\")
    set(BUILTIN_TEXT_FONT font_noto_sans_basic_14_1)
    set(BUILTIN_ICON_FONT font_material_symbols_14_1)
    list(APPEND SOURCES
        "seeway/seeway_buttons.cc"
        "seeway/seeway_mcp_tools.cc"
        "seeway/seeway_character.cc"
        "seeway/seeway_font_14.c"
        "seeway/seeway_screen_state.cc"
        "seeway/seeway_display.cc"
    )
    list(APPEND INCLUDE_DIRS
        "${{CMAKE_CURRENT_SOURCE_DIR}}/seeway"
        "${{CMAKE_CURRENT_SOURCE_DIR}}/boards/${{BOARD_DIR}}"
    )
elseif(CONFIG_BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2)
    set(BOARD_DIR \"waveshare/esp32-s3-rlcd-4.2\")
    set(BUILTIN_TEXT_FONT font_noto_sans_basic_30_4)
    set(BUILTIN_ICON_FONT font_material_symbols_30_4)
""",
    )

    replace_once(
        kconfig,
        "BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2 || BOARD_TYPE_WAVESHARE_ESP32_S3_TOUCH_LCD_1_85B",
        "BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2 || BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2 || BOARD_TYPE_WAVESHARE_ESP32_S3_TOUCH_LCD_1_85B",
    )

    # Gate every capture attempt, not just the initial button press.
    audio_service = root / "main/audio/audio_service.cc"
    replace_once(
        audio_service,
        '#include "audio_service.h"',
        '#include "audio_service.h"\n'
        '#if CONFIG_BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2\n'
        '#include "seeway_audio_privacy.h"\n'
        '#endif',
    )
    read_signature = (
        "bool AudioService::ReadAudioData(std::vector<int16_t>& data, "
        "int sample_rate, int samples) {"
    )
    replace_once(
        audio_service,
        read_signature,
        read_signature + """
#if CONFIG_BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2
    auto privacy = seeway::AudioInputPrivacy::AcquireRead();
    if (!privacy.allowed) {
        data.clear();
        privacy.lock.unlock();
        vTaskDelay(pdMS_TO_TICKS(20));
        return false;
    }
#endif
""",
    )


if __name__ == "__main__":
    main()
