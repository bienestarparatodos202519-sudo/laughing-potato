#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/bienestarparatodos202519-sudo/laughing-potato.git}"
BRANCH="${BRANCH:-cursor/google-drive-beneficiarios-e435}"
TARGET_DIR="${TARGET_DIR:-beneficiarios-google-drive}"

if ! command -v git >/dev/null 2>&1; then
  echo "Git es requerido para descargar el proyecto." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js y npm son requeridos. Instala Node.js 20 o superior." >&2
  exit 1
fi

if [[ -d "$TARGET_DIR/.git" ]]; then
  cd "$TARGET_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
fi

bash scripts/install.sh
