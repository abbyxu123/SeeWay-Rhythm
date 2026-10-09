#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMMIT="$(node -p "require('${ROOT_DIR}/upstream.lock.json').commit")"
PREPARED_SOURCE="${XIAOZHI_PREPARED_SOURCE:-${ROOT_DIR}/.work/upstream-${COMMIT}}"
BUILD_DIR="${ROOT_DIR}/.work/preview-build"
OUTPUT_DIR="${1:-${ROOT_DIR}/.work/ui-preview}"
"${CMAKE:-cmake}" -S "${ROOT_DIR}/host-tests/preview" -B "${BUILD_DIR}" \
  -DLVGL_SOURCE="${PREPARED_SOURCE}/managed_components/lvgl__lvgl"
"${CMAKE:-cmake}" --build "${BUILD_DIR}" -j 4
"${BUILD_DIR}/seeway-preview" "${OUTPUT_DIR}"
