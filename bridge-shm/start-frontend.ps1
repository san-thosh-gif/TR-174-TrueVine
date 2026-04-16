$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root "frontend"
$npmCmd = "npm.cmd"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $nodePath = "C:\Program Files\nodejs"
    if (Test-Path (Join-Path $nodePath "node.exe")) {
        $env:Path = "$nodePath;$env:Path"
    } else {
        throw "Node.js not found. Install Node LTS first, then re-run this script."
    }
}

Set-Location $frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "[frontend] Installing npm dependencies..." -ForegroundColor Cyan
    & $npmCmd install
}

Write-Host "[frontend] Starting Vite at http://127.0.0.1:5173" -ForegroundColor Green
& $npmCmd run dev -- --host 127.0.0.1 --port 5173
