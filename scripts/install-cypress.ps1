# Installs the Cypress app binary manually.
# Why: Cypress 14's built-in unzip stops early on Node.js 26, so `npx cypress install` leaves an empty folder.
# This downloads the official zip from download.cypress.io and extracts it with Windows' own tar.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$version = (Get-Content 'node_modules\cypress\package.json' -Raw | ConvertFrom-Json).version
$cacheDir = Join-Path $env:LOCALAPPDATA "Cypress\Cache\$version"
$zip = Join-Path $env:TEMP "cypress-$version.zip"

if (Test-Path (Join-Path $cacheDir 'Cypress\Cypress.exe')) {
  Write-Host "Cypress $version is already installed."
} else {
  Write-Host "Downloading Cypress $version (about 200 MB)..."
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest "https://download.cypress.io/desktop/$version`?platform=win32&arch=x64" -OutFile $zip
  Write-Host 'Extracting...'
  if (Test-Path $cacheDir) { Remove-Item $cacheDir -Recurse -Force }
  New-Item -ItemType Directory -Force $cacheDir | Out-Null
  tar -xf $zip -C $cacheDir
  Remove-Item $zip -Force
}

npx cypress verify
