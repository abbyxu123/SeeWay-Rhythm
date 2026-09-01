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

## Reproduce

1. Prepare the locked upstream archive into the disposable work tree:

```sh
firmware/xiaozhi-seeway/scripts/prepare-upstream.sh \
  /absolute/path/to/xiaozhi-esp32-e8d8a4010788afd60f0c8aa3b2e3d0a7bb8f02e5.tar.gz
```

2. Export ESP-IDF 6.0.2 and build the SeeWay target:

```sh
IDF_PATH=/absolute/path/to/esp-idf-v6.0.2 \
  firmware/xiaozhi-seeway/scripts/build.sh
```

The build script checks the ESP-IDF version and records the application,
assets, merged image, partition table, sizes, and SHA-256 values in a local
evidence directory. It never writes to or erases a connected device.

## Verified build

- Board identity: `seeway-rhythm-rlcd-4.2`, ESP32-S3 N16R8, 400 x 300 RLCD
- Application: 2,921,760 bytes in a 4,128,768-byte OTA partition
- Assets: 2,609,393 bytes in an 8,388,608-byte partition
- Merged image: 10,998,001 bytes in 16,777,216-byte flash

`build-evidence.json` is the tracked, machine-readable receipt for the latest
reviewed build. The timestamped binaries stay out of Git because they are local
build artifacts and must be verified again immediately before any flash.
