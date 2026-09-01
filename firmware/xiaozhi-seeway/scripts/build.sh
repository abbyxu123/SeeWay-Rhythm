#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_FILE="${ROOT_DIR}/upstream.lock.json"
EXPECTED_IDF="6.0.2"
COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "${LOCK_FILE}")"
PREPARED_SOURCE="${XIAOZHI_PREPARED_SOURCE:-${ROOT_DIR}/.work/upstream-${COMMIT}}"

if [[ -z "${IDF_PATH:-}" || ! -f "${IDF_PATH}/export.sh" ]]; then
  echo "ESP-IDF ${EXPECTED_IDF} is required; set IDF_PATH first" >&2
  exit 2
fi

source "${IDF_PATH}/export.sh" >/dev/null
IDF_VERSION="$(idf.py --version)"
if [[ "${IDF_VERSION}" != *"v${EXPECTED_IDF}"* && "${IDF_VERSION}" != *"${EXPECTED_IDF}"* ]]; then
  echo "ESP-IDF version mismatch: expected ${EXPECTED_IDF}, got ${IDF_VERSION}" >&2
  exit 3
fi
if [[ ! -f "${PREPARED_SOURCE}/main/boards/seeway/seeway-rhythm-rlcd-4.2/config.json" ]]; then
  echo "Prepared SeeWay source not found: ${PREPARED_SOURCE}" >&2
  exit 4
fi

cd "${PREPARED_SOURCE}"
python3 scripts/build.py seeway/seeway-rhythm-rlcd-4.2 \
  --name seeway-rhythm-rlcd-4.2 \
  --language zh-CN \
  --wake-word disabled

EVIDENCE_DIR="${ROOT_DIR}/artifacts/build-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${EVIDENCE_DIR}"
idf.py size > "${EVIDENCE_DIR}/size.txt"
python3 "${IDF_PATH}/components/partition_table/gen_esp32part.py" \
  build/partition_table/partition-table.bin \
  > "${EVIDENCE_DIR}/partition-table.csv"
cp build/xiaozhi.bin "${EVIDENCE_DIR}/application.bin"
cp build/generated_assets.bin "${EVIDENCE_DIR}/assets.bin"
cp build/merged-binary.bin "${EVIDENCE_DIR}/"
cp build/partition_table/partition-table.bin "${EVIDENCE_DIR}/"
(
  cd "${EVIDENCE_DIR}"
  shasum -a 256 ./*.bin > manifest.sha256
)
printf '%s\n' "${IDF_VERSION}" > "${EVIDENCE_DIR}/esp-idf-version.txt"
printf '%s\n' "${EVIDENCE_DIR}"
