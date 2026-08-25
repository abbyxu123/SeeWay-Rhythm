# ESP32-S3-RLCD-4.2 Bring-up Record

## Device identity

- Board: Waveshare ESP32-S3-RLCD-4.2
- Display: 4.2-inch reflective LCD, 300 x 400 pixels
- Host observed: macOS over USB Type-C
- USB identity: Espressif USB JTAG/serial debug unit
- Serial observations: `/dev/cu.usbmodem2101` on 2026-08-22 and
  `/dev/cu.usbmodem101` on 2026-08-24
- USB serial: Espressif USB-Serial/JTAG
- Chip: ESP32-S3 QFN56 revision v0.2, MAC `94:a9:90:cd:50:a0`
- Detected memory: 16 MB QIO Flash and 8 MB embedded PSRAM
- Observation timezone: Asia/Shanghai
- Official documentation: https://docs.waveshare.net/ESP32-S3-RLCD-4.2/

The serial device path is assigned by macOS and may change after reconnecting the
board. Firmware and tooling must discover Espressif serial devices instead of
hard-coding this path.

## Factory firmware state

The board powered on successfully over USB and displayed the factory hardware
status page. The photographed page showed:

- Screen output: working, with stable black-and-white UI
- SHTC3 readings displayed: 25 C and 35% relative humidity
- BLE scan count displayed: 20
- Wi-Fi scan count displayed: 5
- SD card status: `No Card`
- Battery indicator displayed: 100%
- Three physical controls present: PWR, BOOT, and KEY
- Short presses on the three controls: no visible response on this page

These are observations of the factory UI, not yet independent measurements.
In particular, the battery percentage must not be treated as verified until a
known battery is installed and the ADC reading is checked. `No Card` is expected
when no Micro SD card is installed.

## Button behavior and proposed product mapping

The official board behavior is:

- PWR: single press powers on; long press powers off.
- BOOT: holding it while powering on forces firmware download mode. It can also
  be read as an application button after boot.
- KEY: application-defined input.

The factory example documents long-press navigation for KEY and BOOT, so a lack
of visible response to short presses on the photographed page is not currently
classified as a fault.

Proposed SeeWay Rhythm mapping:

- KEY single press: current/next shichen toggle
- KEY long press: return to the default status page
- BOOT single press: start/stop a voice question
- BOOT double press: open the focused question result
- BOOT long press: open details, except during power-on
- PWR: retain power control only

The final enclosure must not hold BOOT down during power-on and must not transfer
force through the reflective display panel.

## Verification status

| Capability | Status | Evidence |
| --- | --- | --- |
| USB power | Verified | Board powers and screen renders |
| USB serial enumeration | Verified | Espressif device and macOS serial path detected |
| ESP32-S3 identity | Verified | `esptool` chip detection and MAC read succeeded |
| Flash capacity | Verified | `esptool flash-id` detected 16 MB at 3.3 V |
| Embedded PSRAM | Verified | Chip report detected 8 MB embedded PSRAM |
| Reflective display | Verified | Factory status page photographed |
| Temperature/humidity sensor | Detected | Values displayed; calibration not checked |
| Wi-Fi/BLE radio | Detected | Factory scan counts displayed; connection not tested |
| KEY/BOOT input | Pending | Short press had no visible effect; long-press test pending |
| PCF85063 communication | Verified | Address `0x51` responded on GPIO 13/14 and accepted a time write |
| RTC progression | Verified | RTC advanced across consecutive minute boundaries after host synchronization |
| RTC accuracy/retention | Pending | Drift and backup-cell retention still require a timed power-off test |
| Micro SD | Not tested | No card installed |
| Battery/charging | Pending | Factory percentage is not independent evidence |
| Microphones/audio output | Pending | No recording or speaker test performed |

## Recovery status

The official Waveshare combined factory image was downloaded before the first
custom upload and validated with `esptool image-info`:

- Image: `01_Factory_V1.bin`
- Size: 4,548,144 bytes
- Target: ESP32-S3, 16 MB, DIO 80 MHz
- Image checksum and validation hash: valid
- SHA-256:
  `d0591315a722d33f4a08931a0341ab840a6c15c56b289d621e8fc18bec8d55a8`

Two attempts to read the entire 16 MB device flash were rejected rather than
accepted as backups. The 921600 attempt ended with a digest mismatch, and the
460800 attempt stopped at about 36% with serial corruption. Neither partial
file was retained. Custom uploads therefore use 460800 or lower, do not enable
`Erase All Flash`, and retain the separately validated official recovery image.

## First firmware acceptance test

Before replacing the factory firmware, archive the vendor example version and
pin the board support dependencies. The first SeeWay firmware must prove this
minimal path before voice or battery work begins:

1. Build for ESP32-S3 with 16 MB Flash and 8 MB PSRAM.
2. Flash through the discovered Espressif serial device.
3. Render a fixed Chinese-font test page at 300 x 400.
4. Log KEY and BOOT single, double, and long presses over USB serial.
5. Receive one versioned time-context payload and render current/next shichen.
6. Reboot and confirm the device returns to the default status page.

## Version 0.2 RTC and calendar-header test

On 2026-08-25, firmware v0.2.0 was built and uploaded through
`/dev/cu.usbmodem101`. Flash writing and hash verification succeeded. Serial
startup identified the expected 16 MB Flash, 8 MB PSRAM, and PCF85063 RTC.

The RTC initially returned the internally consistent but stale value
`2026-01-05T21:38:10`. This proved why a responding RTC must not automatically
be classified as an accurate clock. It was synchronized over USB serial to
China Standard Time and then observed advancing through consecutive minute
boundaries while retaining weekday 2 (Tuesday).

The display header now contains Gregorian date, lunar date, solar term, and four
pillars. The reviewed screen fixture for `2026-08-25T01:35:40+08:00` is:

- Gregorian: `2026-08-25`, Tuesday
- Lunar: `农历丙午年七月十三`
- Solar term: `处暑`
- Pillars: `丙午年 丙申月 辛未日 己丑时`

This fixture pins the current deterministic provider output but does not change
its independent verification status. Dates without a device payload render
`待同步`; the firmware does not infer or reuse calendar conclusions.
