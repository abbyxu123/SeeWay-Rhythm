# RLCD 4.2 First Smoke Test Design

## Goal

Prove the real Waveshare ESP32-S3-RLCD-4.2 hardware path before the product UI
or device API is expanded. The test must be recoverable and must not present
placeholder divination text as a real result.

## Scope

- Build with the official ESP32-S3 Arduino core and Waveshare ST7305/U8g2
  driver baseline.
- Render a restrained landscape screen at 400 x 300.
- Show the compile-time clock, weekday, lunar-date fixture, current or next
  shichen, and three result slots marked as waiting for the algorithm.
- Count KEY and BOOT presses on screen and in the USB serial log.
- Refresh only when the minute, selected shichen, or button counts change.

This stage does not connect Wi-Fi, set the RTC, run a Qimen chart, play audio,
or persist user data.

## Interaction

- KEY (GPIO18): toggle current/next shichen.
- BOOT (GPIO0): increment its visible diagnostic count.
- PWR: retain the board power behavior and is not read by the sketch.

## Acceptance

1. The sketch compiles for ESP32-S3 N16R8 with the vendor-documented options.
2. Upload succeeds without erasing all flash.
3. The screen is correctly oriented and all four edges are visible.
4. Chinese labels, large time range, and status rows are legible.
5. KEY changes the shichen view; BOOT changes its count.
6. USB serial prints the ready line and each button event.

The user reviews a real-device photo at this checkpoint before final UI work.
