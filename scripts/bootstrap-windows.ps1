Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:REPO_URL) { $env:REPO_URL } else { "https://github.com/bienestarparatodos202519-sudo/laughing-potato.git" }
$Branch = if ($env:BRANCH) { $env:BRANCH } else { "cursor/google-drive-beneficiarios-e435" }
$TargetDir = if ($env:TARGET_DIR) { $env:TARGET_DIR } else { "beneficiarios-google-drive" }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git es requerido para descargar el proyecto."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js y npm son requeridos. Instala Node.js 20 o superior."
}

if (Test-Path (Join-Path $TargetDir ".git")) {
  Set-Location $TargetDir
  git fetch origin $Branch
  git checkout $Branch
  git pull origin $Branch
} else {
  git clone --branch $Branch $RepoUrl $TargetDir
  Set-Location $TargetDir
}

powershell -ExecutionPolicy Bypass -File scripts/install.ps1
