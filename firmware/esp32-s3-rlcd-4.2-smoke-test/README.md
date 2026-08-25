# ESP32-S3-RLCD-4.2 Smoke Test

First recoverable hardware acceptance sketch for SeeWay Rhythm.

## Toolchain

- Arduino CLI 1.5.1
- Espressif `esp32:esp32` 3.3.11
- U8g2 2.36.19
- SensorLib 0.4.1
- Board: `esp32:esp32:esp32s3`

Board options follow Waveshare's `Tools-Configuration.png`:

- USB CDC on boot: enabled
- CPU: 240 MHz
- Flash mode: QIO 80 MHz
- Flash size: 16 MB
- Partition: 16 MB, 3 MB app / 9.9 MB FATFS
- PSRAM: OPI PSRAM
- USB mode: Hardware CDC and JTAG
- Upload mode: UART0 / Hardware CDC
- Erase all flash: disabled

The repository pins upload speed to 460800 for this host because two full-flash
read attempts showed serial corruption at higher sustained throughput.

## Build

```bash
arduino-cli compile \
  --build-path /tmp/seeway-rlcd42-build \
  --fqbn 'esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashMode=qio,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,UploadMode=default,UploadSpeed=460800,USBMode=hwcdc' \
  firmware/esp32-s3-rlcd-4.2-smoke-test/SeeWay_RLCD42_Smoke
```

## Vendor Baseline

`ST7305_U8g2.cpp` and `ST7305_U8g2.h` are derived from the Waveshare Apache-2.0
example at:

https://github.com/waveshareteam/ESP32-S3-RLCD-4.2/tree/main/02_Example/Arduino/10_U8G2_Test

The official combined factory recovery image is `01_Factory_V1.bin`, SHA-256:

`d0591315a722d33f4a08931a0341ab840a6c15c56b289d621e8fc18bec8d55a8`

Source:

https://github.com/waveshareteam/ESP32-S3-RLCD-4.2/tree/main/03_Firmware

## Version 0.2 hardware review

The v0.2 screen uses the complete U8g2 `wqy16` GB2312 font so required Chinese
glyphs do not silently disappear. The header renders:

- RTC time, weekday, and Gregorian date
- lunar date and current solar term
- year, month, day, and hour pillars

The reviewed `2026-08-25` calendar facts are a temporary device fixture produced
by `@seeway/time-core`. A different date renders `待同步` instead of reusing
stale calendar facts. Production firmware will receive this versioned payload
from the deterministic calendar service.

The PCF85063 is connected at address `0x51`, with SDA on GPIO 13 and SCL on GPIO
14, matching Waveshare's official example. During bring-up the RTC can be set
over USB serial at 115200 baud:

```text
TIME=2026-08-25T01:35:40
```

An invalid or stopped RTC falls back to the firmware build time. A valid but
stale RTC is not silently trusted by the host bring-up procedure: it is compared
with host time and explicitly synchronized before acceptance.
