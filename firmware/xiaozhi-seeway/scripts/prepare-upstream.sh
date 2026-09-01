#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_FILE="${ROOT_DIR}/upstream.lock.json"
ARCHIVE="${1:-${XIAOZHI_SOURCE_ARCHIVE:-}}"

if [[ -z "${ARCHIVE}" ]]; then
  echo "usage: $0 SOURCE_ARCHIVE [DESTINATION]" >&2
  exit 2
fi

COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "${LOCK_FILE}")"
# Read the pinned sourceArchive.sha256 value; never trust an archive filename.
EXPECTED_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sourceArchive"]["sha256"])' "${LOCK_FILE}")"
DESTINATION="${2:-${ROOT_DIR}/.work/upstream-${COMMIT}}"
STAGING="${DESTINATION}.staging.$$"

if [[ -e "${DESTINATION}" || -e "${STAGING}" ]]; then
  echo "Prepared destination already exists: ${DESTINATION}" >&2
  exit 3
fi

ACTUAL_SHA="$(shasum -a 256 "${ARCHIVE}" | awk '{print $1}')"
if [[ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]]; then
  echo "Prepared source mismatch: archive SHA-256 does not match upstream.lock.json" >&2
  exit 4
fi

TEMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TEMP_DIR}" "${STAGING}"
}
trap cleanup EXIT

tar -xzf "${ARCHIVE}" -C "${TEMP_DIR}"
SOURCE_DIR="${TEMP_DIR}/xiaozhi-esp32-${COMMIT}"
if [[ ! -d "${SOURCE_DIR}/main/boards/waveshare/esp32-s3-rlcd-4.2" ]]; then
  echo "Prepared source mismatch: locked Waveshare board is missing" >&2
  exit 5
fi

mkdir -p "$(dirname "${DESTINATION}")"
cp -R "${SOURCE_DIR}" "${STAGING}"
cp -R "${ROOT_DIR}/overlay/main/." "${STAGING}/main/"
python3 "${SCRIPT_DIR}/apply-overlay.py" "${STAGING}"

if [[ ! -f "${STAGING}/main/boards/seeway/seeway-rhythm-rlcd-4.2/config.json" ]]; then
  echo "Prepared source mismatch: SeeWay overlay was not installed" >&2
  exit 6
fi
if ! rg -q "BOARD_TYPE_SEEWAY_RHYTHM_RLCD_4_2" "${STAGING}/main/Kconfig.projbuild"; then
  echo "Prepared source mismatch: SeeWay Kconfig registration is missing" >&2
  exit 7
fi

mv "${STAGING}" "${DESTINATION}"
trap - EXIT
rm -rf "${TEMP_DIR}"
printf '%s\n' "${DESTINATION}"
