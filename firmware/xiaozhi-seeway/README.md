# SeeWay XiaoZhi Firmware Integration

This directory owns the reproducible XiaoZhi integration for the Waveshare
ESP32-S3-RLCD-4.2. The exact reviewed upstream source is recorded in
`upstream.lock.json`.

## Safety boundary

- The upstream project and its stock board build are reference inputs. They
  are not flashed directly over the working SeeWay firmware.
- A complete, verified 16 MB device backup is required before the first custom
  XiaoZhi-derived flash.
- The product build uses the unique board and OTA identity
  `seeway-rhythm-rlcd-4.2`; it must not impersonate the stock Waveshare build.
- Downloaded source archives must match the SHA-256 in the lock file before
  they are prepared or built.

## Reviewed upstream facts

- Repository: `https://github.com/78/xiaozhi-esp32.git`
- Release: `v2.4.2`
- Official board path: `main/boards/waveshare/esp32-s3-rlcd-4.2`
- Target: ESP32-S3, 400 x 300 RLCD
- Audio: ES7210 input, ES8311 output, device AEC enabled
- Preferred toolchain: ESP-IDF 6.0.2
- License: MIT

The physical board reference supplied for this project is:
`https://docs.waveshare.net/ESP32-S3-RLCD-4.2/`.
