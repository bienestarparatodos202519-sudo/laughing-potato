#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Se creo .env desde .env.example. Edita las credenciales antes de iniciar."
fi

npm install
npm run build

cat <<'MSG'

Instalacion completada.

1. Edita .env con Firebase y GEMINI_API_KEY.
2. Ejecuta npm run dev para desarrollo.
3. Ejecuta npm start despues de npm run build para produccion local.
4. En Android o laptop, abre la URL HTTPS/localhost y usa "Instalar app" del navegador.
MSG
