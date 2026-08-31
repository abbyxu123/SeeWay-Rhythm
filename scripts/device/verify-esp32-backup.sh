#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: verify-esp32-backup.sh BACKUP_DIR" >&2
  exit 2
fi

BACKUP_DIR="${1%/}"
FLASH_FILE="$BACKUP_DIR/flash-full-16mb.bin"
MANIFEST="$BACKUP_DIR/manifest.sha256"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory does not exist: $BACKUP_DIR" >&2
  exit 2
fi
if [[ ! -f "$FLASH_FILE" || ! -f "$MANIFEST" ]]; then
  echo "Backup is missing flash-full-16mb.bin or manifest.sha256" >&2
  exit 1
fi

file_size() {
  if stat -f%z "$1" >/dev/null 2>&1; then
    stat -f%z "$1"
  else
    stat -c%s "$1"
  fi
}

FLASH_SIZE="$(file_size "$FLASH_FILE")"
if [[ "$FLASH_SIZE" != "16777216" ]]; then
  echo "Invalid full-flash size: $FLASH_SIZE bytes" >&2
  exit 1
fi

if ! grep -Eq '[0-9a-f]{64}[[:space:]]+flash-full-16mb\.bin$' "$MANIFEST"; then
  echo "Manifest does not contain the full-flash digest." >&2
  exit 1
fi

(
  cd "$BACKUP_DIR"
  shasum -a 256 -c manifest.sha256
)

echo "Verified ESP32-S3 backup: $BACKUP_DIR"
