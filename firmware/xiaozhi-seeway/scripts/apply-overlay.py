#!/usr/bin/env python3
"""Register the SeeWay board in a disposable, locked XiaoZhi source tree."""

from __future__ import annotations

import sys
from pathlib import Path


BOARD_SYMBOL = "CONFIG_BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2"
BOARD_DIR = "seeway/seeway-rhythm-rlcd-4.2"


def replace_once(path: Path, needle: str, replacement: str) -> None:
    source = path.read_text(encoding="utf-8")
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

    replace_once(
        cmake,
        """elseif(CONFIG_BOARD_TYPE_WAVESHARE_ESP32_S3_RLCD_4_2)
    set(BOARD_DIR \"waveshare/esp32-s3-rlcd-4.2\")
    set(BUILTIN_TEXT_FONT font_noto_sans_basic_30_4)
    set(BUILTIN_ICON_FONT font_material_symbols_30_4)
""",
        f"""elseif({BOARD_SYMBOL})
    set(BOARD_DIR \"{BOARD_DIR}\")
    set(BUILTIN_TEXT_FONT font_noto_sans_basic_30_4)
    set(BUILTIN_ICON_FONT font_material_symbols_30_4)
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


if __name__ == "__main__":
    main()
