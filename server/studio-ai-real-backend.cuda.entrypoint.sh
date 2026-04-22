#!/usr/bin/env bash
set -euo pipefail

HUNYUAN_ROOT="${CLAW3D_STUDIO_REAL_BACKEND_HUNYUAN21_SOURCE_ROOT:-/opt/hunyuan/Hunyuan3D-2.1}"

mkdir -p "$(dirname "${HUNYUAN_ROOT}")"
if [ ! -d "${HUNYUAN_ROOT}/.git" ]; then
  git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git "${HUNYUAN_ROOT}"
fi

export CLAW3D_STUDIO_REAL_BACKEND_HUNYUAN21_SOURCE_ROOT="${HUNYUAN_ROOT}"
export PYTHONUNBUFFERED=1

while true; do
  echo "[studio-ai-real-backend.entrypoint] starting backend at $(date -u +"%Y-%m-%dT%H:%M:%SZ")."
  if python3 -u /app/server/studio_ai_real_backend.py; then
    echo "[studio-ai-real-backend.entrypoint] backend exited cleanly."
    exit 0
  fi
  exit_code=$?
  echo "[studio-ai-real-backend.entrypoint] backend exited with code ${exit_code}; restarting in 2 seconds."
  sleep 2
done
