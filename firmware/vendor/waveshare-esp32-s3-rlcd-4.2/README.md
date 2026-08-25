# Waveshare Factory Recovery

This directory preserves the official combined factory image used as the
recovery point before SeeWay Rhythm first writes the development board.

- Source repository:
  https://github.com/waveshareteam/ESP32-S3-RLCD-4.2/tree/main/03_Firmware
- Upstream license: Apache-2.0
- File: `01_Factory_V1.bin`
- Size: 4,548,144 bytes
- SHA-256:
  `d0591315a722d33f4a08931a0341ab840a6c15c56b289d621e8fc18bec8d55a8`

Recovery command, with the current serial port substituted when necessary:

```bash
esptool --chip esp32s3 --port /dev/cu.usbmodem101 --baud 460800 \
  write-flash 0x0 firmware/vendor/waveshare-esp32-s3-rlcd-4.2/01_Factory_V1.bin
```

Do not restore while another serial monitor owns the port.
