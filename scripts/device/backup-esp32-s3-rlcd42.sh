#!/usr/bin/env bash
set -euo pipefail

PORT=""
EXPECTED_MAC=""
OUTPUT_ROOT="data/private/device-backups"
EXECUTE="false"
BAUD="115200"
ESPTOOL_BIN="${ESPTOOL_BIN:-}"

usage() {
  cat <<'USAGE'
Usage:
  backup-esp32-s3-rlcd42.sh --port PORT --expected-mac MAC [options]

Options:
  --output-root DIR  Backup parent directory (default: data/private/device-backups)
  --baud RATE        Read baud rate (default: 115200)
  --esptool PATH     Explicit esptool executable
  --execute          Perform the read-only backup; otherwise print the plan
  --help             Show this help

The script never erases or writes flash. It reads exactly 16 MB from an
ESP32-S3 after confirming the device MAC. The full read uses the chip ROM
instead of esptool's flasher stub for reliable USB-Serial/JTAG transfers.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --expected-mac)
      EXPECTED_MAC="${2:-}"
      shift 2
      ;;
    --output-root)
      OUTPUT_ROOT="${2:-}"
      shift 2
      ;;
    --baud)
      BAUD="${2:-}"
      shift 2
      ;;
    --esptool)
      ESPTOOL_BIN="${2:-}"
      shift 2
      ;;
    --execute)
      EXECUTE="true"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$PORT" || -z "$EXPECTED_MAC" ]]; then
  echo "Both --port and --expected-mac are required." >&2
  usage >&2
  exit 2
fi

if [[ -z "$ESPTOOL_BIN" ]]; then
  ESPTOOL_BIN="$(command -v esptool || true)"
fi
if [[ -z "$ESPTOOL_BIN" || ! -x "$ESPTOOL_BIN" ]]; then
  echo "esptool was not found; pass --esptool PATH." >&2
  exit 2
fi

EXPECTED_MAC="$(printf '%s' "$EXPECTED_MAC" | tr '[:upper:]' '[:lower:]')"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${OUTPUT_ROOT%/}/${EXPECTED_MAC//:/}-${STAMP}"
FLASH_FILE="$BACKUP_DIR/flash-full-16mb.bin"

echo "Read-only ESP32-S3 backup plan"
echo "  port: $PORT"
echo "  expected MAC: $EXPECTED_MAC"
echo "  bytes: 16777216"
echo "  output: $BACKUP_DIR"
echo "  esptool: $ESPTOOL_BIN"

if [[ "$EXECUTE" != "true" ]]; then
  echo "Dry run only. Re-run with --execute to read the device."
  exit 0
fi

if [[ ! -e "$PORT" ]]; then
  echo "Serial port does not exist: $PORT" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"

"$ESPTOOL_BIN" --chip esp32s3 --port "$PORT" chip-id \
  >"$BACKUP_DIR/chip-id.txt" 2>&1
"$ESPTOOL_BIN" --chip esp32s3 --port "$PORT" read-mac \
  >"$BACKUP_DIR/mac.txt" 2>&1

ACTUAL_MAC="$(
  sed -nE 's/.*MAC:[[:space:]]*([0-9A-Fa-f:]{17}).*/\1/p' \
    "$BACKUP_DIR/mac.txt" | head -n 1 | tr '[:upper:]' '[:lower:]'
)"
if [[ -z "$ACTUAL_MAC" ]]; then
  echo "Could not read the device MAC. See $BACKUP_DIR/mac.txt" >&2
  exit 1
fi
if [[ "$ACTUAL_MAC" != "$EXPECTED_MAC" ]]; then
  echo "Device MAC mismatch: expected $EXPECTED_MAC, found $ACTUAL_MAC" >&2
  exit 1
fi

"$ESPTOOL_BIN" --chip esp32s3 --port "$PORT" flash-id \
  >"$BACKUP_DIR/flash-id.txt" 2>&1
"$ESPTOOL_BIN" --chip esp32s3 --port "$PORT" --baud "$BAUD" --no-stub \
  read-flash --no-progress 0x00000000 0x01000000 "$FLASH_FILE"

file_size() {
  if stat -f%z "$1" >/dev/null 2>&1; then
    stat -f%z "$1"
  else
    stat -c%s "$1"
  fi
}

FLASH_SIZE="$(file_size "$FLASH_FILE")"
if [[ "$FLASH_SIZE" != "16777216" ]]; then
  echo "Unexpected backup size: $FLASH_SIZE bytes" >&2
  exit 1
fi

dd if="$FLASH_FILE" of="$BACKUP_DIR/partition-table.bin" \
  bs=1 skip=32768 count=4096 status=none

{
  echo "schema=seeway-esp32-backup/v1"
  echo "created_utc=$STAMP"
  echo "port=$PORT"
  echo "expected_mac=$EXPECTED_MAC"
  echo "actual_mac=$ACTUAL_MAC"
  echo "chip=esp32s3"
  echo "flash_bytes=$FLASH_SIZE"
  echo "read_baud=$BAUD"
  echo "read_mode=rom-no-stub"
  "$ESPTOOL_BIN" version | sed 's/^/esptool=/'
} >"$BACKUP_DIR/backup-metadata.txt"

(
  cd "$BACKUP_DIR"
  shasum -a 256 \
    flash-full-16mb.bin \
    partition-table.bin \
    chip-id.txt \
    flash-id.txt \
    mac.txt \
    backup-metadata.txt \
    >manifest.sha256
)

echo "Backup complete: $BACKUP_DIR"
echo "Verify with: scripts/device/verify-esp32-backup.sh '$BACKUP_DIR'"
