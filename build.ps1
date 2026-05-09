# Builds click-define.zip for submission to addons.mozilla.org
# Run from the project root: ./build.ps1

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$out  = Join-Path $root "click-define.zip"

if (Test-Path $out) { Remove-Item $out -Force }

$files = @(
    "manifest.json",
    "content.js",
    "content.css",
    "options.html",
    "options.css",
    "options.js",
    "icon.svg",
    "LICENSE",
    "PRIVACY.md",
    "README.md"
)

foreach ($f in $files) {
    if (-not (Test-Path (Join-Path $root $f))) {
        throw "Missing required file: $f"
    }
}

Compress-Archive -Path ($files | ForEach-Object { Join-Path $root $_ }) -DestinationPath $out -Force

$size = (Get-Item $out).Length
Write-Host "Built $out ($([math]::Round($size/1KB, 1)) KB)" -ForegroundColor Green
Write-Host "Upload at: https://addons.mozilla.org/developers/addon/submit/distribution"
