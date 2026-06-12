Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Se creo .env desde .env.example. Edita las credenciales antes de iniciar."
}

npm install
npm run build

Write-Host ""
Write-Host "Instalacion completada."
Write-Host "1. Edita .env con Firebase y GEMINI_API_KEY."
Write-Host "2. Ejecuta npm run dev para desarrollo."
Write-Host "3. Ejecuta npm start despues de npm run build para produccion local."
Write-Host "4. En Android o laptop, abre la URL HTTPS/localhost y usa 'Instalar app' del navegador."
