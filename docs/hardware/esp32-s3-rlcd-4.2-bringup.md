# ESP32-S3-RLCD-4.2 Bring-up Record

## Device identity

- Board: Waveshare ESP32-S3-RLCD-4.2
- Display: 4.2-inch reflective LCD, 300 x 400 pixels
- Host observed: macOS over USB Type-C
- USB identity: Espressif USB JTAG/serial debug unit
- Serial device at observation time: `/dev/cu.usbmodem2101`
- Observation date: 2026-08-22 (Asia/Shanghai)
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
| Reflective display | Verified | Factory status page photographed |
| Temperature/humidity sensor | Detected | Values displayed; calibration not checked |
| Wi-Fi/BLE radio | Detected | Factory scan counts displayed; connection not tested |
| KEY/BOOT input | Pending | Short press had no visible effect; long-press test pending |
| RTC accuracy/retention | Pending | No independent time or backup-cell test |
| Micro SD | Not tested | No card installed |
| Battery/charging | Pending | Factory percentage is not independent evidence |
| Microphones/audio output | Pending | No recording or speaker test performed |

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
