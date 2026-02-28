#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
WORKSPACE_DIR="${SCRIPT_DIR}/workspace"
RUN_SCRIPT_PATH="${SCRIPT_DIR}/run-script.ts"

usage() {
  cat <<EOF
Usage:
  ${SCRIPT_DIR}/run.sh <script.ts> [args...]

Behavior:
  - If <script.ts> is relative, it is resolved under:
    ${WORKSPACE_DIR}
  - If <script.ts> is absolute, it is used directly.
  - Process exits automatically after script completion to avoid
    lingering extension sockets. Set AGENTS_RUNNER_KEEP_ALIVE=1 to disable.
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

TARGET_INPUT="$1"
shift

mkdir -p "${WORKSPACE_DIR}"

if [[ "${TARGET_INPUT}" = /* ]]; then
  SCRIPT_PATH="${TARGET_INPUT}"
else
  SCRIPT_PATH="${WORKSPACE_DIR}/${TARGET_INPUT}"
fi

if [[ ! -f "${SCRIPT_PATH}" ]]; then
  echo "Script not found: ${SCRIPT_PATH}" >&2
  exit 1
fi

cd "${REPO_ROOT}"
pnpm --filter @ank1015/llm-extension exec tsx "${RUN_SCRIPT_PATH}" "${SCRIPT_PATH}" "$@"
