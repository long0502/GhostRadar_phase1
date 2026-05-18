$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$backendStage = Join-Path $root ".deploy-stage-backend"
$webStage = Join-Path $root ".deploy-stage-web"

function Reset-Stage([string]$Path) {
  if (Test-Path $Path) {
    Get-ChildItem -Path $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
      Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $Path -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (Test-Path $Path) {
    [System.IO.Directory]::Delete($Path, $true)
  }

  New-Item -ItemType Directory -Path $Path | Out-Null
}

function Copy-IfExists([string]$SourceRelativePath, [string]$StageRoot) {
  $source = Join-Path $root $SourceRelativePath
  if (-not (Test-Path $source)) {
    throw "Missing required path for packaging: $SourceRelativePath"
  }

  $destination = Join-Path $StageRoot $SourceRelativePath
  $destinationParent = Split-Path -Parent $destination
  if ($destinationParent) {
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  }

  Copy-Item -Path $source -Destination $destination -Recurse -Force
}

function Remove-IfExists([string]$Path) {
  if (Test-Path $Path) {
    Remove-Item $Path -Recurse -Force
  }
}

if (Test-Path "deploy.tar.gz") {
  Remove-Item "deploy.tar.gz" -Force
}

if (Test-Path "deploy_web.tar.gz") {
  Remove-Item "deploy_web.tar.gz" -Force
}

Reset-Stage $backendStage
Reset-Stage $webStage

$backendPaths = @(
  "docker-compose.yml",
  "package.json",
  "package-lock.json",
  "apps/api",
  "apps/admin"
)

$webPaths = @(
  "web/app",
  "web/components",
  "web/hooks",
  "web/i18n",
  "web/lib",
  "web/public",
  "web/Dockerfile",
  "web/docker-compose.yml",
  "web/next-env.d.ts",
  "web/next.config.mjs",
  "web/package.json",
  "web/package-lock.json",
  "web/postcss.config.js",
  "web/tailwind.config.ts",
  "web/tsconfig.json"
)

Write-Host "Staging backend bundle..."
foreach ($path in $backendPaths) {
  Copy-IfExists $path $backendStage
}

Write-Host "Staging web bundle..."
foreach ($path in $webPaths) {
  Copy-IfExists $path $webStage
}

Write-Host "Pruning backend staging..."
$backendPrunePaths = @(
  "apps/api/.env",
  "apps/api/node_modules",
  "apps/api/dist",
  "apps/api/dist_stale",
  "apps/api/storage",
  "apps/api/test",
  "apps/api/promptbackup.scan.2026-04-09.pre-5km.txt",
  "apps/api/src/services/promptbackup.expand.2026-05-13.pre-srb-archive.txt",
  "apps/api/src/services/promptbackup.scan.2026-05-13.pre-deepweb-radar.txt",
  "apps/api/src/services/promptbackup.scan.txt",
  "apps/admin/.env",
  "apps/admin/node_modules",
  "apps/admin/.next",
  "apps/admin/scripts"
)
foreach ($path in $backendPrunePaths) {
  Remove-IfExists (Join-Path $backendStage $path)
}
Get-ChildItem -Path (Join-Path $backendStage "apps/api/scripts") -File -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -ne 'docker-start.js'
} | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $backendStage -Recurse -Include *.log,*.env.* | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue

Write-Host "Pruning web staging..."
$webPrunePaths = @(
  ".env",
  ".next",
  "tests",
  "test-results",
  "playwright.config.ts",
  "before-outer-rim-removal.png",
  "after-outer-rim-removal.png"
)
foreach ($path in $webPrunePaths) {
  Remove-IfExists (Join-Path (Join-Path $webStage "web") $path)
}
Get-ChildItem -Path $webStage -Recurse -Include *.log,*.env.* | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue

Write-Host "Packaging backend bundle..."
tar -czf deploy.tar.gz -C $backendStage .

Write-Host "Packaging web bundle..."
tar -czf deploy_web.tar.gz -C $webStage\web .

Reset-Stage $backendStage
Reset-Stage $webStage
Remove-Item $backendStage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $webStage -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Bundles created:"
Get-Item deploy.tar.gz, deploy_web.tar.gz | Select-Object Name, Length, LastWriteTime
