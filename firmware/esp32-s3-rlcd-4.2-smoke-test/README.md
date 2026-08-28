# ESP32-S3-RLCD-4.2 Device Firmware

Recoverable Arduino/U8g2 firmware for the SeeWay Rhythm 400 x 300 reflective
display. Version 0.3 renders only versioned Qimen payloads that have passed the
host calculator and independent verifier.

## Toolchain

- Arduino CLI 1.5.1
- Espressif `esp32:esp32` 3.3.11
- ArduinoJson 7.4.3
- U8g2 2.36.19
- SensorLib 0.4.1
- Board: `esp32:esp32:esp32s3`

Board options follow Waveshare's `Tools-Configuration.png`: USB CDC on boot,
240 MHz, QIO 80 MHz, 16 MB Flash, OPI PSRAM, Hardware CDC/JTAG, and the 3 MB
app / 9.9 MB FATFS partition. Upload speed is pinned to 460800 for this host.

## Build And Upload

```bash
arduino-cli compile \
  --build-path /tmp/seeway-rlcd42-build \
  --fqbn 'esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashMode=qio,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,UploadMode=default,UploadSpeed=460800,USBMode=hwcdc' \
  firmware/esp32-s3-rlcd-4.2-smoke-test/SeeWay_RLCD42_Smoke

arduino-cli upload \
  --port /dev/cu.usbmodem101 \
  --input-dir /tmp/seeway-rlcd42-build \
  --fqbn 'esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashMode=qio,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,UploadMode=default,UploadSpeed=460800,USBMode=hwcdc' \
  firmware/esp32-s3-rlcd-4.2-smoke-test/SeeWay_RLCD42_Smoke
```

Always identify the actual board port before uploading. The port above records
the reviewed development board, not a portable assumption.

## Controls

- KEY short press: current / next shichen.
- BOOT short press: four-row summary / complete nine-palace chart.
- PWR: hardware power control; it is not treated as an application key.

The summary contains `有利`, `注意`, `方位`, and `建议`. The chart view uses
the Luo Shu screen order `4-9-2 / 3-5-7 / 8-1-6` and shows earth/heaven stems,
stars, gates, deities, void and horse markers.

## Trust Boundary

`QimenPayload.cpp` validates the exact payload/profile versions, profile
reference, verification state, SHA-256 chart identifier, evidence-bearing rows,
rule IDs, nine unique palaces, center-palace emptiness, void/horse consistency,
and current target period before display. Blocked data cannot carry guidance or
chart content. A stale period is rendered as `未同步` instead of being reused.

Validated profiles and current/next payloads are checksummed in ESP32 NVS and
survive firmware reflashing when erase-all is disabled. Changing profile ID or
version clears the cached payload slots.

Birth data is only a versioned profile reference in v0.3. It does not silently
alter the base time-Qimen chart.

## Local Provisioning

Keep the profile JSON outside Git, then generate Base64-chunked serial commands:

```bash
npm run device:bundle -- \
  --profile /absolute/private/path/profile.json \
  --time 2026-08-29T01:36:55
```

The transport uses `BEGIN=PROFILE|PAYLOAD`, short `CHUNK=` records and `END` so
large UTF-8 JSON cannot overrun the USB receive buffer. `STATUS` reports whether
the profile and both verified slots are present. Diagnostic commands
`SELECT=CURRENT|NEXT` and `VIEW=SUMMARY|CHART` exercise the same paths as the two
physical buttons.

The PCF85063 RTC uses address `0x51`, SDA GPIO 13 and SCL GPIO 14. It can be set
at 115200 baud with `TIME=YYYY-MM-DDTHH:MM:SS`.

## Vendor Baseline

`ST7305_U8g2.cpp` and `ST7305_U8g2.h` derive from Waveshare's Apache-2.0
[U8g2 example](https://github.com/waveshareteam/ESP32-S3-RLCD-4.2/tree/main/02_Example/Arduino/10_U8G2_Test).
The recoverable official combined image is `01_Factory_V1.bin`, SHA-256
`d0591315a722d33f4a08931a0341ab840a6c15c56b289d621e8fc18bec8d55a8`.
