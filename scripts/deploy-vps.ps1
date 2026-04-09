param(
  [string]$VpsHost = $env:VPS_HOST,
  [string]$VpsUser = $(if ($env:VPS_USER) { $env:VPS_USER } else { "root" }),
  [string]$VpsBackendDir = $(if ($env:VPS_BACKEND_DIR) { $env:VPS_BACKEND_DIR } else { "/app/ghostradar" }),
  [string]$VpsWebDir = $(if ($env:VPS_WEB_DIR) { $env:VPS_WEB_DIR } else { "/app/ghostradar_web" }),
  [switch]$SkipPackage
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

if (-not $VpsHost) {
  throw "Missing VPS host. Set -VpsHost or VPS_HOST."
}

Require-Command "ssh"
Require-Command "scp"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Deploy target: $VpsUser@$VpsHost"
Write-Host "Backend dir: $VpsBackendDir"
Write-Host "Web dir: $VpsWebDir"

Write-Host "Preflight SSH connectivity..."
& ssh -o ConnectTimeout=12 "$VpsUser@$VpsHost" "echo connected" | Out-Null

if (-not $SkipPackage) {
  Write-Host "Packaging release bundles..."
  & "$PSScriptRoot\package-release.ps1"
}

if (-not (Test-Path "deploy.tar.gz")) {
  throw "Missing deploy.tar.gz. Run package step first."
}

if (-not (Test-Path "deploy_web.tar.gz")) {
  throw "Missing deploy_web.tar.gz. Run package step first."
}

Write-Host "Ensuring remote directories exist..."
& ssh "$VpsUser@$VpsHost" "mkdir -p '$VpsBackendDir' '$VpsWebDir'"

Write-Host "Uploading backend bundle..."
& scp "deploy.tar.gz" "setup.sh" "${VpsUser}@${VpsHost}:$VpsBackendDir/"

Write-Host "Uploading web bundle..."
& scp "deploy_web.tar.gz" "setup_web.sh" "${VpsUser}@${VpsHost}:$VpsWebDir/"

Write-Host "Deploying backend..."
& ssh "$VpsUser@$VpsHost" "cd '$VpsBackendDir' && bash setup.sh"

Write-Host "Deploying web..."
& ssh "$VpsUser@$VpsHost" "cd '$VpsWebDir' && bash setup_web.sh"

Write-Host "Post-deploy health checks..."
& ssh "$VpsUser@$VpsHost" "curl -fsS http://127.0.0.1:8088/health && echo && curl -fsS http://127.0.0.1:8088/ready"

Write-Host "Clearing API cache..."
& ssh "$VpsUser@$VpsHost" "curl -fsS -X DELETE http://127.0.0.1:8088/grid-cache/clear"

Write-Host "Deployment finished successfully."
