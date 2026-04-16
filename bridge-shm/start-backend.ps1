$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"

Set-Location $backend

if (-not (Test-Path $venvPython)) {
    Write-Host "[backend] Creating Python 3.10 virtual environment..." -ForegroundColor Cyan
    py -3.10 -m venv .venv
}

$needsInstall = $false
try {
    & $venvPython -c "import flask, flask_cors, numpy, scipy, cv2, matplotlib" | Out-Null
} catch {
    $needsInstall = $true
}

if ($needsInstall) {
    Write-Host "[backend] Installing requirements..." -ForegroundColor Cyan
    & $venvPython -m pip install -r requirements.txt
}

Write-Host "[backend] Starting Flask API at http://127.0.0.1:5000" -ForegroundColor Green
& $venvPython app.py
