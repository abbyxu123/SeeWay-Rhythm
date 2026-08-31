# ESP32-S3-RLCD-4.2 Backup and Recovery Gate

This guide protects the working SeeWay device before the XiaoZhi firmware
integration changes its partition table or application image.

## Locked device identity

- Board: Waveshare ESP32-S3-RLCD-4.2
- Target MAC: supplied locally as `EXPECTED_MAC`; never committed
- Expected flash capacity: 16777216 bytes (16 MB)
- Backup location: `data/private/device-backups/`

Device backups are private and intentionally excluded from Git.

## Create the read-only backup

1. Connect the target board by its USB Type-C data port.
2. Find the current `/dev/cu.usbmodem*` port.
3. Run the backup script without `--execute` and inspect its plan.
4. Re-run with `--execute` only after the port and MAC are correct.

The script reads the chip identity and MAC before reading flash. A MAC
mismatch stops the process. It reads `0x01000000` bytes from address
`0x00000000`; it does not erase or write the board.

## Accept the backup

Run:

```sh
scripts/device/verify-esp32-backup.sh \
  data/private/device-backups/<device-id>-<UTC-stamp>
```

The backup is accepted only when:

- `flash-full-16mb.bin` is exactly 16777216 bytes;
- every file listed in `manifest.sha256` passes SHA-256 verification;
- `backup-metadata.txt` records the expected and actual MAC as identical;
- the extracted `partition-table.bin` can be decoded and reviewed.

Record the accepted backup directory and full-flash SHA-256 in the stage
checkpoint before any XiaoZhi-derived image is flashed.

## Recovery boundary

No restore command is automated. Restoring a full flash image overwrites the
entire device, so it requires a separate manual review of the selected port,
MAC, image size, manifest, partition table, and power stability. Keep the
verified full-flash image unchanged as the last-resort recovery source.
