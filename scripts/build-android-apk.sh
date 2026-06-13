#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run build --workspace client

if [[ ! -d android ]]; then
  npx cap add android
fi

npx cap sync android

if [[ "${1:-}" == "--sync-only" ]]; then
  exit 0
fi

cd android
./gradlew assembleDebug
cd "$ROOT_DIR"

mkdir -p release/android
cp android/app/build/outputs/apk/debug/app-debug.apk release/android/Beneficiarios-Drive.apk
echo "APK generado en release/android/Beneficiarios-Drive.apk"
